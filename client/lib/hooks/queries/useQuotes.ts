import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';

// Quotes are not yet implemented in Firebase callable functions
// Using placeholder data for now

// Types
export interface QuoteItemInput {
  description: string;
  itemType?: 'shipping' | 'handling' | 'insurance' | 'customs' | 'other';
  quantity: number;
  unitPrice: number;
  weight?: number;
  dimensions?: string;
  origin?: string;
  destination?: string;
}

export interface LeadInfoInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  address?: string;
  taxId?: string;
  city?: string;
  country?: string;
}

export interface CreateQuoteInput {
  customerId?: string;
  customerType?: 'individual' | 'company';
  leadInfo?: LeadInfoInput;
  items?: QuoteItemInput[];
  discountPercentage?: number;
  currency?: string;
  validDays?: number;
  notes?: string;
  requestAiSuggestions?: boolean;
}

export interface QuoteFilters {
  status?: string;
  customerId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  skip?: number;
  take?: number;
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  description: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  weight?: number;
  dimensions?: string;
  origin?: string;
  destination?: string;
  createdAt: string;
}

export interface Quote {
  id: string;
  customerId?: string;
  quoteNumber: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';
  subtotalAmount: number;
  taxAmount: number;
  discountPercentage: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  quoteDate: string;
  validUntil?: string;
  notes?: string;
  customerType: 'individual' | 'company';
  leadName?: string;
  leadEmail?: string;
  leadPhone?: string;
  leadCompany?: string;
  leadAddress?: string;
  leadTaxId?: string;
  leadCity?: string;
  leadCountry?: string;
  aiSuggestions?: any;
  aiDealScore?: number;
  convertedToInvoiceId?: string;
  convertedAt?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  quoteItems: QuoteItem[];
  customer?: {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
    address?: string;
    slCode?: string;
  };
}

