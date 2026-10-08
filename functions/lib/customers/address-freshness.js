"use strict";
/**
 * F8.1 — the customer's addresses in SP1 always come from the CURRENT SP2 state and never go back
 * to an older one (docs/F8_ADDRESS_ENCOMIENDA_PLAN.md, gap G1).
 *
 * One address save in SP2 fires several pushes to slSyncCustomerFromSp2, each with its own
 * snapshot. So the push handler (1) reads the addresses from SP2's `addresses` collection — the
 * source of truth — at the moment it runs, and (2) writes only when that read is not older than the
 * one already saved (`sp2AddressesReadAt`). Pure rules here; tested in test/address-freshness.spec.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickSp2Addresses = pickSp2Addresses;
exports.isOlderAddressSnapshot = isOlderAddressSnapshot;
/** The addresses to use: SP2's `addresses` documents when there are any, else what the push carried. */
function pickSp2Addresses(collectionAddresses, payloadAddresses) {
    if (collectionAddresses && collectionAddresses.length > 0)
        return { addresses: collectionAddresses, source: 'sp2-collection' };
    return { addresses: Array.isArray(payloadAddresses) ? payloadAddresses : null, source: 'payload' };
}
/** A push whose SP2 read is older than the one SP1 already saved must not overwrite it. */
function isOlderAddressSnapshot(savedReadAt, incomingReadAtMs) {
    const saved = typeof savedReadAt === 'number' ? savedReadAt : Date.parse(String(savedReadAt ?? ''));
    return Number.isFinite(saved) && saved > incomingReadAtMs;
}
//# sourceMappingURL=address-freshness.js.map