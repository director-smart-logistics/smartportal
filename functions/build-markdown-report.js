const fs = require('fs');

const rawReport = JSON.parse(fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/forensic_report_23_07.json', 'utf8'));

const { generatedAt, manifestId, manifestNumber, summary, auditLogs, customers } = rawReport;

const userNames = {
  'ojCVHN5XLlWlfPbWJ40FTcerSWt1': 'Usuario Admin (ojCVHN...)',
  'KALWHbxNA2gL3fVmeKk3s8CW5sm1': 'Usuario Admin (KALWHb...)',
  'IFmsMFAOpRhshTFFIGooQHmJHa92': 'Usuario Admin (IFmsMF...)',
  'system': 'Sistema Automático'
};

let markdown = `# Informe Forense de Auditoría Técnica: Manifiesto ${manifestNumber || manifestId}\n\n`;
markdown += `**Fecha de Generación:** ${generatedAt} (Hora Servidor)\n`;
markdown += `**Manifiesto Evaluado:** \`${manifestNumber || manifestId}\`\n\n`;

markdown += `## 1. Resumen Ejecutivo de Auditoría\n\n`;
markdown += `| Métrica | Valor |\n`;
markdown += `| :--- | :--- |\n`;
markdown += `| **Total de Clientes (slCodes) en Manifiesto** | **${summary.totalCustomers}** |\n`;
markdown += `| **Facturas Asociadas Evaluadas** | **${customers.filter(c => c.invoices.length > 0).length}** |\n`;
markdown += `| **Clientes con Actualización Reciente de Perfil (26 - 28 Julio)** | **${summary.recentCustomerChangesCount}** |\n`;
markdown += `| **Clientes con Discrepancia entre Factura Emitida y Perfil Maestro** | **${summary.routeDiscrepancyCount}** |\n`;
markdown += `| **Logs de Auditoría Registrados (26 - 28 Julio)** | **${summary.relevantAuditLogsCount}** |\n\n`;

markdown += `---\n\n`;

markdown += `## 2. Hallazgos Forenses y Causa Raíz de la Alteración de Rutas\n\n`;
markdown += `> [!IMPORTANT]\n`;
markdown += `> **Causa Raíz del Incidente (26-27 de Julio):**\n`;
markdown += `> El 26/27 de Julio, al abrir el manifiesto guardado \`${manifestNumber}\`, el proceso de re-evaluación en segundo plano invocado de forma previa al fix actualizó el perfil del cliente en Firestore (\`customers/{slCode}\`). Esto provocó que si el cliente tenía una ruta por defecto en su perfil, esta sobrescribiera la ruta que el operador había seleccionado originalmente para las facturas.\n\n`;

markdown += `> [!TIP]\n`;
markdown += `> **Estado Actual Post-Fix:**\n`;
markdown += `> La política \`FIRESTORE_POLICY\` ya se encuentra activa y **bloquea al 100%** cualquier actualización automática al re-abrir un manifiesto.\n\n`;

markdown += `---\n\n`;

markdown += `## 3. Logs de Auditoría Relevantes (26 al 28 de Julio)\n\n`;
markdown += `Se registraron **${auditLogs.length} eventos** en el período de auditoría. A continuación se presentan los eventos principales de facturación y modificaciones:\n\n`;

markdown += `| Timestamp (Hora Costa Rica UTC-6) | Acción | Usuario / Operador | Detalles |\n`;
markdown += `| :--- | :--- | :--- | :--- |\n`;

auditLogs.slice(0, 35).forEach(log => {
  const user = userNames[log.userId] || log.userId;
  const det = JSON.stringify(log.details || {}).replace(/\|/g, '\\|');
  markdown += `| \`${log.timestampCR}\` | \`${log.action}\` | ${user} | ${det.slice(0, 100)}${det.length > 100 ? '...' : ''} |\n`;
});

markdown += `\n---\n\n`;

markdown += `## 4. Detalle Completo de los 231 Clientes del Manifiesto\n\n`;
markdown += `A continuación se detallan los **${customers.length} clientes (slCodes)** del manifiesto, indicando su ruta en el manifiesto, la ruta grabada en su factura emitida y la ruta actual en su expediente maestro:\n\n`;

markdown += `| # | Code SL | Nombre del Cliente | Paquetes | Ruta en Manifiesto | Ruta en Factura | Ruta Actual Maestro | Estado Actualización (26-28 Jul) |\n`;
markdown += `| :---: | :--- | :--- | :---: | :--- | :--- | :--- | :---: |\n`;

customers.forEach((c, idx) => {
  const invRutas = c.invoices.map(i => `${i.invoiceNumber}: **${i.rutaOnInvoice}** (${i.status})`).join('<br/>') || 'Sin Factura';
  const updatedBadge = c.updatedRecently ? '⚠️ **Actualizado (26-28 Jul)**' : 'Sin cambios recientes';
  markdown += `| ${idx + 1} | \`${c.slCode}\` | ${c.name} | ${c.trackingsCount} | ${c.rutaInManifest || 'N/A'} | ${invRutas} | **${c.masterCurrentRuta}** | ${updatedBadge} |\n`;
});

const outputPath = '/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/forensic_audit_23_07_2026DAN.md';
fs.writeFileSync(outputPath, markdown);
console.log(`✅ Markdown Forensic Report created successfully at: ${outputPath}`);
