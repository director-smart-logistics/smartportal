export type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "STAFF"
  | "AGENT"
  | "DELIVERY"
  | "CUSTOMER";

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  role: UserRole;
  createdAt: string;
}

/**
 * Customer Payment Method - Synced from smart-portal-2 payment_methods collection
 */
export interface CustomerPaymentMethod {
  id: string;
  userId?: string;
  type: 'card' | 'sinpe' | 'transfer' | 'paypal' | 'cash';
  label: string;
  cardLast4?: string | null;
  cardBrand?: 'visa' | 'mastercard' | 'amex' | 'discover' | 'unknown' | null;
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

/**
 * Customer Address - Synced from smart-portal-2 addresses collection
 */
export interface CustomerAddress {
  id: string;
  userId: string;
  type: 'residence' | 'work' | 'other';
  alias: string;
  country: string;
  province?: string | null;
  canton?: string | null;
  district?: string | null;
  city?: string | null;
  postalCode?: string | null;
  streetAddress: string;
  details?: string | null;
  coordinates?: {
    lat: number;
    lng: number;
    validated?: boolean;
  } | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryInstructions?: string | null;
  encomienda?: {
    id: string;
    name: string;
    phone?: string;
    pickupAddress?: string;
    schedule?: string;
  } | null;
  requiresEncomienda: boolean;
  status: 'active' | 'inactive' | 'pending_confirmation' | 'escalated';
  isDefault: boolean;
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * Customer interface - Normalized from smart-portal-2 users collection
 * 
 * SYNC SOURCE: smart-portal-2 /users collection (UserProfile)
 * SYNC FREQUENCY: Every 6 hours via Cloud Function
 * 
 * Field mapping from SP2 UserProfile:
 * - uid -> firebaseUid (primary key for sync)
 * - slCode -> slCode (document ID)
 * - firstName/lastName -> firstName/lastName, displayName -> fullName
 * - email -> email
 * - phone -> phone
 * - dni -> dni
 * - location -> location (province, canton, district, city, country)
 * - ruta -> ruta (delivery route assignment)
 * - tier/membershipTier -> tier, membershipTier
 * - status -> status
 * - isVerified -> isVerified
 * - emailVerified -> emailVerified
 * - verifiedDni/verifiedEmail/verifiedPhone -> verification data
 * - addresses (from SP2 addresses collection) -> addresses, defaultAddress
 */
export interface Customer {
  id: string;
  
  // === Identity (from SP2) ===
  firebaseUid: string; // SP2: uid - Primary sync key
  slCode: string; // SP2: slCode - SmartLogistics customer code SL{YY}{NNN}
  
  // === Personal Info (from SP2) ===
  firstName: string;
  lastName: string;
  fullName: string; // SP2: displayName or computed firstName + lastName
  email: string;
  phone?: string | null;
  photoURL?: string | null;
  
  // === Costa Rica Identity (from SP2) ===
  dni?: string | null; // Cédula
  
  // === Location (from SP2) ===
  location?: {
    province?: string;
    canton?: string;
    district?: string;
    city?: string;
    country: string;
  } | null;
  country: string; // Primary country (default: Costa Rica)
  timezone?: string | null;
  ruta?: string | null; // Delivery route assignment from SP2
  
  // === Legacy Address Fields (for backward compatibility) ===
  address?: string | null;
  city?: string | null;
  zipCode?: string | null;
  deliveryAddress1?: string | null;
  deliveryAddress2?: string | null;
  deliveryAddress3?: string | null;
  
  // === Route preference (SP1 specific) ===
  preferredRouteId?: string | null;
  preferredRoute?: {
    id: string;
    name: string;
    status: string;
  } | null;
  
  // === Membership (from SP2) ===
  tier: 'basic' | 'smart' | 'premium' | 'business';
  membershipTier: 'basic' | 'smart' | 'premium' | 'business';
  memberSince?: string | null;
  membershipExpires?: string | null;
  
  // === Role & Permissions (from SP2) ===
  role: 'customer' | 'staff' | 'admin' | 'warehouse_operator' | 'driver' | 'auditor' | 'scanner';
  
  // === Stats (from SP2) ===
  totalShipments: number;
  pendingShipments: number;
  
  // === Status Flags (from SP2) ===
  status: 'active' | 'inactive' | 'suspended' | 'deleted';
  isVerified: boolean;
  isActive: boolean;
  emailVerified: boolean;
  
  // === Verification Data (from SP2) ===
  verifiedDni?: string | null;
  verifiedEmail?: string | null;
  verifiedPhone?: string | null;
  verificationSource?: string | null;
  dateOfVerification?: string | null;
  /** Date of birth sourced from TSE (e.g. "27/09/1987") */
  birthDate?: string | null;
  /** Nationality sourced from TSE (e.g. "Costarricense") */
  nationality?: string | null;
  
