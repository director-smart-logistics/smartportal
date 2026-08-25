import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

// Initialize Firebase Admin
if (getApps().length === 0) {
  initializeApp({
    credential: applicationDefault(),
    projectId: 'smart-portal-admin',
  });
}

const db = getFirestore('portal');

// Helper to create timestamps
const now = () => Timestamp.now();
const daysAgo = (days: number) => Timestamp.fromDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000));

// ============================================
// SEED DATA
// ============================================

// Users
// NOTE: This seed ONLY creates Firestore user documents.
// Google Auth accounts are NOT created here - they must be created manually
// or through the Firebase Console. When a real user signs in with Google Auth,
// their profile will be created/synced in Firestore.
const users = [
  {
    id: 'user-admin-001',
    email: 'admin@smartlogistics.com',
    fullName: 'Admin User',
    role: 'ADMIN',
    status: 'active',
    phone: '+506 8888-0001',
  },
  {
    id: 'user-manager-001',
    email: 'manager@smartlogistics.com',
    fullName: 'Manager User',
    role: 'MANAGER',
    status: 'active',
    phone: '+506 8888-0002',
  },
  {
    id: 'user-driver-001',
    email: 'driver1@smartlogistics.com',
    fullName: 'Carlos Rodriguez',
    role: 'DELIVERY',
    status: 'active',
    phone: '+506 8888-1111',
  },
  {
    id: 'user-driver-002',
    email: 'driver2@smartlogistics.com',
    fullName: 'Maria Gonzalez',
    role: 'DELIVERY',
    status: 'active',
    phone: '+506 8888-2222',
  },
];

// Customers
const customers = [
  {
    id: 'cust-001',
    fullName: 'Acme Corporation',
    email: 'contact@acme.com',
    phone: '+1 555-0101',
    address: '123 Business Ave',
    city: 'San Jose',
    country: 'Costa Rica',
    status: 'active',
    slCode: 'SL-001',
    deliveryAddress1: '123 Business Ave, San Jose',
  },
  {
    id: 'cust-002',
    fullName: 'Tech Solutions Inc',
    email: 'info@techsolutions.com',
    phone: '+1 555-0102',
    address: '456 Tech Street',
    city: 'San Jose',
    country: 'Costa Rica',
    status: 'active',
    slCode: 'SL-002',
    deliveryAddress1: '456 Tech Street, San Jose',
  },
  {
    id: 'cust-003',
    fullName: 'Global Imports Ltd',
    email: 'shipping@globalimports.com',
    phone: '+1 555-0103',
    address: '789 Import Boulevard',
    city: 'Cartago',
    country: 'Costa Rica',
    status: 'active',
    slCode: 'SL-003',
    deliveryAddress1: '789 Import Boulevard, Cartago',
  },
  {
    id: 'cust-004',
    fullName: 'Retail Express',
    email: 'orders@retailexpress.com',
    phone: '+1 555-0104',
    address: '321 Commerce Road',
    city: 'Alajuela',
    country: 'Costa Rica',
    status: 'active',
    slCode: 'SL-004',
    deliveryAddress1: '321 Commerce Road, Alajuela',
  },
];

// Packages (with customer references)
const packages = [
  {
    id: 'pkg-001',
    trackingNumber: '123456789012',
    customerId: 'cust-001',
    customerName: 'Acme Corporation',
    weight: 5.5,
    origin: 'Miami, FL',
    destination: 'San Jose, CR',
    description: 'Electronics shipment',
    status: 'pending',
    type: 'air',
    carrier: 'FedEx',
    daysInSystem: 2,
  },
  {
    id: 'pkg-002',
    trackingNumber: '123456789013',
    customerId: 'cust-001',
    customerName: 'Acme Corporation',
    weight: 8.3,
    origin: 'Miami, FL',
    destination: 'San Jose, CR',
    description: 'Office supplies',
    status: 'in_transit',
    type: 'air',
    carrier: 'FedEx',
    daysInSystem: 5,
  },
  {
    id: 'pkg-003',
    trackingNumber: 'TBA1234567890123',
    customerId: 'cust-002',
    customerName: 'Tech Solutions Inc',
    weight: 3.2,
    origin: 'Orlando, FL',
    destination: 'San Jose, CR',
    description: 'Software equipment',
    status: 'pending',
    type: 'air',
    carrier: 'Amazon',
    daysInSystem: 1,
  },
  {
    id: 'pkg-004',
    trackingNumber: 'TBA1234567890124',
    customerId: 'cust-002',
    customerName: 'Tech Solutions Inc',
    weight: 15.8,
    origin: 'Orlando, FL',
    destination: 'San Jose, CR',
    description: 'Server hardware',
    status: 'delivered',
    type: 'air',
    carrier: 'Amazon',
    daysInSystem: 10,
  },
  {
    id: 'pkg-005',
    trackingNumber: '1234567890',
    customerId: 'cust-003',
    customerName: 'Global Imports Ltd',
    weight: 25.5,
    origin: 'New York, NY',
    destination: 'Cartago, CR',
    description: 'Bulk goods',
    status: 'in_transit',
    type: 'freight',
    carrier: 'DHL',
    daysInSystem: 4,
  },
  {
    id: 'pkg-006',
    trackingNumber: '1Z999AA10123456784',
    customerId: 'cust-004',
    customerName: 'Retail Express',
    weight: 4.5,
    origin: 'Los Angeles, CA',
    destination: 'Alajuela, CR',
    description: 'Consumer goods',
    status: 'pending',
    type: 'air',
    carrier: 'UPS',
    daysInSystem: 3,
  },
];

