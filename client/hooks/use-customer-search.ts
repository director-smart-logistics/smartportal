import { useState, useCallback, useEffect, useRef } from 'react';
import { searchCustomersLocal, getCustomerBySlCode } from '@/lib/services/customer-matcher';
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

  // 1. Ultra-fast in-memory search on keystroke (120ms debounce, 0ms network latency)
  const runSearch = useCallback(async (term: string) => {
    const clean = term.trim();
    if (!clean) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const hits = await searchCustomersLocal(clean, { limit: 8, minScore: 0.60 });
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

  const handleInput = useCallback((val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(() => {
      runSearch(val);
    }, 120);
  }, [runSearch]);

  const clearQuery = useCallback(() => {
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
