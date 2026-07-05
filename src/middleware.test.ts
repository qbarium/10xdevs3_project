import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test WPIĘCIA bramki anty-CSRF w middleware (S-14, F1 z /10x-impl-review). Predykat
// isTrustedRequest/isMutatingMethod jest pokryty jednostkowo w src/lib/security/csrf.test.ts —
// tu pinujemy sam kontrakt wpięcia: bramka zwraca 403 PRZED autoryzacją (createClient NIE wywołany
// = fail-fast, bez rundy do Supabase) i legalne żądania przechodzą do next().
//
// `astro:middleware` to wirtualny moduł Astro — mockujemy defineMiddleware jako tożsamość (taka
// jest jego semantyka: zwraca handler bez zmian). createClient mockujemy jak w bulk.test.ts.
// Origin/Sec-Fetch-Site to forbidden headers — jak w csrf.test.ts budujemy lekki mock Request
// zamiast `new Request(...)`, który by je odfiltrował i uczynił test bezwartościowym.
vi.mock("astro:middleware", () => ({ defineMiddleware: (fn: unknown) => fn }));
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn() }));

import { createClient } from "@/lib/supabase";
import { onRequest } from "@/middleware";

const getUser = vi.fn();

function ctx(method: string, headers: Record<string, string>, pathname = "/api/items/bulk") {
  return {
    request: { method, headers: new Headers(headers) },
    url: new URL(`https://x${pathname}`),
    cookies: {},
    locals: {},
    redirect: vi.fn((loc: string) => new Response(null, { status: 302, headers: { Location: loc } })),
  } as unknown as Parameters<typeof onRequest>[0];
}

const next = vi.fn(() => new Response("ok", { status: 200 }));
// TS nie rozwiązuje typu handlera z zamockowanego `astro:middleware`; rzutujemy onRequest na
// konkretną sygnaturę (w każdej testowanej ścieżce zwraca Response) — wzorzec `as unknown as` z repo.
const onReq = onRequest as unknown as (context: unknown, next: unknown) => Promise<Response>;
const call = (c: ReturnType<typeof ctx>) => onReq(c, next);

describe("middleware onRequest — bramka anty-CSRF (S-14)", () => {
  beforeEach(() => {
    getUser.mockResolvedValue({ data: { user: null } });
    vi.mocked(createClient).mockReturnValue({ auth: { getUser } } as never);
  });
  afterEach(() => vi.clearAllMocks());

  it("mutujące + cross-site Origin → 403 PRZED createClient (fail-fast), kształt {ok:false,code:'forbidden'}", async () => {
    const res = await call(ctx("POST", { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, code: "forbidden" });
    expect(vi.mocked(createClient)).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it("mutujące bez Origin i bez Sec-Fetch-Site → 403 (fail-closed), bez createClient", async () => {
    const res = await call(ctx("POST", {}));
    expect(res.status).toBe(403);
    expect(vi.mocked(createClient)).not.toHaveBeenCalled();
  });

  it("mutujące + same-origin Origin → przechodzi bramkę (createClient + next wywołane)", async () => {
    const res = await call(ctx("POST", { origin: "https://x" }));
    expect(res.status).toBe(200);
    expect(vi.mocked(createClient)).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it("bezpieczna metoda (GET) omija bramkę nawet z cross-site Origin", async () => {
    const res = await call(ctx("GET", { origin: "https://evil.example" }));
    expect(res.status).toBe(200);
    expect(vi.mocked(createClient)).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });
});
