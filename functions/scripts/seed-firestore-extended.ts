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
// ROUTES (from smart-portal-2)
// ============================================
const routes = [
  {
    id: 'cartago-1',
    name: 'Cartago 1',
    type: 'metropolitan',
    color: 'cyan-500',
    areas: ['Zapote', 'Lourdes', 'Bermejo', 'Tobosi', 'San Isidro', 'El Tejar', 'Oriental', 'Guadalupe', 'Dulce Nombre', 'Agua Caliente', 'Curridabat', 'El Guarco', 'San Francisco', 'Quebradilla'],
    cantons: ['Cartago', 'Curridabat', 'El Guarco'],
    province: 'Cartago',
    active: true,
  },
  {
    id: 'cartago-2',
    name: 'Cartago 2',
    type: 'metropolitan',
    color: 'blue-600',
    areas: ['San Pedro', 'Tres Ríos', 'Ochomogo', 'Quircot', 'Taras', 'Los Diques', 'El Carmen', 'San Blas', 'San Rafael de Oreamuno', 'Caballo Blanco', 'Paraíso', 'La Unión', 'Granadilla'],
    cantons: ['Oreamuno', 'Paraíso', 'La Unión'],
    province: 'Cartago',
    active: true,
  },
  {
    id: 'heredia',
    name: 'Heredia',
    type: 'metropolitan',
    color: 'yellow-500',
    areas: ['Santo Domingo', 'San Francisco', 'La Aurora', 'Mercedes', 'San Pablo', 'Guarari', 'Santa Bárbara', 'San Juan', 'San Joaquín', 'Ulloa', 'Barva', 'San Lorenzo', 'San Rafael de Heredia'],
    cantons: ['Heredia', 'Santo Domingo', 'Santa Bárbara', 'San Pablo', 'Barva', 'San Rafael'],
    province: 'Heredia',
    active: true,
  },
  {
    id: 'san-jose-coronado',
    name: 'San Jose Coronado',
    type: 'metropolitan',
    color: 'pink-400',
    areas: ['Coronado', 'Vázquez de Coronado', 'San Isidro de Heredia', 'Moravia', 'Guadalupe', 'Tibás'],
    cantons: ['Vázquez de Coronado', 'San Isidro', 'Moravia', 'Goicoechea', 'Tibás'],
    province: 'San José',
    active: true,
  },
  {
    id: 'san-jose-escazu',
    name: 'San Jose Escazu',
    type: 'metropolitan',
    color: 'fuchsia-500',
    areas: ['Escazú', 'Belén', 'Santa Ana', 'Alajuelita'],
    cantons: ['Escazú', 'Belén', 'Santa Ana', 'Alajuelita'],
    province: 'San José',
    active: true,
  },
  {
    id: 'san-jose-centro',
    name: 'San Jose Centro',
    type: 'metropolitan',
    color: 'purple-700',
    areas: ['Hatillo', 'Pavas', 'Carpio', 'Sabana', 'Paseo Colón', 'Barrio México', 'Barrio Cuba', 'Centro', 'San Sebastián', 'Paso Ancho', 'Desamparados', 'Aserrí'],
    cantons: ['San José', 'Desamparados', 'Aserrí'],
    province: 'San José',
    active: true,
  },
  {
    id: 'alajuela',
    name: 'Alajuela',
    type: 'metropolitan',
    color: 'red-600',
    areas: ['Alajuela Centro', 'San Antonio', 'Guácima', 'San José de Alajuela', 'Carrizal', 'San Isidro', 'Sabanilla', 'San Rafael', 'Desamparados'],
    cantons: ['Alajuela'],
    province: 'Alajuela',
    active: true,
  },
  {
    id: 'occidente',
    name: 'Occidente',
    type: 'metropolitan',
    color: 'orange-600',
    areas: ['Grecia', 'La Garita', 'Poás', 'Atenas', 'Naranjo', 'Palmares', 'San Ramón', 'Zarcero', 'Valverde Vega'],
    cantons: ['Grecia', 'Poás', 'Atenas', 'Naranjo', 'Palmares', 'San Ramón', 'Zarcero', 'Valverde Vega'],
    province: 'Alajuela',
    active: true,
  },
  {
    id: 'encomiendas',
    name: 'Encomiendas',
    type: 'encomienda',
    color: 'emerald-600',
    areas: ['San Carlos', 'Upala', 'Los Chiles', 'Guatuso', 'Río Cuarto', 'Orotina', 'San Mateo', 'Turrialba', 'Limón', 'Pococí', 'Siquirres', 'Puntarenas', 'Guanacaste'],
    cantons: ['San Carlos', 'Upala', 'Los Chiles', 'Limón', 'Puntarenas'],
    province: 'Multiple',
    active: true,
    requiresEncomienda: true,
  },
  {
    id: 'retira',
    name: 'Retira',
    type: 'metropolitan',
    color: 'teal-600',
    areas: ['Pickup', 'Retira en SmartLogistics'],
    cantons: ['N/A'],
    province: 'San José',
    active: true,
  },
  {
    id: 'desconocida',
    name: 'Desconocida',
    type: 'unknown',
    color: 'zinc-500',
    areas: ['Sin Ruta Asignada'],
    cantons: ['N/A'],
    province: 'N/A',
    active: true,
  },
];