export interface QuotesResponse {
  data: Quote[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface QuoteStatistics {
  totalQuotes: number;
  draftQuotes: number;
  sentQuotes: number;
  acceptedQuotes: number;
  rejectedQuotes: number;
  convertedQuotes: number;
  totalAcceptedValue: number;
  conversionRate: number;
}

// AI Types
export interface CustomerAnalysis {
  customerId: string;
  customerName: string;
  totalOrders: number;
  totalSpent: number;
  averageOrderValue: number;
  lastOrderDate: string | null;
  preferredServices: string[];
  paymentHistory: 'excellent' | 'good' | 'fair' | 'poor';
  customerTier: 'premium' | 'standard' | 'new';
  insights: string[];
}

export interface DealPrediction {
  likelihood: number;
  category: 'very_likely' | 'likely' | 'uncertain' | 'unlikely';
  factors: {
    positive: string[];
    negative: string[];
  };
  recommendations: string[];
  estimatedCloseTime: string;
}

export interface QuoteAISuggestions {
  customerAnalysis?: CustomerAnalysis;
  pricingSuggestion?: {
    suggestedPrice: number;
    minPrice: number;
    maxPrice: number;
    confidence: number;
    reasoning: string;
    factors: any;
  };
  dealPrediction?: DealPrediction;
  discountRecommendation?: {
    suggestedDiscount: number;
    maxDiscount: number;
    reasoning: string;
    expectedImpact: any;
    alternatives: any[];
  };
  salesInsights?: {
    talkingPoints: string[];
    objectionHandlers: { objection: string; response: string }[];
    upsellOpportunities: string[];
    competitorInfo: string[];
    urgencyFactors: string[];
  };
  generatedAt: string;
}

// ============================================
// Query Hooks
// ============================================

export function useQuotes(filters?: QuoteFilters) {
  return useQuery<QuotesResponse>({
    queryKey: ['quotes', filters],
    queryFn: async () => {
      // Placeholder - quotes not yet implemented in Firebase Functions
      return {
        data: [],
        meta: { total: 0, page: 1, limit: 20, totalPages: 0, hasNextPage: false, hasPrevPage: false }
      };
    },
    staleTime: 30000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}

export function useQuote(id?: string) {
  return useQuery<Quote | undefined>({
    enabled: !!id,
    queryKey: ['quote', id],
    queryFn: async () => {
      // Placeholder - quotes not yet implemented in Firebase Functions
      return undefined;
    },
    staleTime: 60000,
    gcTime: 600000,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}

export function useQuoteStatistics() {
  return useQuery<QuoteStatistics>({
    queryKey: ['quotes', 'statistics'],
    queryFn: async () => {
      // Placeholder - quotes not yet implemented in Firebase Functions
      return {
        totalQuotes: 0, draftQuotes: 0, sentQuotes: 0, acceptedQuotes: 0,
        rejectedQuotes: 0, convertedQuotes: 0, totalAcceptedValue: 0, conversionRate: 0
      };
    },
    staleTime: 60000,
    gcTime: 300000,
  });
}

export function useQuoteAISuggestions(quoteId?: string) {
  return useQuery<QuoteAISuggestions>({
    enabled: !!quoteId,
    queryKey: ['quote', quoteId, 'ai-suggestions'],
    queryFn: async () => {
      // Placeholder - AI suggestions not yet implemented in Firebase Functions
      return { generatedAt: new Date().toISOString() };
    },
    staleTime: 120000, // Cache AI suggestions for 2 minutes
    gcTime: 600000,
    retry: 1,
  });
}

export function useCustomerAnalysis(customerId?: string) {
  return useQuery<CustomerAnalysis>({
    enabled: !!customerId,
    queryKey: ['customer', customerId, 'analysis'],
    queryFn: async () => {
      // Placeholder - customer analysis not yet implemented in Firebase Functions
      return {
        customerId: customerId || '', customerName: '', totalOrders: 0, totalSpent: 0,
        averageOrderValue: 0, lastOrderDate: null, preferredServices: [],
        paymentHistory: 'good' as const, customerTier: 'new' as const, insights: []
      };
    },
    staleTime: 120000,
    gcTime: 600000,
  });
}

// ============================================
// Mutation Hooks
// ============================================

export function useCreateQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateQuoteInput) => {
      console.warn('useCreateQuote: Not implemented in Firebase Functions');
      return { data: payload };
    },
    onMutate: async (newQuote) => {
      await qc.cancelQueries({ queryKey: ['quotes'] });
      const previousQuotes = qc.getQueryData(['quotes']);
      
      qc.setQueryData(['quotes'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: [{
            id: 'temp-' + Date.now(),
            customerId: newQuote.customerId,
            quoteNumber: 'PENDING...',
            status: 'draft',
            totalAmount: 0,
            currency: newQuote.currency || 'USD',
            quoteDate: new Date().toISOString(),
            notes: newQuote.notes,
            leadName: newQuote.leadInfo?.name,
            _optimistic: true,
          }, ...old.data],
        };
      });
      
      return { previousQuotes };
    },
    onError: (_err, _newQuote, context) => {
      if (context?.previousQuotes) {
        qc.setQueryData(['quotes'], context.previousQuotes);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useUpdateQuote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<Quote>) => {
      console.warn('useUpdateQuote: Not implemented in Firebase Functions');
      return { data: { id, ...data } };
    },
    onMutate: async (updatedData) => {
      await qc.cancelQueries({ queryKey: ['quote', id] });
      const previousQuote = qc.getQueryData(['quote', id]);
      
      qc.setQueryData(['quote', id], (old: any) => ({
        ...old,
        ...updatedData,
      }));
      
      return { previousQuote };
    },
    onError: (_err, _data, context) => {
      if (context?.previousQuote) {
        qc.setQueryData(['quote', id], context.previousQuote);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['quote', id] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useAddQuoteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ quoteId, item }: { quoteId: string; item: QuoteItemInput }) => {
      console.warn('useAddQuoteItem: Not implemented in Firebase Functions');
      return { data: item };
    },
    onSuccess: (_, { quoteId }) => {
      qc.invalidateQueries({ queryKey: ['quote', quoteId] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useRemoveQuoteItem(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      console.warn('useRemoveQuoteItem: Not implemented in Firebase Functions');
      return { data: { id: itemId } };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote', quoteId] });
    },
  });
}

export function useRecalculateQuote(quoteId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (discountPercentage?: number) => {
      console.warn('useRecalculateQuote: Not implemented in Firebase Functions');
      return { data: { quoteId, discountPercentage } };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote', quoteId] });
    },
  });
}

export function useMarkQuoteSent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      console.warn('useMarkQuoteSent: Not implemented in Firebase Functions');
      return { data: { id, status: 'sent' } };
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['quote', id] });
      const previousQuote = qc.getQueryData(['quote', id]);
      
      qc.setQueryData(['quote', id], (old: any) => ({
        ...old,
        status: 'sent',
      }));
      
