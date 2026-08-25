import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveEncomiendaName,
  registerEncomiendaForTest,
  initializeEncomiendaLookup,
  isLookupLoaded,
  resolveCustomerEncomiendaService
} from ".././encomienda-lookup";
import * as encomiendaService from ".././encomienda-service";

vi.mock(".././encomienda-service", () => ({
  getActiveEncomiendas: vi.fn(),
}));

describe("Encomienda Lookup Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve custom registered test encomiendas", () => {
    registerEncomiendaForTest("customId123", "Transportes Perez Zeledon");
    expect(resolveEncomiendaName("customId123")).toBe("Transportes Perez Zeledon");
    expect(resolveEncomiendaName("CUSTOMID123")).toBe("Transportes Perez Zeledon");
  });

  it("should return the fallback value when resolving an unmapped ID", () => {
    expect(resolveEncomiendaName("unknown_id")).toBe("unknown_id");
  });

  it("should handle empty or null inputs gracefully", () => {
    expect(resolveEncomiendaName(null)).toBe("");
    expect(resolveEncomiendaName(undefined)).toBe("");
    expect(resolveEncomiendaName("   ")).toBe("");
  });

  it("should fetch and load encomiendas from Firestore and local JSON", async () => {
    const mockList = [
      { id: "firestore-id-1", name: "Firestore Courier 1", zones: [], cost: null, costDisplay: "", active: true }
    ];
    vi.mocked(encomiendaService.getActiveEncomiendas).mockResolvedValue(mockList as any);

    // Mock fetch for local config
    const mockFetch = vi.fn().mockResolvedValue({
      json: async () => ({
        encomiendas: [
          { id: "json-id-1", name: "JSON Courier 1", zones: [] }
        ]
      })
    });
    vi.stubGlobal("fetch", mockFetch);

    const map = await initializeEncomiendaLookup();
    expect(map.get("firestore-id-1")).toBe("Firestore Courier 1");
    expect(map.get("json-id-1")).toBe("JSON Courier 1");
    expect(isLookupLoaded()).toBe(true);

    expect(resolveEncomiendaName("firestore-id-1")).toBe("Firestore Courier 1");
    expect(resolveEncomiendaName("json-id-1")).toBe("JSON Courier 1");

    vi.unstubAllGlobals();
  });
});

describe("resolveCustomerEncomiendaService - Cobertura Exhaustiva", () => {
  it("Caso 1: Dirección por defecto con nombre de transportista", () => {
    const customer = {
      defaultAddress: { encomienda: { name: "Musoc" } }
    };
    expect(resolveCustomerEncomiendaService(customer)).toBe("Musoc");
  });

  it("Caso 2: Dirección por defecto con ID de transportista (resuelve via lookupMap)", () => {
    registerEncomiendaForTest("bava", "Transportes Barva");
    const customer = {
      defaultAddress: { encomienda: { id: "bava" } }
    };
    expect(resolveCustomerEncomiendaService(customer)).toBe("Transportes Barva");
  });

  it("Caso 3: Dirección por defecto con string directo", () => {
    const customer = {
      defaultAddress: { encomienda: "Caribeños" }
    };
    expect(resolveCustomerEncomiendaService(customer)).toBe("Caribeños");
  });

  it("Caso 4: Dirección alternativa en la lista (defaultAddress ausente)", () => {
    const customer = {
      addresses: [
        { streetAddress: "San José", encomienda: null },
        { streetAddress: "Limón", encomienda: { name: "Caribeños" } }
      ]
    };
    expect(resolveCustomerEncomiendaService(customer)).toBe("Caribeños");
  });

  it("Caso 5: Campo raíz SP2 encomiendaServiceName (Caso de Jamal)", () => {
    const customer = {
      encomiendaServiceName: "Transportes Guanacaste"
    };
    expect(resolveCustomerEncomiendaService(customer)).toBe("Transportes Guanacaste");
  });

  it("Caso 6: Objeto encomienda vacío {} (Protección de Cortocircuito)", () => {
    const customer = {
      encomienda: {},
      encomiendaServiceName: "Transportes Guanacaste"
    };
    expect(resolveCustomerEncomiendaService(customer)).toBe("Transportes Guanacaste");
  });

  it("Caso 7: Campo raíz SP1 encomiendaProvider", () => {
    const customer = {
      encomiendaProvider: "Musoc"
    };
    expect(resolveCustomerEncomiendaService(customer)).toBe("Musoc");
  });

  it("Caso 8: Campos raíz heredados (encomiendaName / encomiendaId)", () => {
    const customer = {
      encomiendaName: "Tracasa"
    };
    expect(resolveCustomerEncomiendaService(customer)).toBe("Tracasa");
  });

  it("Caso 9: Fallback total al Hint del manifiesto (Falla de base de datos / Cliente temporal)", () => {
    const customer = null;
    expect(resolveCustomerEncomiendaService(customer, "Correos de Costa Rica")).toBe("Correos de Costa Rica");
  });
});

