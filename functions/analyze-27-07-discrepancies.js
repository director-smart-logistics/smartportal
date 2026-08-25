const fs = require('fs');

const report = JSON.parse(
  fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/manifest_27_07_audit_report.json', 'utf8')
);

const rowMismatches = report.discrepanciesList.filter(d => d.reason === 'ROW_MISMATCH' || d.reason === 'ROW_AND_INVOICE_MISMATCH');
const invoiceOnlyMismatches = report.discrepanciesList.filter(d => d.reason === 'INVOICE_MISMATCH');

console.log('=== DETAILED BREAKDOWN FOR SL-MEGA-MAN-27-07-2026 ===');
console.log(`Total packages: ${report.totalPackages}`);
console.log(`Packages with 100% route match across row, master profile and invoice: ${report.totalOK}`);
console.log(`Packages where manifest row route != customer master profile route: ${rowMismatches.length}`);
console.log(`Packages where row route == master profile route, but invoice field is missing/different: ${invoiceOnlyMismatches.length}`);

if (rowMismatches.length > 0) {
  console.log('\n--- PACKAGES WITH ROW VS MASTER PROFILE ROUTE MISMATCH ---');
  rowMismatches.forEach(d => {
    console.log(`Row #${d.index} | Tracking: ${d.tracking} | slCode: ${d.slCode} | PkgName: ${d.pkgName}`);
    console.log(`   - Manifest Row Route: "${d.rowRuta}"`);
    console.log(`   - Customer Master Route: "${d.masterRuta}"`);
  });
} else {
  console.log('\n🎉 ZERO PACKAGES HAVE ROUTE MISMATCHES BETWEEN MANIFEST ROWS AND CUSTOMER MASTER PROFILES!');
}
