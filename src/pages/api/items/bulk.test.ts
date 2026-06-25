import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test handlera endpointu (jak classify.test.ts): mockujemy createClient + serwis, sprawdzamy
// wyłącznie logikę endpointu — guard auth, walidację zod (400 BEZ wywołania serwisu = „bez
// dotknięcia bazy", krok 1.7), kształt odpowiedzi (1.5) i mapowanie błędu. Warstwa serwis→RLS→DB
// jest pokryta testem integracyjnym items-mutation.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/items-mutation", () => ({
  setAcceptanceStatus: vi.fn(),
  moveToTrash: vi.fn(),
  restoreFromTrash: vi.fn(),
}));
vi.mock("@/lib/services/logger", () => ({ reportError: vi.fn() }));

import { moveToTrash, restoreFromTrash, setAcceptanceStatus } from "@/lib/services/items-mutation";
import { POST } from "@/pages/api/items/bulk";
import type { Item } from "@/types";

const UUID = "11111111-1111-4111-8111-111111111111";

// Minimalny wiersz Item dla mocka restore (S-10: restoreFromTrash zwraca świeże wiersze, nie liczbę).
const ITEM = {
  id: UUID,
  user_id: "u",
  import_session_id: null,
  type: "task",
  title: "T",
  description: null,
  acceptance_status: "accepted",
  operational_status: "new",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:01Z",
} satisfies Item;

interface Body {
  ok?: boolean;
  action?: string;
  updatedIds?: string[];
  count?: number;
  code?: string;
  items?: Item[];
}

function ctx(body: unknown, user: { id: string } | null = { id: "user-1" }) {
  return {
    locals: { user },
    request: new Request("https://x/api/items/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    cookies: {},
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/items/bulk", () => {
  beforeEach(() => {
    vi.mocked(setAcceptanceStatus).mockResolvedValue({ updatedIds: [UUID] });
    vi.mocked(moveToTrash).mockResolvedValue({ updatedIds: [UUID] });
    // S-10: restore zwraca świeże wiersze (Item[]); endpoint wyprowadza z nich updatedIds/count.
    vi.mocked(restoreFromTrash).mockResolvedValue([ITEM]);
  });
  afterEach(() => vi.clearAllMocks());

  it("brak zalogowania → 401, bez wywołania serwisu", async () => {
    const res = await POST(ctx({ ids: [UUID], action: "accept" }, null));
    expect(res.status).toBe(401);
    expect(vi.mocked(setAcceptanceStatus)).not.toHaveBeenCalled();
  });

  // 1.5 — accept zmienia status (endpoint woła serwis z 'accepted' i zwraca count)
  it("accept → 200, serwis z 'accepted', odpowiedź {ok, action, updatedIds, count}", async () => {
    const res = await POST(ctx({ ids: [UUID], action: "accept" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body).toMatchObject({ ok: true, action: "accept", updatedIds: [UUID], count: 1 });
    expect(vi.mocked(setAcceptanceStatus)).toHaveBeenCalledWith(expect.anything(), [UUID], "accepted");
  });

  it("reject → serwis z 'rejected'", async () => {
    await POST(ctx({ ids: [UUID], action: "reject" }));
    expect(vi.mocked(setAcceptanceStatus)).toHaveBeenCalledWith(expect.anything(), [UUID], "rejected");
  });

  // S-06 — trash woła moveToTrash (NIE setAcceptanceStatus), zwraca kształt {ok, action, updatedIds, count}
  it("trash → moveToTrash, odpowiedź {ok, action:'trash', updatedIds, count}", async () => {
    const res = await POST(ctx({ ids: [UUID], action: "trash" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body).toMatchObject({ ok: true, action: "trash", updatedIds: [UUID], count: 1 });
    expect(vi.mocked(moveToTrash)).toHaveBeenCalledWith(expect.anything(), [UUID]);
    expect(vi.mocked(setAcceptanceStatus)).not.toHaveBeenCalled();
  });

  // S-06/S-10 — restore woła restoreFromTrash i ADDYTYWNIE zwraca świeże wiersze (`items`) obok updatedIds/count.
  it("restore → restoreFromTrash, odpowiedź {ok, action:'restore', updatedIds, count, items}", async () => {
    const res = await POST(ctx({ ids: [UUID], action: "restore" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body).toMatchObject({ ok: true, action: "restore", updatedIds: [UUID], count: 1 });
    // S-10: pole `items` ze świeżymi wierszami (poprawny updated_at) dla panelu sesji.
    expect(body.items).toEqual([ITEM]);
    expect(vi.mocked(restoreFromTrash)).toHaveBeenCalledWith(expect.anything(), [UUID]);
    expect(vi.mocked(setAcceptanceStatus)).not.toHaveBeenCalled();
  });

  // 1.7 — zły payload → 400 BEZ dotknięcia bazy (serwis nie wywołany)
  it("puste ids → 400, serwis nie wywołany", async () => {
    const res = await POST(ctx({ ids: [], action: "accept" }));
    expect(res.status).toBe(400);
    expect(vi.mocked(setAcceptanceStatus)).not.toHaveBeenCalled();
  });

  it("nieznana action → 400, serwis nie wywołany", async () => {
    const res = await POST(ctx({ ids: [UUID], action: "delete" }));
    expect(res.status).toBe(400);
    expect(vi.mocked(setAcceptanceStatus)).not.toHaveBeenCalled();
  });

  it(">100 id → 400, serwis nie wywołany", async () => {
    const ids = Array.from({ length: 101 }, () => UUID);
    const res = await POST(ctx({ ids, action: "accept" }));
    expect(res.status).toBe(400);
    expect(vi.mocked(setAcceptanceStatus)).not.toHaveBeenCalled();
  });

  it("niepoprawny JSON → 400", async () => {
    const res = await POST(ctx("{zepsuty"));
    expect(res.status).toBe(400);
  });

  it("rzut serwisu → 500 generyczne", async () => {
    vi.mocked(setAcceptanceStatus).mockRejectedValue(new Error("boom"));
    const res = await POST(ctx({ ids: [UUID], action: "accept" }));
    expect(res.status).toBe(500);
    expect(((await res.json()) as Body).code).toBe("internal");
  });
});
