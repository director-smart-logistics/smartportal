import { db } from "../config/firebase";

export interface AgeGroupRow {
  group: string;
  count: number;
  pct: number;
  packages: number;
  revenue: number;
}

export interface MonthlyAnalyticsData {
  month: string;
  generatedAt: string;
  updatedAt: string;
  totalRevenue: number;
  paidRevenue: number;
  regularPaidRevenue: number;
  permitPaidRevenue: number;
  pendingRevenue: number;
  overdueRevenue: number;
  totalPackages: number;
  totalWeight: number;
  regularPackages: number;
  permitPackages: number;
  regularWeight: number;
  permitWeight: number;
  regularPreAlerts: number;
  permitPreAlerts: number;
  deliveredPackages: number;
  inTransitPackages: number;
  deliveryRate: number;
  avgInvoiceValue: number;
  totalInvoices: number;
  paidInvoices: number;
  pendingInvoices: number;
  overdueInvoices: number;
  activeCustomers: number;
  newCustomersCount: number;
  preAlertsCount: number;
  recentCustomersCount: number;
  legacyCustomersCount: number;
  packagesByStatus: Array<{ status: string; count: number; pct: number }>;
  packagesByRoute: Array<{ route: string; count: number }>;
  invoicesByStatus: Array<{ status: string; count: number; amount: number }>;
  invoicesByRoute: Array<{ route: string; count: number; amount: number; paidCount: number; paidAmount: number; pctPaid: number }>;
  packagesByShipper: Array<{ name: string; count: number; pct: number }>;
  packagesByEncomienda: Array<{ name: string; count: number; pct: number }>;
  topByRevenue: Array<{ slCode: string; name: string; revenue: number; count: number }>;
  topByVolume: Array<{ slCode: string; name: string; count: number }>;
  revenueTrend: Array<{
    period: string;
    revenue: number;
    regularPaidRevenue?: number;
    permitPaidRevenue?: number;
    packages: number;
    newCustomers: number;
    totalWeight?: number;
    regularPackages?: number;
    permitPackages?: number;
    regularWeight?: number;
    permitWeight?: number;
    regularPreAlerts?: number;
    permitPreAlerts?: number;
    packagesByRoute?: Array<{ route: string; count: number }>;
    packagesByShipper?: Array<{ name: string; count: number }>;
    packagesByEncomienda?: Array<{ name: string; count: number }>;
  }>;
  demographics: {
    totalCustomers: number;
    withBirthDate: number;
    withNationality: number;
    tseDataPct: number;
    avgAge: number | null;
    ageGroups: AgeGroupRow[];
    nationalities: Array<{ name: string; count: number; pct: number }>;
    tiers: Array<{ tier: string; label: string; count: number; pct: number }>;
    statusDist: Array<{ status: string; label: string; count: number; pct: number }>;
    verifiedPct: number;
    topNationality: string | null;
    topTier: string | null;
  };
}

const TIER_LABELS: Record<string, string> = { basic: 'Basic', smart: 'Smart', premium: 'Premium', business: 'Business' };
const STATUS_LABELS_DEMO: Record<string, string> = { active: 'Activo', inactive: 'Inactivo', suspended: 'Suspendido', deleted: 'Eliminado' };