// Invoices (with customer and package references)
const invoices = [
  {
    id: 'inv-001',
    invoiceNumber: 'INV-2024-001',
    customerId: 'cust-001',
    customerName: 'Acme Corporation',
    status: 'pending',
    totalAmount: 125.50,
    currency: 'USD',
    items: [
      { packageId: 'pkg-001', description: 'Electronics shipment', quantity: 1, unitPrice: 75.50 },
      { packageId: 'pkg-002', description: 'Office supplies', quantity: 1, unitPrice: 50.00 },
    ],
  },
  {
    id: 'inv-002',
    invoiceNumber: 'INV-2024-002',
    customerId: 'cust-002',
    customerName: 'Tech Solutions Inc',
    status: 'paid',
    totalAmount: 180.00,
    currency: 'USD',
    items: [
      { packageId: 'pkg-003', description: 'Software equipment', quantity: 1, unitPrice: 45.00 },
      { packageId: 'pkg-004', description: 'Server hardware', quantity: 1, unitPrice: 135.00 },
    ],
  },
  {
    id: 'inv-003',
    invoiceNumber: 'INV-2024-003',
    customerId: 'cust-003',
    customerName: 'Global Imports Ltd',
    status: 'sent',
    totalAmount: 250.00,
    currency: 'USD',
    items: [
      { packageId: 'pkg-005', description: 'Bulk goods', quantity: 1, unitPrice: 250.00 },
    ],
  },
];

// Settings
const settings = [
  { id: 'app_name', key: 'app_name', value: 'SmartLogistics', type: 'string', category: 'branding', isPublic: true },
  { id: 'company_name', key: 'company_name', value: 'Smart Logistics CR', type: 'string', category: 'branding', isPublic: true },
  { id: 'company_email', key: 'company_email', value: 'contact@smartlogisticscr.com', type: 'string', category: 'general', isPublic: true },
  { id: 'company_phone', key: 'company_phone', value: '+506 2222-3333', type: 'string', category: 'general', isPublic: true },
  { id: 'tax_rate', key: 'tax_rate', value: '0.13', type: 'number', category: 'invoice', isPublic: false },
  { id: 'default_currency', key: 'default_currency', value: 'USD', type: 'string', category: 'invoice', isPublic: true },
  { id: 'invoice_prefix', key: 'invoice_prefix', value: 'INV', type: 'string', category: 'invoice', isPublic: false },
];

// Permissions
const permissions = [
  { id: 'perm-admin-all', role: 'ADMIN', resource: '*', action: '*', allowed: true },
  { id: 'perm-manager-packages', role: 'MANAGER', resource: 'packages', action: 'manage', allowed: true },
  { id: 'perm-manager-customers', role: 'MANAGER', resource: 'customers', action: 'manage', allowed: true },
  { id: 'perm-manager-invoices', role: 'MANAGER', resource: 'invoices', action: 'manage', allowed: true },
  { id: 'perm-delivery-packages', role: 'DELIVERY', resource: 'packages', action: 'view', allowed: true },
  { id: 'perm-delivery-distribution', role: 'DELIVERY', resource: 'distribution', action: 'update', allowed: true },
];

// ============================================
// SEED FUNCTIONS
// ============================================

async function seedUsers() {
  console.log('👤 Seeding users...');
  const batch = db.batch();
  
  for (const user of users) {
    const ref = db.collection('users').doc(user.id);
    batch.set(ref, {
      ...user,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${users.length} users`);
}

async function seedCustomers() {
  console.log('👥 Seeding customers...');
  const batch = db.batch();
  
  for (const customer of customers) {
    const ref = db.collection('customers').doc(customer.id);
    batch.set(ref, {
      ...customer,
      createdBy: 'user-admin-001',
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${customers.length} customers`);
}

async function seedPackages() {
  console.log('📦 Seeding packages...');
  const batch = db.batch();
  
  for (const pkg of packages) {
    const ref = db.collection('packages').doc(pkg.id);
    batch.set(ref, {
      ...pkg,
      createdBy: 'user-admin-001',
      createdAt: daysAgo(pkg.daysInSystem),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${packages.length} packages`);
}

async function seedInvoices() {
  console.log('🧾 Seeding invoices...');
  const batch = db.batch();
  
  for (const invoice of invoices) {
    const ref = db.collection('invoices').doc(invoice.id);
    batch.set(ref, {
      ...invoice,
      invoiceDate: daysAgo(5),
      dueDate: Timestamp.fromDate(new Date(Date.now() + 25 * 24 * 60 * 60 * 1000)),
      createdBy: 'user-admin-001',
      createdAt: daysAgo(5),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${invoices.length} invoices`);
}

async function seedSettings() {
  console.log('⚙️  Seeding settings...');
  const batch = db.batch();
  
  for (const setting of settings) {
    const ref = db.collection('settings').doc(setting.id);
    batch.set(ref, {
      ...setting,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${settings.length} settings`);
}

async function seedPermissions() {
  console.log('🔐 Seeding permissions...');
  const batch = db.batch();
  
  for (const permission of permissions) {
    const ref = db.collection('permissions').doc(permission.id);
    batch.set(ref, {
      ...permission,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${permissions.length} permissions`);
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🌱 Starting Firestore seed...\n');
  
  try {
    await seedUsers();
    await seedCustomers();
    await seedPackages();
    await seedInvoices();
    await seedSettings();
    await seedPermissions();
    
    console.log('\n🎉 Firestore seed completed successfully!');
  } catch (error) {
    console.error('❌ Error seeding Firestore:', error);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
