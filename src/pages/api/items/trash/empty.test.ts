import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test handlera endpointu „wyczyść kosz" (wzór bulk.test.ts): mockujemy createClient + serwis,
// sprawdzamy wyłącznie logikę endpointu — guard auth (401 BEZ wywołania serwisu), kształt odpowiedzi
// (200 {ok, deletedCount}) i mapowanie błędu (500 generyczne). Warstwa serwis→RLS→DB (izolacja
// per-user twardego DELETE) jest WERYFIKACJĄ RĘCZNĄ — unit z mockiem Supabase tego NIE dowodzi.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/items-mutation", () => ({ emptyTrash: vi.fn() }));
vi.mock("@/lib/services/logger", () => ({ reportError: vi.fn() }));

import { emptyTrash } from "@/lib/services/items-mutation";
import { POST } from "@/pages/api/items/trash/empty";

interface Body {
  ok?: boolean;
  deletedCount?: number;
  code?: string;
}

function ctx(user: { id: string } | null = { id: "user-1" }) {
  return {
    locals: { user },
    request: new Request("https://x/api/items/trash/empty", { method: "POST" }),
    cookies: {},
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/items/trash/empty", () => {
  beforeEach(() => {
    vi.mocked(emptyTrash).mockResolvedValue({ deletedCount: 3 });
  });
  afterEach(() => vi.clearAllMocks());

  it("brak zalogowania → 401, bez wywołania serwisu", async () => {
    const res = await POST(ctx(null));
    expect(res.status).toBe(401);
    expect(vi.mocked(emptyTrash)).not.toHaveBeenCalled();
  });

  it("zalogowany → 200, odpowiedź {ok, deletedCount}", async () => {
    const res = await POST(ctx());
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body).toMatchObject({ ok: true, deletedCount: 3 });
    expect(vi.mocked(emptyTrash)).toHaveBeenCalledOnce();
  });

  it("rzut serwisu → 500 generyczne", async () => {
    vi.mocked(emptyTrash).mockRejectedValue(new Error("boom"));
    const res = await POST(ctx());
    expect(res.status).toBe(500);
    expect(((await res.json()) as Body).code).toBe("internal");
  });
});
