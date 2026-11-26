import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { splitAmount, verifySignature } from "../server/tl/pay.server.js";
import { cleanInterests, THEMES } from "../server/tl/profile.server.js";

describe("comisión del 10% en clases personalizadas", () => {
  it("una clase de $500 MXN: plataforma $50, instructor $450", () => {
    const s = splitAmount(500, 10);
    expect(s.total).toBe(500);
    expect(s.fee).toBe(50);
    expect(s.net).toBe(450);
    expect(s.total_cents).toBe(50000);
    expect(s.fee_cents).toBe(5000);
  });
  it("redondea a centavos y la suma siempre cuadra", () => {
    for (const price of [1, 15, 99, 199.99, 333, 1234.56, 20000]) {
      const s = splitAmount(price, 10);
      expect(s.fee_cents + s.net_cents).toBe(s.total_cents);
      expect(s.fee).toBeCloseTo(Math.round(price * 10) / 100, 2);
    }
  });
  it("rechaza precios o porcentajes no válidos", () => {
    expect(() => splitAmount(0, 10)).toThrow();
    expect(() => splitAmount(100, 80)).toThrow();
  });
});

describe("firma del webhook de Stripe", () => {
  const secret = "whsec_test_123";
  const payload = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const sign = (t: number, body = payload) => "t=" + t + ",v1=" + createHmac("sha256", secret).update(t + "." + body).digest("hex");
  it("acepta una firma válida y reciente", async () => {
    expect(await verifySignature(payload, sign(Math.floor(Date.now() / 1000)), secret)).toBe(true);
  });
  it("rechaza firmas alteradas, antiguas o sin secreto", async () => {
    const now = Math.floor(Date.now() / 1000);
    expect(await verifySignature(payload + " ", sign(now), secret)).toBe(false);
    expect(await verifySignature(payload, sign(now - 3600), secret)).toBe(false);
    expect(await verifySignature(payload, sign(now), "")).toBe(false);
    expect(await verifySignature(payload, "", secret)).toBe(false);
  });
});

describe("perfil", () => {
  it("limpia intereses: sin duplicados, máximo 12", () => {
    const out = cleanInterests(["Ajedrez", "ajedrez", " Fotografía ", "x", ...Array.from({ length: 20 }, (_, i) => "Tema " + i)]);
    expect(out[0]).toBe("Ajedrez");
    expect(out[1]).toBe("Fotografía");
    expect(out.length).toBe(12);
  });
  it("tiene temas de color predeterminados", () => {
    expect(THEMES).toContain("clasico");
    expect(THEMES.length).toBeGreaterThanOrEqual(4);
  });
});
