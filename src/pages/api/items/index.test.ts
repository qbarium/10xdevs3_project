import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test handlera endpointu (jak bulk.test.ts): mockujemy createClient + serwis, sprawdzamy wyłącznie
// logikę endpointu — guard auth, walidację zod (400 BEZ wywołania serwisu = „bez dotknięcia bazy"),
// kształt odpowiedzi 201 z znormalizowanym wejściem (title trim, '' → null) oraz mapowanie błędu na 500.
// Warstwa serwis→RLS→DB (niezmienniki accepted/new/NULL) jest pokryta testem integracyjnym items-mutation.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/items-mutation", () => ({ createManualItem: vi.fn() }));
vi.mock("@/lib/services/items", () => ({ listItems: vi.fn() }));
vi.mock("@/lib/services/logger", () => ({ reportError: vi.fn() }));

import { listItems } from "@/lib/services/items";
import { createManualItem } from "@/lib/services/items-mutation";
import { GET, POST } from "@/pages/api/items/index";

const ITEM = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "user-1",
  import_session_id: null,
  type: "task",
  title: "T",
  description: null,
  acceptance_status: "accepted",
  operational_status: "new",
  created_at: "2026-06-17T00:00:00Z",
  updated_at: "2026-06-17T00:00:00Z",
};

interface Body {
  ok?: boolean;
  item?: typeof ITEM;
  code?: string;
}

