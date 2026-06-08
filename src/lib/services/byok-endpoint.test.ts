// Testy endpointu POST /api/profile/byok-key (FR-026) — higiena logów i mapowanie błędów.
// Pokrywają ręczne kryterium 2.6 ("log z udanego i nieudanego zapisu NIE zawiera fragmentu
// klucza") automatycznie. Serwis i klient Supabase są mockowane — to endpoint jest jednostką
// pod testem. Fail-closed na braku KEK (2.7) jest w osobnym pliku `byok-endpoint.no-kek.test.ts`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/profile-key", () => ({
  saveApiKey: vi.fn(),
  getKeyStatus: vi.fn(),
  deleteApiKey: vi.fn(),
}));

import { POST } from "@/pages/api/profile/byok-key";
import { saveApiKey } from "@/lib/services/profile-key";
import type { APIContext } from "astro";

const FULL_KEY = "sk-abcdefghijklmnopqrstuvwxyz1234";
// Fragment środka klucza, który NIGDY nie może pojawić się w logu ani w treści odpowiedzi.
const SECRET_FRAGMENT = "abcdefghij";

/** Przechwytuje wszystkie linie wypisane na console.{info,warn,error} do jednego stringa. */
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

/** Minimalny APIContext, jakiego dotyka handler POST (user, request.json, headers, cookies). */
function makeContext(opts: { user: { id: string } | null; body?: unknown; rawBody?: string }): APIContext {
  const request = new Request("http://localhost/api/profile/byok-key", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  });
  return {
    locals: { user: opts.user },
    request,
    cookies: {},
  } as unknown as APIContext;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/profile/byok-key — higiena logów i błędy (FR-026, 2.6)", () => {
  it("udany zapis: 200, treść ma hint a NIE pełny klucz, brak logu z kluczem", async () => {
    const read = captureConsole();
    vi.mocked(saveApiKey).mockResolvedValueOnce({
      configured: true,
      hint: "sk-…1234",
      updatedAt: "2026-06-08T10:00:00Z",
    });

    const res = await POST(makeContext({ user: { id: "user-1" }, body: { apiKey: FULL_KEY } }));
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain(SECRET_FRAGMENT); // pełny klucz nie wraca do klienta
    expect(JSON.parse(text)).toMatchObject({ ok: true, configured: true, hint: "sk-…1234" });
    expect(read()).not.toContain(SECRET_FRAGMENT); // sukces niczego nie loguje
  });

  it("nieudany zapis z kluczem w cause: 500 generyczny, log zamaskowany (bez fragmentu klucza)", async () => {
    const read = captureConsole();
    // Wrogi przypadek: surowy błąd DB echo'uje wartość klucza w `cause`.
    const dbError = new Error(`pg: nie udało się zapisać wartości ${FULL_KEY}`);
    vi.mocked(saveApiKey).mockRejectedValueOnce(
      new Error("Zapis klucza w profilu nie powiódł się.", { cause: dbError }),
    );

    const res = await POST(makeContext({ user: { id: "user-1" }, body: { apiKey: FULL_KEY } }));
    const text = await res.text();

    expect(res.status).toBe(500);
    expect(text).not.toContain(SECRET_FRAGMENT); // generyczna treść błędu, bez klucza
    expect(JSON.parse(text)).toMatchObject({ ok: false });
    expect(read()).toContain("[REDACTED]"); // reportError zamaskował
    expect(read()).not.toContain(SECRET_FRAGMENT); // klucz NIE wyciekł do logu
  });

  it("pusty klucz → 400, serwis nie wywołany", async () => {
    const res = await POST(makeContext({ user: { id: "user-1" }, body: { apiKey: "   " } }));
    expect(res.status).toBe(400);
    expect(saveApiKey).not.toHaveBeenCalled();
  });

  it("brak sesji → 401, serwis nie wywołany", async () => {
    const res = await POST(makeContext({ user: null, body: { apiKey: FULL_KEY } }));
    expect(res.status).toBe(401);
    expect(saveApiKey).not.toHaveBeenCalled();
  });
});
