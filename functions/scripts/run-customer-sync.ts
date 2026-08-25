/**
 * Script to manually trigger customer sync from SP2 to SP1
 * Includes addresses and payment_methods collections
 * 
 * Run with:
 *   npx ts-node scripts/run-customer-sync.ts          <- incremental (only changed users)
 *   npx ts-node scripts/run-customer-sync.ts --full   <- force full sync of all users
 * 
 * Prerequisites:
 * - Run: gcloud auth application-default login
 * - Have access to both smart-portal-admin and smart-portal-2 projects
 *
 * Incremental mode:
 *   Reads _sync_metadata/customers.lastSyncAt from SP1.
 *   Detects SP2 users, addresses, and payment_methods updated after that timestamp.
 *   Only processes those users — skips unchanged ones for speed.
 *   Writes lastSyncAt back to _sync_metadata/customers after completion.
 */

import * as admin from 'firebase-admin';

// Initialize SP1 (smart-portal-admin) with Application Default Credentials
admin.initializeApp({
  projectId: 'smart-portal-admin',
});

const SP2_PROJECT_ID = 'smart-portal-2';

// Initialize SP2 app with ADC
const sp2App = admin.initializeApp({
  projectId: SP2_PROJECT_ID,
}, 'sp2');

// SP1 uses named database "portal", SP2 uses default database
const sp1Db = admin.firestore();
sp1Db.settings({ databaseId: 'portal' });

const sp2Db = admin.firestore(sp2App);

interface SyncStats {
  totalProcessed: number;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  errorDetails: string[];
  addressesTotal: number;
  paymentMethodsTotal: number;
}

