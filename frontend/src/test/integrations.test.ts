import { describe, expect, it } from "vitest";
import { eventBody, eventIdFor, receiptText, sheetRow, SHEET_HEADER } from "../server/tl/integrations.server.js";

const booking = { id: "0b6c2f1e-1234-4abc-9def-001122334455", code: "CP-ABC123", title: "Guitarra básica", skill_name: "Guitarra", minutes: 60, mode: "virtual", place: "https://meet.google.com/abc-defg-hij", starts_at: "2026-12-01T22:00:00Z", ends_at: "2026-12-01T23:00:00Z" };
const pay = { id: "9f0e8d7c-0000-4000-8000-aaaaaaaaaaaa", booking_code: "CP-ABC123", amount_mxn: 500, commission_pct: 10, commission_mxn: 50, instructor_net_mxn: 450, status: "paid", confirmed_at: "2026-11-30T18:00:00Z", payment_intent_id: "pi_test_1", livemode: false, refunded_at: null };

describe("integraciones de Google", () => {
  it("recibo con precio, comisión 10% y neto 90% en MXN", () => {
    const t = receiptText("student", booking, pay, { student: "Ana", instructor: "Luis" });
    expect(t).toContain("Clase: Guitarra básica");
    expect(t).toMatch(/Precio total: \$500\.00 MXN/);
    expect(t).toMatch(/Comisión de la plataforma \(10%\): \$50\.00 MXN/);
    expect(t).toMatch(/Importe neto del instructor \(90%\): \$450\.00 MXN/);
    expect(t).toContain("MODO PRUEBA");
  });
  it("evento con ID estable, hora de Ciudad de México, duración e invitados", () => {
    const e = eventBody(booking, { student: "Ana", instructor: "Luis" }, ["a@x.com", "l@x.com"]);
    expect(e.id).toBe(eventIdFor(booking.id));
    expect(e.id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(e.start.timeZone).toBe("America/Mexico_City");
    expect(e.description).toContain("Duración: 60 minutos");
    expect(e.description).toContain("Enlace de la clase: https://meet.google.com/abc-defg-hij");
    expect(e.attendees).toHaveLength(2);
  });
  it("fila de comisiones alineada con el encabezado y mes de control", () => {
    const r = sheetRow(pay, { title: "Guitarra básica" });
    expect(r).toHaveLength(SHEET_HEADER.length);
    expect(r[1]).toBe(pay.id);
    expect(r[2]).toBe("2026-11");
    expect(r[7]).toBe(50);
    expect(r[8]).toBe(450);
    expect(r[9]).toBe("Pagado");
  });
});
