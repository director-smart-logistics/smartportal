"use strict";
/**
 * slManifestReport — Callable Cloud Function
 *
 * Receives a LearningRecord from the client after every processed manifest,
 * builds an HTML report email, and sends it to director@smartlogisticscr.com
 * via the existing Resend service.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.slManifestReport = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const email_service_1 = require("../email/email-service");
// ── Email HTML builders ───────────────────────────────────────────────────────
const SEVERITY_CONFIG = {
    critical: { bg: '#fef2f2', border: '#fca5a5', dot: '#dc2626', label: 'CRÍTICO' },
    warning: { bg: '#fffbeb', border: '#fcd34d', dot: '#d97706', label: 'ADVERTENCIA' },
    info: { bg: '#eff6ff', border: '#93c5fd', dot: '#2563eb', label: 'INFO' },
};
const IMPACT_COLOR = {
    high: '#dc2626',
    medium: '#d97706',
    low: '#16a34a',
};
function buildBugsSection(bugs) {
    if (bugs.length === 0) {
        return `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
        <tr>
          <td style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px 20px;">
            <div style="font-size:14px;font-weight:700;color:#16a34a;">✅ Sin bugs detectados</div>
            <div style="font-size:12px;color:#4ade80;margin-top:4px;">El manifiesto fue procesado sin problemas críticos.</div>
          </td>
        </tr>
      </table>`;
    }
    const rows = bugs.map(bug => {
        const cfg = SEVERITY_CONFIG[bug.severity] ?? SEVERITY_CONFIG.info;
        const examples = bug.examples.length > 0
            ? `<div style="margin-top:8px;font-size:11px;color:#64748b;font-family:monospace;">${bug.examples.slice(0, 4).join(' · ')}</div>`
            : '';
        return `
      <tr>
        <td style="padding:0 0 10px 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
            style="background:${cfg.bg};border:1px solid ${cfg.border};border-left:4px solid ${cfg.dot};border-radius:8px;padding:14px 16px;">
            <tr>
              <td>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                  <tr>
                    <td>
                      <span style="display:inline-block;background:${cfg.dot};color:#fff;font-size:9px;font-weight:800;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.5px;">${cfg.label}</span>
                      <span style="font-size:10px;color:#94a3b8;margin-left:6px;font-family:monospace;">${bug.id}</span>
                    </td>
                    <td align="right">
                      <span style="font-size:11px;font-weight:700;color:${cfg.dot};">${bug.affectedRows} fila${bug.affectedRows !== 1 ? 's' : ''}</span>
                    </td>
                  </tr>
                </table>
                <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:6px;">${bug.title}</div>
                <div style="font-size:12px;color:#475569;margin-top:3px;line-height:1.5;">${bug.description}</div>
                ${examples}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
    }).join('');
    return `
    <div style="font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">
      🐛 Bugs Detectados (${bugs.length})
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
      ${rows}
    </table>`;
}
function buildImprovementsSection(improvements) {
    if (improvements.length === 0)
        return '';
    const rows = improvements.map(imp => `
    <tr>
      <td style="padding:0 0 10px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%"
          style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;">
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <span style="font-size:10px;font-family:monospace;color:#94a3b8;">${imp.id}</span>
                    <span style="font-size:10px;color:#64748b;margin-left:6px;text-transform:uppercase;font-weight:600;">${imp.category}</span>
                  </td>
                  <td align="right">
                    <span style="font-size:10px;font-weight:700;color:${IMPACT_COLOR[imp.impact]};">Impacto: ${imp.impact.toUpperCase()}</span>
                    <span style="font-size:10px;color:#94a3b8;margin-left:8px;">Esfuerzo: ${imp.effort}</span>
                  </td>
                </tr>
              </table>
              <div style="font-size:13px;font-weight:700;color:#0f172a;margin-top:6px;">💡 ${imp.title}</div>
              <div style="font-size:12px;color:#475569;margin-top:3px;line-height:1.5;">${imp.description}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`).join('');
    return `
    <div style="font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">
      💡 Mejoras Sugeridas (${improvements.length})
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
      ${rows}
    </table>`;
}
function buildUnmatchedSection(unmatchedNames) {
    if (unmatchedNames.length === 0)
        return '';
    const shown = unmatchedNames.slice(0, 20);
    const extra = unmatchedNames.length - shown.length;
    const pills = shown.map(n => `<span style="display:inline-block;background:#fee2e2;color:#991b1b;font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;margin:2px;">${n}</span>`).join('');
    const moreNote = extra > 0
        ? `<div style="font-size:11px;color:#94a3b8;margin-top:8px;">…y ${extra} más</div>`
        : '';
    return `
    <div style="font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">
      ❌ Nombres Sin Match (${unmatchedNames.length})
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;">
      <tr>
        <td style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;">
          ${pills}
          ${moreNote}
        </td>
      </tr>
    </table>`;
}
function buildCorrectionsSection(corrections) {
    if (corrections.length === 0)
        return '';
    const rows = corrections.slice(0, 15).map(c => `
    <tr style="border-bottom:1px solid #f1f5f9;">
      <td style="padding:8px 12px;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">${c.field}</td>
      <td style="padding:8px 12px;font-size:12px;color:#dc2626;font-family:monospace;">${c.original}</td>
      <td style="padding:8px 4px;font-size:12px;color:#64748b;">→</td>
      <td style="padding:8px 12px;font-size:12px;color:#16a34a;font-family:monospace;font-weight:700;">${c.corrected}</td>
    </tr>`).join('');
    return `
    <div style="font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">
      ✏️ Correcciones AI (${corrections.length})
    </div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tr style="background:#f8fafc;">
        <td style="padding:8px 12px;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;">Campo</td>
        <td style="padding:8px 12px;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;">Original</td>
        <td style="padding:8px 4px;"></td>
        <td style="padding:8px 12px;font-size:10px;font-weight:800;color:#64748b;text-transform:uppercase;">Corregido</td>
      </tr>
      ${rows}
    </table>`;
}
function buildEmailHtml(record, recordId) {
    const template = fs.readFileSync(path.join(__dirname, '..', '..', 'templates', 'manifest-report-email.html'), 'utf8');
    const date = new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' });
    const typeLabel = {
        usa_air: 'USA Aéreo',
        usa_ocean: 'USA Marítimo',
        mexico_air: 'México Aéreo',
        china_air: 'China Aéreo',
        colombia_air: 'Colombia Aéreo',
    };
    return template
        .replace('{{MANIFEST_NUMBER}}', record.manifestNumber)
        .replace('{{MANIFEST_TYPE}}', typeLabel[record.manifestType] ?? record.manifestType)
        .replace('{{PROCESSED_AT}}', date)
        .replace('{{MATCH_RATE}}', String(record.matchRate))
        .replace('{{TOTAL_ROWS}}', String(record.totalRows))
        .replace('{{MATCHED_ROWS}}', String(record.matchedRows))
        .replace('{{UNMATCHED_ROWS}}', String(record.unmatchedRows))
        .replace('{{PENDING_ROWS}}', String(record.pendingReviewRows))
        .replace('{{TOTAL_PRICE}}', record.totalPrice.toFixed(2))
        .replace('{{BUGS_SECTION}}', buildBugsSection(record.bugs))
        .replace('{{IMPROVEMENTS_SECTION}}', buildImprovementsSection(record.improvements))
        .replace('{{UNMATCHED_SECTION}}', buildUnmatchedSection(record.unmatchedNames))
        .replace('{{CORRECTIONS_SECTION}}', buildCorrectionsSection(record.corrections))
        .replace('{{RECORD_ID}}', recordId);
}
function buildPlainText(record, recordId) {
    const bugsText = record.bugs.length > 0
        ? record.bugs.map(b => `  [${b.severity.toUpperCase()}] ${b.id} — ${b.title} (${b.affectedRows} filas)`).join('\n')
        : '  Sin bugs detectados ✅';
    const improvementsText = record.improvements.length > 0
        ? record.improvements.map(i => `  [${i.impact.toUpperCase()}] ${i.id} — ${i.title}`).join('\n')
        : '  Sin sugerencias';
    return `
REPORTE DE MANIFIESTO — SmartLogistics
=======================================
Manifiesto: ${record.manifestNumber}
Tipo: ${record.manifestType}
Fecha: ${new Date().toLocaleString('es-CR', { timeZone: 'America/Costa_Rica' })}

ESTADÍSTICAS
------------
Total filas:        ${record.totalRows}
Con match:          ${record.matchedRows}
Sin match:          ${record.unmatchedRows}
Revisión pendiente: ${record.pendingReviewRows}
Tasa de match:      ${record.matchRate}%
Total precio:       $${record.totalPrice.toFixed(2)}

BUGS DETECTADOS (${record.bugs.length})
${bugsText}

MEJORAS SUGERIDAS (${record.improvements.length})
${improvementsText}

NOMBRES SIN MATCH (${record.unmatchedNames.length})
${record.unmatchedNames.slice(0, 20).join(', ')}

CORRECCIONES AI (${record.corrections.length})
${record.corrections.slice(0, 10).map(c => `  ${c.field}: "${c.original}" → "${c.corrected}"`).join('\n')}

---
Record ID: ${recordId}
www.smartlogisticscr.com
  `.trim();
}
// ── Callable function ─────────────────────────────────────────────────────────
exports.slManifestReport = (0, https_1.onCall)({ region: 'us-central1', timeoutSeconds: 30 }, async (request) => {
    const { record, recordId, to } = request.data;
    if (!record || !recordId || !to) {
        throw new https_1.HttpsError('invalid-argument', 'Missing record, recordId or to');
    }
    v2_1.logger.info('[slManifestReport] Sending manifest report email', {
        manifestNumber: record.manifestNumber,
        to,
        bugs: record.bugs.length,
        improvements: record.improvements.length,
    });
    const criticalCount = record.bugs.filter(b => b.severity === 'critical').length;
    const subjectPrefix = criticalCount > 0
        ? `🚨 [${criticalCount} críticos]`
        : record.bugs.length > 0
            ? `⚠️ [${record.bugs.length} bugs]`
            : '✅';
    const html = buildEmailHtml(record, recordId);
    const plainText = buildPlainText(record, recordId);
    const result = await (0, email_service_1.sendEmail)({
        to,
        subject: `${subjectPrefix} Manifiesto ${record.manifestNumber} — ${record.matchRate}% match · $${record.totalPrice.toFixed(2)}`,
        html,
        text: plainText,
        replyTo: 'soporte@smartlogisticscr.com',
    });
    if (!result.success) {
        v2_1.logger.error('[slManifestReport] Failed to send email', { error: result.error });
        throw new https_1.HttpsError('internal', `Email send failed: ${result.error}`);
    }
    v2_1.logger.info('[slManifestReport] Report email sent', {
        messageId: result.messageId,
        to,
        manifestNumber: record.manifestNumber,
    });
    return { success: true, messageId: result.messageId };
});
//# sourceMappingURL=manifest-report.js.map