interface CustomerAddress {
  id: string;
  userId: string;
  type: string;
  alias: string;
  country: string;
  province?: string | null;
  canton?: string | null;
  district?: string | null;
  city?: string | null;
  postalCode?: string | null;
  streetAddress: string;
  details?: string | null;
  coordinates?: { lat: number; lng: number; validated?: boolean } | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryInstructions?: string | null;
  encomienda?: { id: string; name: string; phone?: string; pickupAddress?: string; schedule?: string } | null;
  requiresEncomienda: boolean;
  status: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface CustomerPaymentMethod {
  id: string;
  userId?: string;
  type: string;
  label: string;
  cardLast4?: string | null;
  cardBrand?: string | null;
  cardExpMonth?: number | null;
  cardExpYear?: number | null;
  sinpePhone?: string | null;
  bankName?: string | null;
  accountLast4?: string | null;
  isDefault: boolean;
  isActive: boolean;
  detail?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

function toISOString(timestamp: any): string | null {
  if (!timestamp) return null;
  if (timestamp.toDate) return timestamp.toDate().toISOString();
  if (typeof timestamp === 'string') return timestamp;
  if (timestamp instanceof Date) return timestamp.toISOString();
  return null;
}

function transformAddress(doc: admin.firestore.DocumentSnapshot): CustomerAddress {
  const data = doc.data() || {};
  return {
    id: doc.id,
    userId: data.userId || '',
    type: data.type || 'residence',
    alias: data.alias || 'Dirección',
    country: data.country || 'Costa Rica',
    province: data.province || null,
    canton: data.canton || null,
    district: data.district || null,
    city: data.city || null,
    postalCode: data.postalCode || null,
    streetAddress: data.streetAddress || data.detail || '',
    details: data.details || null,
    coordinates: data.coordinates || null,
    recipientName: data.recipientName || data.contactName || null,
    recipientPhone: data.recipientPhone || data.contactPhone || null,
    deliveryInstructions: data.deliveryInstructions || data.deliveryNotes || null,
    encomienda: data.encomienda || null,
    requiresEncomienda: data.requiresEncomienda || false,
    status: data.status || 'active',
    isDefault: data.isDefault ?? data.isPrimary ?? false,
    isActive: data.isActive !== false,
    createdAt: toISOString(data.createdAt),
    updatedAt: toISOString(data.updatedAt),
  };
}

function transformPaymentMethod(doc: admin.firestore.DocumentSnapshot): CustomerPaymentMethod {
  const data = doc.data() || {};
  return {
    id: doc.id,
    userId: data.userId,
    type: data.type || 'cash',
    label: data.label || 'Método de pago',
    cardLast4: data.cardLast4 || null,
    cardBrand: data.cardBrand || null,
    cardExpMonth: data.cardExpMonth || null,
    cardExpYear: data.cardExpYear || null,
    sinpePhone: data.sinpePhone || null,
    bankName: data.bankName || null,
    accountLast4: data.accountLast4 || null,
    isDefault: data.isDefault || false,
    isActive: data.isActive !== false,
    detail: data.detail || null,
    createdAt: toISOString(data.createdAt),
    updatedAt: toISOString(data.updatedAt),
  };
}

// Empty schema templates - show all fields even when no data exists
function createEmptyAddressSchema(): CustomerAddress {
  return {
    id: '',
    userId: '',
    type: '',
    alias: '',
    country: '',
    province: null,
    canton: null,
    district: null,
    city: null,
    postalCode: null,
    streetAddress: '',
    details: null,
    coordinates: null,
    recipientName: null,
    recipientPhone: null,
    deliveryInstructions: null,
    encomienda: null,
    requiresEncomienda: false,
    status: '',
    isDefault: false,
    isActive: false,
    createdAt: null,
    updatedAt: null,
  };
}

function createEmptyPaymentMethodSchema(): CustomerPaymentMethod {
  return {
    id: '',
    userId: '',
    type: '',
    label: '',
    cardLast4: null,
    cardBrand: null,
    cardExpMonth: null,
    cardExpYear: null,
    sinpePhone: null,
    bankName: null,
    accountLast4: null,
    isDefault: false,
    isActive: false,
    detail: null,
    createdAt: null,
    updatedAt: null,
  };
}

async function runSync() {
  const isFullSync = process.argv.includes('--full');
  console.log(`[CustomerSync] Starting ${isFullSync ? 'FULL' : 'incremental'} sync...`);
  const startTime = Date.now();
  const stats: SyncStats = {
    totalProcessed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorDetails: [],
    addressesTotal: 0,
    paymentMethodsTotal: 0,
  };

  try {
    // ── Determine sync window ─────────────────────────────────────────────────
    const syncMetaRef = sp1Db.collection('_sync_metadata').doc('customers');
    const syncMeta = await syncMetaRef.get();
    const lastSyncAt: string | null = (!isFullSync && syncMeta.exists)
      ? (syncMeta.data()?.lastSyncAt || null)
      : null;

    console.log(`[CustomerSync] Last sync: ${lastSyncAt || 'Never — running full sync'}`);

    // ── Collect SP2 doc IDs that need syncing ─────────────────────────────────
    let docs: admin.firestore.DocumentSnapshot[] = [];

    if (lastSyncAt) {
      const since = admin.firestore.Timestamp.fromDate(new Date(lastSyncAt));
      const userIdsToSync = new Set<string>();

      // 1. Users with updated profile
      const updatedUsers = await sp2Db.collection('users')
        .where('updatedAt', '>', since).get();
      updatedUsers.forEach(d => userIdsToSync.add(d.id));
      console.log(`[CustomerSync] Users with profile changes: ${updatedUsers.size}`);

      // 2. Users with updated addresses
      const updatedAddresses = await sp2Db.collection('addresses')
        .where('updatedAt', '>', since).get();
      updatedAddresses.forEach(d => {
        const uid = d.data().userId;
        if (uid) userIdsToSync.add(uid);
      });
      console.log(`[CustomerSync] Addresses updated: ${updatedAddresses.size}`);

      // 3. Users with updated payment methods
      const updatedPM = await sp2Db.collection('payment_methods')
        .where('updatedAt', '>', since).get();
      updatedPM.forEach(d => {
        const uid = d.data().userId;
        if (uid) userIdsToSync.add(uid);
      });
      console.log(`[CustomerSync] Payment methods updated: ${updatedPM.size}`);

      console.log(`[CustomerSync] Total unique users to sync: ${userIdsToSync.size}`);

      if (userIdsToSync.size === 0) {
        console.log('[CustomerSync] No changes detected since last sync. Done.');
        process.exit(0);
      }

      // Fetch those specific user docs (whereIn batches of 10)
      const userIdArray = Array.from(userIdsToSync);
      for (let i = 0; i < userIdArray.length; i += 10) {
        const batch = userIdArray.slice(i, i + 10);
        const snap = await sp2Db.collection('users')
          .where(admin.firestore.FieldPath.documentId(), 'in', batch).get();
        docs.push(...snap.docs);
      }
    } else {
      // Full sync — fetch all users
      const usersSnapshot = await sp2Db.collection('users').get();
      docs = usersSnapshot.docs;
      console.log(`[CustomerSync] Found ${docs.length} total users in SP2`);

      console.log('\n[DEBUG] Checking first 3 users structure:');
      for (let i = 0; i < Math.min(3, docs.length); i++) {
        const d = docs[i].data() || {};
        console.log(`  User ${i+1}: slCode=${d['slCode']}, email=${d['email']}, displayName=${d['displayName']}`);
      }
      console.log('');
    }

    const totalUsers = docs.length;
    const BATCH_SIZE = 20;

    const processUser = async (doc: admin.firestore.DocumentSnapshot) => {
      const user = doc.data()!;
      const slCode = user.slCode || user.sl_code || user.SLCode;
      const userId = doc.id;
      const email = user.email || user.Email;

      if (!slCode || !email) {
        stats.skipped++;
        return;
      }

      // Fetch addresses + payment methods in parallel
      let addressesSnapshot = await sp2Db
        .collection('addresses')
        .where('userId', '==', userId)
        .get();

      if (addressesSnapshot.empty) {
        const legacyPattern = `legacy_${slCode}_`;
        addressesSnapshot = await sp2Db
          .collection('addresses')
          .where('userId', '>=', legacyPattern)
          .where('userId', '<', legacyPattern + '\uf8ff')
          .get();
      }

      const paymentMethodsSnapshot = await sp2Db
        .collection('payment_methods')
        .where('userId', '==', userId)
        .get();

      const addresses: CustomerAddress[] = [];
      let defaultAddress: CustomerAddress | null = null;
      for (const addrDoc of addressesSnapshot.docs) {
        const addr = transformAddress(addrDoc);
        addresses.push(addr);
        stats.addressesTotal++;
        if (addr.isDefault && addr.isActive) defaultAddress = addr;
      }
      if (!defaultAddress && addresses.length > 0)
        defaultAddress = addresses.find(a => a.isActive) || addresses[0];

      const paymentMethods: CustomerPaymentMethod[] = [];
      let defaultPaymentMethod: CustomerPaymentMethod | null = null;
      for (const pmDoc of paymentMethodsSnapshot.docs) {
        const pm = transformPaymentMethod(pmDoc);
        paymentMethods.push(pm);
        stats.paymentMethodsTotal++;
        if (pm.isDefault && pm.isActive) defaultPaymentMethod = pm;
      }
      if (!defaultPaymentMethod && paymentMethods.length > 0)
        defaultPaymentMethod = paymentMethods.find(pm => pm.isActive) || paymentMethods[0];

      // BUG-NAME-FROM-DISPLAYNAME Rule C (2026-04-28): mirror of the helper
      // in client/lib/utils/customer-name.ts and the inline copy in
      // functions/src/customers/sync.ts.
      // Rule: prefer displayName ONLY when it has strictly MORE name tokens
      // than firstName+lastName AND does NOT look like a handle (digits,
      // special chars, or repeated tokens). Fixes regression where SP1 users
      // with empty `lastName` had multi-surname names like "JESUS ARRIETA
      // CLAVERIA" silently truncated to just the firstName, breaking Nova
      // name-based matching for the entire customer base.
      const looksLikeHandle = (n: string): boolean => {
        const c = n.trim();
        if (!c) return false;
        if (/\d/.test(c)) return true;
        if (/[(){}\[\]<>@#$]/.test(c)) return true;
        const tokens = c.split(/\s+/).map(t => t.replace(/[()[\]{}<>]/g, ''));
        if (tokens.length === 2 && tokens[0].length > 0 &&
            tokens[0].toUpperCase() === tokens[1].toUpperCase()) return true;
        return false;
      };
      const computedName = `${(user.firstName || '').trim()} ${(user.lastName || '').trim()}`.trim();
      const display      = (user.displayName || '').trim();
      const computedTokens = computedName ? computedName.split(/\s+/).length : 0;
      const displayTokens  = display ? display.split(/\s+/).length : 0;
      const fullName = (display && !looksLikeHandle(display) && displayTokens > computedTokens)
        ? display
        : (computedName || display || 'Usuario');
      const now = new Date().toISOString();

        const customerRef = sp1Db.collection('customers').doc(slCode);
        const existing = await customerRef.get();
        const existingData = existing.exists ? existing.data() : null;

        const customerData = {
          id: slCode,
          firebaseUid: userId,
          slCode: slCode,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          fullName: fullName,
          name: fullName,
          email: user.email || '',
          phone: user.phone || null,
          photoURL: user.photoURL || null,
          dni: user.dni || null,
          location: user.location || null,
          country: user.country || user.location?.country || 'Costa Rica',
          timezone: user.timezone || null,
          ruta: user.ruta || null,
          zona: user.ruta || null,
          route: user.ruta || null,
          tier: user.tier || user.membershipTier || 'basic',
          membershipTier: user.membershipTier || user.tier || 'basic',
          memberSince: user.memberSince || null,
          membershipExpires: user.membershipExpires || null,
          role: user.role || 'customer',
          totalShipments: user.totalShipments || 0,
          pendingShipments: user.pendingShipments || 0,
          status: user.status || 'active',
          isVerified: user.isVerified || false,
          isActive: user.isActive !== false,
          emailVerified: user.emailVerified || false,
          verifiedDni: user.verifiedDni || null,
          verifiedEmail: user.verifiedEmail || null,
          verifiedPhone: user.verifiedPhone || null,
          verificationSource: user.verificationSource || null,
          dateOfVerification: toISOString(user.dateOfVerification),
          acceptMarketing: user.acceptMarketing || false,
          preferredLanguage: user.preferredLanguage || 'es',
          consolidationEnabled: user.consolidationEnabled || false,
          migratedFromWordPress: user.migratedFromWordPress || false,
          wpUserId: user.wpUserId || null,
          // Addresses - use schema template if empty to show all fields in Firestore
          addresses: addresses.length > 0 ? addresses : [createEmptyAddressSchema()],
          defaultAddress: defaultAddress || createEmptyAddressSchema(),
          hasAddresses: addresses.length > 0,
          // Payment Methods - use schema template if empty to show all fields in Firestore
          paymentMethods: paymentMethods.length > 0 ? paymentMethods : [createEmptyPaymentMethodSchema()],
          defaultPaymentMethod: defaultPaymentMethod || createEmptyPaymentMethodSchema(),
          hasPaymentMethods: paymentMethods.length > 0,
          // Sync metadata
          isSynced: true,
          lastSyncAt: now,
          syncSource: 'smart-portal-2',
          syncVersion: (existingData?.syncVersion || 0) + 1,
          createdAt: existingData?.createdAt || now,
          updatedAt: now,
          lastLoginAt: toISOString(user.lastLoginAt),
          sp2CreatedAt: toISOString(user.createdAt),
          sp2UpdatedAt: toISOString(user.updatedAt),
        };

        // Helper to remove undefined values (Firestore doesn't accept undefined)
        const removeUndefined = (obj: Record<string, any>): Record<string, any> => {
          return Object.fromEntries(
            Object.entries(obj).filter(([_, v]) => v !== undefined)
          );
        };

        if (existing.exists) {
          const updateData = removeUndefined({
            ...customerData,
            // Preserve SP1-specific fields
            notes: existingData?.notes || null,
            preferredRouteId: existingData?.preferredRouteId || null,
            preferredRoute: existingData?.preferredRoute || null,
            createdBy: existingData?.createdBy || null,
            userCreatedBy: existingData?.userCreatedBy || null,
          });
          await customerRef.update(updateData);
          stats.updated++;
          if (stats.updated <= 3) {
            console.log(`[UPDATED] ${slCode} - ${addresses.length} addr, ${paymentMethods.length} pm`);
          }
        } else {
          await customerRef.set(removeUndefined(customerData));
          stats.created++;
          if (stats.created <= 3) {
            console.log(`[CREATED] ${slCode} - ${addresses.length} addr, ${paymentMethods.length} pm`);
          }
        }

    }; // end processUser

    // ── Parallel batch processing (20 concurrent) ────────────────────────────
    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const batch = docs.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(d => processUser(d)));

      for (let j = 0; j < results.length; j++) {
        stats.totalProcessed++;
        if (results[j].status === 'rejected') {
          stats.errors++;
          const reason = (results[j] as PromiseRejectedResult).reason;
          stats.errorDetails.push(`${batch[j].id}: ${reason?.message ?? reason}`);
          if (stats.errors <= 5) {
            console.log(`[ERROR] ${batch[j].id}: ${reason?.message ?? reason}`);
          }
        }
      }

      const currentTime = Date.now();
      const elapsed = (currentTime - startTime) / 1000;
      const rate = stats.totalProcessed / elapsed;
      const remaining = totalUsers - stats.totalProcessed;
      const eta = rate > 0 ? remaining / rate : 0;
      const percent = ((stats.totalProcessed / totalUsers) * 100).toFixed(1);
      console.log(
        `⏳ ${percent}% (${stats.totalProcessed}/${totalUsers}) | ` +
        `✅ ${stats.created} | ♻️ ${stats.updated} | ⏭️ ${stats.skipped} | ` +
        `ETA: ${Math.round(eta)}s`
      );
    }

    // ── Update sync metadata so next incremental run knows where to start ──────
    const syncEndTime = new Date().toISOString();
    await sp1Db.collection('_sync_metadata').doc('customers').set({
      lastSyncAt: syncEndTime,
      lastSyncStats: {
        created: stats.created,
        updated: stats.updated,
        skipped: stats.skipped,
        errors: stats.errors,
        mode: lastSyncAt ? 'incremental' : 'full',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`[CustomerSync] Sync metadata updated — nextRun will be incremental from: ${syncEndTime}`);

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n[CustomerSync] ✅ COMPLETED');
    console.log(`  Total Time: ${totalTime}s`);
    console.log(`  Total Users: ${stats.totalProcessed}/${totalUsers}`);
    console.log(`  Created: ${stats.created}`);
    console.log(`  Updated: ${stats.updated}`);
    console.log(`  Skipped: ${stats.skipped}`);
    console.log(`  Errors: ${stats.errors}`);
    console.log(`  Addresses synced: ${stats.addressesTotal}`);
    console.log(`  Payment Methods synced: ${stats.paymentMethodsTotal}`);

    if (stats.errorDetails.length > 0) {
      console.log('\nErrors:');
      stats.errorDetails.slice(0, 10).forEach(e => console.log(`  - ${e}`));
    }

  } catch (error) {
    console.error('[CustomerSync] Fatal error:', error);
  }

  process.exit(0);
}

runSync();
