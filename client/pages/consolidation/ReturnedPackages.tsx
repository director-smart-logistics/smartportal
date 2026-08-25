import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import {
  Undo2,
  Search,
  Building,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Loader2,
  Package,
  Clock,
  MapPin,
  Truck,
  Scale,
  DollarSign,
  X,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, writeBatch, arrayUnion, deleteField, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { syncPackagesToSmartWeb } from '@/lib/services/sync-smartweb-service';
import { deleteInvoiceFromSp2 } from '@/lib/services/sync-invoices-service';
import { getRouteColor } from '@/lib/utils/route-colors';
import { CopyButton } from '@/components/ui/copy-button';

// Interface for returned packages loaded from Firestore
interface ReturnedPackage {
  id: string;
  trackingNumber: string;
  customerName: string;
  slCode: string;
  manifestNumber: string;
  manifestId?: string;
  ruta: string;
  returnedAt: string;
  returnReason: string;
  invoiceId?: string;
  invoiceNumber?: string;
  invoiceStatus?: string;
  weight?: number;
  description?: string;
}

interface CustomerGroup {
  slCode: string;
  customerName: string;
  ruta?: string;
  packages: ReturnedPackage[];
}

interface ManifestInfo {
  date: Date | null;
  type: 'ENC' | 'MAR' | 'REGULAR';
}

/** Parses type (Permisos/ENC, Maritimo/MAR, Regular) and date from a manifest code string */
function parseManifestInfo(name: string): ManifestInfo {
  const upper = (name || '').trim().toUpperCase();
  
  let type: 'ENC' | 'MAR' | 'REGULAR' = 'REGULAR';
  if (upper.startsWith('ENC') || upper.includes('-ENC-') || upper.includes('PERMISOS')) {
    type = 'ENC';
  } else if (upper.startsWith('MAR') || upper.includes('-MAR-') || upper.includes('MARITIMO')) {
    type = 'MAR';
  }

  let date: Date | null = null;
  // Match DD-MM-YYYY (e.g. 23-07-2026 or 15-07-2026)
  const ddmmyyyyMatch = upper.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (ddmmyyyyMatch) {
    const day = parseInt(ddmmyyyyMatch[1], 10);
    const month = parseInt(ddmmyyyyMatch[2], 10) - 1;
    const year = parseInt(ddmmyyyyMatch[3], 10);
    date = new Date(year, month, day);
  } else {
    // Match YYYY-MM-DD
    const yyyymmddMatch = upper.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (yyyymmddMatch) {
      const year = parseInt(yyyymmddMatch[1], 10);
      const month = parseInt(yyyymmddMatch[2], 10) - 1;
      const day = parseInt(yyyymmddMatch[3], 10);
      date = new Date(year, month, day);
    }
  }

  return { date, type };
}

export default function ReturnedPackages() {
  const { toast } = useToast();
  const [packages, setPackages] = useState<ReturnedPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPkgs, setSelectedPkgs] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Track expanded state for customer sections
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  
  // Re-assign manifest & modal dialog states
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [singleTargetPkg, setSingleTargetPkg] = useState<ReturnedPackage | null>(null);
  const [showReconsolidateModal, setShowReconsolidateModal] = useState(false);
  const [showOfficeDeliveryModal, setShowOfficeDeliveryModal] = useState(false);
  const [targetManifest, setTargetManifest] = useState('');
  const [isSelectedTag, setIsSelectedTag] = useState(false);
  const [availableManifests, setAvailableManifests] = useState<string[]>([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Source package manifest name (used to enforce date >= source date and matching manifest type)
  const sourceManifestName = useMemo(() => {
    if (singleTargetPkg) {
      return singleTargetPkg.manifestNumber || singleTargetPkg.manifestId || '';
    }
    if (selectedPkgs.size > 0) {
      const first = packages.find(p => selectedPkgs.has(p.id));
      return first?.manifestNumber || first?.manifestId || '';
    }
    return '';
  }, [singleTargetPkg, selectedPkgs, packages]);

  const sourceManifestInfo = useMemo(() => {
    return sourceManifestName ? parseManifestInfo(sourceManifestName) : null;
  }, [sourceManifestName]);

  const filteredManifests = useMemo(() => {
    const q = targetManifest.trim().toLowerCase();

    return availableManifests.filter(m => {
      // 1. Filter by search query if user typed anything
      if (q && !m.toLowerCase().includes(q)) return false;

      // 2. Enforce manifest type & date >= source date constraint
      if (sourceManifestInfo) {
        const candInfo = parseManifestInfo(m);

        // Type constraint (Regular vs Permisos/ENC vs Maritimo/MAR)
        if (candInfo.type !== sourceManifestInfo.type) {
          return false;
        }

        // Date constraint: only allow manifests on or after the source package manifest date
        if (sourceManifestInfo.date && candInfo.date) {
          const srcTime = new Date(sourceManifestInfo.date.getFullYear(), sourceManifestInfo.date.getMonth(), sourceManifestInfo.date.getDate()).getTime();
          const candTime = new Date(candInfo.date.getFullYear(), candInfo.date.getMonth(), candInfo.date.getDate()).getTime();
          if (candTime < srcTime) {
            return false;
          }
        }
      }

      return true;
    });
  }, [targetManifest, availableManifests, sourceManifestInfo]);
  
  // 1. Subscribe to returned packages (listening to both status and deliveryStatus)
  useEffect(() => {
    let q1Docs: any[] = [];
    let q2Docs: any[] = [];

    const updateList = () => {
      const pkgsMap = new Map<string, ReturnedPackage>();
      const allDocs = [...q1Docs, ...q2Docs];
      allDocs.forEach((d: any) => {
        const data = d.data() as any;
        // If the package has been explicitly delivered at pickup office or moved to transitoria, skip
        if (data.status === 'pickup' || data.deliveryStatus === 'pickup' || data.manifestNumber === 'consolidacion_transitoria') {
          return;
        }

        pkgsMap.set(d.id, {
          id: d.id,
          trackingNumber: data.trackingNumber || data.tracking || '',
          customerName: data.customerName || data.nombreCliente || 'Cliente Desconocido',
          slCode: data.slCode || '',
          manifestNumber: data.manifestNumber || data.manifiesto || '',
          ruta: data.ruta || '',
          returnedAt: data.returnedAt || '',
          returnReason: data.returnReason || 'Sin motivo especificado',
          invoiceId: data.invoiceId,
          invoiceNumber: data.invoiceNumber,
          invoiceStatus: data.invoiceStatus,
          weight: data.weight || data.peso,
          description: data.description || data.descripcion,
        });
      });

      setPackages(Array.from(pkgsMap.values()));
      setLoading(false);
    };

    const q1 = query(collection(db, 'packages'), where('status', '==', 'returned'));
    const q2 = query(collection(db, 'packages'), where('deliveryStatus', '==', 'returned'));

    const unsub1 = onSnapshot(q1, (snap) => {
      q1Docs = snap.docs;
      updateList();
    }, (err) => {
      console.error('[ReturnedPackages] Firestore q1 error:', err);
      toast({ title: 'Error al cargar paquetes devueltos', description: err.message, variant: 'destructive' });
      setLoading(false);
    });

    const unsub2 = onSnapshot(q2, (snap) => {
      q2Docs = snap.docs;
      updateList();
    }, (err) => {
      console.error('[ReturnedPackages] Firestore q2 error:', err);
    });

    return () => {
      unsub1();
      unsub2();
    };
  }, [toast]);

  // 2. Fetch available manifests for reassignment suggestions from manifests collection (optimized to prevent database read leak)
  useEffect(() => {
    const q = query(
      collection(db, 'manifests'),
      orderBy('processedAt', 'desc'),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      const set = new Set<string>();
      snap.docs.forEach(d => {
        const id = d.id.trim().toUpperCase();
        if (id && id !== 'CONSOLIDACION_TRANSITORIA') {
          set.add(id);
        }
      });
      setAvailableManifests(Array.from(set).sort().slice(-10)); // Top 10 most recent
    }, (err) => {
      console.error('[ReturnedPackages] Manifests query failed:', err);
    });
    return unsub;
  }, []);

  // 3. Group packages by customer slCode / name
  const groupedCustomers = useMemo(() => {
    const map = new Map<string, CustomerGroup>();
    
    // Filter packages based on search query
    const filtered = packages.filter(p => {
      const q = search.toLowerCase().trim();
      if (!q) return true;
      return (
        p.trackingNumber.toLowerCase().includes(q) ||
        p.customerName.toLowerCase().includes(q) ||
        p.slCode.toLowerCase().includes(q) ||
        p.manifestNumber.toLowerCase().includes(q)
      );
    });

    for (const pkg of filtered) {
      const key = (pkg.slCode || pkg.customerName).toUpperCase().trim();
      if (!map.has(key)) {
        map.set(key, {
          slCode: pkg.slCode,
          customerName: pkg.customerName,
          ruta: pkg.ruta,
          packages: [],
        });
      }
      map.get(key)!.packages.push(pkg);
    }
    
    const sorted = Array.from(map.values()).sort((a, b) => a.customerName.localeCompare(b.customerName));
    
    // Auto-expand all customers initially when they change or load
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      sorted.forEach(c => next.add(c.slCode || c.customerName));
      return next;
    });

    return sorted;
  }, [packages, search]);

  const toggleCustomerExpand = (key: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleToggleSelectAll = (pkgIds: string[], checked: boolean) => {
    setSelectedPkgs(prev => {
      const next = new Set(prev);
      for (const id of pkgIds) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedPkgs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Action: Re-consolidar (Mover a Consolidación Transitoria)
  const handleReconsolidate = async () => {
    if (selectedPkgs.size === 0) return;
    
    setActionLoading('recon');
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const pkgsToSync: any[] = [];
      const invoiceIdsToAnnul = new Set<string>();
      const cancelledInvoices: { id: string; num: string }[] = [];

      // 1. Collect all invoice IDs associated with the selected packages or tracking numbers
      for (const id of selectedPkgs) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) continue;

        if (pkg.invoiceId) {
          invoiceIdsToAnnul.add(pkg.invoiceId);
        }

        if (pkg.trackingNumber) {
          const [snapArr, snapSingle] = await Promise.all([
            getDocs(query(
              collection(db, 'invoices'),
              where('trackingNumbers', 'array-contains', pkg.trackingNumber),
            )),
            getDocs(query(
              collection(db, 'invoices'),
              where('trackingNumber', '==', pkg.trackingNumber),
            )),
          ]);
          for (const d of [...snapArr.docs, ...snapSingle.docs]) {
            invoiceIdsToAnnul.add(d.id);
          }
        }
      }

      // 2. Annul collected invoice documents ONLY if not paid (preserve admin-given status)
      const paidInvoices = new Set<string>();
      for (const invId of invoiceIdsToAnnul) {
        const invRef = doc(db, 'invoices', invId);
        const invSnap = await getDoc(invRef);
        if (invSnap.exists()) {
          const invData = invSnap.data();
          const isPaid = (invData.status || '').toLowerCase() === 'paid';
          if (isPaid) {
            paidInvoices.add(invId);
            continue; // Lock: Never annul invoices marked as paid by admin
          }
          if (invData.status !== 'annulled' && invData.status !== 'cancelled') {
            batch.update(invRef, {
              status: 'annulled',
              annulledAt: now,
              cancelReason: 'Paquete devuelto re-consolidado: desvinculado y movido a Consolidación Transitoria',
              updatedAt: now,
              statusHistory: arrayUnion({
                status: 'annulled',
                changedAt: now,
                changedBy: 'returns-management-manual',
                reason: 'Paquete devuelto re-consolidado: desvinculado y movido a Consolidación Transitoria',
              }),
            });
            cancelledInvoices.push({ id: invId, num: invData.invoiceNumber || invId });
          }
        }
      }

      // 3. Update packages: move to consolidacion_transitoria
      for (const id of selectedPkgs) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) continue;

        const hasPaidInvoice = pkg.invoiceStatus === 'paid' || (pkg.invoiceId && paidInvoices.has(pkg.invoiceId));

        if (hasPaidInvoice) {
          // If invoice was paid, preserve invoice linkage and pricing
          batch.update(doc(db, 'packages', id), {
            status: 'consolidated',
            deliveryStatus: 'consolidated',
            manifestId: 'consolidacion_transitoria',
            manifestNumber: 'consolidacion_transitoria',
            updatedManifest: 'consolidacion_transitoria',
            encomiendaManifestNumber: 'none',
            manifestUpdatedAt: now,
            consolidacion: true,
            ...(!pkg.firstConsolidatedAt ? { firstConsolidatedAt: now } : {}),
            smartwebSyncSource: 'transitoria',
            smartwebSynced: false,
            statusHistory: arrayUnion({
              status: 'consolidated',
              changedAt: now,
              changedBy: 'returns-management-manual',
              note: `Paquete devuelto re-consolidado a Consolidación Transitoria (conservando factura pagada ${pkg.invoiceNumber || ''})`,
            }),
          });
        } else {
          // Unpaid: reset pricing guards & remove invoice refs
          batch.update(doc(db, 'packages', id), {
            status: 'consolidated',
            deliveryStatus: 'consolidated',
            manifestId: 'consolidacion_transitoria',
            manifestNumber: 'consolidacion_transitoria',
            updatedManifest: 'consolidacion_transitoria',
            encomiendaManifestNumber: 'none',
            manifestUpdatedAt: now,
            consolidacion: true,
            ...(!pkg.firstConsolidatedAt ? { firstConsolidatedAt: now } : {}),
            invoiceId: deleteField(),
            invoiceNumber: deleteField(),
            invoiceStatus: deleteField(),
            smartwebSyncSource: 'transitoria',
            smartwebSynced: false,

            // Clear pricing overrides so target manifest calculates clean standard pricing
            ajustePrecio: deleteField(),
            precio: deleteField(),
            price: deleteField(),
            precioSinPermiso: deleteField(),
            precioConPermiso: deleteField(),
            pesoRedondeo: deleteField(),
            diferenciaRedondeo: deleteField(),
            pesoConsolidacion: deleteField(),
            cost: deleteField(),
            costCRC: deleteField(),

            statusHistory: arrayUnion({
              status: 'consolidated',
              changedAt: now,
              changedBy: 'returns-management-manual',
              note: 'Paquete devuelto re-consolidado (movido a Consolidación Transitoria) por administración',
            }),
          });
        }

        pkgsToSync.push({
          id: pkg.id,
          trackingNumber: pkg.trackingNumber,
          slCode: pkg.slCode,
          customerName: pkg.customerName,
          status: 'consolidated',
          weight: pkg.weight,
          description: pkg.description,
          ruta: pkg.ruta,
          manifestNumber: 'consolidacion_transitoria',
          forceSync: true,
          allowCreate: true,
        });
      }

      await batch.commit();

      // 4. Delete annulled invoices from SP2 customer portal
      for (const inv of cancelledInvoices) {
        await deleteInvoiceFromSp2(inv.id, inv.num).catch(() => {});
      }

      // 5. Sync updated packages to SP2 (SmartWeb)
      if (pkgsToSync.length > 0) {
        await syncPackagesToSmartWeb(pkgsToSync);
      }

      const annulNote = cancelledInvoices.length > 0
        ? ` Se anularon ${cancelledInvoices.length} factura(s) asociada(s).`
        : '';
      toast({
        title: 'Enviados a Consolidación Transitoria',
        description: `${selectedPkgs.size} paquete(s) movidos a Consolidación Transitoria.${annulNote}`,
      });
      setSelectedPkgs(new Set());
      setShowReconsolidateModal(false);
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error al enviar a transitoria', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  // Action: Entregar en Oficina (Retirado en Oficina)
  const handleOfficeDelivery = async () => {
    if (selectedPkgs.size === 0) return;

    setActionLoading('office');
    setShowOfficeDeliveryModal(false);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const pkgsToSync: any[] = [];

      for (const id of selectedPkgs) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) continue;

        batch.update(doc(db, 'packages', id), {
          status: 'pickup',
          deliveryStatus: 'pickup',
          pickupAt: now,
          statusHistory: arrayUnion({
            status: 'pickup',
            changedAt: now,
            changedBy: 'returns-management-manual',
            note: 'Paquete devuelto entregado/retirado en oficina',
          }),
        });

        pkgsToSync.push({
          id: pkg.id,
          trackingNumber: pkg.trackingNumber,
          slCode: pkg.slCode,
          customerName: pkg.customerName,
          status: 'pickup',
          weight: pkg.weight,
          description: pkg.description,
          ruta: pkg.ruta,
          manifestNumber: pkg.manifestNumber,
          forceSync: true,
          allowCreate: true,
        });
      }

      await batch.commit();

      if (pkgsToSync.length > 0) {
        await syncPackagesToSmartWeb(pkgsToSync);
      }

      toast({ title: 'Entregados en oficina', description: `${selectedPkgs.size} paquete(s) marcados como retirados en oficina.` });
      setSelectedPkgs(new Set());
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error al actualizar paquetes', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  /**
   * Action: Devolver al Remitente (Procesado)
   */
  const handleSenderReturn = async () => {
    if (selectedPkgs.size === 0) return;

    setActionLoading('sender');
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const pkgsToSync: any[] = [];

      for (const id of selectedPkgs) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) continue;

        batch.update(doc(db, 'packages', id), {
          status: 'processed',
          deliveryStatus: 'processed',
          processedAt: now,
          statusHistory: arrayUnion({
            status: 'processed',
            changedAt: now,
            changedBy: 'returns-management-manual',
            note: 'Devolución finalizada: paquete retornado al remitente en Miami',
          }),
        });

        pkgsToSync.push({
          id: pkg.id,
          trackingNumber: pkg.trackingNumber,
          slCode: pkg.slCode,
          customerName: pkg.customerName,
          status: 'processed',
          weight: pkg.weight,
          description: pkg.description,
          ruta: pkg.ruta,
          manifestNumber: pkg.manifestNumber,
          forceSync: true,
          allowCreate: true,
        });
      }

      await batch.commit();

      if (pkgsToSync.length > 0) {
        await syncPackagesToSmartWeb(pkgsToSync);
      }

      toast({ title: 'Devolución procesada', description: `${selectedPkgs.size} paquete(s) marcados como devueltos a origen.` });
      setSelectedPkgs(new Set());
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error al procesar devolución', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  // Action: Re-asignar manifiesto
  const handleReassignManifest = async () => {
    const mf = targetManifest.trim().toUpperCase();
    if (!mf) return;

    const targetIds = singleTargetPkg ? new Set([singleTargetPkg.id]) : selectedPkgs;
    if (targetIds.size === 0) return;

    setActionLoading('reassign');
    setShowReassignDialog(false);
    try {
      const batch = writeBatch(db);
      const now = new Date().toISOString();
      const pkgsToSync: any[] = [];
      const invoiceIdsToAnnul = new Set<string>();
      const cancelledInvoices: { id: string; num: string }[] = [];

      // 1. Gather all invoice IDs attached to target packages or tracking numbers
      for (const id of targetIds) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) continue;

        if (pkg.invoiceId) {
          invoiceIdsToAnnul.add(pkg.invoiceId);
        }

        if (pkg.trackingNumber) {
          const [snapArr, snapSingle] = await Promise.all([
            getDocs(query(
              collection(db, 'invoices'),
              where('trackingNumbers', 'array-contains', pkg.trackingNumber),
            )),
            getDocs(query(
              collection(db, 'invoices'),
              where('trackingNumber', '==', pkg.trackingNumber),
            )),
          ]);
          for (const d of [...snapArr.docs, ...snapSingle.docs]) {
            invoiceIdsToAnnul.add(d.id);
          }
        }
      }

      // 2. Annul source invoices from old manifest ONLY if not paid (preserve admin-given status)
      const paidInvoices = new Set<string>();
      for (const invId of invoiceIdsToAnnul) {
        const invRef = doc(db, 'invoices', invId);
        const invSnap = await getDoc(invRef);
        if (invSnap.exists()) {
          const invData = invSnap.data();
          const isPaid = (invData.status || '').toLowerCase() === 'paid';
          if (isPaid) {
            paidInvoices.add(invId);
            continue; // Lock: Never annul invoices marked as paid by admin
          }
          if (invData.status !== 'annulled' && invData.status !== 'cancelled') {
            batch.update(invRef, {
              status: 'annulled',
              annulledAt: now,
              cancelReason: `Tracking devuelto reasignado al manifiesto ${mf}`,
              updatedAt: now,
              statusHistory: arrayUnion({
                status: 'annulled',
                changedAt: now,
                changedBy: 'returns-management-manual',
                reason: `Tracking devuelto reasignado al manifiesto ${mf}`,
              }),
            });
            cancelledInvoices.push({ id: invId, num: invData.invoiceNumber || invId });
          }
        }
      }

      // 3. Update packages: assign new manifest
      for (const id of targetIds) {
        const pkg = packages.find(p => p.id === id);
        if (!pkg) continue;

        const hasPaidInvoice = pkg.invoiceStatus === 'paid' || (pkg.invoiceId && paidInvoices.has(pkg.invoiceId));

        if (hasPaidInvoice) {
          // If invoice was paid, preserve invoice linkage and pricing
          batch.update(doc(db, 'packages', id), {
            status: 'consolidated',
            deliveryStatus: 'consolidated',
            manifestId: mf,
            manifestNumber: mf,
            updatedManifest: mf,
            encomiendaManifestNumber: mf.toUpperCase().startsWith('ENC-') ? mf : 'none',
            manifestUpdatedAt: now,
            consolidacion: true,
            isReassigned: true,
            isReturned: true,
            wasReturned: true,
            originalManifest: (pkg as any).originalManifest || pkg.manifestNumber || (pkg as any).manifiesto || mf,
            smartwebSyncSource: 'reassign',
            smartwebSynced: false,
            statusHistory: arrayUnion({
              status: 'consolidated',
              changedAt: now,
              changedBy: 'returns-management-manual',
              note: `Paquete devuelto re-asignado al manifiesto ${mf} (conservando factura pagada ${pkg.invoiceNumber || ''})`,
            }),
          });
        } else {
          // Unpaid: clear old invoice link & pricing overrides for clean re-invoicing in target manifest
          batch.update(doc(db, 'packages', id), {
            status: 'consolidated',
            deliveryStatus: 'consolidated',
            manifestId: mf,
            manifestNumber: mf,
            updatedManifest: mf,
            encomiendaManifestNumber: mf.toUpperCase().startsWith('ENC-') ? mf : 'none',
            manifestUpdatedAt: now,
            consolidacion: true,
            isReassigned: true,
            isReturned: true,
            wasReturned: true,
            originalManifest: (pkg as any).originalManifest || pkg.manifestNumber || (pkg as any).manifiesto || mf,
            invoiceId: deleteField(),
            invoiceNumber: deleteField(),
            invoiceStatus: deleteField(),
            smartwebSyncSource: 'reassign',
            smartwebSynced: false,

            // Clear pricing overrides so target manifest calculates clean standard pricing
            ajustePrecio: deleteField(),
            precio: deleteField(),
            price: deleteField(),
            precioSinPermiso: deleteField(),
            precioConPermiso: deleteField(),
            pesoRedondeo: deleteField(),
            diferenciaRedondeo: deleteField(),
            pesoConsolidacion: deleteField(),
            cost: deleteField(),
            costCRC: deleteField(),

            statusHistory: arrayUnion({
              status: 'consolidated',
              changedAt: now,
              changedBy: 'returns-management-manual',
              note: `Paquete devuelto re-asignado al manifiesto ${mf} por administración`,
            }),
          });
        }

        pkgsToSync.push({
          id: pkg.id,
          trackingNumber: pkg.trackingNumber,
          slCode: pkg.slCode,
          customerName: pkg.customerName,
          status: 'consolidated',
          weight: pkg.weight,
          description: pkg.description,
          ruta: pkg.ruta,
          manifestNumber: mf,
          forceSync: true,
          allowCreate: true,
        });
      }

      await batch.commit();

      // 4. Delete annulled invoices from SP2 customer portal
      for (const inv of cancelledInvoices) {
        await deleteInvoiceFromSp2(inv.id, inv.num).catch(() => {});
      }

      // 5. Sync updated packages to SP2 (SmartWeb)
      if (pkgsToSync.length > 0) {
        await syncPackagesToSmartWeb(pkgsToSync);
      }

      const annulNote = cancelledInvoices.length > 0
        ? ` Se anularon ${cancelledInvoices.length} factura(s) origen.`
        : '';
      toast({ title: 'Manifiesto re-asignado', description: `${targetIds.size} paquete(s) re-asignados al manifiesto ${mf}.${annulNote}` });
      
      if (singleTargetPkg) {
        setSingleTargetPkg(null);
      } else {
        setSelectedPkgs(new Set());
      }
      setTargetManifest('');
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error al re-asignar', description: err.message, variant: 'destructive' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col h-[calc(100vh-4.5rem)] md:h-[calc(100vh-4rem)] bg-background">
        <div className="flex flex-col flex-1 min-h-0">
          
          {/* Header (Same look as Consolidation) */}
          <div className="flex flex-col md:flex-row md:items-center justify-between px-4 sm:px-6 py-4 bg-background border-b border-border/80 gap-4 shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="p-1.5 sm:p-2 rounded-xl bg-red-50 dark:bg-red-950/20 shadow-sm border border-red-200/50 dark:border-red-900/30 shrink-0">
                <Undo2 className="h-4 w-4 sm:h-5 sm:w-5 text-red-500" aria-hidden />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl font-bold text-foreground tracking-tight">Devoluciones de Ruta</h1>
                <p className="text-xs text-muted-foreground mt-0.5 hidden sm:flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    {loading ? (
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 animate-pulse"></span>
                    ) : (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                      </>
                    )}
                  </span>
                  {loading ? 'Cargando devoluciones…' : 'Gestión de paquetes retornados en ruta'}
                </p>
              </div>
            </div>

            {/* Actions & Search */}
            <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end shrink-0">
              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-72 lg:w-96 sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden />
                  <Input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar tracking, cliente, manifiesto..."
                    className="pl-10 pr-10 h-10 text-sm w-full bg-background border-border/80 shadow-sm focus-visible:ring-1"
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Limpiar búsqueda"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Loader */}
          {loading && (
            <div className="flex flex-col items-center justify-center flex-1 gap-3 py-24 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Cargando devoluciones…</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && groupedCustomers.length === 0 && (
            <div className="flex flex-col items-center justify-center flex-1 gap-4 py-24 text-muted-foreground">
              <Package className="h-10 w-10 opacity-30" />
              <div className="text-center space-y-2 max-w-md px-4">
                <p className="text-sm font-medium text-foreground">
                  {search ? 'Sin resultados para los filtros aplicados.' : 'No hay devoluciones activas.'}
                </p>
                <p className="text-xs text-muted-foreground/70 leading-relaxed">
                  {search
                    ? `No se encontró ningún paquete devuelto con el criterio "${search}" en la vista local.`
                    : 'Los paquetes devueltos en ruta aparecen automáticamente cuando un chofer los registra en la aplicación móvil.'}
                </p>
              </div>
            </div>
          )}

          {/* Scrollable list of Customer Cards */}
          {!loading && groupedCustomers.length > 0 && (
            <div className="flex-1 overflow-y-auto px-2 sm:px-6 py-3 sm:py-5 space-y-3">
              {groupedCustomers.map(group => {
                const groupKey = group.slCode || group.customerName;
                const isOpen = expandedCustomers.has(groupKey);
                const allGroupIds = group.packages.map(p => p.id);
                const isGroupAllSelected = allGroupIds.every(id => selectedPkgs.has(id));
                const isGroupSomeSelected = allGroupIds.some(id => selectedPkgs.has(id)) && !isGroupAllSelected;
                
                return (
                  <div
                    key={groupKey}
                    className="flex flex-col border rounded-xl shadow-sm bg-card overflow-hidden transition-all border-border"
                  >
                    {/* Header: Collapse toggle + Route + SLCode + Name */}
                    <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 bg-muted/20 hover:bg-muted/30 transition-colors gap-3 border-b border-border">
                      <button
                        type="button"
                        onClick={() => toggleCustomerExpand(groupKey)}
                        className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity flex-1 min-w-0"
                        aria-expanded={isOpen}
                        title={isOpen ? "Colapsar cliente" : "Expandir cliente"}
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}

                        {/* Route or Courier Service Badge */}
                        {group.ruta ? (() => {
                          const rc = getRouteColor(group.ruta);
                          return (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border shrink-0',
                                rc.bg, rc.border, rc.text
                              )}
                              title={`Ruta: ${group.ruta}`}
                            >
                              <MapPin className="h-2.5 w-2.5 shrink-0" />
                              <span>{group.ruta}</span>
                            </span>
                          );
                        })() : null}

                        <span className="text-[10px] font-mono text-muted-foreground bg-background border border-border/60 px-1.5 py-0.5 rounded shrink-0">
                          {group.slCode || "—"}
                        </span>
                        <span className="text-sm font-semibold text-foreground truncate flex-1 uppercase">
                          {group.customerName}
                        </span>
                      </button>

                      {/* Right actions: Checkbox + Total Counter */}
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-bold text-muted-foreground px-2 py-0.5 rounded-full bg-background border border-border/60">
                          {group.packages.length} pq
                        </span>
                        <label className="flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-muted-foreground hover:text-foreground select-none">
                          <Checkbox
                            checked={isGroupAllSelected ? true : isGroupSomeSelected ? 'indeterminate' : false}
                            onCheckedChange={checked => handleToggleSelectAll(allGroupIds, !!checked)}
                            className="h-4 w-4 border-2 border-primary/70 data-[state=checked]:bg-primary"
                          />
                          <span className="hidden sm:inline">Seleccionar todo</span>
                        </label>
                      </div>
                    </div>

                    {/* Customer packages list */}
                    {isOpen && (
                      <div className="p-3 bg-background space-y-2">
                        {group.packages.map(pkg => (
                          <div
                            key={pkg.id}
                            className={cn(
                              "flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] rounded-lg px-3 py-2 border transition-all w-full",
                              selectedPkgs.has(pkg.id)
                                ? "bg-primary/5 border-primary/40 ring-1 ring-primary/20"
                                : "bg-muted/20 border-border hover:bg-muted/30"
                            )}
                          >
                            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
                              <Checkbox
                                checked={selectedPkgs.has(pkg.id)}
                                onCheckedChange={() => handleToggleSelectOne(pkg.id)}
                                className="h-4 w-4 border-2 border-primary/70 data-[state=checked]:bg-primary"
                              />
                            </label>

                            {/* Tracking Number */}
                            <span className="font-mono font-bold text-[13px] text-foreground min-w-0 inline-flex items-center gap-1">
                              <span className="truncate">{pkg.trackingNumber}</span>
                              <CopyButton value={pkg.trackingNumber} label="Copiar tracking" iconSize="h-3 w-3" />
                            </span>

                            {/* Status Badge */}
                            <span className="shrink-0">
                              <Badge className="bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 font-bold border-red-200 dark:border-red-900/30">
                                Devuelto
                              </Badge>
                            </span>

                            {/* Weight */}
                            {pkg.weight != null && pkg.weight > 0 && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
                                <Scale className="h-2.5 w-2.5" aria-hidden />
                                {pkg.weight.toFixed(2)} kg
                              </span>
                            )}

                            {/* Manifest Info */}
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 border border-border/80 px-1.5 py-0.5 rounded bg-background">
                              Manifiesto: <strong className="text-foreground">{pkg.manifestNumber}</strong>
                            </span>

                            {/* Route Info */}
                            {pkg.ruta && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 border border-border/80 px-1.5 py-0.5 rounded bg-background">
                                Ruta: <strong className="text-foreground">{pkg.ruta}</strong>
                              </span>
                            )}

                            {/* Date of Return */}
                            {pkg.returnedAt && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground shrink-0 leading-none">
                                <Clock className="h-3 w-3 text-muted-foreground/60" />
                                <span>{new Date(pkg.returnedAt).toLocaleString('es-CR')}</span>
                              </span>
                            )}

                            {/* Right Actions: Invoice Info + Direct Reassign Button */}
                            <div className="flex items-center gap-2 ml-auto shrink-0">
                              {pkg.invoiceNumber && (
                                <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-955/20 text-amber-700 dark:text-amber-400 border border-amber-200/50 shrink-0">
                                  Factura: {pkg.invoiceNumber} ({pkg.invoiceStatus})
                                </span>
                              )}
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSingleTargetPkg(pkg);
                                  setTargetManifest('');
                                  setIsSelectedTag(false);
                                  setIsDropdownOpen(false);
                                  setShowReassignDialog(true);
                                }}
                                className="h-7 px-2.5 text-[11px] font-bold gap-1 text-foreground border-border hover:bg-accent hover:border-primary/50 shadow-xs"
                                title="Re-asignar manifiesto para este paquete"
                              >
                                <ExternalLink className="h-3 w-3 text-primary" />
                                <span>Re-asignar</span>
                              </Button>
                            </div>

                            {/* Break to next line for Return Reason */}
                            <div className="w-full text-xs text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5 mt-1 pt-1.5 border-t border-border/40">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              <span>Motivo: {pkg.returnReason}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Floating Action Bar */}
          {selectedPkgs.size > 0 && (
            <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-3xl z-50 animate-in slide-in-from-bottom-5 fade-in duration-200">
              <div className="bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl p-3 space-y-2.5">
                {/* Header Row: Selection Count + Clear Button */}
                <div className="flex items-center justify-between px-1 border-b border-border/50 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1 rounded-lg bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400">
                      <Package className="h-4 w-4" />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-foreground">
                      <span className="text-red-600 dark:text-red-400 font-extrabold">{selectedPkgs.size}</span> paquete(s) seleccionado(s)
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedPkgs(new Set())}
                    className="h-7 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 gap-1 rounded-lg"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Desmarcar todo</span>
                  </Button>
                </div>

                {/* Action Buttons Grid / Row */}
                <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowReconsolidateModal(true)}
                    disabled={!!actionLoading}
                    className="h-9 text-xs font-bold border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 gap-1.5 shadow-xs justify-center"
                    title="Mover a Consolidación Transitoria"
                  >
                    {actionLoading === 'recon' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    <span>Consolidación Transitoria</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowOfficeDeliveryModal(true)}
                    disabled={!!actionLoading}
                    className="h-9 text-xs font-bold border-teal-200 dark:border-teal-900/50 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/30 gap-1.5 shadow-xs justify-center"
                    title="Marcar como retirado en oficina"
                  >
                    {actionLoading === 'office' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building className="h-3.5 w-3.5" />}
                    <span>Entregar Oficina</span>
                  </Button>
                  {/* 
                    OCULTADO SEGÚN REQUERIMIENTO OPERATIVO:
                    La opción de 'Procesar Devolución' (Devolver al remitente en Miami / status: 'processed')
                    se deshabilita temporalmente de la barra flotante visible de usuarios para prevenir
                    cierres de devolución por error. La función `handleSenderReturn` permanece implementada en la lógica.
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSenderReturn}
                      disabled={!!actionLoading}
                      className="h-9 text-xs font-bold border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/40 gap-1.5 shadow-xs justify-center"
                      title="Devolver al remitente en Miami (cierre definitivo)"
                    >
                      {actionLoading === 'sender' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                      <span>Procesar Devolución</span>
                    </Button>
                  */}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setTargetManifest('');
                      setIsSelectedTag(false);
                      setIsDropdownOpen(false);
                      setShowReassignDialog(true);
                    }}
                    disabled={!!actionLoading}
                    className="h-9 text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 shadow-sm justify-center col-span-2 sm:col-span-1"
                  >
                    {actionLoading === 'reassign' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
                    <span>Re-asignar Manifiesto</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Re-assign Manifest Dialog */}
          {showReassignDialog && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
              <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-md sm:max-w-lg shadow-2xl space-y-4.5">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-foreground">Re-asignar Manifiesto</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Moverá {singleTargetPkg ? `el paquete ${singleTargetPkg.trackingNumber}` : `los ${selectedPkgs.size} paquetes seleccionados`} a otro manifiesto de destino, liberándolo de la facturación actual.
                  </p>
                </div>

                {sourceManifestName && (
                  <div className="text-xs font-mono text-muted-foreground bg-muted/40 border border-border/60 rounded-xl p-3 flex items-center justify-between gap-2">
                    <span className="truncate">Manifiesto actual: <strong className="text-foreground font-extrabold">{sourceManifestName}</strong></span>
                    <Badge variant="outline" className="text-[10px] font-sans font-bold text-primary border-primary/30 bg-primary/10 shrink-0 px-2 py-0.5">
                      Futuro / Misma fecha
                    </Badge>
                  </div>
                )}
                
                {/* Type-ahead Autocomplete Container */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-muted-foreground block">
                    Selecciona o busca un manifiesto:
                  </label>
                  
                  {isSelectedTag && targetManifest.trim() ? (
                    /* Display Selected Tag / Badge */
                    <div className="flex items-center justify-between p-3 rounded-xl bg-primary/10 border border-primary/30 text-primary animate-in zoom-in-95 duration-150">
                      <div className="flex items-center gap-2 min-w-0">
                        <Package className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-mono font-extrabold text-xs uppercase truncate text-primary">{targetManifest.toUpperCase()}</span>
                        <Badge className="bg-primary/20 hover:bg-primary/20 text-primary border-primary/30 text-[9px] font-bold shrink-0">
                          Seleccionado
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetManifest('');
                          setIsSelectedTag(false);
                          setIsDropdownOpen(false);
                        }}
                        className="p-1 hover:bg-primary/20 rounded-lg text-primary transition-colors shrink-0 ml-2"
                        title="Cambiar manifiesto"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    /* Search Input + Type-Ahead Dropdown (only opens when typing) */
                    <div className="relative">
                      {/* Transparent backdrop to close dropdown on click outside */}
                      {isDropdownOpen && targetManifest.trim().length > 0 && (
                        <div
                          className="fixed inset-0 z-40 bg-transparent"
                          onClick={() => setIsDropdownOpen(false)}
                        />
                      )}

                      {/* Input Box */}
                      <div className="relative z-50">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                          autoFocus
                          placeholder="Escribe para buscar manifiesto..."
                          value={targetManifest}
                          onFocus={() => {
                            if (targetManifest.trim().length > 0) setIsDropdownOpen(true);
                          }}
                          onChange={e => {
                            const val = e.target.value;
                            setTargetManifest(val);
                            setIsDropdownOpen(val.trim().length > 0);
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && targetManifest.trim()) {
                              e.preventDefault();
                              setIsSelectedTag(true);
                              setIsDropdownOpen(false);
                            }
                          }}
                          className="h-10 pl-9 pr-9 font-mono font-bold text-xs uppercase bg-background border-border shadow-xs focus-visible:ring-1"
                        />
                        {targetManifest && (
                          <button
                            type="button"
                            onClick={() => { setTargetManifest(''); setIsDropdownOpen(false); }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                            aria-label="Limpiar búsqueda"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* Floating Type-ahead Autocomplete Dropdown List - ONLY shown when typing (targetManifest.trim().length > 0) */}
                        {isDropdownOpen && targetManifest.trim().length > 0 && filteredManifests.length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in fade-in-50 duration-150">
                            <div className="px-3 py-1.5 text-[10px] font-bold text-muted-foreground uppercase bg-muted border-b border-border">
                              Coincidencias encontradas ({filteredManifests.length})
                            </div>
                            <div className="max-h-44 overflow-y-auto divide-y divide-border/40">
                              {filteredManifests.map(m => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => {
                                    setTargetManifest(m);
                                    setIsSelectedTag(true);
                                    setIsDropdownOpen(false);
                                  }}
                                  className="w-full text-left px-3.5 py-2.5 text-xs font-mono font-semibold flex items-center justify-between transition-colors hover:bg-accent text-foreground"
                                >
                                  <span className="flex items-center gap-2 truncate">
                                    <Package className="h-3.5 w-3.5 text-primary shrink-0" />
                                    <span className="truncate">{m}</span>
                                  </span>
                                  <CheckCircle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0 ml-1" />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Custom manifest notice when user types an unlisted manifest */}
                        {isDropdownOpen && targetManifest.trim().length > 0 && !filteredManifests.some(m => m === targetManifest.toUpperCase()) && (
                          <div
                            onClick={() => {
                              setIsSelectedTag(true);
                              setIsDropdownOpen(false);
                            }}
                            className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-card border border-border rounded-xl shadow-2xl p-3 text-[11px] text-muted-foreground flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <Info className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              <span>Usar manifiesto: <strong className="font-mono text-foreground font-bold">{targetManifest.toUpperCase()}</strong></span>
                            </div>
                            <Badge variant="outline" className="text-[9px] font-sans">Enter ↵</Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button variant="ghost" size="sm" onClick={() => { setShowReassignDialog(false); setSingleTargetPkg(null); }} className="h-9 text-xs font-bold">
                    Cancelar
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleReassignManifest}
                    disabled={!targetManifest.trim()}
                    className="h-9 text-xs font-bold"
                  >
                    Confirmar
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Confirmación para Consolidación Transitoria */}
          {showReconsolidateModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
              <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-600 dark:text-amber-400 shrink-0">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-foreground">
                      Mover a Consolidación Transitoria
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Se moverán <strong className="text-foreground">{selectedPkgs.size} paquete(s)</strong> al manifiesto <strong className="font-mono text-foreground">consolidacion_transitoria</strong>.
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>Atención: Anulación de facturas</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-5">
                    Esta acción desvinculará los paquetes y <strong className="text-foreground font-semibold">anulará automáticamente sus facturas actuales</strong> en el portal y en SmartWeb para permitir una posterior consolidación limpia.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReconsolidateModal(false)}
                    disabled={!!actionLoading}
                    className="h-9 text-xs font-bold"
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleReconsolidate}
                    disabled={!!actionLoading}
                    className="h-9 text-xs font-bold gap-1.5 bg-red-600 hover:bg-red-700 text-white shadow-sm"
                  >
                    {actionLoading === 'recon' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    <span>Confirmar y Anular Facturas</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Modal de Confirmación para Entregar en Oficina */}
          {showOfficeDeliveryModal && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
              <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md shadow-2xl space-y-4">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900/50 text-teal-600 dark:text-teal-400 shrink-0">
                    <Building className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-foreground">
                      Entregar en Oficina
                    </h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Se marcarán <strong className="text-foreground">{selectedPkgs.size} paquete(s)</strong> como retirados/entregados en oficina (<strong className="font-mono text-foreground">pickup</strong>).
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20 text-xs text-teal-800 dark:text-teal-300">
                  <p className="text-[11px] leading-relaxed">
                    El estado de los paquetes se actualizará en el sistema administrativo y se sincronizará de inmediato con el portal del cliente en SmartWeb.
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowOfficeDeliveryModal(false)}
                    disabled={!!actionLoading}
                    className="h-9 text-xs font-bold"
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleOfficeDelivery}
                    disabled={!!actionLoading}
                    className="h-9 text-xs font-bold gap-1.5 bg-teal-600 hover:bg-teal-700 text-white shadow-sm"
                  >
                    {actionLoading === 'office' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building className="h-3.5 w-3.5" />}
                    <span>Confirmar Entrega</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </DashboardLayout>
  );
}
