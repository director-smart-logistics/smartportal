import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { firestoreApi, listDocumentsCursor, COLLECTIONS, type CursorPage } from '@/lib/firebase/firestore-client';
import { serverTimestamp, collection, query, where, getDocs, writeBatch, doc, deleteField, arrayUnion } from 'firebase/firestore';
import type { DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { deleteInvoiceFromSp2 } from '@/lib/services/sync-invoices-service';
import { db } from '@/lib/firebase/config';

export interface InvoiceItemInput { packageId: string; quantity: number; unitPrice: number }

export function useInvoices(filters?: { status?: string; customerId?: string; skip?: number; take?: number }) {
  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: async () => {
      const filterArray = filters?.status ? [{ field: 'status', op: '==' as const, value: filters.status }] : undefined;
      const result = await firestoreApi.invoices.list({
        page: filters?.skip ? Math.floor(filters.skip / (filters.take || 20)) + 1 : 1,
        pageSize: filters?.take || 20,
        filters: filterArray,
      });
      return { data: result.data };
    },
    staleTime: 30000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: ['invoice', id],
    queryFn: async () => {
      const result = await firestoreApi.invoices.get(id!);
      if (!result) throw new Error('Invoice not found');
      return { data: result };
    },
    staleTime: 60000,
    gcTime: 600000,
    retry: 1,
    retryDelay: 1000,
  });
}

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { customerId: string; items?: InvoiceItemInput[]; notes?: string }) => {
      const result = await firestoreApi.invoices.create(payload);
      return { data: result };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['invoices-cursor'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useUpdateInvoice(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const result = await firestoreApi.invoices.update(id, data);
      return { data: result };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
      qc.invalidateQueries({ queryKey: ['invoices-cursor'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useAddInvoiceItem(invoiceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: InvoiceItemInput) => {
      console.warn('useAddInvoiceItem: Items should be added during invoice creation');
      return { data: item };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', invoiceId] });
    },
  });
}

export function useDeleteInvoiceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (itemId: string) => {
      console.warn('useDeleteInvoiceItem: Items should be managed during invoice update');
      return { data: { id: itemId } };
    },
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });
}

export function useMarkInvoiceSent(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await firestoreApi.invoices.update(id, { status: 'sent' });
      return { data: result };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });
}

export function useMarkInvoicePaid(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const result = await firestoreApi.invoices.update(id, { status: 'paid' });
      return { data: result };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoice', id] });
    },
  });
}

export interface SoftDeleteInvoiceParams {
  id: string;
  deletedBy: string;
  deletedByName: string;
  invoiceNumber?: string;
}

export function useDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, deletedBy, deletedByName, invoiceNumber }: SoftDeleteInvoiceParams) => {
      await firestoreApi.invoices.update(id, {
        status: 'deleted',
        deletedAt: serverTimestamp(),
        deletedBy,
        deletedByName,
        ...(invoiceNumber && { deletedInvoiceNumber: invoiceNumber }),
      });

      // Unlink packages associated with this invoice in SP1
      try {
        const pkgSnaps = await getDocs(query(collection(db, 'packages'), where('invoiceId', '==', id)));
        if (!pkgSnaps.empty) {
          const batch = writeBatch(db);
          pkgSnaps.docs.forEach(pkgDoc => {
            const data = pkgDoc.data() as any;
            const isEncomienda = (data.manifestNumber || '').toUpperCase().startsWith('ENC-') || data.ruta === 'Encomiendas';
            const targetPkgStatus = isEncomienda ? 'customs' : 'consolidated';

            batch.update(doc(db, 'packages', pkgDoc.id), {
              status: targetPkgStatus,
              invoiceId: deleteField(),
              invoiceNumber: deleteField(),
              invoiceStatus: deleteField(),
              smartwebSynced: false,
              statusHistory: arrayUnion({
                status: targetPkgStatus,
                changedAt: new Date().toISOString(),
                changedBy: deletedByName || deletedBy || 'admin',
                note: `Factura ${invoiceNumber || id} eliminada — paquete desvinculado y devuelto a ${targetPkgStatus}.`,
              }),
            });
          });
          await batch.commit();
          console.log(`[useDeleteInvoice] Successfully unlinked ${pkgSnaps.size} packages in SP1`);
        }
      } catch (pkgErr) {
        console.warn('[useDeleteInvoice] Failed to unlink packages in SP1:', pkgErr);
      }

      await deleteInvoiceFromSp2(id, invoiceNumber || id);
      return { data: { id } };
    },
    onSuccess: (_, { id }) => {
      qc.setQueriesData({ queryKey: ['invoices-cursor'] }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.filter((inv: any) => inv.id !== id) };
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['invoices-cursor'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['packages'] });
    },
  });
}

/**
 * HARD-delete an invoice document from Firestore. Irreversible — only
 * reachable from `/invoices/recovery` (the trash) after the operator has
 * already soft-deleted it, and gated by a double confirmation in the UI.
 *
 * Intentionally does NOT touch related collections (packages, manifests,
 * temp_customers) because by the time an invoice reaches the trash those
 * references have already been cleaned up by the soft-delete / reassign
 * flows. If future requirements change this contract, extend the mutation
 * body accordingly.
 */
