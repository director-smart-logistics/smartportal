import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { firestoreApi, listDocuments, deleteDocument } from '@/lib/firebase/firestore-client';
import { firebaseApi } from '@/lib/firebase/callable';

export interface UserDto {
  id: string;
  email: string;
  fullName: string;
  role: string;
  phone?: string;
  createdAt: string;
  status: string;
  isPending?: boolean;
}

function toIso(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value === 'string') return value;
  return '';
}

export function useUsers(options?: { enabled?: boolean }) {
  const qc = useQueryClient();
  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!enabled) return;

    let usersSnap: UserDto[] = [];
    let pendingSnap: UserDto[] = [];
    const ready = { users: false, pending: false };

    const merge = () => {
      if (!ready.users || !ready.pending) return;
      const activeEmails = new Set(
        usersSnap.map((u) => u.email?.trim().toLowerCase())
      );
      const filteredPending = pendingSnap.filter(
        (p) => !activeEmails.has((p.email ?? '').trim().toLowerCase())
      );
      qc.setQueryData<UserDto[]>(['users'], [...usersSnap, ...filteredPending]);
    };

    const usersQ = query(
      collection(db, 'users'),
      orderBy('createdAt', 'desc')
    );
    const pendingQ = query(
      collection(db, 'pending_registrations'),
      orderBy('createdAt', 'desc')
    );

    const unsubUsers = onSnapshot(
      usersQ,
      (snap) => {
        usersSnap = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              email: (data.email as string) ?? '',
              fullName: (data.fullName as string) ?? '',
              role: (data.role as string) ?? 'VIEWER',
              phone: (data.phone as string) ?? undefined,
              createdAt: toIso(data.createdAt),
              status: (data.status as string) ?? 'active',
              isPending: false,
            };
          })
          .filter((u) => u.status !== 'deleted');
        ready.users = true;
        merge();
      },
      (err) => console.error('[useUsers] users snapshot error:', err)
    );

    const unsubPending = onSnapshot(
      pendingQ,
      (snap) => {
        pendingSnap = snap.docs.map((d) => {
          const data = d.data();
          const email = (data.email as string) ?? d.id;
          return {
            id: email,
            email,
            fullName: (data.fullName as string) ?? email,
            role: (data.role as string) ?? 'VIEWER',
            phone: (data.phone as string) ?? undefined,
            createdAt: toIso(data.createdAt),
            status: 'pending_invitation',
            isPending: true,
          };
        });
        ready.pending = true;
        merge();
      },
      (err) => console.error('[useUsers] pending snapshot error:', err)
    );

    return () => {
      unsubUsers();
      unsubPending();
    };
  }, [enabled, qc]);

  return useQuery<UserDto[]>({
    queryKey: ['users'],
    queryFn: async () => {
      const [usersRes, pendingRes] = await Promise.all([
        firestoreApi.users.list({ pageSize: 200 }),
        listDocuments<Record<string, any>>('pending_registrations', {
          orderByField: 'createdAt',
          orderDirection: 'desc',
          pageSize: 200,
        }),
      ]);
      const users = ((usersRes.data as UserDto[]) || []).filter(
        (u) => u.status !== 'deleted'
      );
      const activeEmails = new Set(users.map((u) => u.email?.trim().toLowerCase()));
      const pending: UserDto[] = ((pendingRes.data as Record<string, any>[]) || [])
        .filter((p) => !activeEmails.has((p.email as string)?.trim().toLowerCase()))
        .map((p) => ({
          id: p.email as string,
          email: p.email as string,
          fullName: (p.fullName as string) || (p.email as string),
          role: (p.role as string) || 'VIEWER',
          phone: (p.phone as string) || undefined,
          createdAt: (p.createdAt as string) || '',
          status: 'pending_invitation',
          isPending: true,
        }));
      return [...users, ...pending];
    },
    enabled,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useUser(id?: string) {
  return useQuery<UserDto | undefined>({
    enabled: !!id,
    queryKey: ['user', id],
    queryFn: async () => {
      if (!id) return undefined;
      const res = await firestoreApi.users.get(id);
      return res as UserDto | undefined;
    },
  });
}

export function useInvalidateUsers() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['users'] });
  };
}

export interface CreateUserDto {
  email: string;
  fullName: string;
  role: string;
  phone?: string;
  status?: string;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateUserDto) => {
      const res = await firestoreApi.users.create(data);
      return res as unknown as UserDto;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: Partial<UserDto>) => {
      const res = await firestoreApi.users.update(id, data);
      return res as UserDto;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user', id] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await firebaseApi.users.delete(id);
      return { id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}

export function useDeletePendingRegistration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      await deleteDocument('pending_registrations', email.trim().toLowerCase());
      return { email };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });
}