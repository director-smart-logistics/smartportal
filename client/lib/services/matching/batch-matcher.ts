/**
 * Matching Engine — Batch Matcher with AI Disambiguation
 *
 * Handles bulk manifest matching: algorithmic pass → historical lookup → AI disambiguation.
 *
 * @module matching/batch-matcher
 */

import type { CustomerData, CustomerMatchResponse, MatchResult } from './types';
import { MATCH_THRESHOLDS } from './thresholds';
import { normalize, meaningfulTokens, phoneticKey, clearNormalizeCaches, permutationCache, sanitizeName } from './normalize';
import { loadCustomers, getCachedIndexes, getCachedCustomers, injectCustomerIntoCache, getCustomerBySlCode } from './customer-loader';
import { matchName } from './match-engine';
import { isDivergentMatch } from '../manifest-processor/parser';
import { aiSelectBestMatchBatch, aiFindPotentialMatchesBatch, type BatchMatchItem, type BatchSearchItem } from '../gemini-client';
import { findAndSyncCustomerFromSP2 } from '../customer-sync';
import { loadLearnedMatches, lookupLearned, getLearnedCandidatesForAI, saveAIAutoMatchFeedback, hasLearnedCollision, hasRoutingPrefix, getLearnedIndex, isDominantCollisionWinner } from '../match-learning';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { createTelemetrySession, recordMatchDecision, flushTelemetry, type MatchDecisionPath } from './match-telemetry';

/**
 * Batch match multiple names (algorithmic only, no AI).
 */
export async function batchFindCustomerMatches(
  names: Array<{ index: number; name: string }>
): Promise<Map<number, CustomerMatchResponse>> {
  console.log(`[CustomerMatcher] Batch matching ${names.length} names`);
  const customers = await loadCustomers();
  console.log(`[CustomerMatcher] Customers loaded: ${customers.length}`);
  if (customers.length === 0) console.warn('[CustomerMatcher] No customers found in database!');

  const results = new Map<number, CustomerMatchResponse>();
  let matchCount = 0;

  for (const { index, name } of names) {
    const searchName = sanitizeName(name).toUpperCase().trim();
    if (!searchName) {
      results.set(index, { exactMatch: false, candidates: [], searchedName: name, totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false });
      continue;
    }

    const matches = matchName(searchName, customers);
    const exactMatch = matches.find(m => m.score >= MATCH_THRESHOLDS.AUTO_ACCEPT_MIN && !m.customer.isTemp) ?? matches.find(m => m.score >= MATCH_THRESHOLDS.AUTO_ACCEPT_MIN);
    const highConfidenceMatches = matches.filter(m => m.score >= MATCH_THRESHOLDS.MULTIPLE_HIGH_CONFIDENCE);
    const hasMultipleMatches = highConfidenceMatches.length > 1;
    const topScore = matches[0]?.score || 0;
    const secondScore = matches[1]?.score || 0;
    const requiresUserChoice = hasMultipleMatches && (topScore - secondScore) < 0.1;

    if (exactMatch) {
      matchCount++;
      results.set(index, {
        exactMatch: true, bestMatch: exactMatch, candidates: matches.slice(0, 5),
        slCode: exactMatch.customer.slCode || undefined, ruta: exactMatch.customer.ruta || undefined,
        consolidationEnabled: exactMatch.customer.consolidationEnabled, searchedName: name,
        totalCustomers: customers.length, multipleMatches: hasMultipleMatches, requiresUserChoice: false,
      });
    } else {
      const bestMatch = matches[0];
      if (bestMatch && bestMatch.score >= 0.6) matchCount++;
      results.set(index, {
        exactMatch: false, bestMatch, candidates: matches.slice(0, 10),
        slCode: bestMatch?.customer.slCode || undefined, ruta: bestMatch?.customer.ruta || undefined,
        consolidationEnabled: bestMatch?.customer.consolidationEnabled, searchedName: name,
        totalCustomers: customers.length, multipleMatches: hasMultipleMatches, requiresUserChoice,
      });
    }
  }

  console.log(`[CustomerMatcher] Completed: ${matchCount}/${names.length} names matched (score >= 0.6)`);
  if (names.length > 0) {
    const firstFew = Array.from(results.entries()).slice(0, 3);
    for (const [, result] of firstFew) {
      console.log(`[CustomerMatcher] Sample - "${result.searchedName}" -> ${result.bestMatch ? `"${result.bestMatch.customer.name}" (${result.bestMatch.customer.slCode}, score: ${result.bestMatch.score.toFixed(2)})` : 'NO MATCH'}`);
    }
  }
  return results;
}