  // === Settings (from SP2) ===
  acceptMarketing: boolean;
  preferredLanguage: 'es' | 'en' | 'pt' | 'zh';
  consolidationEnabled: boolean;
  
  // === WordPress Migration (from SP2) ===
  migratedFromWordPress?: boolean;
  wpUserId?: number | null;
  
  // === Sync Tracking (SP1 specific) ===
  isSynced: boolean;
  lastSyncAt: string | null;
  syncSource: 'smart-portal-2' | 'manual' | 'import';
  syncVersion: number; // Incremented on each sync
  
  // === SP1 Specific Fields ===
  notes?: string | null;
  
  // === Addresses (from SP2 addresses collection) ===
  addresses?: CustomerAddress[];
  defaultAddress?: CustomerAddress | null;
  
  // === Payment Methods (from SP2 payment_methods collection) ===
  paymentMethods?: CustomerPaymentMethod[];
  defaultPaymentMethod?: CustomerPaymentMethod | null;
  
  // === Timestamps ===
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
  sp2CreatedAt?: string | null; // Original creation date in SP2
  sp2UpdatedAt?: string | null; // Last update date in SP2
  
  // === Audit (SP1 specific) ===
  createdBy?: string | null;
  updatedBy?: string | null;
  userCreatedBy?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  userUpdatedBy?: {
    id: string;
    fullName: string;
  } | null;
  
  // === Relations (SP1 specific) ===
  packages?: Package[];
  invoices?: any[];
  quotes?: any[];
}

/**
 * Customer statistics for dashboard
 */
export interface CustomerStats {
  totalPackages: number;
  activePackages: number;
  deliveredPackages: number;
  totalValue: number;
  totalWeight: number;
  lastActivityDate: string | null;
  daysAsCustomer: number;
  averagePackageWeight: number;
}

/**
 * Customer activity/audit trail item
 */
export type ActivityType = 
  | 'customer_created'
  | 'customer_updated'
  | 'package_created'
  | 'package_status_changed'
  | 'invoice_created'
  | 'quote_created'
  | 'route_changed';

export interface CustomerActivity {
  id: string;
  type: ActivityType;
  description: string;
  timestamp: string;
  userId?: string | null;
  user?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  metadata?: Record<string, any>;
}

export interface Location {
  id: string;
  name: string;
  type: "Origin" | "Destination";
  country: string;
  isActive: boolean;
}

export interface PackageStatus {
  id: string;
  packageId: string;
  status: "pre_alerted" | "received" | "in_transit" | "customs" | "retained" | "on_route" | "delivered" | "consolidated" | "returned";
  locationId: string;
  timestamp: string;
  description?: string;
  createdBy: string;
}

export interface Package {
  id: string;
  trackingNumber: string;
  /**
   * Searchable tracking variants — populated by the manifest ingester and
   * the `slBackfillTrackingVariants` Cloud Function. Indexes carrier-specific
   * extracts (USPS 9-prefix from 420-composite, FedEx 96-suffix, UPS 1Z, GS1
   * runs, etc.) so the public `/scanner/bodega` lookup can match a partial
   * scan via `array-contains-any`.
   */
  trackingVariants?: string[];
  customerId: string;
  customerName: string;
  slCode?: string;
  agentId?: string;
  staffId?: string;
  deliveryId?: string;
  status:
  | "pending"
  | "intake"
  | "in_transit"
  | "custom_released"
  | "consolidated_completed"
  | "delivered"
  | "failed"
  | "intake";
  flagStatus?: "normal" | "requires_documents" | "stuck_in_customs" | "clear_to_proceed";
  daysInSystem?: number;
  weight: number;
  description?: string;
  type?: string;
  origin: string;
  destination: string;
  routeId?: string;
  route?: {
    id: string;
    name: string;
    status: string;
    destinationLocation?: string;
  };
  originLocationId?: string;
  destinationLocationId?: string;
  assignedRouteId?: string;
  consolidatedId?: string;
  isConsolidated?: boolean;
  calculatedCost?: number;
  manifestNumber?: string;
  createdAt: string;
  updatedAt: string;
  /** True once the package has been successfully pushed to SmartWeb (SP2) */
  smartwebSynced?: boolean;
  /** ISO timestamp of last successful SmartWeb sync */
  smartwebSyncedAt?: string | null;
  /** How the package was synced — via an invoice sync or a direct package bulk update */
  smartwebSyncSource?: 'invoice' | 'package';
}

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    fullName: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
}
