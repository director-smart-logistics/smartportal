import { useEffect, useMemo, useState, useRef } from 'react';
import {
  collection,
  onSnapshot,
  query,
  where,
  getDocs,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { principalLabelAddress, activeAdminOverride, areStringsRedundant, deduplicateAddressLines } from '@/lib/customers/label-address';
import { resolveCustomerEncomiendaService } from '@/lib/services/encomienda-lookup';

const CUSTOMERS_COLLECTION = 'customers';
const PACKAGES_COLLECTION  = 'packages';
const INVOICES_COLLECTION  = 'invoices';

export interface EncomiendaCustomer {
  id: string;
  slCode: string;
  fullName: string;
  email: string;
  phone: string;
  ruta: string;
  dni: string;
  courierService: string;
  encomiendaServiceName: string;
  address?: string;
  notes?: string;
  recipientName?: string;
  recipientPhone?: string;
  streetAddress?: string;
  details?: string;
  /** "district, canton, province" of the principal address (empty when the admin's correction applies) */
  geo?: string;
  deliveryInstructions?: string;
}

export interface EncomiendaPackage {
  id: string;
  trackingNumber: string;
  description: string;
  weight?: number;
  status: string;
  manifestNumber: string;
  updatedManifest: string;
  manifestUpdatedAt: any;
  slCode: string;
  customerName: string;
  ruta: string;
  origin: string;
  destination: string;
  requiresPermit: boolean;
  createdAt: any;
  savedAt: any;
  isReassigned: boolean;
  price?: number;
  currency?: string;
  invoiceNumber?: string;
  invoiceStatus?: string;
  invoiceId?: string;
  isMasterPackage?: boolean;
  groupedTrackings?: string[];
}

export interface EncomiendaInvoice {
  id: string;
  invoiceNumber: string;
  slCode: string;
  clientName: string;
  manifestNumber: string;
  manifestNumbers: string[];
  totalAmount: number;
  currency: string;
  status: string;
  isConsolidation: boolean;
  createdAt: any;
  updatedAt: any;
  invoiceItems: any[];
  ruta?: string;
  clientRoute?: string;
}

export interface ManifestGroup {
  manifestNumber: string;
  packages: EncomiendaPackage[];
  invoices: EncomiendaInvoice[];
}

export interface CustomerSection {
  customer: EncomiendaCustomer;
  manifestGroups: ManifestGroup[];
  lookupPackages: EncomiendaPackage[];
  totalPackages: number;
  totalWeight: number;
  totalAmount: number;
  manifestCount: number;
}

export interface UseEncomiendaDispatchDataResult {
  customerSections: CustomerSection[];
  allManifestNumbers: string[];
  allInvoices: EncomiendaInvoice[];
  allPackages: EncomiendaPackage[];
  manifestPackageCounts: Map<string, number>;
  loading: boolean;
  error: string | null;
}

// ── Customer address / service / notes for the dispatch and the encomienda manifest ─────────────
// F11 (docs/F11_LABEL_ADDRESS_AUDIT.md): the SAME principal address and service the labels print —
// principalLabelAddress / activeAdminOverride / resolveCustomerEncomiendaService. Before, this screen
// took the first address with any encomienda (not the principal), ignored the customer's proposed
// service (F8.2) and dropped the district/canton (L4, L5).

function getEncomiendaServiceName(c: any): string {
  const override = activeAdminOverride(c);
  if (override?.courierService) return override.courierService.trim();
  return resolveCustomerEncomiendaService(c).trim();
}

function getCustomerAddress(c: any): string {
  const override = activeAdminOverride(c);
  if (override?.deliveryAddress) return deduplicateAddressLines(override.deliveryAddress);
  const addrObj = principalLabelAddress(c);
  if (!addrObj) return '';
  // district (else city, as this screen printed before), canton (was dropped — L5), province
  const geo = [addrObj.district || addrObj.city, addrObj.canton, addrObj.province].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  return [addrObj.streetAddress, addrObj.details, geo, addrObj.country]
    .map((val) => (typeof val === 'string' ? val.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

/**
 * What the "Salida" shipping label prints as the address (F11 — the same rule as every label):
 *   - the admin's hand-typed address while it is newer than the customer's → only that text;
 *   - else the principal address: street, otras señas and district / canton / province.
 */
export function dispatchLabelAddress(c: any): { streetAddress: string; details: string; geo: string } {
  if (activeAdminOverride(c)?.deliveryAddress) return { streetAddress: '', details: '', geo: '' };
  const a = principalLabelAddress(c);
  const geo = a ? [a.district || a.city, a.canton, a.province].map((v) => String(v || '').trim()).filter(Boolean).join(', ') : '';
  return { streetAddress: String(a?.streetAddress || '').trim(), details: String(a?.details || '').trim(), geo };
}

// Customer notes + delivery instructions (without repeating what the address already says)
function getCustomerNotes(c: any): string {
  const addrObj = principalLabelAddress(c);
  const override = activeAdminOverride(c);
  const notesParts: string[] = [];
  if (c.notes && !(override?.deliveryAddress && areStringsRedundant(override.deliveryAddress, c.notes))) {
    notesParts.push(c.notes);
  }
  const instructions = String(addrObj?.deliveryInstructions || '');
  if (instructions) {
    const isRedundant = areStringsRedundant(String(addrObj?.details || ''), instructions)
      || (!!c.notes && areStringsRedundant(c.notes, instructions))
      || (!!override?.deliveryAddress && areStringsRedundant(override.deliveryAddress, instructions));
    if (!isRedundant) notesParts.push(instructions);
  }
  return notesParts.map((val) => (typeof val === 'string' ? val.trim() : '')).filter(Boolean).join(' | ');
}

/** Normalize manifest number (uppercase, trimmed) */
function normalizeManifest(m: string | null | undefined): string {
  if (!m) return '';
  return m.toUpperCase().trim();
}

export interface UseEncomiendaDispatchDataParams {
  /** Optional set of manifest numbers to filter packages and invoices */
  manifests?: Set<string>;
  /** Gate flag: when false, no package or invoice onSnapshot subscriptions are opened */
  hasLoaded?: boolean;
}

/**
 * useEncomiendaDispatchData
 *
 * Real-time data aggregation hook for the Encomiendas Dispatch module.
 *
 * ARCHITECTURAL OPTIMIZATION (Lazy On-Demand & Safe Chunking):
 * 1. Lazy Gating: When `hasLoaded` is false (e.g. before the operator clicks "Cargar"),
 *    zero heavy onSnapshot subscriptions to packages or invoices are initialized.
 * 2. Safe Chunking: `where('in', ...)` clauses chunk query terms in groups of $\le 30$
 *    to prevent Firestore query overflow errors.
 * 3. Lazy Deduplicated Customer Profiles: Customers are fetched in chunks of 30 by
 *    unique `slCode` extracted from loaded packages/invoices, caching fetched codes
 *    in `fetchedSlCodesRef` to avoid duplicate queries across renders.
 */
export function useEncomiendaDispatchData({ manifests, hasLoaded = false }: UseEncomiendaDispatchDataParams = {}): UseEncomiendaDispatchDataResult {
  const [customers, setCustomers] = useState<EncomiendaCustomer[]>([]);
  const [packages,  setPackages]  = useState<EncomiendaPackage[]>([]);
  const [invoicesQ, setInvoicesQ] = useState<EncomiendaInvoice[]>([]);
  const [invoicesQRuta, setInvoicesQRuta] = useState<EncomiendaInvoice[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingPackages,  setLoadingPackages]  = useState(false);
  const [loadingInvoices,  setLoadingInvoices]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // 0. Load manifests list on mount (always)
  const [manifestsList, setManifestsList] = useState<string[]>([]);
  useEffect(() => {
    const q = query(collection(db, 'manifests'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => d.id);
      setManifestsList(list);
    }, (err) => {
      console.error('[EncomiendaDispatch] manifests list error:', err);
    });
    return unsub;
  }, []);

  // Suscripción de montaje para obtener paquetes activos de encomienda para el cálculo del selector de manifiestos
  const [activePackagesOnMount, setActivePackagesOnMount] = useState<EncomiendaPackage[]>([]);
  useEffect(() => {
    if (!hasLoaded) return;
    const q = query(
      collection(db, PACKAGES_COLLECTION),
      where('ruta', '==', 'Encomiendas'),
      where('status', 'not-in', ['delivered', 'returned', 'pickup'])
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: EncomiendaPackage[] = [];
      snap.docs.forEach(d => {
        const data = d.data() as any;
        const original  = data.manifestNumber  || data.manifiesto || '';
        const updated   = data.updatedManifest  || '';
        const nativePrice =
          typeof data.precio === 'number' ? data.precio
          : typeof data.price === 'number' ? data.price
          : typeof data.precioSinPermiso === 'number' ? data.precioSinPermiso
          : typeof data.precioConPermiso === 'number' ? data.precioConPermiso
          : undefined;

        const pkg: EncomiendaPackage = {
          id:               d.id,
          trackingNumber:   data.trackingNumber || data.tracking  || '',
          description:      data.description   || data.descripcion || '',
          weight:           typeof data.weight === 'number' ? data.weight
                            : (typeof data.peso === 'number' ? data.peso : undefined),
          status:           data.status || '',
          manifestNumber:   original,
          updatedManifest:  updated,
          manifestUpdatedAt: data.manifestUpdatedAt,
          slCode:           data.slCode || '',
          customerName:     data.customerName || data.nombreCliente || '',
          ruta:             data.ruta || '',
          origin:           data.origin || data.origen || 'USA',
          destination:      data.destination || data.destino || 'CR',
          requiresPermit:   data.requiresPermit || data.permisos || false,
          createdAt:        data.createdAt || data.savedAt || '',
          savedAt:          data.savedAt || '',
          isReassigned:     !!updated && updated !== original,
          price:            nativePrice,
          currency:         data.currency || (nativePrice != null ? 'USD' : undefined),
          isMasterPackage:  false,
          groupedTrackings: data.groupedTrackings || [],
        };

        const statusLower = (pkg.status || '').toLowerCase();
        const isExcluded = statusLower === 'delivered' || statusLower === 'returned' || statusLower === 'pickup';
        if (!isExcluded) {
          list.push(pkg);
        }
      });
      if (mounted.current) {
        setActivePackagesOnMount(list);
      }
    }, (err) => {
      console.error('[EncomiendaDispatch] activePackagesOnMount subscription error:', err);
    });
    return unsub;
  }, [hasLoaded]);

  const manifestPackageCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const pkg of activePackagesOnMount) {
      if (pkg.isMasterPackage) continue; // Exclude master packages from count
      const mf = normalizeManifest(pkg.updatedManifest || pkg.manifestNumber);
      if (mf) {
        map.set(mf, (map.get(mf) || 0) + 1);
      }
    }
    return map;
  }, [activePackagesOnMount]);

  const [prevHasLoaded, setPrevHasLoaded] = useState(hasLoaded);
  if (hasLoaded !== prevHasLoaded) {
    setPrevHasLoaded(hasLoaded);
    if (hasLoaded) {
      setLoadingCustomers(true);
      setLoadingPackages(true);
      setLoadingInvoices(true);
      setPackages([]);
      setInvoicesQ([]);
      setInvoicesQRuta([]);
    } else {
      setLoadingCustomers(false);
      setLoadingPackages(false);
      setLoadingInvoices(false);
      setPackages([]);
      setInvoicesQ([]);
      setInvoicesQRuta([]);
    }
  }

  // 1. Encomienda Customers (Lazy, on-demand by loaded package/invoice slCodes)
  const fetchedSlCodesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!hasLoaded) {
      fetchedSlCodesRef.current.clear();
      setCustomers([]);
    }
  }, [hasLoaded]);

  useEffect(() => {
    if (!hasLoaded) return;

    // Extract unique slCodes from packages and invoices
    const slCodes = new Set<string>();
    packages.forEach(p => {
      if (p.slCode) slCodes.add(p.slCode);
    });
    invoicesQ.forEach(i => {
      if (i.slCode) slCodes.add(i.slCode);
    });
    invoicesQRuta.forEach(i => {
      if (i.slCode) slCodes.add(i.slCode);
    });

    // Find missing slCodes that we haven't attempted to fetch yet
    const missingSlCodes = Array.from(slCodes).filter(
      code => !fetchedSlCodesRef.current.has(code)
    );

    if (missingSlCodes.length === 0) {
      if (loadingPackages || loadingInvoices) {
        return;
      }
      if (loadingCustomers) {
        setLoadingCustomers(false);
      }
      return;
    }

    // Mark as fetched immediately to prevent concurrent duplicate queries
    missingSlCodes.forEach(code => fetchedSlCodesRef.current.add(code));

    setLoadingCustomers(true);
    let active = true;

    const fetchCustomersInChunks = async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < missingSlCodes.length; i += 30) {
        chunks.push(missingSlCodes.slice(i, i + 30));
      }

      const fetchedList: EncomiendaCustomer[] = [];

      try {
        for (const chunk of chunks) {
          const q = query(
            collection(db, CUSTOMERS_COLLECTION),
            where('slCode', 'in', chunk)
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            const data = d.data() as any;
            const encService = getEncomiendaServiceName(data);
            const address = getCustomerAddress(data);
            const notes = getCustomerNotes(data);

            const addrObj = principalLabelAddress(data);   // F11: the same address the labels print

            const recipientName = (addrObj?.recipientName || '').trim();
            const recipientPhone = (addrObj?.recipientPhone || '').trim();
            // F11: the admin's newer correction wins; else street + otras señas + district/canton/province.
            const { streetAddress, details, geo } = dispatchLabelAddress(data);
            const deliveryInstructions = (addrObj?.deliveryInstructions || '').trim();

            fetchedList.push({
              id: d.id,
              slCode:   data.slCode   || d.id,
              fullName: data.fullName || data.name || data.slCode || d.id,
              email:    data.email,
              phone:    data.phone || data.phoneNumber,
              ruta:     data.ruta,
              dni:      data.verifiedDni || data.dni,
              courierService: data.courierService,
              encomiendaServiceName: encService,
              address,
              notes,
              recipientName,
              recipientPhone,
              streetAddress,
              details,
              geo,
              deliveryInstructions,
            });
          });
        }

        if (mounted.current) {
          setCustomers(prev => {
            const map = new Map<string, EncomiendaCustomer>();
            prev.forEach(c => map.set(c.slCode, c));
            fetchedList.forEach(c => map.set(c.slCode, c));
            return Array.from(map.values());
          });
          setLoadingCustomers(false);
        }
      } catch (err) {
        console.error('[EncomiendaDispatch] fetch customers error:', err);
        if (mounted.current) {
          setError('Error al cargar perfiles de clientes.');
          setLoadingCustomers(false);
        }
      }
    };

    fetchCustomersInChunks();
  }, [hasLoaded, packages, invoicesQ, invoicesQRuta, loadingCustomers, customers.length, loadingPackages, loadingInvoices]);

  // 2. Encomienda Packages (Lazy)
  useEffect(() => {
    if (!hasLoaded) return;

    setLoadingPackages(true);

    const manifestsArray = manifests ? Array.from(manifests).filter(Boolean) : [];
    
    if (manifestsArray.length > 0) {
      // Generar todas las variaciones de nombres de manifiesto
      const manifestTerms = new Set<string>();
      manifestsArray.forEach(m => {
        manifestTerms.add(m.trim());
        manifestTerms.add(m.trim().toLowerCase());
        manifestTerms.add(m.trim().toUpperCase());
      });
      const queryManifests = Array.from(manifestTerms);

      const unsubscribes: (() => void)[] = [];
      const queryFields = ['manifestNumber', 'manifiesto', 'updatedManifest'];
      const resultsMap = new Map<string, Map<string, EncomiendaPackage>>();

      queryFields.forEach(field => {
        resultsMap.set(field, new Map());

        const q = query(
          collection(db, PACKAGES_COLLECTION),
          where(field, 'in', queryManifests)
        );

        const unsub = onSnapshot(q, (snap) => {
          const fieldMap = new Map<string, EncomiendaPackage>();
          snap.docs.forEach(d => {
            const data = d.data() as any;
            const original  = data.manifestNumber  || data.manifiesto || '';
            const updated   = data.updatedManifest  || '';
            const nativePrice =
              typeof data.precio === 'number' ? data.precio
              : typeof data.price === 'number' ? data.price
              : typeof data.precioSinPermiso === 'number' ? data.precioSinPermiso
              : typeof data.precioConPermiso === 'number' ? data.precioConPermiso
              : undefined;

            const pkg: EncomiendaPackage = {
              id:               d.id,
              trackingNumber:   data.trackingNumber || data.tracking  || '',
              description:      data.description   || data.descripcion || '',
              weight:           typeof data.weight === 'number' ? data.weight
                                : (typeof data.peso === 'number' ? data.peso : undefined),
              status:           data.status || '',
              manifestNumber:   original,
              updatedManifest:  updated,
              manifestUpdatedAt: data.manifestUpdatedAt,
              slCode:           data.slCode || '',
              customerName:     data.customerName || data.nombreCliente || '',
              ruta:             data.ruta || '',
              origin:           data.origin || data.origen || 'USA',
              destination:      data.destination || data.destino || 'CR',
              requiresPermit:   data.requiresPermit || data.permisos || false,
              createdAt:        data.createdAt || data.savedAt || '',
              savedAt:          data.savedAt || '',
              isReassigned:     !!updated && updated !== original,
              price:            nativePrice,
              currency:         data.currency || (nativePrice != null ? 'USD' : undefined),
              isMasterPackage:  !!data.isMasterPackage,
              groupedTrackings: data.groupedTrackings || [],
            };

            const statusLower = (pkg.status || '').toLowerCase();
            const isExcluded = statusLower === 'delivered' || statusLower === 'returned' || statusLower === 'pickup';
            const isEncomienda = pkg.ruta === 'Encomiendas';
            if (!isExcluded && isEncomienda) {
              fieldMap.set(pkg.id, pkg);
            }
          });

          resultsMap.set(field, fieldMap);

          if (mounted.current) {
            const merged = new Map<string, EncomiendaPackage>();
            resultsMap.forEach(map => {
              map.forEach((pkg, id) => merged.set(id, pkg));
            });
            setPackages(Array.from(merged.values()));
            setLoadingPackages(false);
          }
        }, (err) => {
          if (!mounted.current) return;
          console.error(`[EncomiendaDispatch] packages query error for ${field}:`, err);
          setError('Error al cargar paquetes de encomiendas.');
          setLoadingPackages(false);
        });

        unsubscribes.push(unsub);
      });

      // Also subscribe to active master packages to match invoices of selected manifests in real time
      resultsMap.set('masterPackages', new Map());
      const qMaster = query(
        collection(db, PACKAGES_COLLECTION),
        where('isMasterPackage', '==', true)
      );
      const unsubMaster = onSnapshot(qMaster, (snap) => {
        const masterMap = new Map<string, EncomiendaPackage>();
        snap.docs.forEach(d => {
          const data = d.data() as any;
          const original  = data.manifestNumber  || data.manifiesto || '';
          const updated   = data.updatedManifest  || '';
          const nativePrice =
            typeof data.precio === 'number' ? data.precio
            : typeof data.price === 'number' ? data.price
            : typeof data.precioSinPermiso === 'number' ? data.precioSinPermiso
            : typeof data.precioConPermiso === 'number' ? data.precioConPermiso
            : undefined;

          const pkg: EncomiendaPackage = {
            id:               d.id,
            trackingNumber:   data.trackingNumber || data.tracking  || '',
            description:      data.description   || data.descripcion || '',
            weight:           typeof data.weight === 'number' ? data.weight
                              : (typeof data.peso === 'number' ? data.peso : undefined),
            status:           data.status || '',
            manifestNumber:   original,
            updatedManifest:  updated,
            manifestUpdatedAt: data.manifestUpdatedAt,
            slCode:           data.slCode || '',
            customerName:     data.customerName || data.nombreCliente || '',
            ruta:             data.ruta || '',
            origin:           data.origin || data.origen || 'USA',
            destination:      data.destination || data.destino || 'CR',
            requiresPermit:   data.requiresPermit || data.permisos || false,
            createdAt:        data.createdAt || data.savedAt || '',
            savedAt:          data.savedAt || '',
            isReassigned:     !!updated && updated !== original,
            price:            nativePrice,
            currency:         data.currency || (nativePrice != null ? 'USD' : undefined),
            isMasterPackage:  true,
            groupedTrackings: data.groupedTrackings || [],
          };

          const statusLower = (pkg.status || '').toLowerCase();
          const isExcluded = statusLower === 'delivered' || statusLower === 'returned' || statusLower === 'pickup';
          if (!isExcluded) {
            masterMap.set(pkg.id, pkg);
          }
        });

        resultsMap.set('masterPackages', masterMap);

        if (mounted.current) {
          const merged = new Map<string, EncomiendaPackage>();
          resultsMap.forEach(map => {
            map.forEach((pkg, id) => merged.set(id, pkg));
          });
          setPackages(Array.from(merged.values()));
        }
      }, (err) => {
        console.error('[EncomiendaDispatch] master packages query error:', err);
      });
      unsubscribes.push(unsubMaster);

      return () => {
        unsubscribes.forEach(unsub => unsub());
      };
    } else {
      const q = query(
        collection(db, PACKAGES_COLLECTION),
        where('ruta', '==', 'Encomiendas'),
        where('status', 'not-in', ['delivered', 'returned', 'pickup'])
      );

      const unsub = onSnapshot(
        q,
        (snap) => {
          if (!mounted.current) return;
          const list: EncomiendaPackage[] = [];
          snap.docs.forEach(d => {
            const data = d.data() as any;
            const original  = data.manifestNumber  || data.manifiesto || '';
            const updated   = data.updatedManifest  || '';
            const nativePrice =
              typeof data.precio === 'number' ? data.precio
              : typeof data.price === 'number' ? data.price
              : typeof data.precioSinPermiso === 'number' ? data.precioSinPermiso
              : typeof data.precioConPermiso === 'number' ? data.precioConPermiso
              : undefined;

            const pkg: EncomiendaPackage = {
              id:               d.id,
              trackingNumber:   data.trackingNumber || data.tracking  || '',
              description:      data.description   || data.descripcion || '',
              weight:           typeof data.weight === 'number' ? data.weight
                                : (typeof data.peso === 'number' ? data.peso : undefined),
              status:           data.status || '',
              manifestNumber:   original,
              updatedManifest:  updated,
              manifestUpdatedAt: data.manifestUpdatedAt,
              slCode:           data.slCode || '',
              customerName:     data.customerName || data.nombreCliente || '',
              ruta:             data.ruta || '',
              origin:           data.origin || data.origen || 'USA',
              destination:      data.destination || data.destino || 'CR',
              requiresPermit:   data.requiresPermit || data.permisos || false,
              createdAt:        data.createdAt || data.savedAt || '',
              savedAt:          data.savedAt || '',
              isReassigned:     !!updated && updated !== original,
              price:            nativePrice,
              currency:         data.currency || (nativePrice != null ? 'USD' : undefined),
              isMasterPackage:  !!data.isMasterPackage,
              groupedTrackings: data.groupedTrackings || [],
            };
            list.push(pkg);
          });
          setPackages(list);
          setLoadingPackages(false);
        },
        (err) => {
          if (!mounted.current) return;
          console.error('[EncomiendaDispatch] packages error:', err);
          setError('Error al cargar paquetes de encomiendas.');
          setLoadingPackages(false);
        }
      );
      return unsub;
    }
  }, [hasLoaded, manifests]);

  // 3. Encomienda Invoices (Lazy)
  useEffect(() => {
    if (!hasLoaded) return;

    setLoadingInvoices(true);

    const manifestsArray = manifests ? Array.from(manifests).filter(Boolean) : [];

    const handleSnap = (snap: any, setFn: any) => {
      if (!mounted.current) return;
      
      const newList = snap.docs.map((d: any) => {
        const data = d.data() as any;
        return {
          id:              d.id,
          invoiceNumber:   data.invoiceNumber || '',
          slCode:          data.slCode || data.customerId || '',
          clientName:      data.clientName || '',
          manifestNumber:  data.manifestNumber || '',
          manifestNumbers: data.manifestNumbers || [],
          totalAmount:     data.totalAmount ?? data.amount ?? 0,
          currency:        data.currency || 'USD',
          status:          data.status || 'draft',
          isConsolidation: data.isConsolidation || false,
          createdAt:       data.createdAt || '',
          updatedAt:       data.updatedAt || '',
          invoiceItems:    data.invoiceItems || [],
          ruta:            data.ruta || '',
          clientRoute:     data.clientRoute || '',
        };
      });

      if (manifestsArray.length > 0) {
        const filteredList = newList.filter(
          inv => inv.clientRoute === 'Encomiendas' || inv.ruta === 'Encomiendas'
        );
        setFn(filteredList);
      } else {
        setFn(newList);
      }
      setLoadingInvoices(false);
    };

    if (manifestsArray.length > 0) {
      // Generar todas las variaciones de nombres de manifiesto
      const manifestTerms = new Set<string>();
      manifestsArray.forEach(m => {
        manifestTerms.add(m.trim());
        manifestTerms.add(m.trim().toLowerCase());
        manifestTerms.add(m.trim().toUpperCase());
      });
      const queryManifests = Array.from(manifestTerms);

      const unsubscribes: (() => void)[] = [];
      const queryFields = ['manifestNumber', 'manifiesto', 'manifestNumbers'];
      const resultsMap = new Map<string, Map<string, EncomiendaInvoice>>();

      queryFields.forEach(field => {
        resultsMap.set(field, new Map());

        let q;
        if (field === 'manifestNumbers') {
          q = query(
            collection(db, INVOICES_COLLECTION),
            where(field, 'array-contains-any', queryManifests)
          );
        } else {
          q = query(
            collection(db, INVOICES_COLLECTION),
            where(field, 'in', queryManifests)
          );
        }

        const unsub = onSnapshot(q, (snap) => {
          if (!mounted.current) return;
          const fieldMap = new Map<string, EncomiendaInvoice>();
          snap.docs.forEach(d => {
            const data = d.data() as any;
            const inv: EncomiendaInvoice = {
              id:              d.id,
              invoiceNumber:   data.invoiceNumber || '',
              slCode:          data.slCode || data.customerId || '',
              clientName:      data.clientName || '',
              manifestNumber:  data.manifestNumber || '',
              manifestNumbers: data.manifestNumbers || [],
              totalAmount:     data.totalAmount ?? data.amount ?? 0,
              currency:        data.currency || 'USD',
              status:          data.status || 'draft',
              isConsolidation: data.isConsolidation || false,
              createdAt:       data.createdAt || '',
              updatedAt:       data.updatedAt || '',
              invoiceItems:    data.invoiceItems || [],
              ruta:            data.ruta || '',
              clientRoute:     data.clientRoute || '',
            };

            if (inv.clientRoute === 'Encomiendas' || inv.ruta === 'Encomiendas') {
              fieldMap.set(inv.id, inv);
            }
          });

          resultsMap.set(field, fieldMap);

          const merged = new Map<string, EncomiendaInvoice>();
          resultsMap.forEach(map => {
            map.forEach((inv, id) => merged.set(id, inv));
          });
          setInvoicesQ(Array.from(merged.values()));
          setLoadingInvoices(false);
        }, (err) => {
          if (!mounted.current) return;
          console.error(`[EncomiendaDispatch] invoices query error for ${field}:`, err);
          setLoadingInvoices(false);
        });

        unsubscribes.push(unsub);
      });

      setInvoicesQRuta([]);
      return () => {
        unsubscribes.forEach(unsub => unsub());
      };
    } else {
      const q = query(
        collection(db, INVOICES_COLLECTION),
        where('clientRoute', '==', 'Encomiendas')
      );
      
      const qRuta = query(
        collection(db, INVOICES_COLLECTION),
        where('ruta', '==', 'Encomiendas')
      );

      const unsub1 = onSnapshot(q, (snap) => handleSnap(snap, setInvoicesQ), (err) => {
        if (!mounted.current) return;
        console.error('[EncomiendaDispatch] invoices error 1:', err);
        setLoadingInvoices(false);
      });
      
      const unsub2 = onSnapshot(qRuta, (snap) => handleSnap(snap, setInvoicesQRuta), (err) => {
        if (!mounted.current) return;
        console.error('[EncomiendaDispatch] invoices error 2:', err);
        setLoadingInvoices(false);
      });

      return () => { unsub1(); unsub2(); };
    }
  }, [hasLoaded, manifests]);

  const invoices = useMemo(() => {
    const map = new Map<string, EncomiendaInvoice>();
    invoicesQ.forEach(i => map.set(i.id, i));
    invoicesQRuta.forEach(i => map.set(i.id, i));
    return Array.from(map.values());
  }, [invoicesQ, invoicesQRuta]);

  // ── Derived indexes ──────────────────────────────────────────────────────
  const customerSlCodes = useMemo(
    () => new Set(customers.map(c => c.slCode)),
    [customers]
  );

  const EXCLUDED_PKG_STATUSES = useMemo(
    () => new Set(['delivered', 'returned', 'pickup']),
    []
  );

  const packagesBySlCode = useMemo(() => {
    const map = new Map<string, EncomiendaPackage[]>();
    for (const pkg of packages) {
      if (!pkg.slCode || !customerSlCodes.has(pkg.slCode)) continue;
      const status = (pkg.status || '').toLowerCase();
      if (EXCLUDED_PKG_STATUSES.has(status)) continue;
      if (!map.has(pkg.slCode)) map.set(pkg.slCode, []);
      map.get(pkg.slCode)!.push(pkg);
    }
    return map;
  }, [packages, customerSlCodes, EXCLUDED_PKG_STATUSES]);

  const allPackagesBySlCode = useMemo(() => {
    const map = new Map<string, EncomiendaPackage[]>();
    for (const pkg of packages) {
      if (!pkg.slCode || !customerSlCodes.has(pkg.slCode)) continue;
      if (!map.has(pkg.slCode)) map.set(pkg.slCode, []);
      map.get(pkg.slCode)!.push(pkg);
    }
    return map;
  }, [packages, customerSlCodes]);

  const invoicesBySlCode = useMemo(() => {
    const map = new Map<string, EncomiendaInvoice[]>();
    for (const inv of invoices) {
      // Index by slCode AND customerId to cover both storage patterns
      const keys = new Set<string>();
      if (inv.slCode) keys.add(inv.slCode);
      if ((inv as any).customerId) keys.add((inv as any).customerId);
      for (const key of keys) {
        if (!map.has(key)) map.set(key, []);
        // Avoid duplicates within same key
        if (!map.get(key)!.find(x => x.id === inv.id)) {
          map.get(key)!.push(inv);
        }
      }
    }
    return map;
  }, [invoices]);

  // ── Build CustomerSection[] ──────────────────────────────────────────────
  const customerSections = useMemo((): CustomerSection[] => {
    return customers
      .map(customer => {
        const pkgs   = packagesBySlCode.get(customer.slCode) || [];
        const allPkgs = allPackagesBySlCode.get(customer.slCode) || [];
        const allInvs = invoicesBySlCode.get(customer.slCode) || [];

        const invs = allInvs.filter(inv => {
          const status = (inv.status || '').toLowerCase();
          
          // Only show active/valid invoices (exclude cancelled and annulled)
          if (status === 'cancelled' || status === 'annulled') return false;

          const cleanInvNo = (inv.invoiceNumber || inv.id).replace(/[\s\-_]+/g, '').toUpperCase();

          // Find all packages in database associated with this invoice (master package or sub-packages)
          const associatedPackages = allPkgs.filter(p => {
            if (p.isMasterPackage && p.id === cleanInvNo) return true;
            if (!p.isMasterPackage && p.trackingNumber) {
              const tn = p.trackingNumber.toUpperCase();
              return inv.invoiceItems?.some((item: any) => (item.trackingNumber || '').toUpperCase() === tn);
            }
            return false;
          });

          // If there are no packages in database for this invoice yet, keep it (e.g. newly created paid invoice)
          if (associatedPackages.length === 0) return true;

          // Keep the invoice if at least one associated package is active (status not in EXCLUDED_PKG_STATUSES)
          const hasActivePackage = associatedPackages.some(
            p => !EXCLUDED_PKG_STATUSES.has((p.status || '').toLowerCase())
          );

          return hasActivePackage;
        });

        type InvItemEntry = {
          price: number;
          invoiceNumber: string;
          invoiceStatus: string;
          invoiceId: string;
          currency: string;
        };
        const trackingInvMap = new Map<string, InvItemEntry>();
        for (const inv of invs) {
          for (const item of (inv.invoiceItems || [])) {
            const tn = (item.trackingNumber || '').toUpperCase();
            if (!tn) continue;
            const candidate: InvItemEntry = {
              price:         item.totalPrice ?? item.unitPrice ?? 0,
              invoiceNumber: inv.invoiceNumber,
              invoiceStatus: inv.status,
              invoiceId:     inv.id,
              currency:      inv.currency || 'USD',
            };
            const existing = trackingInvMap.get(tn);
            const existingCancelled = existing?.invoiceStatus === 'cancelled';
            const candidateCancelled = candidate.invoiceStatus === 'cancelled';
            if (
              !existing ||
              (existingCancelled && !candidateCancelled) ||
              (!existingCancelled && !candidateCancelled && candidate.price > existing.price)
            ) {
              trackingInvMap.set(tn, candidate);
            }
          }
        }

        const enrichedPkgs: EncomiendaPackage[] = pkgs.map(pkg => {
          const tn    = (pkg.trackingNumber || '').toUpperCase();
          const entry = trackingInvMap.get(tn);
          return entry
            ? { ...pkg, price: entry.price, currency: entry.currency, invoiceNumber: entry.invoiceNumber, invoiceStatus: entry.invoiceStatus, invoiceId: entry.invoiceId }
            : pkg;
        });

        const manifestPkgMap = new Map<string, EncomiendaPackage[]>();
        for (const pkg of enrichedPkgs) {
          const mf = normalizeManifest(pkg.updatedManifest || pkg.manifestNumber);
          if (!manifestPkgMap.has(mf)) manifestPkgMap.set(mf, []);
          manifestPkgMap.get(mf)!.push(pkg);
        }

        const manifestInvMap = new Map<string, EncomiendaInvoice[]>();
        for (const inv of invs) {
          const mf = normalizeManifest(inv.manifestNumber);
          if (!manifestInvMap.has(mf)) manifestInvMap.set(mf, []);
          manifestInvMap.get(mf)!.push(inv);
        }

        const allMf = new Set([...manifestPkgMap.keys(), ...manifestInvMap.keys()]);

        const manifestGroups: ManifestGroup[] = Array.from(allMf)
          .sort()
          .map(mf => ({
            manifestNumber: mf,
            packages:       manifestPkgMap.get(mf) || [],
            invoices:       manifestInvMap.get(mf) || [],
          }));

        const totalWeight = enrichedPkgs.reduce((sum, p) => sum + (p.weight || 0), 0);
        
        const computedTotalPackages = invs.length > 0
          ? invs.reduce((sum, inv) => {
              const physicalItemsCount = (inv.invoiceItems || [])
                .filter((item: any) => !!item.trackingNumber)
                .length;
              return sum + physicalItemsCount;
            }, 0)
          : enrichedPkgs.filter(p => !p.isMasterPackage).length;

        const totalAmount = invs
          .filter(inv => inv.status !== 'cancelled' && inv.status !== 'annulled')
          .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);

        const enrichedLookup: EncomiendaPackage[] = allPkgs.map(pkg => {
          const tn    = (pkg.trackingNumber || '').toUpperCase();
          const entry = trackingInvMap.get(tn);
          return entry
            ? { ...pkg, price: entry.price, currency: entry.currency, invoiceNumber: entry.invoiceNumber, invoiceStatus: entry.invoiceStatus, invoiceId: entry.invoiceId }
            : pkg;
        });

        return {
          customer,
          manifestGroups,
          lookupPackages: enrichedLookup,
          totalPackages: computedTotalPackages,
          totalWeight,
          totalAmount,
          manifestCount: allMf.size,
        };
      })
      .filter(s => s.totalPackages > 0 || s.manifestGroups.some(g => g.invoices.length > 0))
      .sort((a, b) => a.customer.fullName.localeCompare(b.customer.fullName));
  }, [customers, packagesBySlCode, allPackagesBySlCode, invoicesBySlCode]);

  const allManifestNumbers = useMemo(() => {
    const set = new Set<string>(manifestsList.map(normalizeManifest));
    for (const pkg of packages) {
      if (pkg.manifestNumber)  set.add(normalizeManifest(pkg.manifestNumber));
      if (pkg.updatedManifest) set.add(normalizeManifest(pkg.updatedManifest));
    }
    for (const inv of invoices) {
      if (inv.manifestNumber) set.add(normalizeManifest(inv.manifestNumber));
      (inv.manifestNumbers || []).forEach(m => set.add(normalizeManifest(m)));
    }

    const parseManifestDate = (m: string): number => {
      const match = m.match(/(\d{2})-(\d{2})-(\d{4})/);
      if (match) {
        const [, dd, mm, yyyy] = match;
        return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime();
      }
      return 0;
    };

    return Array.from(set).filter(Boolean).sort((a, b) => {
      const da = parseManifestDate(a);
      const db = parseManifestDate(b);
      if (da !== db) return db - da;
      return b.localeCompare(a);
    });
  }, [manifestsList, packages, invoices]);

  const loading = loadingCustomers || loadingPackages || loadingInvoices;

  return { customerSections, allManifestNumbers, allInvoices: invoices, allPackages: packages, manifestPackageCounts, loading, error };
}
