/**
 * Data-origin module — public surface.
 *
 * Consumers import from `@/lib/nova/data-origin` and never reach into
 * `types.ts` directly. This way, future internals (cache, telemetry hooks,
 * dynamic policy overrides) can live alongside the types without leaking
 * into call-sites.
 */
export type { DataOrigin, DataOriginPolicy } from './types';
export {
  FRESH_POLICY,
  FIRESTORE_POLICY,
  policyForOrigin,
  policyFromResultData,
} from './types';
