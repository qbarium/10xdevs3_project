import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test handlera endpointu (jak items/index.test.ts): mockujemy createClient + serwis, sprawdzamy wyłącznie
// logikę endpointu — guard auth, tolerancyjny parser kryteriów (fallback zamiast 400), mapowanie „all" →
// brak filtra statusu, kształt odpowiedzi 200 oraz mapowanie rzutu serwisu na 500. `toSessionRow` mockujemy
// jako tożsamość (mapowanie wiersza jest pokryte testem serwisu), więc `rows` === `sessions`.
vi.mock("@/lib/supabase", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("@/lib/services/import-session", () => ({
  getImportSessions: vi.fn(),
  toSessionRow: vi.fn((s: unknown) => s),
}));
vi.mock("@/lib/services/logger", () => ({ reportError: vi.fn() }));

import { getImportSessions } from "@/lib/services/import-session";
import { GET } from "@/pages/api/import-sessions/index";

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  isFile: false,
  preview: "kup mleko",
  dateLabel: "2026-06-13 09:30",
  status: "failed",
  itemCount: null,
  liveItemCount: 0,
  errorCode: "invalid_key",
};

const PAGE = { sessions: [ROW], total: 1, page: 1, pageSize: 20 };

interface ListBody {
  ok?: boolean;
  rows?: unknown[];
  total?: number;
  page?: number;
  pageSize?: number;
  code?: string;
}

function getCtx(query: string, user: { id: string } | null = { id: "user-1" }) {
  return {
    locals: { user },
    request: new Request(`https://x/api/import-sessions${query}`, { method: "GET" }),
    cookies: {},
  } as unknown as Parameters<typeof GET>[0];
}

describe("GET /api/import-sessions", () => {
  beforeEach(() => {
    vi.mocked(getImportSessions).mockResolvedValue(PAGE as never);
  });
  afterEach(() => vi.clearAllMocks());

  it("brak zalogowania → 401, bez wywołania serwisu", async () => {
    const res = await GET(getCtx("?status=failed", null));
    expect(res.status).toBe(401);
    expect(vi.mocked(getImportSessions)).not.toHaveBeenCalled();
  });

  // 200 + serwis dostaje user.id ORAZ kryteria sparsowane z query stringa (status enuma przekazany wprost).
  it("poprawne parametry → 200, serwis z user.id + kryteriami, odpowiedź {ok,rows,total,page,pageSize}", async () => {
    const res = await GET(getCtx("?status=failed&sort=created_asc&page=1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body).toMatchObject({ ok: true, rows: [ROW], total: 1, page: 1, pageSize: 20 });
    expect(vi.mocked(getImportSessions)).toHaveBeenCalledWith(expect.anything(), "user-1", {
      sort: "created_asc",
      status: "failed",
      page: 1,
      pageSize: 10,
    });
  });

  it("size z puli → pageSize dla serwisu; spoza puli → domyślny 10", async () => {
    await GET(getCtx("?size=50"));
    expect(vi.mocked(getImportSessions)).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ pageSize: 50 }),
    );
    vi.mocked(getImportSessions).mockClear();
    await GET(getCtx("?size=7"));
    expect(vi.mocked(getImportSessions)).toHaveBeenCalledWith(
      expect.anything(),
      "user-1",
      expect.objectContaining({ pageSize: 10 }),
    );
  });

  // status=all (lub brak) → serwis dostaje status undefined (brak filtra).
  it("brak statusu → status undefined dla serwisu (brak filtra)", async () => {
    await GET(getCtx("?sort=created_asc"));
    expect(vi.mocked(getImportSessions)).toHaveBeenCalledWith(expect.anything(), "user-1", {
      sort: "created_asc",
      status: undefined,
      page: 1,
      pageSize: 10,
    });
  });

  // Niepoprawny sort/status NIE daje 400 — tolerancyjny parser cofa je do domyślnych; page<1 → 1.
  it("niepoprawny sort/status + page=0 tolerowane → 200, fallback (status undefined, sort created_desc, page 1)", async () => {
    const res = await GET(getCtx("?status=bogus&sort=sideways&page=0"));
    expect(res.status).toBe(200);
    expect(vi.mocked(getImportSessions)).toHaveBeenCalledWith(expect.anything(), "user-1", {
      sort: "created_desc",
      status: undefined,
      page: 1,
      pageSize: 10,
    });
  });

  it("pusta strona → 200, rows: []", async () => {
    vi.mocked(getImportSessions).mockResolvedValue({ sessions: [], total: 0, page: 1, pageSize: 20 });
    const res = await GET(getCtx("?status=processing"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ListBody;
    expect(body).toMatchObject({ ok: true, rows: [], total: 0 });
  });

  it("rzut serwisu → 500 generyczne", async () => {
    vi.mocked(getImportSessions).mockRejectedValue(new Error("boom"));
    const res = await GET(getCtx("?status=failed"));
    expect(res.status).toBe(500);
    expect(((await res.json()) as ListBody).code).toBe("internal");
  });
});