// ============================================
// DELIVERIES
// ============================================
const deliveries = [
  {
    id: 'del-001',
    packageId: 'pkg-004',
    routeId: 'san-jose-centro',
    customerId: 'cust-002',
    customerName: 'Tech Solutions Inc',
    deliveryAddress: '456 Tech Street, San Jose',
    status: 'delivered',
    deliveredBy: 'user-driver-001',
    signature: 'base64-signature-data',
    notes: 'Delivered to reception',
  },
  {
    id: 'del-002',
    packageId: 'pkg-002',
    routeId: 'cartago-1',
    customerId: 'cust-001',
    customerName: 'Acme Corporation',
    deliveryAddress: '123 Business Ave, Cartago',
    status: 'delivered',
    deliveredBy: 'user-driver-002',
    signature: 'base64-signature-data',
    notes: 'Signed by security guard',
  },
];

// ============================================
// HR - DEPARTMENTS
// ============================================
const departments = [
  {
    id: 'dept-001',
    name: 'Operations',
    code: 'OPS',
    description: 'Operations and logistics department',
    status: 'active',
    countryCode: 'CR',
  },
  {
    id: 'dept-002',
    name: 'Administration',
    code: 'ADM',
    description: 'Administrative and finance department',
    status: 'active',
    countryCode: 'CR',
  },
];

// ============================================
// HR - EMPLOYEES
// ============================================
const employees = [
  {
    id: 'emp-001',
    employeeCode: 'EMP-001',
    fullName: 'Carlos Rodriguez',
    email: 'carlos@smartlogistics.com',
    phone: '+506 8888-1111',
    departmentId: 'dept-001',
    position: 'Delivery Driver',
    hireDate: '2023-01-15',
    salary: 450000,
    currency: 'CRC',
    status: 'active',
  },
  {
    id: 'emp-002',
    employeeCode: 'EMP-002',
    fullName: 'Maria Gonzalez',
    email: 'maria@smartlogistics.com',
    phone: '+506 8888-2222',
    departmentId: 'dept-002',
    position: 'Administrative Assistant',
    hireDate: '2023-03-20',
    salary: 550000,
    currency: 'CRC',
    status: 'active',
  },
];