/**
 * Batch matching with AI disambiguation for uncertain cases.
 *
 * Pipeline:
 *  Pass 0 – Learned matches (human-confirmed, score >= MATCH_THRESHOLDS.LEARNED_ACCEPT_MIN)
 *  Pass 1 – Algorithmic matching for all unique names
 *  Pass 1.5 – Historical package lookup for unmatched names
 *  Pass 2 – AI disambiguation (batched, max 12 per call)
 *  Pass 3 – Learned match fallback
 */
export async function batchFindCustomerMatchesWithAI(
  names: Array<{ index: number; name: string }>,
  useAI: boolean = true
): Promise<Map<number, CustomerMatchResponse>> {
  console.log(`%c[CustomerMatcher] Starting batch matching: ${names.length} names (AI: ${useAI})`, 'color: #2196F3; font-weight: bold');
  const telemetry = createTelemetrySession(`manifest-${Date.now()}`);
  permutationCache.clear();
  clearNormalizeCaches();

  const [customers] = await Promise.all([loadCustomers(), loadLearnedMatches()]);

  if (customers.length === 0) {
    console.warn('[CustomerMatcher] ⚠️ No customers found in database!');
    const emptyResults = new Map<number, CustomerMatchResponse>();
    for (const { index, name } of names) {
      emptyResults.set(index, { exactMatch: false, candidates: [], searchedName: name, totalCustomers: 0, multipleMatches: false, requiresUserChoice: false });
    }
    return emptyResults;
  }

  console.log(`[CustomerMatcher] Database: ${customers.length} customers loaded`);
  const learnedMatches = await loadLearnedMatches();
  console.log(`[CustomerMatcher] Learned matches: ${learnedMatches.length}`);

  const results = new Map<number, CustomerMatchResponse>();
  const nameMatchCache = new Map<string, CustomerMatchResponse>();
  const dynamicCollisions = new Set<string>();
  const aiDisambiguate: Array<{ index: number; name: string; candidates: MatchResult[]; learnedContext: ReturnType<typeof getLearnedCandidatesForAI> }> = [];
  const aiSearch: Array<{ index: number; name: string; learnedContext: ReturnType<typeof getLearnedCandidatesForAI> }> = [];
  const noMatchNames: string[] = [];
  const lowScoreNames: Array<{ name: string; score: number; bestMatch: string }> = [];
  let autoMatchCount = 0;
  let learnedMatchCount = 0;

  // ── PASS 1: ALGORITHMIC ──────────────────────────────────────────────────
  for (const { index, name } of names) {
    const searchName = sanitizeName(name).toUpperCase().trim();
    if (!searchName) {
      results.set(index, { exactMatch: false, candidates: [], searchedName: name, totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false });
      continue;
    }

    const cached = nameMatchCache.get(searchName);
    if (cached) {
      results.set(index, { ...cached, searchedName: name });
      if (cached.bestMatch && cached.bestMatch.score >= 0.45) autoMatchCount++;
      continue;
    }

    const matches = matchName(searchName, customers);
    const topScore = matches[0]?.score ?? 0;

    // ── PASS 0 (PRIORITY 1): LEARNED MATCHES ─────────────────────────────
    // Learning always wins: admin-confirmed associations override even a
    // perfect algorithmic hit. Priority chain: Learning > Customer > Temp.
    let learned = lookupLearned(searchName, learnedMatches);
    let hasCollision = learned ? hasLearnedCollision(learned.normalizedName) : false;

    // A. DEGRADACIÓN DE CORTOCIRCUITO PARA IA AUTO-SAVES
    if (learned && learned.source === 'ai_auto') {
      learned.score = 0.92;
    }

    // Admin-confirmed entries are treated as absolute picks.
    // A confirmation establishes intent — the homonym evaluator must not override it.
    // (admin_pick / admin_manual / admin_sp2 / admin are always absolute)
    const isAdminPick = learned && (
      learned.source === 'admin_pick' ||
      learned.source === 'admin_manual' ||
      learned.source === 'admin_sp2' ||
      String(learned.source) === 'admin'
    );

    // B. DETECCIÓN DE COLISIONES EXTENDIDA (HOMÓNIMOS) EN EL HISTORIAL DE PAQUETES
    // ADMIN PICK ES LEY ABSOLUTA: Si el administrador asignó explícitamente este nombre
    // a un cliente (ej. "Carlos López" → Alejandro Ulate SL_ALEJANDRO), no consultamos
    // la base de datos general de clientes ni anulamos la voluntad del admin por homónimos algorítmicos.
    if (learned && !hasCollision && !isAdminPick) {
      // Buscar si el motor algorítmico detectó otros clientes similares en Pass 1 (matches)
      const competingCandidates = matches.filter(m =>
        m.customer.slCode.toUpperCase() !== learned!.slCode.toUpperCase() &&
        m.score >= 0.75
      );

      if (competingCandidates.length > 0) {
        // Tenemos un homónimo registrado muy similar en la base de datos de clientes
        const competitor = competingCandidates[0];

        try {
          // Consultamos el historial real de paquetes para resolver con dominancia
          const { getCountFromServer } = await import('firebase/firestore');
          const [learnedCountSnap, competitorCountSnap] = await Promise.all([
            getCountFromServer(query(collection(db, 'packages'), where('slCode', '==', learned.slCode))),
            getCountFromServer(query(collection(db, 'packages'), where('slCode', '==', competitor.customer.slCode))),
          ]);

          const learnedHistoryCount = learnedCountSnap.data().count;
          const competitorHistoryCount = competitorCountSnap.data().count;

          // Escenario 1: El competidor histórico es abrumadoramente dominante (Dominant History Winner)
          if (competitorHistoryCount >= 5 && learnedHistoryCount <= 1 && learned.source === 'ai_auto') {
            console.log(`[NovaMatch] Evaluando "${name}". Regla ai_auto -> ${learned.slCode} descartada. Asignando automáticamente a favor del homónimo dominante ${competitor.customer.fullName} (${competitor.customer.slCode}) por contar con un historial abrumador de ${competitorHistoryCount} paquetes frente a ${learnedHistoryCount} de ${learned.slCode}.`);

            // Re-asignamos la asignación aprendida a favor del ganador por dominancia
            const liveCustomer = getCustomerBySlCode(competitor.customer.slCode) ?? competitor.customer;
            learned = {
              manifestName: learned.manifestName,
              normalizedName: learned.normalizedName,
              slCode: competitor.customer.slCode,
              fullName: liveCustomer.fullName || liveCustomer.name || '',
              ruta: liveCustomer.ruta,
              consolidationEnabled: !!liveCustomer.consolidationEnabled,
              hitCount: competitorHistoryCount,
              score: 1.0, // Promover con score absoluto por dominancia histórica
              source: 'admin_pick'
            };
          }
          // Escenario 2: Colisión activa en reglas de ia_auto (historiales comparables)
          else {
            hasCollision = true;
            dynamicCollisions.add(learned.normalizedName);
            console.log(`[NovaMatch] Evaluando "${name}". Regla ${learned.source} -> ${learned.slCode} en colisión activa con homónimo ${competitor.customer.fullName} (${competitor.customer.slCode}). Historial: ${learnedHistoryCount} frente a ${competitorHistoryCount}. Abortando corto circuito automático.`);
          }
        } catch (err) {
          console.warn('[NovaMatch] Error al evaluar dominancia por historial:', err);
        }
      }
    }

    // A "dominant" collision: the admin-confirmed winner has ≥3× the hitCount of
    // every competing entry — treat it as unambiguous even in a collision set.
    const collisionIsDominant = hasCollision && learned
      ? isDominantCollisionWinner(learned.normalizedName, learned.slCode)
      : false;
    if (learned && learned.score >= MATCH_THRESHOLDS.LEARNED_ACCEPT_MIN && (!hasCollision || collisionIsDominant)) {
      const liveCustomer = getCustomerBySlCode(learned.slCode) ?? customers.find(c => c.slCode.toUpperCase() === learned.slCode.toUpperCase());
      const activeRuta = liveCustomer ? liveCustomer.ruta : (learned.ruta ?? undefined);
      const activeConsolidation = liveCustomer ? liveCustomer.consolidationEnabled : learned.consolidationEnabled;
      const matchedCustomer = liveCustomer ?? {
        id: learned.slCode, name: learned.fullName, fullName: learned.fullName,
        normalizedName: learned.normalizedName, firstName: learned.fullName.split(' ')[0] || '',
        lastName: learned.fullName.split(' ').slice(1).join(' ') || '',
        slCode: learned.slCode, ruta: activeRuta,
        consolidationEnabled: activeConsolidation, email: '', phone: '',
      };
      const matchedCustomerWithActive = { ...matchedCustomer, ruta: activeRuta, consolidationEnabled: activeConsolidation };
      const learnedResult: CustomerMatchResponse = {
        exactMatch: true,
        bestMatch: {
          customer: matchedCustomerWithActive, score: learned.score, matchType: 'exact', matchedField: 'fullName',
          algorithms: { exact: true, normalized: true, levenshtein: 1, jaroWinkler: 1, tokenBased: 1, firstNameMatch: 1, lastNameMatch: 1, doubleMetaphone: 1 },
        },
        candidates: matches, slCode: learned.slCode, ruta: activeRuta,
        consolidationEnabled: activeConsolidation, searchedName: name,
        totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false,
      };
      learnedMatchCount++; autoMatchCount++;
      results.set(index, learnedResult);
      nameMatchCache.set(searchName, learnedResult);
      recordMatchDecision(telemetry, searchName, 'learned', learned.score, 1);
      console.log(`[CustomerMatcher] 🎓 Learned Match${collisionIsDominant ? ' (dominant)' : ''}: "${name}" → "${learned.fullName}" (${learned.slCode}) ×${learned.hitCount}`);
      continue;
    }

    // ── PASS 1 (PRIORITY 2): EXACT REAL-CUSTOMER MATCH ───────────────────
    // Only reached when no learned entry won. Non-temp customers beat temp.
    if (topScore === 1.0 && matches[0] && !matches[0].customer.isTemp) {
      autoMatchCount++;
      const best = matches[0];
      const result: CustomerMatchResponse = {
        exactMatch: true, bestMatch: best, candidates: matches, slCode: best.customer.slCode,
        ruta: best.customer.ruta, consolidationEnabled: best.customer.consolidationEnabled,
        searchedName: name, totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false,
      };
      results.set(index, result);
      nameMatchCache.set(searchName, result);
      recordMatchDecision(telemetry, searchName, 'exact-customer', topScore, matches.length);
      console.log(`[CustomerMatcher] 🎯 Exact Customer Match: "${name}" → "${best.customer.fullName}" (${best.customer.slCode})`);
      continue;
    }



    // Routing-prefix guard
    // HARDENING: Only block if there is NO learned entry for this name.
    // If the operator previously confirmed a mapping (e.g. "AIR JAMAL" → SP123),
    // the entry exists in match_feedback and must reach Pass 2/3 for resolution.
    // `lookupLearned` is called again here (Pass 1 required score >= MATCH_THRESHOLDS.LEARNED_ACCEPT_MIN to
    // short-circuit; we allow ANY score to bypass the prefix guard).
    if (hasRoutingPrefix(searchName)) {
      const anyLearnedEntry = lookupLearned(searchName, learnedMatches);
      if (!anyLearnedEntry) {
        console.log(`[CustomerMatcher] ⛔ Routing-prefix, no learned entry — skipping: "${searchName}"`);
        const r: CustomerMatchResponse = { exactMatch: false, candidates: [], searchedName: name, totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false };
        results.set(index, r);
        nameMatchCache.set(searchName, r);
        continue;
      }
      console.log(`[CustomerMatcher] ⚠️ Routing-prefix but learned entry found — allowing AI pass: "${searchName}" (score: ${anyLearnedEntry.score.toFixed(2)})`);
    }

    let result: CustomerMatchResponse;

    const secondScore = matches[1]?.score ?? 0;
    const isProximityAmbiguous = topScore >= 0.45 && (topScore - secondScore) < 0.08;
    const searchMeaningfulTokens = meaningfulTokens(normalize(searchName).split(' '));
    const isGenericName = searchMeaningfulTokens.length < MATCH_THRESHOLDS.AUTO_ACCEPT_MIN_TOKENS;
    const highConfidenceMatches = matches.filter(m => m.score >= MATCH_THRESHOLDS.MULTIPLE_HIGH_CONFIDENCE);
    const multipleHighMatches = highConfidenceMatches.length > 1;

    if (topScore >= MATCH_THRESHOLDS.AUTO_ACCEPT_MIN && !isProximityAmbiguous && !isGenericName && !multipleHighMatches) {
      autoMatchCount++;
      const best = matches[0];
      recordMatchDecision(telemetry, searchName, 'auto-accept', topScore, matches.length);
      result = {
        exactMatch: false, bestMatch: best, candidates: matches, slCode: best.customer.slCode,
        ruta: best.customer.ruta, consolidationEnabled: best.customer.consolidationEnabled,
        searchedName: name, totalCustomers: customers.length, multipleMatches: multipleHighMatches, requiresUserChoice: false,
      };
    } else if (topScore >= 0.45 && matches.length > 0) {
      aiDisambiguate.push({ index, name, candidates: matches, learnedContext: getLearnedCandidatesForAI(searchName, learnedMatches) });
      result = {
        exactMatch: false, bestMatch: matches[0], candidates: matches, slCode: undefined,
        ruta: undefined, consolidationEnabled: matches[0].customer.consolidationEnabled,
        searchedName: name, totalCustomers: customers.length, multipleMatches: matches.filter(m => m.score >= 0.45).length > 1, requiresUserChoice: true,
      };
      lowScoreNames.push({ name: searchName, score: topScore, bestMatch: matches[0].customer.fullName || matches[0].customer.name });
    } else {
      aiSearch.push({ index, name, learnedContext: getLearnedCandidatesForAI(searchName, learnedMatches) });
      noMatchNames.push(searchName);
      recordMatchDecision(telemetry, searchName, 'unmatched', topScore, matches.length);
      result = { exactMatch: false, candidates: matches, searchedName: name, totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false };
    }
    results.set(index, result);
    nameMatchCache.set(searchName, result);
  }

  // ── PASS 1.5: HISTORICAL PACKAGES ─────────────────────────────────────────
  const unmatchedNamesList = [...aiDisambiguate, ...aiSearch].map(item => item.name);
  if (unmatchedNamesList.length > 0) {
    console.log(`[CustomerMatcher] 📦 Checking historical packages for ${unmatchedNamesList.length} names...`);
    const historyMap = new Map<string, { slCode: string, ruta?: string }>();
    const uniqueUnmatched = Array.from(new Set(unmatchedNamesList.map(n => n.toUpperCase().trim()))).filter(Boolean);
    const CHUNK_SIZE = 30;

    for (let i = 0; i < uniqueUnmatched.length; i += CHUNK_SIZE) {
      const chunk = uniqueUnmatched.slice(i, i + CHUNK_SIZE);
      try {
        const queries = [
          getDocs(query(collection(db, 'packages'), where('nombre', 'in', chunk), limit(300))),
          getDocs(query(collection(db, 'packages'), where('customerName', 'in', chunk), limit(300))),
          getDocs(query(collection(db, 'packages'), where('nombreCliente', 'in', chunk), limit(300))),
          getDocs(query(collection(db, 'packages'), where('userId', 'in', chunk), limit(300))),
          getDocs(query(collection(db, 'packages'), where('slCode', 'in', chunk), limit(300)))
        ];
        const snaps = await Promise.allSettled(queries);
        const docs: Array<{ data: any; createdAt: number }> = [];
        for (const snapResult of snaps) {
          if (snapResult.status === 'fulfilled') {
            docs.push(...snapResult.value.docs.map(d => ({ data: d.data(), createdAt: d.data().createdAt?.toMillis?.() || 0 })));
          }
        }
        docs.sort((a, b) => b.createdAt - a.createdAt);
        for (const docSnap of docs) {
          const data = docSnap.data;
          const slCode = data.slCode || data.customerSlCode || data.userId;
          const nameFields = [data.nombre, data.customerName, data.nombreCliente, data.userId, data.slCode];
          for (const rawName of nameFields) {
            const nombre = typeof rawName === 'string' ? rawName.toUpperCase().trim() : '';
            if (nombre && chunk.includes(nombre) && slCode && slCode.toUpperCase() !== 'SL0' && !historyMap.has(nombre)) {
              historyMap.set(nombre, { slCode, ruta: data.ruta });
            }
          }
        }
      } catch (e) { console.warn('[CustomerMatcher] Failed historical check:', e); }
    }

    if (historyMap.size > 0) {
      console.log(`[CustomerMatcher] 📦 Found ${historyMap.size} historical matches!`);
      const processHistory = (arr: Array<{ index: number; name: string;[k: string]: any }>) => {
        for (let i = arr.length - 1; i >= 0; i--) {
          const item = arr[i];
          const searchName = item.name.toUpperCase().trim();
          const searchMTokens = meaningfulTokens(normalize(searchName).split(' '));
          // Single-token protection: never auto-assign isolated single-token / generic words from historical packages
          if (searchMTokens.length < MATCH_THRESHOLDS.AUTO_ACCEPT_MIN_TOKENS) {
            continue;
          }
          const hist = historyMap.get(searchName);
          if (hist) {
            const matchedCust = customers.find(c => c.slCode.toUpperCase() === hist.slCode.toUpperCase())
              ?? { id: hist.slCode, name: item.name, fullName: item.name, normalizedName: item.name, firstName: item.name.split(' ')[0] || '', lastName: item.name.split(' ').slice(1).join(' ') || '', slCode: hist.slCode, ruta: hist.ruta, consolidationEnabled: false, email: '', phone: '', isTemp: true };
            autoMatchCount++;
            const histResult: CustomerMatchResponse = {
              exactMatch: true,
              bestMatch: { customer: matchedCust, score: 0.99, matchType: 'exact', matchedField: 'fullName', algorithms: { exact: true, normalized: true, levenshtein: 1, jaroWinkler: 1, tokenBased: 1, firstNameMatch: 1, lastNameMatch: 1, doubleMetaphone: 1 } },
              candidates: [], slCode: matchedCust.slCode, ruta: matchedCust.ruta, consolidationEnabled: matchedCust.consolidationEnabled,
              searchedName: item.name, totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false,
            };
            results.set(item.index, histResult);
            nameMatchCache.set(searchName, histResult);
            arr.splice(i, 1);
          }
        }
      };
      processHistory(aiDisambiguate);
      processHistory(aiSearch as any);
    }
  }

  // ── PASS 2: AI DISAMBIGUATION ─────────────────────────────────────────────
  if (useAI && (aiDisambiguate.length > 0 || aiSearch.length > 0)) {
    console.log(`%c[CustomerMatcher] AI pass: ${aiDisambiguate.length} uncertain + ${aiSearch.length} no-match | 🎓 ${learnedMatchCount} learned`, 'color: #9C27B0; font-weight: bold');
    const BATCH_SIZE = 12;
    const BATCH_CONCURRENCY = 3;

    // 2a: Disambiguate uncertain matches
    if (aiDisambiguate.length > 0) {
      const disambBatches: typeof aiDisambiguate[] = [];
      for (let i = 0; i < aiDisambiguate.length; i += BATCH_SIZE) disambBatches.push(aiDisambiguate.slice(i, i + BATCH_SIZE));

      for (let bi = 0; bi < disambBatches.length; bi += BATCH_CONCURRENCY) {
        await Promise.allSettled(
          disambBatches.slice(bi, bi + BATCH_CONCURRENCY).map(async (batch) => {
            const batchItems: BatchMatchItem[] = batch.map(({ index, name, candidates, learnedContext }) => {
              const topLearned = learnedContext[0];
              return { id: index, searchName: name, candidates: candidates.slice(0, 5).map(c => ({ slCode: c.customer.slCode, name: c.customer.fullName || c.customer.name, score: Math.round(c.score * 100) })), learnedHint: topLearned ? `${topLearned.manifestName}→${topLearned.fullName}` : undefined };
            });
            try {
              const batchResults = await aiSelectBestMatchBatch(batchItems);
              for (const br of batchResults) {
                if (!br.slCode || br.confidence < MATCH_THRESHOLDS.AI_ACCEPT_CONFIDENCE) continue;
                const item = batch.find(b => b.index === br.id);
                if (!item) continue;
                const matched = customers.find(c => c.slCode === br.slCode);
                if (matched) {
                  const candidateName = matched.fullName || matched.name;
                  if (isDivergentMatch(item.name, candidateName)) {
                    console.log(`[CustomerMatcher] ⚠️ AI batch match rejected for token divergence: "${item.name}" → "${candidateName}"`);
                    continue;
                  }
                  autoMatchCount++;
                  const aiScore = br.confidence / 100;
                  const newResult: CustomerMatchResponse = {
                    exactMatch: false, bestMatch: { customer: matched, score: aiScore, matchType: 'fuzzy', matchedField: 'fullName', algorithms: { exact: false, normalized: false, levenshtein: 0, jaroWinkler: 0, tokenBased: aiScore, firstNameMatch: 0, lastNameMatch: 0, doubleMetaphone: 0 } },
                    candidates: item.candidates, slCode: matched.slCode, ruta: matched.ruta, consolidationEnabled: matched.consolidationEnabled,
                    searchedName: item.name, totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false,
                  };
                  results.set(br.id, newResult);
                  nameMatchCache.set(item.name.toUpperCase().trim(), newResult);
                  console.log(`[CustomerMatcher] 🤖 AI batch: "${item.name}" → "${matched.fullName || matched.name}" (${br.confidence}%)`);
                  if (br.confidence >= MATCH_THRESHOLDS.AI_AUTO_SAVE_DISAMBIGUATE) {
                    saveAIAutoMatchFeedback({ manifestName: item.name, slCode: matched.slCode, fullName: matched.fullName || matched.name, ruta: matched.ruta, consolidationEnabled: matched.consolidationEnabled, confidence: br.confidence }).catch(() => { });
                  }
                }
              }
            } catch { /* Batch AI failed — keep algorithmic best with requiresUserChoice */ }
          })
        );
      }
    }

    // 2b: No-match names — batch search
    const cachedIndexes = getCachedIndexes();
    const SEARCH_BATCH_SIZE = 10;
    for (let si = 0; si < aiSearch.length; si += SEARCH_BATCH_SIZE) {
      const searchBatch = aiSearch.slice(si, si + SEARCH_BATCH_SIZE);
      const batchSearchItems: BatchSearchItem[] = searchBatch.map(({ index, name }) => {
        const searchNorm = normalize(name);
        const searchTokens = searchNorm.split(' ').filter(t => t.length >= 3);
        const seen = new Set<string>();
        let subset = customers.filter(c => {
          if (seen.has(c.slCode)) return false;
          const cn = c.normalizedName || normalize(c.fullName || c.name);
          const hit = searchTokens.some(tok => cn.includes(tok) || tok.includes(cn.split(' ')[0]?.slice(0, 4) ?? ''));
          if (hit) seen.add(c.slCode);
          return hit;
        }).slice(0, 50);
        if (subset.length < 5 && searchTokens.length > 0) {
          const ext = cachedIndexes?.byFirstToken.get(phoneticKey(searchTokens[0])) ?? [];
          const extCodes = new Set(subset.map(c => c.slCode));
          subset = [...subset, ...ext.filter(c => !extCodes.has(c.slCode))].slice(0, 50);
        }
        return { id: index, searchName: name, candidates: subset.map(c => ({ slCode: c.slCode, name: c.fullName || c.name })) };
      });

      try {
        const batchSearchResults = await aiFindPotentialMatchesBatch(batchSearchItems);
        for (const { index, name } of searchBatch) {
          const aiMatches = batchSearchResults.get(index) ?? [];
          if (aiMatches.length > 0 && aiMatches[0].confidence >= MATCH_THRESHOLDS.AI_SEARCH_ACCEPT_CONFIDENCE) {
            const matched = customers.find(c => c.slCode === aiMatches[0].slCode);
            if (matched) {
              const candidateName = matched.fullName || matched.name;
              if (isDivergentMatch(name, candidateName)) {
                console.log(`[CustomerMatcher] ⚠️ AI batch-search match rejected for token divergence: "${name}" → "${candidateName}"`);
                continue;
              }
              autoMatchCount++;
              const aiScore = aiMatches[0].confidence / 100;
              const newResult: CustomerMatchResponse = {
                exactMatch: false, bestMatch: { customer: matched, score: aiScore, matchType: 'fuzzy', matchedField: 'fullName', algorithms: { exact: false, normalized: false, levenshtein: 0, jaroWinkler: 0, tokenBased: aiScore, firstNameMatch: 0, lastNameMatch: 0, doubleMetaphone: 0 } },
                candidates: [], slCode: matched.slCode, ruta: matched.ruta, consolidationEnabled: matched.consolidationEnabled,
                searchedName: name, totalCustomers: customers.length, multipleMatches: aiMatches.length > 1, requiresUserChoice: false,
              };
              results.set(index, newResult);
              nameMatchCache.set(name.toUpperCase().trim(), newResult);
              console.log(`[CustomerMatcher] 🤖 AI batch-search "${name}" → "${matched.fullName || matched.name}" (${aiMatches[0].confidence}%)`);
              if (aiMatches[0].confidence >= MATCH_THRESHOLDS.AI_AUTO_SAVE_SEARCH) {
                saveAIAutoMatchFeedback({ manifestName: name, slCode: matched.slCode, fullName: matched.fullName || matched.name, ruta: matched.ruta, consolidationEnabled: matched.consolidationEnabled, confidence: aiMatches[0].confidence }).catch(() => { });
              }
            }
          }
        }
      } catch { /* Batch search API failed */ }
    }
  }

  // ── PASS 3: LEARNED MATCH FALLBACK ────────────────────────────────────────
  for (const { index, name } of names) {
    const searchName = name.toUpperCase().trim();
    const learned = lookupLearned(searchName, learnedMatches);
    if (!learned || learned.score < MATCH_THRESHOLDS.LEARNED_ACCEPT_MIN) continue;

    const existingResult = results.get(index);
    // If we already have a solid exact match without ambiguity, don't overwrite it
    if (existingResult?.exactMatch && !existingResult.requiresUserChoice && existingResult.bestMatch && existingResult.bestMatch.score >= MATCH_THRESHOLDS.AUTO_ACCEPT_MIN) {
      continue;
    }

    const liveCustomer = getCustomerBySlCode(learned.slCode) ?? customers.find(c => c.slCode.toUpperCase() === learned.slCode.toUpperCase());
    const activeRuta = liveCustomer ? liveCustomer.ruta : (learned.ruta ?? undefined);
    const activeConsolidation = liveCustomer ? liveCustomer.consolidationEnabled : learned.consolidationEnabled;
    const matchedCustomer = liveCustomer ?? { id: learned.slCode, name: learned.fullName, fullName: learned.fullName, normalizedName: learned.normalizedName, firstName: learned.fullName.split(' ')[0] || '', lastName: learned.fullName.split(' ').slice(1).join(' ') || '', slCode: learned.slCode, ruta: activeRuta, consolidationEnabled: activeConsolidation, email: '', phone: '', isTemp: true };
    const matchedCustomerWithActive = { ...matchedCustomer, ruta: activeRuta, consolidationEnabled: activeConsolidation };

    const hasCollision = hasLearnedCollision(learned.normalizedName) || dynamicCollisions.has(learned.normalizedName);
    const collisionIsDominant = hasCollision ? isDominantCollisionWinner(learned.normalizedName, learned.slCode) : false;
    const isAmbiguous = hasCollision && !collisionIsDominant;

    // Keep existing candidates so the user can choose from them if it remains ambiguous
    let candidates = existingResult?.candidates ? [...existingResult.candidates] : [];
    // Ensure the learned matched customer is in the candidates
    if (!candidates.some(c => c.customer.slCode === matchedCustomerWithActive.slCode)) {
      candidates.unshift({ customer: matchedCustomerWithActive, score: learned.score, matchType: 'fuzzy', matchedField: 'fullName', algorithms: { exact: false, normalized: false, levenshtein: 0, jaroWinkler: 0, tokenBased: learned.score, firstNameMatch: 0, lastNameMatch: 0, doubleMetaphone: 0 } });
    }

    if (isAmbiguous) {
      // Overwrite only if it provides a better score or we need to add candidates
      if (!existingResult || !existingResult.bestMatch || existingResult.bestMatch.score < learned.score) {
        results.set(index, {
          exactMatch: false,
          bestMatch: { customer: matchedCustomerWithActive, score: learned.score, matchType: 'fuzzy', matchedField: 'fullName', algorithms: { exact: false, normalized: false, levenshtein: 0, jaroWinkler: 0, tokenBased: learned.score, firstNameMatch: 0, lastNameMatch: 0, doubleMetaphone: 0 } },
          candidates, slCode: learned.slCode, ruta: activeRuta, consolidationEnabled: activeConsolidation,
          searchedName: name, totalCustomers: customers.length, multipleMatches: true, requiresUserChoice: true,
        });
        nameMatchCache.set(searchName, results.get(index)!);
      }
    } else {
      // Not ambiguous — safe to upgrade to exact match
      const learnedResult: CustomerMatchResponse = {
        exactMatch: learned.score >= 1.0,
        bestMatch: { customer: matchedCustomerWithActive, score: learned.score, matchType: 'exact', matchedField: 'fullName', algorithms: { exact: true, normalized: true, levenshtein: 1, jaroWinkler: 1, tokenBased: 1, firstNameMatch: 1, lastNameMatch: 1, doubleMetaphone: 1 } },
        candidates, slCode: learned.slCode, ruta: activeRuta, consolidationEnabled: activeConsolidation,
        searchedName: name, totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false,
      };
      results.set(index, learnedResult);
      nameMatchCache.set(searchName, learnedResult);
      learnedMatchCount++;
      console.log(`[CustomerMatcher] 🎓 Learned fallback: "${name}" → "${learned.fullName}" (${learned.slCode}) ${(learned.score * 100).toFixed(0)}% ×${learned.hitCount}`);
    }
  }

  // ── PASS 4: LAST RESORT TEMP MATCH ────────────────────────────────────────
  // Priority for SL-NAN is the absolute lowest. We only match them if all real
  // customer matches, learned fallbacks, and AI attempts yielded nothing, and
  // the temp customer has an extremely strict high-confidence score (>= 0.90).
  for (const { index, name } of names) {
    const existingResult = results.get(index);
    // Only proceed if we still have no slCode assigned or it requires user choice
    if (existingResult && !existingResult.slCode) {
      const searchName = name.toUpperCase().trim();
      const matches = matchName(searchName, customers);
      const topMatch = matches[0];
      if (topMatch && topMatch.customer.isTemp && topMatch.score >= 0.90) {
        const result: CustomerMatchResponse = {
          exactMatch: true, bestMatch: topMatch, candidates: matches, slCode: topMatch.customer.slCode,
          ruta: topMatch.customer.ruta, consolidationEnabled: topMatch.customer.consolidationEnabled,
          searchedName: name, totalCustomers: customers.length, multipleMatches: false, requiresUserChoice: false,
        };
        results.set(index, result);
        nameMatchCache.set(searchName, result);
        console.log(`[CustomerMatcher] 🟡 Last Resort Temp-Customer Match: "${name}" → "${topMatch.customer.fullName}" (${topMatch.customer.slCode})`);
      }
    }
  }

  // ── LOGGING + TELEMETRY ──────────────────────────────────────────────────
  const totalMatched = Array.from(results.values()).filter(r => r.bestMatch && r.bestMatch.score >= 0.45).length;
  console.log(`%c[CustomerMatcher] FINAL RESULTS: ${totalMatched}/${names.length} matched (${((totalMatched / names.length) * 100).toFixed(1)}%)`, 'color: #4CAF50; font-weight: bold');
  if (noMatchNames.length > 0) console.log(`%c[CustomerMatcher] NO-MATCH (${noMatchNames.length}): ${noMatchNames.slice(0, 10).join(', ')}`, 'color: #FF5722');
  if (lowScoreNames.length > 0) {
    console.log(`%c[CustomerMatcher] LOW-SCORE SENT TO AI (${lowScoreNames.length}):`, 'color: #FF9800; font-weight: bold');
    lowScoreNames.slice(0, 10).forEach(l => console.log(`[CustomerMatcher]   "${l.name}" → "${l.bestMatch}" (${(l.score * 100).toFixed(0)}%)`));
  }

  // Flush telemetry (non-blocking)
  flushTelemetry(telemetry).catch(() => { /* telemetry errors are non-critical */ });

  return results;
}
