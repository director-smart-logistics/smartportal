const fs = require('fs');

const rawData = JSON.parse(fs.readFileSync('/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/scratch/route_restoration_evidence.json', 'utf8'));

const { generatedAt, summary, restorationAnalysis } = rawData;

const corruptedList = restorationAnalysis.filter(item => item.status === 'CORRUPTED_ROUTE_NEEDS_RESTORATION');

let markdown = `# Lista de Clientes con Ruta Corrompida por Re-evaluación Automática (Para Reversión Explícita)\n\n`;
markdown += `**Fecha de Análisis:** ${generatedAt} (Hora Servidor)\n`;
markdown += `**Criterio de Inclusión:** Clientes modificados entre el 25 y el 28 de Julio cuya ruta actual en Firestore (\`customers/{slCode}\`) **difiere de su ruta histórica comprobada** antes del incidente.\n\n`;

markdown += `## Resumen de Diagnóstico de Reversión\n\n`;
markdown += `| Métrica | Cantidad |\n`;
markdown += `| :--- | :--- |\n`;
markdown += `| **Total de Clientes Auditados (Modificados 25-28 Jul)** | **${summary.totalAudited}** |\n`;
markdown += `| **Clientes con Ruta Confirmada Sin Cambios (Match Histórico)** | **${summary.matchesHistoricalCount}** |\n`;
markdown += `| **Clientes Nuevos / Sin Histórico Previo** | **${summary.noPriorHistoryCount}** |\n`;
markdown += `| **TOTAL DE CLIENTES CON RUTA CORROMPIDA A REVERSAR** | **${corruptedList.length}** |\n\n`;

markdown += `---\n\n`;

markdown += `## Lista Completa de los ${corruptedList.length} Clientes a Reversar Uno a Uno\n\n`;
markdown += `| # | Code SL | Nombre del Cliente | Ruta Errónea Actual | Ruta Original A Restablecer | Evidencia Histórica Comprobada | Última Modificación (Hora CR) |\n`;
markdown += `| :---: | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

corruptedList.forEach((c, idx) => {
  markdown += `| ${idx + 1} | \`${c.slCode}\` | ${c.name} | ❌ **${c.currentRuta}** | ✅ **${c.proposedRestoredRuta}** | ${c.evidenceSource} | \`${c.updatedAtCR}\` |\n`;
});

markdown += `\n---\n\n`;
markdown += `> [!IMPORTANT]\n`;
markdown += `> **Procedimiento de Reversión Segura:**\n`;
markdown += `> Ninguna actualización se aplicará automáticamente a la base de datos hasta que el usuario confirme y apruebe esta lista de reversión. Una vez aprobada, se ejecutará el script de restauración uno a uno via \`writeBatch\` en Firestore.\n`;

const outputPath = '/Users/jbricenoz/.gemini/antigravity-ide/brain/8f943ff1-4bc4-4caa-b515-acf9edef2fdd/corrupted_routes_reversal_list.md';
fs.writeFileSync(outputPath, markdown);
console.log(`✅ Corrupted routes markdown report created successfully at: ${outputPath}`);
