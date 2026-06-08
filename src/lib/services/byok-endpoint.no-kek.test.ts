// Test fail-closed endpointu POST /api/profile/byok-key przy braku/niepoprawnym KEK.
// Pokrywa ręczne kryterium 2.7 ("zapis przy niepoprawnym KEK → 503 generyczny, bez wycieku")
// automatycznie. Łańcuch jest REALNY: endpoint → prawdziwy saveApiKey → prawdziwy encryptApiKey,
// który przy BYOK_KEK=undefined rzuca KekNotConfiguredError PRZED dotknięciem DB. Mockowane jest
// tylko środowisko (KEK undefined) i klient Supabase (stub rzucający przy `from` — dowód, że żadna
// koperta nie trafia do bazy). Osobny plik = świeży moduł crypto (memoizacja KEK nie przecieka).

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("astro:env/server", () => ({ BYOK_KEK: undefined, SUPABASE_URL: undefined, SUPABASE_KEY: undefined }));
vi.mock("@/lib/supabase", () => ({
  createClient: vi.fn(() => ({
    from() {
      throw new Error("DB nie powinno być dotknięte przy braku KEK (fail-closed przed zapisem)");
    },
  })),
}));

import { POST } from "@/pages/api/profile/byok-key";
import type { APIContext } from "astro";

const FULL_KEY = "sk-abcdefghijklmnopqrstuvwxyz1234";
const SECRET_FRAGMENT = "abcdefghij";

function captureConsole(): () => string {
  const lines: string[] = [];
  const push = (arg: unknown) => {
    lines.push(typeof arg === "string" ? arg : String(arg));
  };
  vi.spyOn(console, "info").mockImplementation(push);
  vi.spyOn(console, "warn").mockImplementation(push);
  vi.spyOn(console, "error").mockImplementation(push);
  return () => lines.join("\n");
}

function makeContext(user: { id: string } | null, body: unknown): APIContext {
  const request = new Request("http://localhost/api/profile/byok-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { locals: { user }, request, cookies: {} } as unknown as APIContext;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/profile/byok-key — fail-closed bez KEK (2.7)", () => {
  it("zapis przy BYOK_KEK=undefined → 503 generyczny, bez wycieku klucza, DB nietknięte", async () => {
    const read = captureConsole();

    const res = await POST(makeContext({ id: "user-1" }, { apiKey: FULL_KEY }));
    const text = await res.text();

    expect(res.status).toBe(503);
    expect(JSON.parse(text)).toMatchObject({ ok: false });
    expect(text).not.toContain(SECRET_FRAGMENT); // generyczny komunikat, bez klucza
    expect(read()).not.toContain(SECRET_FRAGMENT); // logger.warn nie zawiera fragmentu klucza
  });
});