export function usePermanentlyDeleteInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await firestoreApi.invoices.delete(id);
      await deleteInvoiceFromSp2(id, id);
      return { data: { id } };
    },
    onSuccess: (_, id) => {
      qc.setQueriesData({ queryKey: ['invoices-cursor'] }, (old: any) => {
        if (!old?.data) return old;
        return { ...old, data: old.data.filter((inv: any) => inv.id !== id) };
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['invoices-cursor'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

export function useRestoreInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await firestoreApi.invoices.update(id, {
        status: 'draft',
        deletedAt: null,
        deletedBy: null,
        deletedByName: null,
        restoredAt: serverTimestamp(),
      });
      return { data: { id } };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['invoices-cursor'] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Cursor-based invoice loader — scales to 10k+ invoices without offset reads.
// Default: loads last 1000 invoices sorted by createdAt desc.
// loadMore(n) appends the next n invoices after the current last cursor.
// ─────────────────────────────────────────────────────────────────────────────
export type LoadMoreAmount = 500 | 1000 | 'all';

export interface UseInvoicesCursorOptions {
  initialLimit?: number;
  statusFilter?: string;
  /** ISO date string — only load invoices created on or after this date */
  dateFrom?: string;
  enabled?: boolean;
}

export interface UseInvoicesCursorResult<T> {
  invoices: T[];
  isLoading: boolean;
  isFetching: boolean;
  isFetchingMore: boolean;
  hasMore: boolean;
  totalLoaded: number;
  loadMore: (amount: LoadMoreAmount) => Promise<void>;
  reload: () => void;
}

export function useInvoicesCursor<T = any>(
  options: UseInvoicesCursorOptions = {}
): UseInvoicesCursorResult<T> {
  const { initialLimit = 1000, statusFilter, dateFrom, enabled = true } = options;

  const filters: Array<{ field: string; op: '==' | '!=' | '<' | '<=' | '>' | '>='; value: unknown }> = [];
  if (statusFilter) {
    filters.push({ field: 'status', op: '==' as const, value: statusFilter });
  }
  if (dateFrom) {
    filters.push({ field: 'createdAt', op: '>=' as const, value: new Date(dateFrom) });
  }

  // React Query for the initial load
  const { data: initialPage, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['invoices-cursor', initialLimit, statusFilter, dateFrom, enabled],
    queryFn: () => {
      if (!enabled) return { data: [], hasMore: false, nextCursor: null };
      return listDocumentsCursor<T>(COLLECTIONS.INVOICES, {
        pageSize: initialLimit,
        orderByField: 'createdAt',
        orderDirection: 'desc',
        filters: filters.length > 0 ? filters : undefined,
      });
    },
    staleTime: 30_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
    enabled: enabled,
  });

  // Local accumulator: pages beyond the initial load
  const [extraPages, setExtraPages] = useState<CursorPage<T>[]>([]);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Merge all loaded data
  const invoices: T[] = [
    ...(initialPage?.data ?? []),
    ...extraPages.flatMap((p) => p.data),
  ];

  // The cursor after the last extra page, or after the initial page
  const lastCursor: QueryDocumentSnapshot<DocumentData> | null =
    extraPages.length > 0
      ? extraPages[extraPages.length - 1].nextCursor
      : (initialPage?.nextCursor ?? null);

  const hasMore =
    extraPages.length > 0
      ? (extraPages[extraPages.length - 1].hasMore)
      : (initialPage?.hasMore ?? false);

  const loadMore = useCallback(
    async (amount: LoadMoreAmount) => {
      if (isFetchingMore || !hasMore) return;
      setIsFetchingMore(true);
      const cursorFilters = filters.length > 0 ? filters : undefined;
      try {
        if (amount === 'all') {
          // Keep fetching pages until hasMore is false
          let cursor: QueryDocumentSnapshot<DocumentData> | null = lastCursor;
          let more: boolean = hasMore;
          const pages: CursorPage<T>[] = [];
          while (more && cursor) {
            const page = await listDocumentsCursor<T>(COLLECTIONS.INVOICES, {
              pageSize: 1000,
              orderByField: 'createdAt',
              orderDirection: 'desc',
              filters: cursorFilters,
              cursor,
            });
            pages.push(page);
            cursor = page.nextCursor;
            more = page.hasMore;
          }
          setExtraPages((prev) => [...prev, ...pages]);
        } else {
          const page = await listDocumentsCursor<T>(COLLECTIONS.INVOICES, {
            pageSize: amount,
            orderByField: 'createdAt',
            orderDirection: 'desc',
            filters: cursorFilters,
            cursor: lastCursor,
          });
          setExtraPages((prev) => [...prev, page]);
        }
      } finally {
        setIsFetchingMore(false);
      }
    },
    [isFetchingMore, hasMore, lastCursor, filters]
  );

  const reload = useCallback(() => {
    setExtraPages([]);
    setReloadKey((k) => k + 1);
    refetch();
  }, [refetch]);

  return {
    invoices,
    isLoading,
    isFetching,
    isFetchingMore,
    hasMore,
    totalLoaded: invoices.length,
    loadMore,
    reload,
  };
}

// ============================================
// Customer Creation for Invoice Flow
// ============================================

export interface CreateInvoiceCustomerInput {
  fullName: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  slCode?: string;
  deliveryAddress1?: string;
}

export interface CreateInvoiceCustomerResponse {
  success: boolean;
  customer: {
    id: string;
    fullName: string;
    email: string;
    phone?: string;
    slCode?: string;
  };
}

export function useCreateInvoiceCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateInvoiceCustomerInput) => {
      const result = await firestoreApi.customers.create(data);
      return { success: true, customer: result } as CreateInvoiceCustomerResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}