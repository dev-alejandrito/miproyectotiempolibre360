import { describe, expect, it } from "vitest";
import { buildMessage, composeSecurityEmail, deviceLabel } from "../server/tl/security.server.js";

describe("avisos de seguridad por correo", () => {
  it("identifica navegador y sistema sin datos sensibles", () => {
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")).toBe("Chrome en Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("Safari en iPhone");
  });
  it("incluye tipo de evento, fecha y hora, nunca contraseñas", () => {
    const ev = { kind: "password_changed", created: "2026-11-26T18:00:00Z", device_label: "" };
    const m = composeSecurityEmail(ev, "Ana López");
    expect(m.text).toContain("Tipo de evento: cambio de contraseña");
    expect(m.text).toContain("Fecha y hora:");
    expect(m.text).not.toMatch(/contraseña:\s*\S/i);
    const d = composeSecurityEmail({ kind: "new_device", created: "2026-11-26T18:00:00Z", device_label: "Firefox/120 (X11; Linux x86_64)" }, "Ana");
    expect(d.text).toContain("Dispositivo:");
  });
  it("arma un mensaje RFC 2822 con asunto UTF-8", () => {
    const raw = buildMessage({ to: "a@b.com", subject: "Aviso: contraseña", text: "Hola", from: "x@y.com" });
    expect(raw).toContain("To: a@b.com");
    expect(raw).toContain("Subject: =?UTF-8?B?");
    expect(raw).toContain("charset=UTF-8");
  });
});