function ctx(body: unknown, user: { id: string } | null = { id: "user-1" }) {
  return {
    locals: { user },
    request: new Request("https://x/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    cookies: {},
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/items", () => {
  beforeEach(() => {
    vi.mocked(createManualItem).mockResolvedValue(ITEM as never);
  });
  afterEach(() => vi.clearAllMocks());

  it("brak zalogowania → 401, bez wywołania serwisu", async () => {
    const res = await POST(ctx({ title: "T", description: null, type: "task" }, null));
    expect(res.status).toBe(401);
    expect(vi.mocked(createManualItem)).not.toHaveBeenCalled();
  });

  // 201 + serwis dostaje user.id ORAZ znormalizowane wejście (title trim, description '' → null)
  it("poprawny payload → 201, serwis z user.id + danymi, odpowiedź {ok,item}", async () => {
    const res = await POST(ctx({ title: "  T  ", description: "   ", type: "task" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as Body;
    expect(body).toMatchObject({
      ok: true,
      item: { acceptance_status: "accepted", operational_status: "new", import_session_id: null },
    });
    expect(vi.mocked(createManualItem)).toHaveBeenCalledWith(expect.anything(), "user-1", {
      title: "T",
      description: null,
      type: "task",
    });
  });

  it("pusty title → 400 BEZ dotknięcia bazy (serwis nie wywołany)", async () => {
    const res = await POST(ctx({ title: "   ", description: null, type: "task" }));
    expect(res.status).toBe(400);
    expect(vi.mocked(createManualItem)).not.toHaveBeenCalled();
  });

  it("nieznany type → 400, serwis nie wywołany", async () => {
    const res = await POST(ctx({ title: "T", description: null, type: "task2" }));
    expect(res.status).toBe(400);
    expect(vi.mocked(createManualItem)).not.toHaveBeenCalled();
  });

  it("niepoprawny JSON → 400, serwis nie wywołany", async () => {
    const res = await POST(ctx("{zepsuty"));
    expect(res.status).toBe(400);
    expect(vi.mocked(createManualItem)).not.toHaveBeenCalled();
  });

  it("rzut serwisu → 500 generyczne", async () => {
    vi.mocked(createManualItem).mockRejectedValue(new Error("boom"));
    const res = await POST(ctx({ title: "T", description: null, type: "task" }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as Body).code).toBe("internal");
  });
});

// GET czyta kryteria z query string i woła `listItems` (zmockowany — handler testujemy w izolacji od DB).
// `parseListCriteria`/`parseItemPage`/`parseItemSize` działają NA ŻYWO (czyste walidatory) — stąd asercje
// na kryteriach i oknie przekazanych serwisowi.
interface ListBody {
  ok?: boolean;
  items?: unknown[];
  total?: number;
  page?: number;
  pageSize?: number;
  code?: string;
}

function getCtx(query: string, user: { id: string } | null = { id: "user-1" }) {
  return {
    locals: { user },
    request: new Request(`https://x/api/items${query}`, { method: "GET" }),
    cookies: {},
  } as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/items", () => {
  beforeEach(() => {
    vi.mocked(listItems).mockResolvedValue({ items: [ITEM], total: 1 } as never);
  });
  afterEach(() => vi.clearAllMocks());

  it("brak zalogowania → 401, bez wywołania serwisu", async () => {
    const res = await GET(getCtx("?view=active", null));
    expect(res.status).toBe(401);
    expect(vi.mocked(listItems)).not.toHaveBeenCalled();
  });

  it("brak view → 400, serwis nie wywołany", async () => {
    const res = await GET(getCtx(""));
    expect(res.status).toBe(400);
    expect(vi.mocked(listItems)).not.toHaveBeenCalled();
  });

  it("view spoza pięciu widoków → 400, serwis nie wywołany", async () => {
    const res = await GET(getCtx("?view=bogus"));
    expect(res.status).toBe(400);
    expect(vi.mocked(listItems)).not.toHaveBeenCalled();
  });

  // 200 + serwis dostaje user.id, kryteria sparsowane z query stringa ORAZ okno Z KRYTERIÓW (S-13 F2:
  // lista wpisów zawsze stronicuje — brak `size` w adresie ⇒ domyślne okno strona 1 × ITEM_PAGE_SIZE).
  it("poprawne parametry bez okna w adresie → 200, serwis z DOMYŚLNYM oknem, echo page/pageSize", async () => {
    const res = await GET(getCtx("?view=active&type=task&sort=title&dir=asc"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body).toMatchObject({ ok: true, items: [ITEM], total: 1, page: 1, pageSize: 10 });
    expect(vi.mocked(listItems)).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      {
        view: "active",
        type: "task",
        sort: "title",
        dir: "asc",
        q: "",
        opstatus: undefined,
        page: 1,
        size: 10,
      },
      { page: 1, size: 10 },
    );
  });

  it("page+size z puli → 200, serwis z oknem z adresu, odpowiedź z echem page/pageSize", async () => {
    vi.mocked(listItems).mockResolvedValue({ items: [ITEM], total: 60 } as never);
    const res = await GET(getCtx("?view=active&page=2&size=25"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body).toMatchObject({ ok: true, items: [ITEM], total: 60, page: 2, pageSize: 25 });
    expect(vi.mocked(listItems)).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ view: "active", page: 2, size: 25 }),
      { page: 2, size: 25 },
    );
  });

  it("size spoza puli / śmieciowy page → fallback do domyślnego okna (tolerancyjny parser)", async () => {
    const res = await GET(getCtx("?view=active&page=abc&size=999"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body).toMatchObject({ page: 1, pageSize: 10 });
    expect(vi.mocked(listItems)).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ page: 1, size: 10 }),
      { page: 1, size: 10 },
    );
  });

  // Niepoprawny sort/type NIE daje 400 — tolerancyjny parser cofa je do domyślnych (świadome odchylenie od zod).
  it("niepoprawny sort/type tolerowany → 200, fallback do domyślnych kryteriów", async () => {
    const res = await GET(getCtx("?view=active&sort=garbage&type=archived"));
    expect(res.status).toBe(200);
    expect(vi.mocked(listItems)).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      {
        view: "active",
        type: "all",
        sort: "updated",
        dir: "desc",
        q: "",
        opstatus: undefined,
        page: 1,
        size: 10,
      },
      { page: 1, size: 10 },
    );
  });

  it("filtr bez trafień → 200, items: [] + total 0", async () => {
    vi.mocked(listItems).mockResolvedValue({ items: [], total: 0 });
    const res = await GET(getCtx("?view=trash&q=nic-takiego"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, items: [], total: 0 });
  });

  it("rzut serwisu → 500 generyczne", async () => {
    vi.mocked(listItems).mockRejectedValue(new Error("boom"));
    const res = await GET(getCtx("?view=active"));
    expect(res.status).toBe(500);
    expect(((await res.json()) as ListBody).code).toBe("internal");
  });
});
