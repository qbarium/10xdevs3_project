import { describe, expect, it, vi } from "vitest";

import { getImportSessions, getSessionForRetry, reopenSession, toSessionRow } from "@/lib/services/import-session";
import { SESSION_PAGE_SIZE } from "@/lib/services/session-list-criteria";
import type { ImportSessionWithFile } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// Chainable mock buildera Supabase: każda metoda zwraca builder; builder jest awaitable (`then`),
// więc terminalny `await` (po .order / .range / .maybeSingle) daje { data, error, count }. Inspekcja
// argumentów przez `builder.<m>.mock.calls`.
function mockSupabase(result: { data: unknown; error: unknown; count?: number | null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => unknown;
  } = {};
  for (const m of ["select", "eq", "order", "range", "update", "maybeSingle"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient, builder, from };
}

const baseRow = {
  id: "s1",
  user_id: "u1",
  status: "failed",
  raw_input: "wsad",
  item_count: null,
  error_message: "invalid_key",
  created_at: "2026-06-13T00:00:00Z",
  updated_at: "2026-06-13T00:00:00Z",
};

describe("getImportSessions (S-08/S-11) — strona dziennika", () => {
  it("filtruje po userze, domyślnie sortuje malejąco i mapuje metadane pliku + live_item_count", async () => {
    const { client, builder } = mockSupabase({
      data: [
        {
          ...baseRow,
          import_files: [{ file_name: "notatki.txt", file_mime: "text/plain" }],
          items: [{ count: 3 }],
        },
      ],
      error: null,
      count: 1,
    });
    const { sessions } = await getImportSessions(client, "u1");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      id: "s1",
      file_name: "notatki.txt",
      file_mime: "text/plain",
      live_item_count: 3, // count z embedowanego items(count)
    });
    // pola pomocnicze embedów nie wyciekają do wyniku
    expect("import_files" in sessions[0]).toBe(false);
    expect("items" in sessions[0]).toBe(false);
  });

  it("paste bez pliku → file_name/file_mime null; brak embeda items → live_item_count 0", async () => {
    const { client } = mockSupabase({ data: [{ ...baseRow, import_files: [] }], error: null, count: 1 });
    const {
      sessions: [s],
    } = await getImportSessions(client, "u1");
    expect(s.file_name).toBeNull();
    expect(s.file_mime).toBeNull();
    expect(s.live_item_count).toBe(0);
  });

  it("sort created_asc → ascending true (oba .order); filtr statusu → dodatkowy eq", async () => {
    const { client, builder } = mockSupabase({ data: [], error: null, count: 0 });
    await getImportSessions(client, "u1", { sort: "created_asc", status: "failed" });
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(builder.order).toHaveBeenCalledWith("id", { ascending: true }); // tie-break ten sam kierunek
    expect(builder.eq).toHaveBeenCalledWith("status", "failed");
  });

  it("tie-break: domyślnie dokłada .order('id', desc) po .order('created_at', desc)", async () => {
    const { client, builder } = mockSupabase({ data: [], error: null, count: 0 });
    await getImportSessions(client, "u1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(builder.order).toHaveBeenCalledWith("id", { ascending: false });
  });

  it("paginacja: range(from,to) wg page/pageSize i total z count", async () => {
    const { client, builder } = mockSupabase({ data: [], error: null, count: 42 });
    const result = await getImportSessions(client, "u1", { page: 3, pageSize: 10 });
    expect(builder.range).toHaveBeenCalledWith(20, 29); // (3-1)*10 .. +10-1
    expect(result).toMatchObject({ total: 42, page: 3, pageSize: 10 });
  });

  it("domyślna strona 1 → range(0, SESSION_PAGE_SIZE-1); count null → total 0", async () => {
    const { client, builder } = mockSupabase({ data: [], error: null, count: null });
    const result = await getImportSessions(client, "u1");
    expect(builder.range).toHaveBeenCalledWith(0, SESSION_PAGE_SIZE - 1);
    expect(result).toMatchObject({ total: 0, page: 1, pageSize: SESSION_PAGE_SIZE });
  });

  it("page < 1 → clamp do 1 (range od 0)", async () => {
    const { client, builder } = mockSupabase({ data: [], error: null, count: 0 });
    const result = await getImportSessions(client, "u1", { page: 0, pageSize: 5 });
    expect(builder.range).toHaveBeenCalledWith(0, 4);
    expect(result.page).toBe(1);
  });

  it("błąd zapytania → rzuca", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "boom" }, count: null });
    await expect(getImportSessions(client, "u1")).rejects.toThrow();
  });
});

