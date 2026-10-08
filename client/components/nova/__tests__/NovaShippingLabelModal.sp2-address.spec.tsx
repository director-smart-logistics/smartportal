// @vitest-environment jsdom
// F11.2 — the Nova label's address options:
//   "Guardar como dirección de administración" (SP1 only) and
//   "Actualizar también la dirección principal del cliente en SmartWeb (SP2)".
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("framer-motion", () => ({
  // One stable component per tag (a new one per render would remount the form).
  motion: { div: ({ children, className }: any) => <div className={className}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/lib/firebase/callable", () => ({
  firebaseApi: { customers: { getBySlCode: vi.fn(), update: vi.fn() }, packages: { list: vi.fn(), bulkUpdateStatus: vi.fn() } },
}));
vi.mock("@/lib/services/customer-sync", () => ({ updateCustomerEncomiendaService: vi.fn(), updateSp2AddressFromLabel: vi.fn() }));
vi.mock("@/lib/services/shipping-labels.service", () => ({ shippingLabelsService: {} }));
vi.mock("@/lib/services/manifest-processor", () => ({ createOrGetTempCustomer: vi.fn(), updateTempCustomerEncomienda: vi.fn() }));
vi.mock("@/lib/firebase/config", () => ({ db: {}, auth: { currentUser: null }, app: {} }));   // label history write fails → caught by the modal
vi.mock("@/lib/services/encomienda-lookup", async () => ({
  ...(await vi.importActual<any>("@/lib/services/encomienda-lookup")),
  useEncomiendaLookup: () => ({ resolve: (n: string) => n }),
  resolveEncomiendaName: (n: string) => n,
}));

import { NovaShippingLabelModal } from "../NovaShippingLabelModal";
import { firebaseApi } from "@/lib/firebase/callable";
import { updateCustomerEncomiendaService, updateSp2AddressFromLabel } from "@/lib/services/customer-sync";

const CUSTOMER = {
  id: "SL90021", slCode: "SL90021", fullName: "Cliente Etiqueta",
  defaultAddress: { streetAddress: "Del parque 100 m sur", details: "Casa azul", province: "Heredia", isActive: true, encomienda: { id: "c", name: "Correos de Costa Rica" } },
};

async function open({ edit = true, autoGenerate = false } = {}) {
  const { container } = render(<NovaShippingLabelModal data={{ slCode: "SL90021", clientName: "Cliente Etiqueta", trackings: ["T1"] }} onClose={() => {}} autoGenerate={autoGenerate} />);
  const box = (await within(container).findByDisplayValue(/Del parque 100 m sur/)) as HTMLTextAreaElement;
  if (edit) fireEvent.change(box, { target: { value: "Del parque 300 m sur\nCasa azul" } });
  return box;
}
const generate = () => fireEvent.click(screen.getByRole("button", { name: /Generar Etiqueta/ }));

beforeEach(() => {
  vi.mocked(firebaseApi.customers.getBySlCode).mockResolvedValue({ success: true, data: CUSTOMER } as any);
  vi.mocked(firebaseApi.customers.update).mockResolvedValue({ success: true } as any);
  vi.mocked(updateCustomerEncomiendaService).mockResolvedValue(undefined);
  vi.mocked(updateSp2AddressFromLabel).mockResolvedValue({ changed: true });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("F11.2 Nova label — SP2 address option (checked by default, only for what the admin typed)", () => {
  it("both options start checked", async () => {
    await open({ edit: false });
    expect((screen.getByLabelText(/dirección de administración preferida/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/SmartWeb \(SP2\)/) as HTMLInputElement).checked).toBe(true);
  });

  it("default + the admin typed: sends the edited text for this SL to SP2 (and saves the SP1 admin address)", async () => {
    await open();
    generate();
    await waitFor(() => expect(updateSp2AddressFromLabel).toHaveBeenCalledWith("SL90021", "Del parque 300 m sur\nCasa azul"));
    await waitFor(() => expect(firebaseApi.customers.update).toHaveBeenCalled());
  });

  it("default but the admin did NOT type: SP2 is not touched (the loaded text is never pushed)", async () => {
    await open({ edit: false });
    generate();
    await waitFor(() => expect(firebaseApi.customers.update).toHaveBeenCalled());
    expect(updateSp2AddressFromLabel).not.toHaveBeenCalled();
  });

  it("SP2 unchecked: SP1 admin address only", async () => {
    await open();
    fireEvent.click(screen.getByLabelText(/SmartWeb \(SP2\)/));
    generate();
    await waitFor(() => expect(firebaseApi.customers.update).toHaveBeenCalled());
    expect(updateSp2AddressFromLabel).not.toHaveBeenCalled();
  });

  it("both unchecked: nothing is saved (before, the stale callback always saved)", async () => {
    await open();
    fireEvent.click(screen.getByLabelText(/dirección de administración preferida/));
    fireEvent.click(screen.getByLabelText(/SmartWeb \(SP2\)/));
    generate();
    await waitFor(() => expect(screen.queryByText("Generando...")).toBeNull());
    await new Promise((r) => setTimeout(r, 50));
    expect(firebaseApi.customers.update).not.toHaveBeenCalled();
    expect(updateSp2AddressFromLabel).not.toHaveBeenCalled();
  });

  it("bulk (autoGenerate): never writes SP2", async () => {
    await open({ edit: false, autoGenerate: true });
    await waitFor(() => expect(firebaseApi.customers.update).toHaveBeenCalled());
    expect(updateSp2AddressFromLabel).not.toHaveBeenCalled();
  });
});