// ============================================
// PRICING (matching smart-portal-2 structure)
// ============================================
const pricing = [
  // USA Air
  // PRICING LOGIC:
  // 0-499g = $8
  // 500g-1kg = $12
  // >1kg = $12 (primer kg) + $12 (cada kg completo adicional) + fracción
  //        fracción 0-499g = $8, fracción >=500g = $12
  // EJEMPLOS: 0.23kg=$8, 0.89kg=$12, 1.30kg=$20, 2.12kg=$32, 2.56kg=$36, 3.50kg=$48
  {
    id: 'usa-air',
    country: 'usa',
    countryName: 'Estados Unidos',
    flag: '🇺🇸',
    shippingType: 'air',
    shippingTypeName: 'Aéreo',
    note: 'Vuelos diarios · 3-4 días hábiles',
    regular: {
      description: 'Ropa, calzado, accesorios, adornos, bisutería, juguetes',
      tiers: [
        { range: '0g - 499g', price: 8, note: 'Peso mínimo' },
        { range: '500g - 1kg', price: 12, note: 'Primer kilogramo' },
        { range: '>1kg base', price: 12, note: 'Primer kg = $12' },
        { range: 'Cada kg adicional completo', price: 12, note: 'Por cada kg completo adicional' },
        { range: 'Fracción 0-499g', price: 8, note: 'Fracción menor a 500g' },
        { range: 'Fracción >=500g', price: 12, note: 'Fracción de 500g o más' },
      ],
      currency: 'USD',
      examples: [
        { weight: 0.23, price: 8, calculation: '0-499g = $8' },
        { weight: 0.89, price: 12, calculation: '500g-1kg = $12' },
        { weight: 1.30, price: 20, calculation: '12 + 8 = $20' },
        { weight: 2.12, price: 32, calculation: '12 + 12 + 8 = $32' },
        { weight: 2.56, price: 36, calculation: '12 + 12 + 12 = $36' },
        { weight: 3.50, price: 48, calculation: '12 + 12 + 12 + 12 = $48' },
      ],
    },
    restricted: {
      description: 'Cosméticos, medicamentos, suplementos, alimentos',
      basePrice: 12,
      trackingFee: 3,
      perKg: 12,
      currency: 'USD',
    },
    electronics: {
      description: 'Electrónicos',
      quoteRequired: true,
      chargePerTracking: true,
    },
  },
  // USA Sea
  {
    id: 'usa-sea',
    country: 'usa',
    countryName: 'Estados Unidos',
    flag: '🇺🇸',
    shippingType: 'sea',
    shippingTypeName: 'Marítimo',
    note: 'Envío económico 15-30 días',
    regular: {
      description: 'Artículos generales por pie cúbico',
      pricePerCubicFoot: 30,
      currency: 'USD',
    },
    restricted: {
      description: 'Artículos regulados',
      quoteRequired: true,
      currency: 'USD',
    },
    electronics: {
      quoteRequired: true,
    },
  },
  // Mexico Air
  {
    id: 'mexico-air',
    country: 'mexico',
    countryName: 'México',
    flag: '🇲🇽',
    shippingType: 'air',
    shippingTypeName: 'Aéreo',
    note: '1 vuelo al mes · Ciudad de México',
    regular: {
      description: 'Artículos generales',
      pricePerKg: 16,
      currency: 'USD',
    },
    restricted: {
      description: 'Artículos que requieren permisos',
      pricePerKg: 20,
      currency: 'USD',
    },
    electronics: {
      quoteRequired: true,
      chargePerTracking: true,
    },
  },
  // Mexico Sea
  {
    id: 'mexico-sea',
    country: 'mexico',
    countryName: 'México',
    flag: '🇲🇽',
    shippingType: 'sea',
    shippingTypeName: 'Marítimo',
    regular: {
      description: 'Por peso volumétrico',
      pricePerKg: 5,
      currency: 'USD',
      note: 'Largo x Ancho x Alto (cm) ÷ 5000',
    },
    restricted: {
      description: 'Artículos regulados',
      basePrice: 8,
      trackingFee: 3,
      pricePerKg: 5,
      currency: 'USD',
    },
    electronics: {
      quoteRequired: true,
      chargePerTracking: true,
    },
  },
  // China Air
  {
    id: 'china-air',
    country: 'china',
    countryName: 'China',
    flag: '🇨🇳',
    shippingType: 'air',
    shippingTypeName: 'Aéreo',
    note: '1-2 cortes semanales · Baiyun',
    regular: {
      description: 'Artículos generales',
      pricePerKg: 20,
      currency: 'USD',
    },
    restricted: {
      description: 'Artículos regulados',
      quoteRequired: true,
      currency: 'USD',
    },
    electronics: {
      quoteRequired: true,
      chargePerTracking: true,
    },
  },
  // China Sea
  {
    id: 'china-sea',
    country: 'china',
    countryName: 'China',
    flag: '🇨🇳',
    shippingType: 'sea',
    shippingTypeName: 'Marítimo',
    note: 'Corte cada 15 días',
    regular: {
      description: 'Por pie cúbico',
      pricePerCubicFoot: 45,
      currency: 'USD',
    },
    restricted: {
      description: 'Artículos regulados',
      quoteRequired: true,
      currency: 'USD',
    },
    electronics: {
      quoteRequired: true,
    },
  },
  // Colombia Air
  {
    id: 'colombia-air',
    country: 'colombia',
    countryName: 'Colombia',
    flag: '🇨🇴',
    shippingType: 'air',
    shippingTypeName: 'Aéreo',
    note: '',
    regular: {
      description: 'Artículos generales',
      pricePerKg: 12,
      currency: 'USD',
    },
    restricted: {
      description: 'Artículos que requieren permisos',
      pricePerKg: 15,
      currency: 'USD',
    },
    electronics: {
      quoteRequired: true,
      chargePerTracking: true,
    },
  },
  // Colombia Sea
  {
    id: 'colombia-sea',
    country: 'colombia',
    countryName: 'Colombia',
    flag: '🇨🇴',
    shippingType: 'sea',
    shippingTypeName: 'Marítimo',
    regular: {
      description: 'Por peso volumétrico',
      pricePerKg: 7,
      currency: 'USD',
    },
    restricted: {
      description: 'Artículos regulados',
      basePrice: 10,
      trackingFee: 3,
      pricePerKg: 7,
      currency: 'USD',
    },
    electronics: {
      quoteRequired: true,
    },
  },
];