describe("toSessionRow (S-11) — mapowanie wiersza na DTO wyspy", () => {
  function session(over: Partial<ImportSessionWithFile>): ImportSessionWithFile {
    return {
      id: "s1",
      user_id: "u1",
      status: "completed_with_items",
      raw_input: null,
      item_count: 2,
      error_message: null,
      created_at: "2026-06-13T09:30:45Z",
      updated_at: "2026-06-13T09:30:45Z",
      file_name: null,
      file_mime: null,
      live_item_count: 2,
      ...over,
    };
  }

  it("plik → preview to nazwa pliku, isFile true", () => {
    const row = toSessionRow(session({ file_name: "notatki.txt" }));
    expect(row).toMatchObject({ isFile: true, preview: "notatki.txt" });
  });

  it("paste → preview z raw_input (spacje zwinięte), isFile false", () => {
    const row = toSessionRow(session({ raw_input: "  kup   mleko\n i chleb " }));
    expect(row.isFile).toBe(false);
    expect(row.preview).toBe("kup mleko i chleb");
  });

  it("pusty wsad → placeholder „(pusty wsad)”", () => {
    expect(toSessionRow(session({ raw_input: "   " })).preview).toBe("(pusty wsad)");
  });

  it("długi raw_input → ucięty do 120 znaków + wielokropek", () => {
    const row = toSessionRow(session({ raw_input: "a".repeat(200) }));
    expect(row.preview).toHaveLength(121); // 120 znaków + „…"
    expect(row.preview.endsWith("…")).toBe(true);
  });

  it("dateLabel: 'YYYY-MM-DD HH:mm' z created_at", () => {
    expect(toSessionRow(session({ created_at: "2026-06-13T09:30:45Z" })).dateLabel).toBe("2026-06-13 09:30");
  });
});

describe("getSessionForRetry (S-08)", () => {
  it("brak wiersza (null / cudza sesja przez RLS) → null", async () => {
    const { client } = mockSupabase({ data: null, error: null });
    expect(await getSessionForRetry(client, "u1", "s1")).toBeNull();
  });

  it("zwraca sesję + pierwszy plik (z file_path do downloadu)", async () => {
    const file = {
      id: "f1",
      user_id: "u1",
      session_id: "s1",
      file_path: "u1/s1/f1.txt",
      file_name: "n.txt",
      file_mime: "text/plain",
      created_at: "2026-06-13T00:00:00Z",
    };
    const { client, builder } = mockSupabase({ data: { ...baseRow, import_files: [file] }, error: null });
    const session = await getSessionForRetry(client, "u1", "s1");
    expect(builder.eq).toHaveBeenCalledWith("id", "s1");
    expect(session?.file?.file_path).toBe("u1/s1/f1.txt");
    expect("import_files" in (session ?? {})).toBe(false);
  });

  it("błąd zapytania → rzuca", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(getSessionForRetry(client, "u1", "s1")).rejects.toThrow();
  });
});

describe("reopenSession (S-08) — warunkowy guard TOCTOU", () => {
  it("przestawia failed→processing i zwraca true gdy zmieniono wiersz", async () => {
    const { client, builder } = mockSupabase({ data: [{ id: "s1" }], error: null });
    const ok = await reopenSession(client, "s1");
    expect(ok).toBe(true);
    expect(builder.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "processing", error_message: null, item_count: null }),
    );
    expect(builder.eq).toHaveBeenCalledWith("status", "failed"); // atomowy warunek
    expect(builder.eq).toHaveBeenCalledWith("id", "s1");
  });

  it("0 zmienionych wierszy (równoległe ponowienie wygrało) → false", async () => {
    const { client } = mockSupabase({ data: [], error: null });
    expect(await reopenSession(client, "s1")).toBe(false);
  });

  it("błąd update → rzuca", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(reopenSession(client, "s1")).rejects.toThrow();
  });
});