function parseFirestoreDate(raw: any): Date {
  if (!raw) return new Date(0);
  if (raw instanceof Date) return raw;
  if (typeof raw === 'object') {
    if (typeof raw.toDate === 'function') {
      return raw.toDate();
    }
    const seconds = raw.seconds ?? raw._seconds;
    if (typeof seconds === 'number') {
      return new Date(seconds * 1000);
    }
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

async function fetchHybridCollection(
  collectionName: string,
  start: Date,
  end: Date,
  selectFields?: string[]
): Promise<any[]> {
  let queryTs = db.collection(collectionName)
    .where("createdAt", ">=", start)
    .where("createdAt", "<=", end);

  let queryStr = db.collection(collectionName)
    .where("createdAt", ">=", start.toISOString())
    .where("createdAt", "<=", end.toISOString());

  if (selectFields && selectFields.length > 0) {
    queryTs = queryTs.select(...selectFields) as any;
    queryStr = queryStr.select(...selectFields) as any;
  }

  const [snapTs, snapStr] = await Promise.all([queryTs.get(), queryStr.get()]);

  const map = new Map<string, any>();
  snapTs.docs.forEach((doc) => map.set(doc.id, { id: doc.id, ...doc.data() }));
  snapStr.docs.forEach((doc) => map.set(doc.id, { id: doc.id, ...doc.data() }));

  return Array.from(map.values());
}

export async function aggregateMonthlyData(month: string, includeTrend = true): Promise<MonthlyAnalyticsData> {
  const parts = month.split("-");
  const year = parseInt(parts[0], 10);
  const monthIndex = parseInt(parts[1], 10) - 1;

  // Costa Rica local time (UTC-6) boundaries for monthly aggregation:
  // 00:00:00 CR time on 1st of month = 06:00:00 UTC
  // 23:59:59.999 CR time on last day of month = 05:59:59.999 UTC on 1st of next month
  const start = new Date(Date.UTC(year, monthIndex, 1, 6, 0, 0, 0));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 5, 59, 59, 999));
  const now = new Date();

  // 1. Fetch packages, invoices, pre-alerts, customers created in this month
  console.log(`[aggregateMonthlyData] Fetching main collections for ${month}...`);
  const packageFields = [
    'status', 'ruta', 'destination', 'customerId', 'slCode', 'customerName',
    'carrier', 'originCarrier', 'shipper', 'description', 'trackingNumber',
    'tracking', 'groupedTrackings', 'originalTracking', 'externalTracking',
    'supplierTracking', 'carrierTracking', 'encomiendaServiceName',
    'manifestNumber', 'isMasterPackage', 'weight',
    'requiresPermit', 'permisos'
  ];
  const invoiceFields = [
    'status', 'totalAmount', 'dueDate', 'limitDate', 'customerId', 'clientSlCode',
    'slCode', 'clientName', 'customer', 'invoiceNumber', 'ruta', 'destination', 'items'
  ];
  const customerFields = [
    'nationality', 'tier', 'membershipTier', 'status', 'ruta', 'encomiendaServiceName', 'slCode',
    'migratedFromWordPress', 'migratedFromLegacy', 'wpUserId'
  ];

  const [
    packagesRaw,
    invoices,
    newCustomers,
    preAlertsRaw,
    allCustomersSnap,
    allPackagesWithCustSnap
  ] = await Promise.all([
    fetchHybridCollection("packages", start, end, packageFields),
    fetchHybridCollection("invoices", start, end, invoiceFields),
    fetchHybridCollection("customers", start, end, customerFields),
    fetchHybridCollection("pre_alerts", start, end, ["requiresPermit", "permisos", "status"]),
    db.collection("customers").select(
      "encomiendaServiceName", "slCode", "ruta", "status", "isVerified",
      "sp2CreatedAt", "memberSince", "createdAt",
      "migratedFromWordPress", "migratedFromLegacy", "wpUserId"
    ).get(),
    db.collection("packages").select("customerId", "slCode").get(),
  ]);

  const packages = packagesRaw.filter(p => {
    const tracking = String(p.trackingNumber || p.tracking || '').trim();
    const isConsolidation = tracking.endsWith('-C');
    const isInternalTracking = p.isMasterPackage === true && p.status === 'ready';

    // Exclude internal trackings
    if (isInternalTracking) return false;

    // Keep consolidated packages
    if (isConsolidation) return true;

    // Otherwise, exclude if no manifest
    const hasManifest = p.manifestNumber && String(p.manifestNumber).trim() !== '';
    return hasManifest;
  });

  const totalWeight = packages.reduce((sum, p) => sum + (Number(p.weight) || 0), 0);
  const roundedWeight = Math.round(totalWeight * 10) / 10;

  // Split into regular and permit packages
  let regularPackages = 0;
  let permitPackages = 0;
  let regularWeight = 0;
  let permitWeight = 0;
  const packagePermitMap = new Map<string, boolean>();

  packages.forEach(p => {
    const isPermit = p.requiresPermit === true || p.permisos === true;
    const w = Number(p.weight) || 0;
    if (isPermit) {
      permitPackages++;
      permitWeight += w;
    } else {
      regularPackages++;
      regularWeight += w;
    }

    // Populate permit map
    if (p.id) packagePermitMap.set(p.id, isPermit);
    const tracking = String(p.trackingNumber || p.tracking || '').toUpperCase().trim();
    if (tracking) packagePermitMap.set(tracking, isPermit);
  });

  const roundedRegularWeight = Math.round(regularWeight * 10) / 10;
  const roundedPermitWeight = Math.round(permitWeight * 10) / 10;

  // Calculate pre-alerts breakdown
  let regularPreAlerts = 0;
  let permitPreAlerts = 0;
  preAlertsRaw.forEach(pa => {
    const isPermit = pa.requiresPermit === true || pa.permisos === true;
    if (isPermit) {
      permitPreAlerts++;
    } else {
      regularPreAlerts++;
    }
  });
  const preAlertsCount = preAlertsRaw.length;
  console.log(`[aggregateMonthlyData] Fetched packages raw: ${packagesRaw.length}, filtered: ${packages.length}, total weight: ${roundedWeight} kg, invoices: ${invoices.length}, preAlertsCount: ${preAlertsCount}, newCustomers: ${newCustomers.length}`);

  const customersWithPackages = new Set<string>();
  allPackagesWithCustSnap.docs.forEach(doc => {
    const data = doc.data();
    if (data.customerId) {
      customersWithPackages.add(String(data.customerId).trim());
    }
    if (data.slCode) {
      customersWithPackages.add(String(data.slCode).trim().toUpperCase());
    }
  });

  const customerServiceMap = new Map<string, string>();
  const customerRouteMap = new Map<string, string>();
  const activeCustomersList: Array<{ id: string; slCode: string; status: string; isVerified: boolean }> = [];

  allCustomersSnap.docs.forEach(doc => {
    const data = doc.data();
    const slCode = String(data.slCode || '').trim().toUpperCase();
    const service = String(data.encomiendaServiceName || '').trim();
    const route = String(data.ruta || '').trim();
    const status = String(data.status || '').trim().toLowerCase() || 'active';
    const isVerified = data.isVerified === true;

    if (status !== 'inactive' && status !== 'deleted') {
      activeCustomersList.push({
        id: doc.id,
        slCode,
        status,
        isVerified,
      });
    }

    if (slCode) {
      if (service) customerServiceMap.set(slCode, service);
      if (route) customerRouteMap.set(slCode, route);
    }
    if (doc.id) {
      if (service) customerServiceMap.set(doc.id, service);
      if (route) customerRouteMap.set(doc.id, route);
    }
  });

  // Robust Invoice status checking helpers
  const isOverdue = (i: any) => {
    if (i.status === 'overdue') return true;
    if (['sent', 'pending'].includes(i.status)) {
      const due = parseFirestoreDate(i.dueDate || i.limitDate);
      return due && due.getTime() > 0 ? due < now : false;
    }
    return false;
  };

  const isPending = (i: any) => {
    if (['draft'].includes(i.status)) return true;
    if (['sent', 'pending'].includes(i.status)) {
      return !isOverdue(i);
    }
    return false;
  };

  const isPaid = (i: any) => i.status === 'paid';

  // Revenue computations
  const paidInvList = invoices.filter(isPaid);
  const paidRevenue = paidInvList.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const paidInvoices = paidInvList.length;

  let regularPaidRevenue = 0;
  let permitPaidRevenue = 0;

  paidInvList.forEach(inv => {
    let invoicePermitRevenue = 0;
    let invoiceRegularRevenue = 0;
    let classifiedAmount = 0;

    if (inv.items && Array.isArray(inv.items)) {
      inv.items.forEach((item: any) => {
        const itemVal = Number(item.totalPrice ?? item.amount ?? item.subtotal ?? 0);
        const isPermit = item.requiresPermit === true ||
                         item.permisos === true ||
                         (item.packageId && packagePermitMap.get(item.packageId)) ||
                         (item.tracking && packagePermitMap.get(String(item.tracking).toUpperCase().trim())) ||
                         (item.trackingNumber && packagePermitMap.get(String(item.trackingNumber).toUpperCase().trim()));
        if (isPermit) {
          invoicePermitRevenue += itemVal;
        } else {
          invoiceRegularRevenue += itemVal;
        }
        classifiedAmount += itemVal;
      });
    }

    const totalAmount = Number(inv.totalAmount || 0);
    if (classifiedAmount > 0) {
      const ratio = totalAmount / classifiedAmount;
      permitPaidRevenue += invoicePermitRevenue * ratio;
      regularPaidRevenue += invoiceRegularRevenue * ratio;
    } else {
      regularPaidRevenue += totalAmount;
    }
  });

  const roundedRegularPaidRevenue = Math.round(regularPaidRevenue * 100) / 100;
  const roundedPermitPaidRevenue = Math.round(permitPaidRevenue * 100) / 100;

  const pendingInvList = invoices.filter(isPending);
  const pendingRevenue = pendingInvList.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const pendingInvoices = pendingInvList.length;

  const overdueInvList = invoices.filter(isOverdue);
  const overdueRevenue = overdueInvList.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const overdueInvoices = overdueInvList.length;

  const totalInvoices = invoices.length;
  const totalRevenue = paidRevenue + pendingRevenue + overdueRevenue;

  // Packages computations
  const totalPackages = packages.length;
  const deliveredPkgs = packages.filter(p => p.status === 'delivered');
  const deliveredPackages = deliveredPkgs.length;
  const inTransitPkgs = packages.filter(p => ['transit', 'pre-alerted', 'pre_alerted', 'consolidated', 'customs', 'route'].includes(p.status));
  const inTransitPackages = inTransitPkgs.length;
  const deliveryRate = totalPackages > 0 ? Math.round((deliveredPackages / totalPackages) * 1000) / 10 : 0;
  const avgInvoiceValue = paidInvoices > 0 ? Math.round(paidRevenue / paidInvoices) : 0;

  // Active customers in month
  const activeCustomersSet = new Set<string>();
  packages.forEach(p => {
    const id = p.customerId || p.slCode;
    if (id) activeCustomersSet.add(String(id).toUpperCase().trim());
  });
  invoices.forEach(i => {
    const id = i.customerId || i.clientSlCode;
    if (id) activeCustomersSet.add(String(id).toUpperCase().trim());
  });
  const activeCustomers = activeCustomersSet.size;

  // New organic signups (excluding bulk-migrated & inactive/deleted accounts)
  const newCustomersFiltered = newCustomers.filter((c: any) => {
    const isMigrated = Boolean(c.migratedFromWordPress === true || c.migratedFromLegacy === true || c.wpUserId);
    return !isMigrated && c.status !== 'inactive' && c.status !== 'deleted';
  });

function resolveCustomerEarliestRegDate(d: any): Date {
  if (!d) return new Date(0);
  const candidates = [d.memberSince, d.createdAt, d.sp2CreatedAt, d.termsAcceptedAt].filter(Boolean);
  if (candidates.length === 0) return new Date(0);

  let earliest: Date | null = null;
  for (const raw of candidates) {
    const dt = parseFirestoreDate(raw);
    if (dt.getTime() > 0) {
      if (!earliest || dt.getTime() < earliest.getTime()) {
        earliest = dt;
      }
    }
  }
  return earliest || new Date(0);
}

  let newCustomersCount = 0;
  allCustomersSnap.docs.forEach(docSnap => {
    const d = docSnap.data();
    const status = String(d.status || '').trim().toLowerCase() || 'active';
    if (status === 'inactive' || status === 'deleted') return;

    const isMigrated = Boolean(d.migratedFromWordPress === true || d.migratedFromLegacy === true || d.wpUserId);
    if (isMigrated) return;

    const dateObj = resolveCustomerEarliestRegDate(d);
    if (dateObj.getTime() > 0 && dateObj >= start && dateObj <= end) {
      newCustomersCount++;
    }
  });

  // Package status distribution
  const statusMap = new Map<string, number>();
  packages.forEach(p => {
    const s = p.status || 'unknown';
    statusMap.set(s, (statusMap.get(s) || 0) + 1);
  });
  const packagesByStatus = Array.from(statusMap.entries())
    .map(([status, count]) => ({ status, count, pct: totalPackages > 0 ? Math.round((count / totalPackages) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  // Packages by route
  const routeMap = new Map<string, number>();
  packages.forEach(p => {
    const r = p.ruta || p.destination || 'Sin ruta';
    routeMap.set(r, (routeMap.get(r) || 0) + 1);
  });
  const packagesByRoute = Array.from(routeMap.entries())
    .map(([route, count]) => ({ route, count }))
    .sort((a, b) => b.count - a.count);

  // Invoice status distribution
  const invStatusMap = new Map<string, { count: number; amount: number }>();
  invoices.forEach(i => {
    const s = i.status || 'unknown';
    const cur = invStatusMap.get(s) || { count: 0, amount: 0 };
    invStatusMap.set(s, { count: cur.count + 1, amount: cur.amount + (i.totalAmount || 0) });
  });
  const invoicesByStatus = Array.from(invStatusMap.entries())
    .map(([status, d]) => ({ status, count: d.count, amount: Math.round(d.amount) }))
    .sort((a, b) => b.amount - a.amount);

  // Map package IDs/trackings to their routes for invoice lookup
  const packageRouteMap = new Map<string, string>();
  
  // 1. Map packages that were already fetched (current month packages)
  packages.forEach(p => {
    const route = p.ruta || p.destination || 'Sin ruta';
    if (p.id) packageRouteMap.set(p.id, route);
    const tracking = String(p.trackingNumber || p.tracking || '').toUpperCase().trim();
    if (tracking) packageRouteMap.set(tracking, route);
  });

  // 2. Identify missing package IDs/trackings from invoices
  const missingLookupIds = new Set<string>();
  invoices.forEach(inv => {
    if (inv.items && Array.isArray(inv.items)) {
      inv.items.forEach((item: any) => {
        if (item.packageId && !packageRouteMap.has(item.packageId)) {
          missingLookupIds.add(item.packageId);
        }
        if (item.tracking) {
          const tracking = String(item.tracking).toUpperCase().trim();
          if (tracking && !packageRouteMap.has(tracking)) {
            missingLookupIds.add(tracking);
          }
        }
      });
    }
  });

  // 3. Fetch missing packages from Firestore in chunks of 100
  const missingIdsArray = Array.from(missingLookupIds).filter(Boolean);
  console.log(`[aggregateMonthlyData] Number of missing package IDs/trackings to resolve: ${missingIdsArray.length}`);
  if (includeTrend && missingIdsArray.length > 0) {
    const chunkSize = 100;
    for (let i = 0; i < missingIdsArray.length; i += chunkSize) {
      const chunk = missingIdsArray.slice(i, i + chunkSize);
      console.log(`[aggregateMonthlyData] Fetching chunk of missing packages: ${i} to ${i + chunk.length}...`);
      const refs = chunk.map(id => db.collection("packages").doc(id));
      try {
        const snaps = await db.getAll(...refs);
        console.log(`[aggregateMonthlyData] Fetched chunk of snaps, size: ${snaps.length}`);
        snaps.forEach(snap => {
          if (snap.exists) {
            const pkg = snap.data();
            const route = pkg?.ruta || pkg?.destination || 'Sin ruta';
            const isPermit = pkg?.requiresPermit === true || pkg?.permisos === true;
            packageRouteMap.set(snap.id, route);
            packagePermitMap.set(snap.id, isPermit);
            const tracking = String(pkg?.trackingNumber || pkg?.tracking || '').toUpperCase().trim();
            if (tracking) {
              packageRouteMap.set(tracking, route);
              packagePermitMap.set(tracking, isPermit);
            }
          }
        });
      } catch (err) {
        console.error("Error fetching missing package routes in batch:", err);
      }
    }
  }

  // Calculate Invoices by Route (issued vs paid)
  const invoicesByRouteMap = new Map<string, { totalAmount: number; paidAmount: number; count: number; paidCount: number }>();
  invoices.forEach(inv => {
    let route = 'Sin ruta';
    if (inv.items && Array.isArray(inv.items)) {
      for (const item of inv.items) {
        if (item.packageId && packageRouteMap.has(item.packageId)) {
          route = packageRouteMap.get(item.packageId)!;
          break;
        }
        const tracking = String(item.tracking || '').toUpperCase().trim();
        if (tracking && packageRouteMap.has(tracking)) {
          route = packageRouteMap.get(tracking)!;
          break;
        }
      }
    }
    if (route === 'Sin ruta') {
      route = inv.ruta || inv.destination || 'Sin ruta';
    }
    
    const cur = invoicesByRouteMap.get(route) || { totalAmount: 0, paidAmount: 0, count: 0, paidCount: 0 };
    cur.count++;
    cur.totalAmount += (inv.totalAmount || 0);
    if (isPaid(inv)) {
      cur.paidCount++;
      cur.paidAmount += (inv.totalAmount || 0);
    }
    invoicesByRouteMap.set(route, cur);
  });
  
  const invoicesByRoute = Array.from(invoicesByRouteMap.entries())
    .map(([route, d]) => ({
      route,
      count: d.count,
      amount: Math.round(d.totalAmount),
      paidCount: d.paidCount,
      paidAmount: Math.round(d.paidAmount),
      pctPaid: d.totalAmount > 0 ? Math.round((d.paidAmount / d.totalAmount) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Logistics Courier MoM volume detection (Amazon, SPX, DHL, USPS, UPS, FedEx, Shein, Temu, LaserShip, Otros) according to trackings
  const courierCounts = new Map<string, number>();
  ['Amazon', 'SPX', 'DHL', 'USPS', 'UPS', 'FedEx', 'Shein', 'Temu', 'LaserShip', 'Otros'].forEach(c => courierCounts.set(c, 0));
  packages.forEach(p => {
    const carrier = String(p.carrier || p.originCarrier || p.shipper || '').toUpperCase().trim();
    const desc = String(p.description || '').toLowerCase();
    
    // Compile all possible tracking fields to inspect for this package
    const trksToCheck = [];
    const mainTrk = String(p.trackingNumber || p.tracking || '').toUpperCase().trim();
    if (mainTrk) trksToCheck.push(mainTrk);
    if (Array.isArray(p.groupedTrackings)) {
      p.groupedTrackings.forEach((t: any) => {
        if (t) trksToCheck.push(String(t).toUpperCase().trim());
      });
    }
    ['originalTracking', 'externalTracking', 'supplierTracking', 'carrierTracking'].forEach(f => {
      if (p[f]) trksToCheck.push(String(p[f]).toUpperCase().trim());
    });

    let detected = 'Otros';
    for (const trk of trksToCheck) {
      if (trk.startsWith('TBA') || trk.startsWith('AMZN') || carrier.includes('AMAZON') || desc.includes('amazon')) {
        detected = 'Amazon';
        break;
      } else if (trk.startsWith('SPX')) {
        detected = 'SPX';
        break;
      } else if (trk.startsWith('1Z') || carrier.includes('UPS') || desc.includes('ups')) {
        detected = 'UPS';
        break;
      } else if (/^(91|92|93|94|95|96|420)\d+/.test(trk) || trk.length === 22 || /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(trk) || carrier.includes('USPS') || desc.includes('usps') || desc.includes('postal')) {
        detected = 'USPS';
        break;
      } else if (trk.startsWith('4022') || /^\d{12}$/.test(trk) || /^\d{15}$/.test(trk) || carrier.includes('FEDEX') || desc.includes('fedex') || desc.includes('federal express')) {
        detected = 'FedEx';
        break;
      } else if (/^\d{10}$/.test(trk) || carrier.includes('DHL') || desc.includes('dhl')) {
        detected = 'DHL';
        break;
      } else if (trk.startsWith('GSH') || trk.startsWith('GFUS') || trk.startsWith('CNUSUP') || trk.startsWith('UUS') || carrier.includes('SHEIN') || desc.includes('shein')) {
        detected = 'Shein';
        break;
      } else if (trk.startsWith('FAZN') || carrier.includes('TEMU') || desc.includes('temu')) {
        detected = 'Temu';
        break;
      } else if (trk.startsWith('1LS') || carrier.includes('LASERSHIP') || carrier.includes('ONTRAC')) {
        detected = 'LaserShip';
        break;
      }
    }
    
    courierCounts.set(detected, (courierCounts.get(detected) || 0) + 1);
  });
  const packagesByShipper = Array.from(courierCounts.entries())
    .map(([name, count]) => ({ name, count, pct: totalPackages > 0 ? Math.round((count / totalPackages) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);

  // Calculate packages by domestic courier (encomienda)
  const encomiendaCounts = new Map<string, number>();
  packages.forEach(p => {
    const route = String(p.ruta || p.destination || '').trim().toUpperCase();
    if (route === 'ENCOMIENDAS') {
      const slCode = String(p.slCode || '').trim().toUpperCase();
      const customerId = String(p.customerId || '').trim();
      
      // Skip packages if the associated customer's route is not 'Encomiendas'
      const customerRoute = customerRouteMap.get(slCode) || customerRouteMap.get(customerId);
      if (customerRoute !== 'Encomiendas') {
        return;
      }
      
      let service = String(p.encomiendaServiceName || '').trim();
      if (!service) {
        service = customerServiceMap.get(slCode) || customerServiceMap.get(customerId) || '';
      }
      
      if (!service || service.toLowerCase() === 'none' || service.toLowerCase() === 'sin servicio') {
        // Omit "Sin servicio" completely from the aggregation
        return;
      }
      
      encomiendaCounts.set(service, (encomiendaCounts.get(service) || 0) + 1);
    }
  });
  
  const totalEncomiendaPackages = Array.from(encomiendaCounts.values()).reduce((sum, count) => sum + count, 0);
  const packagesByEncomienda = Array.from(encomiendaCounts.entries())
    .map(([name, count]) => ({
      name,
      count,
      pct: totalEncomiendaPackages > 0 ? Math.round((count / totalEncomiendaPackages) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  // Top customers by revenue
  const custRevMap = new Map<string, { name: string; revenue: number; count: number }>();
  paidInvList.forEach(i => {
    const code = i.clientSlCode || i.slCode || i.customerId || 'Unknown';
    const name = i.clientName || i.customer?.fullName || '';
    const cur = custRevMap.get(code) || { name, revenue: 0, count: 0 };
    custRevMap.set(code, { name: cur.name || name, revenue: cur.revenue + (i.totalAmount || 0), count: cur.count + 1 });
  });
  const topByRevenue = Array.from(custRevMap.entries())
    .map(([slCode, d]) => ({ slCode, name: d.name, revenue: d.revenue, count: d.count }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Top customers by volume
  const custVolMap = new Map<string, { name: string; count: number }>();
  packages.forEach(p => {
    const code = p.slCode || p.customerId || 'Unknown';
    const name = p.customerName || '';
    const cur = custVolMap.get(code) || { name, count: 0 };
    custVolMap.set(code, { name: cur.name || name, count: cur.count + 1 });
  });
  const topByVolume = Array.from(custVolMap.entries())
    .map(([slCode, d]) => ({ slCode, name: d.name, count: d.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Demographics
  const uniqueCustomersMap = new Map<string, any>();
  const customersWithoutSlCode: any[] = [];
  
  activeCustomersList.forEach(c => {
    if (c.slCode) {
      if (!uniqueCustomersMap.has(c.slCode)) {
        uniqueCustomersMap.set(c.slCode, c);
      }
    } else {
      customersWithoutSlCode.push(c);
    }
  });

  const totalCustomers = uniqueCustomersMap.size + customersWithoutSlCode.length;

  let verifiedCount = 0;
  uniqueCustomersMap.forEach(c => {
    if (c.isVerified) verifiedCount++;
  });
  customersWithoutSlCode.forEach(c => {
    if (c.isVerified) verifiedCount++;
  });

  const verifiedPct = totalCustomers > 0 ? Math.round((verifiedCount / totalCustomers) * 100) : 0;

  let recentCustomersCount = 0;
  let legacyCustomersCount = 0;
  uniqueCustomersMap.forEach(c => {
    if (c.slCode >= "SL26") {
      recentCustomersCount++;
    } else {
      legacyCustomersCount++;
    }
  });
  legacyCustomersCount += customersWithoutSlCode.length;

  const natMap = new Map<string, number>();
  newCustomersFiltered.forEach(c => {
    if (!c.nationality) return;
    const n = String(c.nationality).trim();
    natMap.set(n, (natMap.get(n) || 0) + 1);
  });
  const natTotal = Array.from(natMap.values()).reduce((s, v) => s + v, 0);
  const nationalities = Array.from(natMap.entries())
    .map(([name, count]) => ({ name, count, pct: natTotal > 0 ? Math.round((count / natTotal) * 100) : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const tierMap = new Map<string, number>();
  newCustomersFiltered.forEach(c => {
    const t = c.tier || c.membershipTier || 'basic';
    tierMap.set(t, (tierMap.get(t) || 0) + 1);
  });
  const tiers = Array.from(tierMap.entries())
    .map(([tier, count]) => ({
      tier,
      label: TIER_LABELS[tier] || tier,
      count,
      pct: newCustomersFiltered.length > 0 ? Math.round((count / newCustomersFiltered.length) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  const stMap = new Map<string, number>();
  newCustomersFiltered.forEach(c => {
    const s = c.status || 'active';
    stMap.set(s, (stMap.get(s) || 0) + 1);
  });
  const statusDist = Array.from(stMap.entries())
    .map(([status, count]) => ({
      status,
      label: STATUS_LABELS_DEMO[status] || status,
      count,
      pct: newCustomersFiltered.length > 0 ? Math.round((count / newCustomersFiltered.length) * 100) : 0
    }))
    .sort((a, b) => b.count - a.count);

  // Generate 6 months list ending with month (inclusive) for trend
  const months: string[] = [];
  let revenueTrend: Array<{
    period: string;
    revenue: number;
    regularPaidRevenue?: number;
    permitPaidRevenue?: number;
    packages: number;
    newCustomers: number;
    totalWeight?: number;
    regularPackages?: number;
    permitPackages?: number;
    regularWeight?: number;
    permitWeight?: number;
    regularPreAlerts?: number;
    permitPreAlerts?: number;
    packagesByRoute?: Array<{ route: string; count: number }>;
    packagesByShipper?: Array<{ name: string; count: number }>;
    packagesByEncomienda?: Array<{ name: string; count: number }>;
  }> = [];

  if (includeTrend) {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, monthIndex - i, 1);
      const mStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push(mStr);
    }

    // Resolve each month (either from cache or by dynamically computing it)
    const trendResults = await Promise.all(months.map(async (mStr) => {
      if (mStr === month) {
        return {
          period: mStr,
          revenue: paidRevenue,
          regularPaidRevenue: roundedRegularPaidRevenue,
          permitPaidRevenue: roundedPermitPaidRevenue,
          packages: totalPackages,
          newCustomers: newCustomersCount,
          totalWeight: roundedWeight,
          regularPackages: regularPackages,
          permitPackages: permitPackages,
          regularWeight: roundedRegularWeight,
          permitWeight: roundedPermitWeight,
          regularPreAlerts: regularPreAlerts,
          permitPreAlerts: permitPreAlerts,
          packagesByRoute: packagesByRoute,
          packagesByShipper: packagesByShipper,
          packagesByEncomienda: packagesByEncomienda,
        };
      }

      try {
        const docSnap = await db.collection("monthly_analytics").doc(mStr).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          return {
            period: mStr,
            revenue: data?.paidRevenue ?? 0,
            regularPaidRevenue: data?.regularPaidRevenue ?? 0,
            permitPaidRevenue: data?.permitPaidRevenue ?? 0,
            packages: data?.totalPackages ?? 0,
            newCustomers: data?.newCustomersCount ?? 0,
            totalWeight: data?.totalWeight ?? 0,
            regularPackages: data?.regularPackages ?? 0,
            permitPackages: data?.permitPackages ?? 0,
            regularWeight: data?.regularWeight ?? 0,
            permitWeight: data?.permitWeight ?? 0,
            regularPreAlerts: data?.regularPreAlerts ?? 0,
            permitPreAlerts: data?.permitPreAlerts ?? 0,
            packagesByRoute: data?.packagesByRoute ?? [],
            packagesByShipper: data?.packagesByShipper ?? [],
            packagesByEncomienda: data?.packagesByEncomienda ?? [],
          };
        }
      } catch (err) {
        console.warn(`Failed reading cache for ${mStr}, computing on the fly:`, err);
      }

      try {
        console.log(`Trend cache miss for ${mStr}, computing on the fly...`);
        const computed = await aggregateMonthlyData(mStr, false);
        // Cache the computed analytics document for future requests
        await db.collection("monthly_analytics").doc(mStr).set(computed).catch(() => {});
        return {
          period: mStr,
          revenue: computed.paidRevenue ?? 0,
          regularPaidRevenue: computed.regularPaidRevenue ?? 0,
          permitPaidRevenue: computed.permitPaidRevenue ?? 0,
          packages: computed.totalPackages ?? 0,
          newCustomers: computed.newCustomersCount ?? 0,
          totalWeight: computed.totalWeight ?? 0,
          regularPackages: computed.regularPackages ?? 0,
          permitPackages: computed.permitPackages ?? 0,
          regularWeight: computed.regularWeight ?? 0,
          permitWeight: computed.permitWeight ?? 0,
          regularPreAlerts: computed.regularPreAlerts ?? 0,
          permitPreAlerts: computed.permitPreAlerts ?? 0,
          packagesByRoute: computed.packagesByRoute ?? [],
          packagesByShipper: computed.packagesByShipper ?? [],
          packagesByEncomienda: computed.packagesByEncomienda ?? [],
        };
      } catch (e) {
        console.error(`Failed to dynamically compute trend for ${mStr}:`, e);
        return {
          period: mStr,
          revenue: 0,
          regularPaidRevenue: 0,
          permitPaidRevenue: 0,
          packages: 0,
          newCustomers: 0,
          totalWeight: 0,
          regularPackages: 0,
          permitPackages: 0,
          regularWeight: 0,
          permitWeight: 0,
          regularPreAlerts: 0,
          permitPreAlerts: 0,
          packagesByRoute: [],
          packagesByShipper: [],
          packagesByEncomienda: [],
        };
      }
    }));
    revenueTrend = trendResults;
  }

  return {
    month,
    generatedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    totalRevenue,
    paidRevenue,
    regularPaidRevenue: roundedRegularPaidRevenue,
    permitPaidRevenue: roundedPermitPaidRevenue,
    pendingRevenue,
    overdueRevenue,
    totalPackages,
    totalWeight: roundedWeight,
    regularPackages,
    permitPackages,
    regularWeight: roundedRegularWeight,
    permitWeight: roundedPermitWeight,
    deliveredPackages,
    inTransitPackages,
    deliveryRate,
    avgInvoiceValue,
    totalInvoices,
    paidInvoices,
    pendingInvoices,
    overdueInvoices,
    activeCustomers,
    newCustomersCount,
    preAlertsCount,
    regularPreAlerts,
    permitPreAlerts,
    recentCustomersCount,
    legacyCustomersCount,
    packagesByStatus,
    packagesByRoute,
    invoicesByStatus,
    invoicesByRoute,
    packagesByShipper,
    packagesByEncomienda,
    topByRevenue,
    topByVolume,
    revenueTrend,
    demographics: {
      totalCustomers,
      withBirthDate: 0,
      withNationality: 0,
      tseDataPct: 0,
      avgAge: null,
      ageGroups: [],
      nationalities,
      tiers,
      statusDist,
      verifiedPct,
      topNationality: nationalities[0]?.name ?? null,
      topTier: tiers[0]?.label ?? null,
    }
  };
}
