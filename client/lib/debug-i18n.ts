/**
 * i18n Debug Helper
 * Add this to any component to debug translation loading
 */

import i18n from '@/i18n/config';

export function debugI18n() {
  console.group('🔍 i18n Debug Info');
  
  console.log('Current language:', i18n.language);
  console.log('Fallback language:', i18n.options.fallbackLng);
  console.log('Default namespace:', i18n.options.defaultNS);
  
  console.log('\n📦 Loaded namespaces:', Object.keys(i18n.store.data[i18n.language] || {}));
  
  // Check if specific namespaces are loaded
  const namespacesToCheck = ['menu', 'packages', 'payroll', 'dashboard'];
  namespacesToCheck.forEach(ns => {
    const exists = i18n.hasResourceBundle(i18n.language, ns);
    const status = exists ? '✅' : '❌';
    console.log(`${status} ${ns}:`, exists);
    
    if (exists) {
      // Show sample keys
      const bundle = i18n.getResourceBundle(i18n.language, ns);
      const keys = Object.keys(bundle || {}).slice(0, 3);
      console.log(`  Sample keys:`, keys);
    }
  });
  
  // Test translation
  console.log('\n🧪 Test translations:');
  console.log('menu.dashboard =>', i18n.t('menu.dashboard'));
  console.log('packages.title =>', i18n.t('packages.title'));
  console.log('payroll.menu.employees =>', i18n.t('payroll.menu.employees'));
  
  console.groupEnd();
}

// Auto-run debug on module load (only in development)
// Disabled - uncomment to enable debugging
// if (import.meta.env.DEV) {
//   console.log('🚀 i18n config loaded');
//   setTimeout(() => {
//     debugI18n();
//   }, 1000); // Wait 1 second for everything to initialize
// }
