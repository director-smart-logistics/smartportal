import { describe, it, expect } from "vitest";
import { principalLabelAddress, activeAdminOverride, areStringsRedundant, deduplicateAddressLines, customerLabelAddressText, reprintLabelAddressText, compareLabelAddresses } from "../label-address";

const A = (id: string, extra: Record<string, unknown> = {}) => ({ id, streetAddress: `Calle ${id}`, province: "Heredia", ...extra });

describe("F11 principalLabelAddress — one rule for every label", () => {
  it("the active defaultAddress", () => {
    expect(principalLabelAddress({ defaultAddress: A("d"), addresses: [A("x", { isDefault: true })] })?.id).toBe("d");
  });
  it("an INACTIVE defaultAddress is never printed (was printed by 3 screens)", () => {
    expect(principalLabelAddress({ defaultAddress: A("d", { isActive: false }), addresses: [A("x", { isPrimary: true })] })?.id).toBe("x");
    expect(principalLabelAddress({ defaultAddress: A("d", { status: "inactive" }), addresses: [] })).toBeNull();
  });
  it("no default → the active one marked principal, else the first active (never an inactive addresses[0])", () => {
    expect(principalLabelAddress({ addresses: [A("a"), A("b", { isDefault: true })] })?.id).toBe("b");
    expect(principalLabelAddress({ addresses: [A("old", { isActive: false }), A("b")] })?.id).toBe("b");
  });
  it("an empty address is not an address", () => {
    expect(principalLabelAddress({ defaultAddress: { id: "e" }, addresses: [] })).toBeNull();
    expect(principalLabelAddress(null)).toBeNull();
  });
});

describe("F11 activeAdminOverride — the hand-typed address does not win forever", () => {
  const typed = { deliveryAddress: "Dirección escrita por el admin", courierService: "Correos" };
  it("newer than the customer's address → used", () => {
    expect(activeAdminOverride({ adminAddressOverride: { ...typed, savedAt: "2026-09-20T00:00:00Z" }, defaultAddress: A("d", { updatedAt: "2026-09-01T00:00:00Z" }) })).not.toBeNull();
  });
  it("the customer changed their address in SP2 afterwards → the customer's address wins", () => {
    expect(activeAdminOverride({ adminAddressOverride: { ...typed, savedAt: "2026-09-01T00:00:00Z" }, defaultAddress: A("d", { updatedAt: "2026-09-20T00:00:00Z" }) })).toBeNull();
  });
  it("saved before F11 (no savedAt) → unchanged behavior", () => {
    expect(activeAdminOverride({ adminAddressOverride: typed, defaultAddress: A("d", { updatedAt: "2026-09-20T00:00:00Z" }) })).not.toBeNull();
  });
  it("empty override → none", () => {
    expect(activeAdminOverride({ adminAddressOverride: { deliveryAddress: "  " } })).toBeNull();
    expect(activeAdminOverride({})).toBeNull();
  });
});

describe("shared line de-duplication (was 3 copies)", () => {
  it("instructions that only repeat the details are dropped", () => {
    expect(areStringsRedundant("Portón negro casa 5", "Instrucciones: portón negro")).toBe(true);
    expect(deduplicateAddressLines("Calle 1\nPortón negro\nInstrucciones: portón negro")).toBe("Calle 1\nPortón negro");
  });
});