      return { previousQuote };
    },
    onError: (_err, _data, context) => {
      if (context?.previousQuote) {
        qc.setQueryData(['quote', id], context.previousQuote);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['quote', id] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useMarkQuoteAccepted(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      console.warn('useMarkQuoteAccepted: Not implemented in Firebase Functions');
      return { data: { id, status: 'accepted' } };
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ['quote', id] });
      const previousQuote = qc.getQueryData(['quote', id]);
      
      qc.setQueryData(['quote', id], (old: any) => ({
        ...old,
        status: 'accepted',
      }));
      
      return { previousQuote };
    },
    onError: (_err, _data, context) => {
      if (context?.previousQuote) {
        qc.setQueryData(['quote', id], context.previousQuote);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['quote', id] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useMarkQuoteRejected(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      console.warn('useMarkQuoteRejected: Not implemented in Firebase Functions');
      return { data: { id, status: 'rejected' } };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['quote', id] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useConvertQuoteToInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (createCustomer?: boolean) => {
      console.warn('useConvertQuoteToInvoice: Not implemented in Firebase Functions');
      return { data: { id, createCustomer } };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote', id] });
      qc.invalidateQueries({ queryKey: ['quotes'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useDeleteQuote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      console.warn('useDeleteQuote: Not implemented in Firebase Functions');
      return { data: { id } };
    },
    onMutate: async (deletedId) => {
      await qc.cancelQueries({ queryKey: ['quotes'] });
      const previousQuotes = qc.getQueryData(['quotes']);
      
      qc.setQueryData(['quotes'], (old: any) => {
        if (!old?.data) return old;
        return {
          ...old,
          data: old.data.filter((quote: any) => quote.id !== deletedId),
        };
      });
      
      return { previousQuotes };
    },
    onError: (_err, _deletedId, context) => {
      if (context?.previousQuotes) {
        qc.setQueryData(['quotes'], context.previousQuotes);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['quotes'] });
    },
  });
}

export function useGenerateQuotePdf(id: string) {
  return useMutation({
    mutationFn: async () => {
      console.warn('useGenerateQuotePdf: Not implemented in Firebase Functions');
      return { data: { id } };
    },
  });
}

export function useSendQuoteSms(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { phoneNumber: string; companyName: string }) => {
      console.warn('useSendQuoteSms: Not implemented in Firebase Functions');
      return { data: payload };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quote', id] });
    },
  });
}

// AI Mutations
export function useAnalyzeLead() {
  return useMutation({
    mutationFn: async (leadInfo: {
      name: string;
      email?: string;
      phone?: string;
      company?: string;
      estimatedValue?: number;
    }) => {
      console.warn('useAnalyzeLead: Not implemented in Firebase Functions');
      return { data: leadInfo };
    },
  });
}

export interface AutoCompleteQuoteResponse {
  suggestedItems: Array<{
    description: string;
    itemType: 'shipping' | 'handling' | 'insurance' | 'customs' | 'other';
    quantity: number;
    unitPrice: number;
    weight?: number;
    origin?: string;
    destination?: string;
    reasoning: string;
  }>;
  autoCompleteData: {
    [itemIndex: number]: {
      description?: string;
      itemType?: string;
      quantity?: number;
      unitPrice?: number;
      weight?: number;
      origin?: string;
      destination?: string;
    };
  };
  engagingNotes: string;
  discountSuggestion: {
    percentage: number;
    reasoning: string;
  };
  closingTechniques: Array<{
    technique: string;
    description: string;
    expectedImpact: string;
  }>;
  dealClosingStrategy: {
    recommendedApproach: string;
    keyTalkingPoints: string[];
    urgencyFactors: string[];
    valueProposition: string;
  };
}

export interface SuggestPricingResponse {
  currency?: string;
  generatedAt?: string;
  itemPrices?: Array<{
    itemIndex: number;
    description?: string;
    suggestedPrice: number;
    minPrice?: number;
    maxPrice?: number;
    confidence?: number;
    reasoning?: string;
  }>;
  totalEstimate?: {
    suggested: number;
    min: number;
    max: number;
  };
  factors?: Record<string, any>;
}

export function useAutoCompleteQuote() {
  return useMutation({
    mutationFn: async (payload: {
      customerId?: string;
      language?: string;
      leadInfo?: {
        name?: string;
        email?: string;
        company?: string;
      };
      currentItems: Array<{
        description?: string;
        itemType?: string;
        quantity?: number;
        unitPrice?: number;
        weight?: number;
        origin?: string;
        destination?: string;
      }>;
      quoteValue?: number;
    }) => {
      console.warn('useAutoCompleteQuote: Not implemented in Firebase Functions');
      return null;
    },
  });
}

export function useSuggestPricing() {
  return useMutation({
    mutationFn: async (payload: {
      items: { description: string; weight?: number; origin?: string; destination?: string }[];
      customerId?: string;
      currency?: string;
      language?: string;
    }) => {
      console.warn('useSuggestPricing: Not implemented in Firebase Functions');
      return null;
    },
  });
}
