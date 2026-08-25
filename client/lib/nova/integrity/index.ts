/**
 * Public entry points for the integrity module. Keep the import surface
 * tight: callers should reach for these names, not deep paths.
 */

export { auditManifestIntegrity } from './audit-service';
export { computeIntegrityReport, compareRow } from './compute';
export { applyIntegrityRepairs } from './repair-service';
export type { IntegrityRepair, IntegrityRepairResult } from './repair-service';
export type {
  IntegrityAuditInputs,
  IntegrityEvidence,
  IntegrityIssue,
  IntegrityIssueKind,
  IntegrityIssueSeverity,
  IntegrityReport,
  IntegritySuggestedFix,
  ManifestRowSnapshot,
} from './types';
