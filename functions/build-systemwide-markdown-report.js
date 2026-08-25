const fs = require('fs');

const rawData = JSON.parse(fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/systemwide_customer_route_audit.json', 'utf8'));

const { generatedAt, filterStartDate, summary, updatedCustomers } = rawData;

let markdown = `# Informe Forense del Sistema: Modificación de Rutas y Perfiles (Desde el Sábado 25 de Julio)\n\n`;
markdown += `**Fecha de Auditoría:** ${generatedAt} (Hora Servidor)\n`;
markdown += `**Período Evaluado:** Desde **Sábado 25 de Julio de 2026 00:00:00 UTC** hasta Hoy (**28 de Julio de 2026**)\n\n`;

markdown += `## 1. Resumen Ejecutivo del Sistema\n\n`;
markdown += `| Métrica del Sistema | Valor Auditado |\n`;
markdown += `| :--- | :--- |\n`;
markdown += `| **Total de Clientes Maestros en el Sistema (customers)** | **${summary.totalCustomersInSystem}** |\n`;
markdown += `| **Clientes con Expediente / Ruta Actualizado desde el Sábado 25** | **${summary.customersUpdatedSinceSaturdayCount}** |\n`;
markdown += `| **Logs de Auditoría Registrados (25 - 28 Julio)** | **${summary.auditLogsSinceSaturdayCount}** |\n\n`;

markdown += `---\n\n`;

markdown += `## 2. Análisis Forense de Causa Raíz\n\n`;
markdown += `> [!IMPORTANT]\n`;
markdown += `> **Origen de los Cambios Masivos de Ruta:**\n`;
markdown += `> Entre el **Sábado 25 de Julio** y el **Lunes 27 de Julio**, al abrir manifiestos en la tabla Nova con código previo al fix, el hook de re-validación automática (\`autoDivergentRematch\`) consultaba la ruta del cliente y disparaba una actualización defensiva en la colección \`customers/{slCode}\` de Firestore.\n`;
markdown += `> Esto causó que **301 clientes** en la base de datos registraran fechas de modificación en su perfil entre el 25 y el 28 de Julio.\n\n`;

markdown += `> [!TIP]\n`;
markdown += `> **Estado de Blindaje Post-Fix:**\n`;
markdown += `> Con la política \`FIRESTORE_POLICY\` activa en producción, ningún manifiesto abierto desde Firestore vuelve a alterar las rutas de los clientes de forma automática.\n\n`;

markdown += `---\n\n`;

markdown += `## 3. Lista Completa de Clientes Modificados desde el Sábado 25 de Julio\n\n`;
markdown += `A continuación se detallan los **${updatedCustomers.length} clientes** cuyo expediente registra actualización entre el Sábado 25 y el 28 de Julio, ordenados cronológicamente por la fecha más reciente de modificación:\n\n`;

markdown += `| # | Code SL | Nombre del Cliente | Ruta Actual registrada en Maestro | Timestamp de Modificación (Hora Costa Rica UTC-6) | Registros de Auditoría |\n`;
markdown += `| :---: | :--- | :--- | :--- | :--- | :---: |\n`;

updatedCustomers.forEach((c, idx) => {
  const auditDetails = c.auditLogsCount > 0
    ? c.auditLogs.map(l => `\`${l.timestampCR}\` - ${l.action} (${l.userId})`).join('<br/>')
    : 'Actualización en Firestore (customers)';

  markdown += `| ${idx + 1} | \`${c.slCode}\` | ${c.name} | **${c.currentRuta}** | \`${c.updatedAtCR}\` | ${auditDetails} |\n`;
});

const outputPath = '/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/systemwide_route_audit_since_saturday.md';
fs.writeFileSync(outputPath, markdown);
console.log(`✅ System-wide Markdown Audit Report generated at: ${outputPath}`);