describe("customerLabelAddressText — the FULL, CURRENT address every label prints", () => {
  const principal = { streetAddress: "Barrio Nuevo, casa 9", details: "Portón verde", district: "Limón", canton: "Limón", province: "Limón", deliveryInstructions: "Llamar antes", isActive: true, updatedAt: "2026-09-27T12:00:00Z" };
  it("street, details, district/canton/province and instructions (the location was missing before)", () => {
    expect(customerLabelAddressText({ defaultAddress: principal })).toBe("Barrio Nuevo, casa 9\nPortón verde\nLimón\nInstrucciones: Llamar antes");
    expect(customerLabelAddressText({ defaultAddress: { ...principal, district: "San Pedro", canton: "Montes de Oca", province: "San José" } }))
      .toBe("Barrio Nuevo, casa 9\nPortón verde\nSan Pedro, Montes de Oca, San José\nInstrucciones: Llamar antes");
  });
  it("an OLDER hand-typed admin address does not win over the customer's newer address", () => {
    const c = { defaultAddress: principal, adminAddressOverride: { deliveryAddress: "Dirección vieja a mano", savedAt: "2026-09-01T00:00:00Z" } };
    expect(customerLabelAddressText(c)).toContain("Barrio Nuevo");
  });
  it("a NEWER hand-typed admin address wins", () => {
    const c = { defaultAddress: principal, adminAddressOverride: { deliveryAddress: "Oficina central, piso 2", savedAt: "2026-09-28T00:00:00Z" } };
    expect(customerLabelAddressText(c)).toBe("Oficina central, piso 2");
  });
  it("no repeated lines (details or instructions that only repeat the street)", () => {
    expect(customerLabelAddressText({ defaultAddress: { streetAddress: "Portón negro frente al parque", details: "portón negro", deliveryInstructions: "Portón negro", province: "Heredia", isActive: true } }))
      .toBe("Portón negro frente al parque\nHeredia");
  });
  it("legacy customers without a principal address: location fields, else the route", () => {
    expect(customerLabelAddressText({ direccionExacta: "200 m norte de la iglesia", distrito: "Mercedes", canton: "Heredia", provincia: "Heredia" }))
      .toBe("200 m norte de la iglesia\nMercedes, Heredia");
    expect(customerLabelAddressText({ ruta: "Encomiendas" })).toBe("Ruta: Encomiendas");
    expect(customerLabelAddressText(null)).toBe("");
  });
});

describe("reprintLabelAddressText — reprint/edit of a saved label", () => {
  const c = { defaultAddress: { streetAddress: "Barrio Nuevo, casa 9", district: "San Pedro", canton: "Montes de Oca", province: "San José", isActive: true, updatedAt: "2026-09-27T12:00:00Z" } };
  it("the customer changed the address after the label → current full address", () => {
    expect(reprintLabelAddressText(c, "Barrio Viejo, casa 4", "2026-09-20T00:00:00Z")).toBe("Barrio Nuevo, casa 9\nSan Pedro, Montes de Oca, San José");
  });
  it("no change since → the saved text (may be a hand edit), completed with the location line", () => {
    expect(reprintLabelAddressText(c, "Barrio Nuevo casa 9, portón café", "2026-09-28T00:00:00Z")).toBe("Barrio Nuevo casa 9, portón café\nSan Pedro, Montes de Oca, San José");
    expect(reprintLabelAddressText(c, "Casa 9, San Pedro, Montes de Oca, San José", "2026-09-28T00:00:00Z")).toBe("Casa 9, San Pedro, Montes de Oca, San José");
  });
  it("no customer data → the saved text; nothing saved → current", () => {
    expect(reprintLabelAddressText(null, "Texto guardado", "2026-09-28T00:00:00Z")).toBe("Texto guardado");
    expect(reprintLabelAddressText(c, "", null)).toContain("Barrio Nuevo");
  });
});

// 2026-10-07 — label modal shows BOTH addresses; this only tells which is newer (the default stays activeAdminOverride).
describe("compareLabelAddresses — which address is newer, for the label modal", () => {
  const addr = { streetAddress: "Del parque 100 m sur", province: "Heredia", isDefault: true, isActive: true, updatedAt: "2026-08-20T17:42:00.000Z" };
  it("admin address without date → unknown (cannot tell)", () => {
    expect(compareLabelAddresses({ defaultAddress: addr, adminAddressOverride: { deliveryAddress: "San Ramón" } })).toMatchObject({ newer: "unknown", clientChangedAfter: false });
  });
  it("customer changed the address after the admin typed it → client newer", () => {
    expect(compareLabelAddresses({ defaultAddress: addr, adminAddressOverride: { deliveryAddress: "San Ramón", savedAt: "2026-05-01T00:00:00.000Z" } })).toMatchObject({ newer: "client", clientChangedAfter: true });
  });
  it("admin typed it after the customer's last change → admin newer (same rule as activeAdminOverride)", () => {
    const c = { defaultAddress: addr, adminAddressOverride: { deliveryAddress: "Abangares", savedAt: "2026-10-07T02:13:47.999Z" } };
    expect(compareLabelAddresses(c)).toMatchObject({ newer: "admin", clientChangedAfter: false });
    expect(activeAdminOverride(c)).not.toBeNull();
  });
});