// ============================================
// CONSOLIDATION RULES
// ============================================
const consolidationRules = [
  {
    id: 'cons-rule-001',
    name: 'Standard Consolidation',
    description: 'Standard consolidation for regular packages',
    maxWeight: 50,
    maxPackages: 10,
    allowMixedCategories: false,
    applicableCategories: ['regular'],
    discountPercentage: 10,
    active: true,
  },
  {
    id: 'cons-rule-002',
    name: 'Premium Consolidation',
    description: 'Premium consolidation with higher limits',
    maxWeight: 100,
    maxPackages: 20,
    allowMixedCategories: true,
    applicableCategories: ['regular', 'restricted'],
    discountPercentage: 15,
    active: true,
  },
];

// ============================================
// PAYROLL SETTINGS (per country)
// ============================================
const payrollSettings = [
  {
    id: 'CR',
    countryCode: 'CR',
    countryName: 'Costa Rica',
    employerSocialSecurityRate: 0.2683,
    employeeSocialSecurityRate: 0.1083,
    overtimeRate: 1.5,
    standardWeeklyHours: 48,
    incomeTaxBrackets: [
      { upTo: 922000, rate: 0 },
      { upTo: 1352000, rate: 0.1 },
      { upTo: 2373000, rate: 0.15 },
      { upTo: 4745000, rate: 0.2 },
      { upTo: 999999999, rate: 0.25 },
    ],
  },
  {
    id: 'US',
    countryCode: 'US',
    countryName: 'United States',
    employerSocialSecurityRate: 0.0765,
    employeeSocialSecurityRate: 0.0765,
    overtimeRate: 1.5,
    standardWeeklyHours: 40,
    incomeTaxBrackets: [
      { upTo: 11000, rate: 0.1 },
      { upTo: 44725, rate: 0.12 },
      { upTo: 95375, rate: 0.22 },
      { upTo: 182000, rate: 0.24 },
      { upTo: 999999999, rate: 0.32 },
    ],
  },
];

