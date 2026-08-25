import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { firebaseApi } from '@/lib/firebase/callable';
import { firestoreApi } from '@/lib/firebase/firestore-client';

export function useRoutes(filters?: { status?: string }, options?: any) {
  return useQuery({
    queryKey: ['routes', filters],
    queryFn: async () => {
      const res = await firebaseApi.routes.list(filters);
      if (res && res.success === false) throw new Error(res.error || 'Error al cargar rutas');
      // callFunction returns result.data from Firebase, so res = {success, data: routes[], pagination} or just {data: routes[]}.
      return res;
    },
    staleTime: 2 * 60 * 1000,
    ...options,
  });
}

export function useRoute(id?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: ['route', id],
    queryFn: async () => {
      const res = await firebaseApi.routes.getById(id!);
      if (!res.success) throw new Error(res.error || 'Error al cargar ruta');
      return res.data ?? null;
    },
  });
}

export function useCreateRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await firebaseApi.routes.create(payload);
      if (!res.success) throw new Error(res.error || 'Error al crear ruta');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });
}

export function useUpdateRoute(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await firebaseApi.routes.update(id, data);
      if (!res.success) throw new Error(res.error || 'Error al actualizar ruta');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['route', id] });
      qc.invalidateQueries({ queryKey: ['routes'] });
    },
  });
}

export function useDeleteRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await firebaseApi.routes.delete(id);
      if (!res.success) throw new Error(res.error || 'Error al eliminar ruta');
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });
}

function expandRouteVariations(route: string): string[] {
  const list = route.includes('+') ? route.split('+').map(s => s.trim()) : [route];
  const expanded: string[] = [];
  list.forEach(r => {
    if (!r) return;
    expanded.push(r);
    const lower = r.toLowerCase();
    if (!expanded.includes(lower)) expanded.push(lower);
    const capitalized = r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
    if (!expanded.includes(capitalized)) expanded.push(capitalized);
  });
  return expanded;
}

export function useRoutePackages(route: string | null, status?: string) {
  const qc = useQueryClient();

  // Real-time subscription — pushes Firestore snapshot updates into the React Query cache.
  // This makes manifest dropdown and package table instantly reactive to remote changes.
  useEffect(() => {
    if (!route) return;
    const qKey = ['route-packages', route, status ?? ''];
    const routesList = expandRouteVariations(route);

    const constraints = [
      routesList.length > 1 ? where('ruta', 'in', routesList) : where('ruta', '==', routesList[0]),
      ...(status ? [where('status', '==', status)] : [])
    ];
    const q = query(collection(db, 'packages'), ...constraints);
    const unsub = onSnapshot(
      q,
      snap => { qc.setQueryData(qKey, snap.docs.map(d => ({ id: d.id, ...d.data() as any }))); },
      () => { if (!qc.getQueryData(qKey)) qc.setQueryData(qKey, []); },
    );
    return unsub;
  }, [route, status, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  return useQuery({
    enabled: !!route,
    queryKey: ['route-packages', route ?? '', status ?? ''],
    queryFn: async () => {
      if (!route) return [];
      const routesList = expandRouteVariations(route);
      const constraints = [
        routesList.length > 1 ? where('ruta', 'in', routesList) : where('ruta', '==', routesList[0]),
        ...(status ? [where('status', '==', status)] : [])
      ];
      const q = query(collection(db, 'packages'), ...constraints);
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
    },
    staleTime: Infinity,   // onSnapshot keeps cache fresh — no polling needed
    refetchInterval: false,
  });
}