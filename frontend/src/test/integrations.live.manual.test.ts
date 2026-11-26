// @ts-nocheck -- prueba manual con datos simulados
// PRUEBA REAL (manual) de las 4 integraciones con Google. Ejecutar con:
//   LIVE_GOOGLE=1 npx vitest run src/test/integrations.live.manual.test.ts
// Usa el código real de integrations.server.js; solo la base de datos se simula en memoria.
import { describe, expect, it, vi } from "vitest";

const B_ID = "7e57c1a5-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12);
const P_ID = "7e57ba11-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0").slice(-12);
const ADMIN = "alejandroortizcalles@gmail.com";
const fake: Record<string, unknown> = {
  private_bookings: { id: B_ID, code: "CP-PRUEBA", title: "PRUEBA — Clase de guitarra (no es real)", skill_name: "Guitarra", minutes: 60, mode: "virtual", place: "https://meet.google.com/prueba-tl360", starts_at: "2027-01-15T23:00:00Z", ends_at: "2027-01-16T00:00:00Z", status: "confirmed", student: "s1", instructor: "i1" },
  members: [{ id: "s1", name: "Alumno PRUEBA", email: ADMIN }, { id: "i1", name: "Instructor PRUEBA", email: ADMIN }],
  class_payments: { id: P_ID, booking: B_ID, booking_code: "CP-PRUEBA", student: "s1", instructor: "i1", amount_mxn: 500, commission_pct: 10, commission_mxn: 50, instructor_net_mxn: 450, status: "paid", confirmed_at: new Date().toISOString(), payment_intent_id: "pi_PRUEBA", livemode: false, refunded_at: null },
};
vi.mock("../server/tl/core.server.js", () => {
  const chain = (t: string) => { const c: Record<string, unknown> = { _t: t }; for (const m of ["select", "eq", "in", "order", "limit", "gt", "lt", "update", "insert", "maybeSingle", "single"]) c[m] = () => c; return c; };
  return { db: { from: (t: string) => chain(t) }, q: async (c: { _t: string }) => fake[c._t], displayName: (n: string) => n };
});
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => null }));

const live = process.env.LIVE_GOOGLE === "1";
describe.runIf(live)("integraciones reales con Google (PRUEBA)", () => {
  it("1) recibo por Gmail", async () => {
    const { receiptText } = await import("../server/tl/integrations.server.js");
    const { sendMail } = await import("../server/tl/security.server.js");
    const b = fake.private_bookings as never, p = fake.class_payments as never;
    const id = await sendMail({ to: ADMIN, subject: "[PRUEBA] Recibo de clase personalizada CP-PRUEBA · $500.00 MXN", text: "CORREO DE PRUEBA\n\n" + receiptText("student", b, p, { student: "Alumno PRUEBA", instructor: "Instructor PRUEBA" }) });
    console.log("RECEIPT_ID", id); expect(id).toBeTruthy();
  }, 30000);
  it("2) aviso al administrador por Gmail", async () => {
    const { sendMail } = await import("../server/tl/security.server.js");
    const id = await sendMail({ to: ADMIN, subject: "[PRUEBA] [TIEMPO LIBRE 360] Nueva queja o sugerencia (Problema técnico)", text: "CORREO DE PRUEBA\n\nTipo: Nueva queja o sugerencia\nFolio: QS-PRUEBA\nEnviada por: Usuario PRUEBA\nAsunto: Esto es una prueba\n\nRevísalo en el panel administrativo: /admin/quejas" });
    console.log("ALERT_ID", id); expect(id).toBeTruthy();
  }, 30000);
  it("3) Google Calendar: crear, actualizar sin duplicar y cancelar", async () => {
    const m = await import("../server/tl/integrations.server.js");
    const a = await m.calendarSync(B_ID); console.log("CAL1", JSON.stringify(a)); expect(a.action).toBe("created");
    (fake.private_bookings as Record<string, unknown>).minutes = 90;
    (fake.private_bookings as Record<string, unknown>).ends_at = "2027-01-16T00:30:00Z";
    const b = await m.calendarSync(B_ID); console.log("CAL2", JSON.stringify(b)); expect(b.action).toBe("updated");
    (fake.private_bookings as Record<string, unknown>).status = "cancelled";
    const c = await m.calendarSync(B_ID); console.log("CAL3", JSON.stringify(c)); expect(c.action).toBe("cancelled");
  }, 60000);
  it("4) Google Sheets: agregar, actualizar sin duplicar y marcar reembolso", async () => {
    const m = await import("../server/tl/integrations.server.js");
    const a = await m.sheetSync(P_ID); console.log("SH1", JSON.stringify(a)); expect(a.action).toBe("appended");
    const b = await m.sheetSync(P_ID); console.log("SH2", JSON.stringify(b)); expect(b.action).toBe("updated");
    Object.assign(fake.class_payments as object, { status: "refunded", refunded_at: new Date().toISOString() });
    const c = await m.sheetSync(P_ID); console.log("SH3", JSON.stringify(c)); expect(c.action).toBe("updated");
    (fake.class_payments as Record<string, unknown>).status = "pending";
    const d = await m.sheetSync(P_ID); console.log("SH4", JSON.stringify(d)); expect(d.skipped).toBe("pending");
    console.log("TEST_EVENT", m.eventIdFor(B_ID), "TEST_PAYMENT", P_ID);
  }, 60000);
});