// ============================================
// PAYROLL
// ============================================
const payrollRecords = [
  {
    id: 'payroll-001',
    employeeId: 'emp-001',
    employeeName: 'Carlos Rodriguez',
    period: '2024-02',
    baseSalary: 450000,
    bonuses: 25000,
    deductions: 67500,
    netSalary: 407500,
    currency: 'CRC',
    status: 'paid',
    paymentDate: '2024-02-28',
  },
  {
    id: 'payroll-002',
    employeeId: 'emp-002',
    employeeName: 'Maria Gonzalez',
    period: '2024-02',
    baseSalary: 550000,
    bonuses: 0,
    deductions: 82500,
    netSalary: 467500,
    currency: 'CRC',
    status: 'paid',
    paymentDate: '2024-02-28',
  },
];

// ============================================
// SEED FUNCTIONS
// ============================================

async function seedRoutes() {
  console.log('🛣️  Seeding routes...');
  const batch = db.batch();
  
  for (const route of routes) {
    const ref = db.collection('routes').doc(route.id);
    batch.set(ref, {
      ...route,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${routes.length} routes`);
}

async function seedDeliveries() {
  console.log('🚚 Seeding deliveries...');
  const batch = db.batch();
  
  for (const delivery of deliveries) {
    const ref = db.collection('deliveries').doc(delivery.id);
    batch.set(ref, {
      ...delivery,
      deliveredAt: daysAgo(2),
      createdAt: daysAgo(3),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${deliveries.length} deliveries`);
}

async function seedDepartments() {
  console.log('🏢 Seeding departments...');
  const batch = db.batch();
  
  for (const dept of departments) {
    const ref = db.collection('departments').doc(dept.id);
    batch.set(ref, {
      ...dept,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${departments.length} departments`);
}

async function seedEmployees() {
  console.log('👥 Seeding employees...');
  const batch = db.batch();
  
  for (const emp of employees) {
    const ref = db.collection('employees').doc(emp.id);
    batch.set(ref, {
      ...emp,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${employees.length} employees`);
}

async function seedPricing() {
  console.log('💰 Seeding pricing...');
  const batch = db.batch();
  
  for (const price of pricing) {
    const ref = db.collection('pricing').doc(price.id);
    batch.set(ref, {
      ...price,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${pricing.length} pricing rules`);
}

async function seedConsolidationRules() {
  console.log('📦 Seeding consolidation rules...');
  const batch = db.batch();
  
  for (const rule of consolidationRules) {
    const ref = db.collection('consolidationRules').doc(rule.id);
    batch.set(ref, {
      ...rule,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${consolidationRules.length} consolidation rules`);
}

async function seedPayroll() {
  console.log('💵 Seeding payroll...');
  const batch = db.batch();
  
  for (const record of payrollRecords) {
    const ref = db.collection('payroll').doc(record.id);
    batch.set(ref, {
      ...record,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${payrollRecords.length} payroll records`);
}

async function seedPayrollSettings() {
  console.log('⚙️  Seeding payroll settings...');
  const batch = db.batch();
  
  for (const settings of payrollSettings) {
    const ref = db.collection('payrollSettings').doc(settings.id);
    batch.set(ref, {
      ...settings,
      createdAt: now(),
      updatedAt: now(),
    });
  }
  
  await batch.commit();
  console.log(`  ✅ Created ${payrollSettings.length} payroll settings`);
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('🌱 Starting Firestore extended seed...\n');
  
  try {
    await seedRoutes();
    await seedDeliveries();
    await seedDepartments();
    await seedEmployees();
    await seedPricing();
    await seedConsolidationRules();
    await seedPayroll();
    await seedPayrollSettings();
    
    console.log('\n🎉 Extended seed completed successfully!');
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
