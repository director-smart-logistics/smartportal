/**
 * F8.3 — what Nova shows next to a customer on the ENCOMIENDAS route (docs/F8_ADDRESS_ENCOMIENDA_PLAN.md):
 * - the encomienda SERVICE when it is one of the known services (SP1 `encomiendas` + static list);
 * - "Servicio de terceros" when there is none or it is not in the list (e.g. one the customer
 *   proposed in SP2), so the admin checks it by hand.
 * Customers on any other route show no encomienda badge (G5: an old address service misleads).
 * Pure; tested in __tests__/encomienda-badge.spec.ts.
 */
export const THIRD_PARTY_LABEL = 'Servicio de terceros';

export interface EncomiendaBadge {
  kind: 'service' | 'third-party';
  label: string;
  title: string;
}

export function isEncomiendaRoute(ruta: string | null | undefined): boolean {
  return /encomienda/i.test(String(ruta ?? ''));
}

export function novaEncomiendaBadge(
  customer: { ruta?: string | null; encomiendaServiceName?: string | null; defaultAddress?: { encomiendaSuggestedName?: string | null } | null } | null | undefined,
  lookup: { ready: boolean; isKnown: (nameOrId: string) => boolean; resolve: (nameOrId: string) => string },
): EncomiendaBadge | null {
  if (!customer || !isEncomiendaRoute(customer.ruta)) return null;
  const service = String(customer.encomiendaServiceName ?? '').trim();
  // Until the list is loaded, show the name as it is (never flash "terceros").
  if (service && (!lookup.ready || lookup.isKnown(service))) {
    const name = lookup.resolve(service);
    return { kind: 'service', label: name, title: `Servicio de encomienda: ${name}` };
  }
  const named = service || String(customer.defaultAddress?.encomiendaSuggestedName ?? '').trim();
  return {
    kind: 'third-party',
    label: THIRD_PARTY_LABEL,
    title: named ? `No está en la lista de encomiendas: "${named}" — revisar manualmente` : 'Cliente de encomienda sin servicio asignado — revisar manualmente',
  };
}
