import { useState, useCallback, useEffect, useRef } from 'react';
import { searchCustomersLocal, getCustomerBySlCode, findCustomerBySlCode } from '@/lib/services/customer-matcher';
import { getLearningAssociations } from '@/lib/services/manifest-learning-service';

export type CombinedResult = {
  slCode: string;
  fullName: string;
  email?: string;
  phone?: string;
  dni?: string;
  ruta?: string;
  consolidationEnabled?: boolean;
  score: number;
  source: 'local' | 'learning' | 'suggested';
  approvalCount?: number;
  isTemp?: boolean;
};

export interface UseCustomerSearchReturn {
  query: string;
  displayResults: CombinedResult[];
  suggestedResults: CombinedResult[];
  learningResults: CombinedResult[];
  currentCustomer?: CombinedResult;
  loading: boolean;
  handleInput: (val: string) => void;
  clearQuery: () => void;
  triggerSearchImmediate: (overrideVal?: string) => void;
}

export function useCustomerSearch(nombre: string, currentSlCode?: string): UseCustomerSearchReturn {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CombinedResult[]>([]);
  const [suggestedResults, setSuggestedResults] = useState<CombinedResult[]>([]);
  const [learningResults, setLearningResults] = useState<CombinedResult[]>([]);
  const [currentCustomer, setCurrentCustomer] = useState<CombinedResult | undefined>(() => {
    if (!currentSlCode) return undefined;
    const cached = getCustomerBySlCode(currentSlCode);
    if (!cached) return undefined;
    return {
      slCode: cached.slCode,
      fullName: cached.fullName || cached.name,
      email: cached.email,
      phone: cached.phone,
      dni: cached.dni,
      ruta: cached.ruta,
      consolidationEnabled: cached.consolidationEnabled,
      score: 1.0,
      source: 'local',
      isTemp: cached.isTemp,
    };
  });
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 1. Ultra-fast in-memory search on keystroke with resilient live fallback
  const runSearch = useCallback(async (term: string) => {
    const clean = term.trim();
    if (!clean) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      let hits = await searchCustomersLocal(clean, { limit: 8, minScore: 0.60 });

      // Direct fallback if exact SL code or digits were entered and still 0 hits
      if (hits.length === 0) {
        const cleanUpper = clean.toUpperCase().replace(/\s+/g, '');
        const targetSl = cleanUpper.startsWith('SL') ? cleanUpper : `SL${cleanUpper}`;
        const directCustomer = await findCustomerBySlCode(targetSl);
        if (directCustomer) {
          hits = [{
            slCode: directCustomer.slCode,
            fullName: directCustomer.fullName,
            email: directCustomer.email,
            phone: directCustomer.phone,
            dni: directCustomer.dni,
            ruta: directCustomer.ruta,
            consolidationEnabled: directCustomer.consolidationEnabled,
            score: 1.0,
            source: 'local' as const,
            isTemp: directCustomer.isTemp,
          } as any];
        }
      }

      const enriched: CombinedResult[] = hits.map((h) => ({
        slCode: h.slCode,
        fullName: h.fullName,
        email: (h as any).email || getCustomerBySlCode(h.slCode)?.email,
        phone: (h as any).phone || getCustomerBySlCode(h.slCode)?.phone,
        dni: (h as any).dni || getCustomerBySlCode(h.slCode)?.dni,
        ruta: h.ruta,
        consolidationEnabled: h.consolidationEnabled,
        score: h.score,
        source: 'local',
        isTemp: h.isTemp,
      }));
      setResults(enriched);
    } catch (err) {
      console.error('[useCustomerSearch] local search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const triggerSearchImmediate = useCallback((overrideVal?: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const term = overrideVal !== undefined ? overrideVal : query;
    if (!term.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    runSearch(term);
  }, [query, runSearch]);

  const handleInput = useCallback((val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // Execute search 2 seconds after the user stops typing
    debounceRef.current = setTimeout(() => {
      runSearch(val);
    }, 2000);
  }, [runSearch]);

  const clearQuery = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    setResults([]);
    setLoading(false);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // 2. Load Nova Learning associations and suggested matches on modal mount (0ms latency)
  useEffect(() => {
    const rawName = nombre?.trim();
    if (!rawName) return;

    let isMounted = true;

    // A. Nova Learning (Previously human-approved links)
    getLearningAssociations(rawName)
      .then((patterns) => {
        if (!isMounted || patterns.length === 0) return;
        const enriched: CombinedResult[] = patterns.map((p) => {
          const cached = getCustomerBySlCode(p.slCode);
          return {
            slCode: p.slCode,
            fullName: cached?.fullName || p.matchedName,
            email: cached?.email,
            phone: cached?.phone,
            dni: cached?.dni,
            ruta: cached?.ruta,
            consolidationEnabled: cached?.consolidationEnabled,
            score: Math.max(p.matchScore, 0.95),
            source: 'learning' as const,
            approvalCount: p.approvalCount,
            isTemp: cached?.isTemp,
          };
        });
        setLearningResults(enriched);
      })
      .catch((err) => {
        console.warn('[useCustomerSearch] error loading learning associations:', err);
      });

    // B. Suggested Local Matches (Deterministic in-memory match for the manifest name)
    searchCustomersLocal(rawName, { limit: 4, minScore: 0.68 })
      .then((hits) => {
        if (!isMounted || hits.length === 0) return;
        const enriched: CombinedResult[] = hits.map((h) => ({
          slCode: h.slCode,
          fullName: h.fullName,
          email: (h as any).email || getCustomerBySlCode(h.slCode)?.email,
          phone: (h as any).phone || getCustomerBySlCode(h.slCode)?.phone,
          dni: (h as any).dni || getCustomerBySlCode(h.slCode)?.dni,
          ruta: h.ruta,
          consolidationEnabled: h.consolidationEnabled,
          score: h.score,
          source: 'suggested' as const,
          isTemp: h.isTemp,
        }));
        setSuggestedResults(enriched);
      })
      .catch((err) => {
        console.warn('[useCustomerSearch] error loading suggested matches:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [nombre]);

  const displayResults = query.trim().length >= 2 ? results : [];

  return {
    query,
    displayResults,
    suggestedResults,
    learningResults,
    loading,
    handleInput,
    clearQuery,
  };
}
