/**
 * R1 — the delivery route of a Nova manifest row. ONE rule for what the table shows and what
 * "Guardar en BD" persists (use-nova-resolved-rows + every NovaTableModal chain).
 *
 * The route must always be the route of the row's CURRENT customer:
 * 1. Row with a customer → the route chosen this session for THAT customer (rutaOverrides[slCode]).
 *    A route learned for the manifest NAME (`__unmatched__<name>`) never applies to it.
 * 2. Customer changed (pre-alert, admin, move to group) → never the previous customer's route
 *    override nor the route the processor gave the row for the previous customer.
 * 3. Row without a customer now → unchanged behavior: the route of its unmatched group, else
 *    what it had (an UNLINKED row keeps its route by design, commit c17de000 — not part of R1).
 * A manifest re-loaded from the database keeps its saved route: `customerRoute` is only passed
 * when DataOriginPolicy.allowAutoCustomerRouteFill (or the row was reassigned this session).
 */
export interface RowRouteInput {
  /** Customer of the row now ('' when it has none / was unlinked). */
  effSlCode: string | null | undefined;
  /** Customer the processor gave the row (row.slCode). */
  rowSlCode?: string | null;
  /** Names that key an unmatched group's route (`__unmatched__<name>`), in priority order. */
  unmatchedNames?: Array<string | null | undefined>;
  /** Route the processor gave the row (row.ruta) — belongs to rowSlCode. */
  rowRuta?: string | null;
  rutaOverrides: Record<string, string | undefined>;
  /** Current route of effSlCode's customer profile, when allowed (see above). */
  customerRoute?: string | null;
  /** slCodeOverrides[idx].ruta / matchOverrides[idx].ruta — set with the customer they belong to. */
  slCodeOverrideRuta?: string | null;
  matchOverrideRuta?: string | null;
}

const sameSl = (a: string | null | undefined, b: string | null | undefined) =>
  String(a ?? '').toUpperCase().trim() === String(b ?? '').toUpperCase().trim();

const firstDefined = (...values: Array<string | null | undefined>): string | undefined =>
  values.find((v) => v !== undefined && v !== null) ?? undefined;

export function effectiveRowRuta(input: RowRouteInput): string {
  const eff = String(input.effSlCode ?? '').trim();
  if (eff) {
    const chosen = input.rutaOverrides[eff];
    if (chosen !== undefined) return chosen;
    const sameCustomer = sameSl(eff, input.rowSlCode);
    return firstDefined(
      input.customerRoute,
      input.slCodeOverrideRuta,
      input.matchOverrideRuta,
      sameCustomer ? (input.rowRuta || '') : undefined,
    ) ?? '';
  }
  for (const name of input.unmatchedNames ?? []) {
    if (!name) continue;
    const route = input.rutaOverrides[`__unmatched__${name}`];
    if (route !== undefined) return route;
  }
  return firstDefined(
    input.rowSlCode ? input.rutaOverrides[input.rowSlCode] : undefined,
    input.slCodeOverrideRuta,
    input.matchOverrideRuta,
  ) ?? (input.rowRuta || '');
}
