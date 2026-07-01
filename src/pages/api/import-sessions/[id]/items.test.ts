import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test handlera endpointu (wzorzec api/items/index.test.ts): mockujemy createClient + serwis, sprawdzamy
// wyłącznie logikę endpointu — guard auth, walidację UUID ścieżki (400 BEZ wywołania serwisu), okno strony
// (S-13 F1: brak/śmieciowy `size` → pełna lista bez okna; z oknem → echo page/pageSize), addytywność
// odpowiedzi (`total` zawsze) i mapowanie błędu na 500. `parseItemPage`/`parseItemSize` działają NA ŻYWO.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/items", () => ({ getSessionItems: vi.fn() }));
vi.mock("@/lib/services/logger", () => ({ reportError: vi.fn() }));

import { getSessionItems } from "@/lib/services/items";
import { GET } from "@/pages/api/import-sessions/[id]/items";

const SESSION_ID = "22222222-2222-4222-8222-222222222222";

const ITEM = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "user-1",
  import_session_id: SESSION_ID,
  type: "task",
  title: "T",
  description: null,
  acceptance_status: "pending",
  operational_status: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
};

interface Body {
  ok?: boolean;
  items?: unknown[];
  total?: number;
  page?: number;
  pageSize?: number;
  code?: string;
}

function ctx(id: string | undefined, query = "", user: { id: string } | null = { id: "user-1" }) {
  return {
    locals: { user },
    params: { id },
    request: new Request(`https://x/api/import-sessions/${id ?? ""}/items${query}`, { method: "GET" }),
    cookies: {},
  } as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/import-sessions/[id]/items", () => {
  beforeEach(() => {
    vi.mocked(getSessionItems).mockResolvedValue({ items: [ITEM], total: 1 } as never);
  });
  afterEach(() => vi.clearAllMocks());

  it("brak zalogowania → 401, bez wywołania serwisu", async () => {
    const res = await GET(ctx(SESSION_ID, "", null));
    expect(res.status).toBe(401);
    expect(vi.mocked(getSessionItems)).not.toHaveBeenCalled();
  });

  it("zły format UUID → 400 BEZ dotknięcia bazy (serwis nie wywołany)", async () => {
    const res = await GET(ctx("nie-uuid"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as Body).code).toBe("bad_request");
    expect(vi.mocked(getSessionItems)).not.toHaveBeenCalled();
  });

  // Bez `size` → wywołanie BEZ okna (pełna lista — panel S-10 bez zmian) i odpowiedź BEZ echa page/pageSize,
  // ale zawsze z `total` (rozszerzenie addytywne — stare pola nienaruszone).
  it("poprawny UUID bez okna → 200, serwis bez okna, {ok,items,total} bez page/pageSize", async () => {
    const res = await GET(ctx(SESSION_ID));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body).toMatchObject({ ok: true, items: [ITEM], total: 1 });
    expect(body.page).toBeUndefined();
    expect(body.pageSize).toBeUndefined();
    expect(vi.mocked(getSessionItems)).toHaveBeenCalledWith(expect.anything(), "user-1", SESSION_ID);
  });

  it("page+size z puli → 200, serwis z oknem, odpowiedź z echem page/pageSize", async () => {
    vi.mocked(getSessionItems).mockResolvedValue({ items: [ITEM], total: 30 } as never);
    const res = await GET(ctx(SESSION_ID, "?page=2&size=10"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body).toMatchObject({ ok: true, items: [ITEM], total: 30, page: 2, pageSize: 10 });
    expect(vi.mocked(getSessionItems)).toHaveBeenCalledWith(expect.anything(), "user-1", SESSION_ID, {
      page: 2,
      size: 10,
    });
  });

  it("size spoza puli / śmieć → traktowane jak brak okna (pełna lista)", async () => {
    const res = await GET(ctx(SESSION_ID, "?page=2&size=7"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.page).toBeUndefined();
    expect(body.pageSize).toBeUndefined();
    expect(vi.mocked(getSessionItems)).toHaveBeenCalledWith(expect.anything(), "user-1", SESSION_ID);
  });

  it("śmieciowy page z poprawnym size → clamp do strony 1", async () => {
    const res = await GET(ctx(SESSION_ID, "?page=abc&size=25"));
    expect(res.status).toBe(200);
    expect(vi.mocked(getSessionItems)).toHaveBeenCalledWith(expect.anything(), "user-1", SESSION_ID, {
      page: 1,
      size: 25,
    });
  });

  it("nieistniejąca/cudza sesja (RLS) → 200, items: [] + total 0", async () => {
    vi.mocked(getSessionItems).mockResolvedValue({ items: [], total: 0 });
    const res = await GET(ctx(SESSION_ID));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, items: [], total: 0 });
  });

  it("rzut serwisu → 500 generyczne", async () => {
    vi.mocked(getSessionItems).mockRejectedValue(new Error("boom"));
    const res = await GET(ctx(SESSION_ID));
    expect(res.status).toBe(500);
    expect(((await res.json()) as Body).code).toBe("internal");
  });
});
