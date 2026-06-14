import { describe, expect, it, vi } from "vitest";

import { getImportSessions, getSessionForRetry, reopenSession } from "@/lib/services/import-session";
import type { SupabaseClient } from "@supabase/supabase-js";

// Chainable mock buildera Supabase: każda metoda zwraca builder; builder jest awaitable (`then`),
// więc terminalny `await` (po .order / .select / .maybeSingle) daje { data, error }. Inspekcja
// argumentów przez `builder.<m>.mock.calls`.
function mockSupabase(result: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> & {
    then?: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => unknown;
  } = {};
  for (const m of ["select", "eq", "order", "update", "maybeSingle"]) {
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

describe("getImportSessions (S-08) — listowanie dziennika", () => {
  it("filtruje po userze, domyślnie sortuje malejąco i mapuje metadane pliku z LEFT JOIN", async () => {
    const { client, builder } = mockSupabase({
      data: [{ ...baseRow, import_files: [{ file_name: "notatki.txt", file_mime: "text/plain" }] }],
      error: null,
    });
    const sessions = await getImportSessions(client, "u1");
    expect(builder.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: "s1", file_name: "notatki.txt", file_mime: "text/plain" });
    // pole pomocnicze import_files nie wycieka do wyniku
    expect("import_files" in sessions[0]).toBe(false);
  });

  it("paste bez pliku → file_name/file_mime null", async () => {
    const { client } = mockSupabase({ data: [{ ...baseRow, import_files: [] }], error: null });
    const [s] = await getImportSessions(client, "u1");
    expect(s.file_name).toBeNull();
    expect(s.file_mime).toBeNull();
  });

  it("sort created_asc → ascending true; filtr statusu → dodatkowy eq", async () => {
    const { client, builder } = mockSupabase({ data: [], error: null });
    await getImportSessions(client, "u1", { sort: "created_asc", status: "failed" });
    expect(builder.order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(builder.eq).toHaveBeenCalledWith("status", "failed");
  });

  it("błąd zapytania → rzuca", async () => {
    const { client } = mockSupabase({ data: null, error: { message: "boom" } });
    await expect(getImportSessions(client, "u1")).rejects.toThrow();
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
