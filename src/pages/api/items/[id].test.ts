import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test handlera PATCH /api/items/[id] (jak classify.test.ts): mock createClient + serwis. Sprawdza
// guard auth, walidację UUID i payloadu (400 bez serwisu), happy path (1.6) oraz mapowanie
// ItemNotEditableError → 404. Derywacja operational_status i zapis do bazy: test integracyjny.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/items-mutation", () => ({
  editPendingItem: vi.fn(),
  ItemNotEditableError: class ItemNotEditableError extends Error {},
}));
vi.mock("@/lib/services/logger", () => ({ reportError: vi.fn() }));

import { editPendingItem, ItemNotEditableError } from "@/lib/services/items-mutation";
import { PATCH } from "@/pages/api/items/[id]";
import type { Item } from "@/types";

const UUID = "11111111-1111-4111-8111-111111111111";

const sampleItem: Item = {
  id: UUID,
  user_id: "u",
  import_session_id: null,
  type: "note",
  title: "Nowy",
  description: null,
  acceptance_status: "pending",
  operational_status: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const validBody = { title: "Nowy", description: null, type: "note" };

function ctx(
  body: unknown,
  { user = { id: "user-1" }, id = UUID }: { user?: { id: string } | null; id?: string } = {},
) {
  return {
    locals: { user },
    params: { id },
    request: new Request(`https://x/api/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    cookies: {},
  } as unknown as Parameters<typeof PATCH>[0];
}

describe("PATCH /api/items/[id]", () => {
  beforeEach(() => {
    vi.mocked(editPendingItem).mockResolvedValue(sampleItem);
  });
  afterEach(() => vi.clearAllMocks());

  it("brak zalogowania → 401", async () => {
    const res = await PATCH(ctx(validBody, { user: null }));
    expect(res.status).toBe(401);
    expect(vi.mocked(editPendingItem)).not.toHaveBeenCalled();
  });

  it("niepoprawny UUID w ścieżce → 400, serwis nie wywołany", async () => {
    const res = await PATCH(ctx(validBody, { id: "nie-uuid" }));
    expect(res.status).toBe(400);
    expect(vi.mocked(editPendingItem)).not.toHaveBeenCalled();
  });

  // 1.6 — poprawna edycja przechodzi do serwisu i zwraca item
  it("poprawna edycja → 200 {ok, item}, serwis z parsed payloadem", async () => {
    const res = await PATCH(ctx(validBody));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; item: Item };
    expect(body.ok).toBe(true);
    expect(body.item.id).toBe(UUID);
    expect(vi.mocked(editPendingItem)).toHaveBeenCalledWith(expect.anything(), UUID, {
      title: "Nowy",
      description: null,
      type: "note",
    });
  });

  it("pusty title → 400, serwis nie wywołany", async () => {
    const res = await PATCH(ctx({ title: "   ", description: null, type: "note" }));
    expect(res.status).toBe(400);
    expect(vi.mocked(editPendingItem)).not.toHaveBeenCalled();
  });

  it("ItemNotEditableError → 404 not_found", async () => {
    vi.mocked(editPendingItem).mockRejectedValue(new ItemNotEditableError());
    const res = await PATCH(ctx(validBody));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { code: string }).code).toBe("not_found");
  });

  it("inny rzut serwisu → 500 generyczne", async () => {
    vi.mocked(editPendingItem).mockRejectedValue(new Error("boom"));
    const res = await PATCH(ctx(validBody));
    expect(res.status).toBe(500);
  });
});
