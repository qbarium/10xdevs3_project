import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Testy RLS tabeli `import_files` (S-02 Faza 6, PR2) — izolacja per-user po kolumnie user_id
// (wzorzec items/import_sessions). Dowodzi, że granica "sesja → wiele plików" jest egzekwowana
// w SCHEMACIE, niezależnie od warstwy Storage (RLS storage.objects testuje storage-rls.*).
// Dwóch userów przez signUp (config.toml enable_confirmations=false → sesja bez service_role).

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";

const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  const email = `s02-files-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("signUp nie zwrócił usera (sprawdź enable_confirmations=false)");
  return { supabase, id };
}

d("RLS: import_files (S-02 Faza 6)", () => {
  let A: Awaited<ReturnType<typeof signUpClient>>;
  let B: Awaited<ReturnType<typeof signUpClient>>;
  const sessionId = crypto.randomUUID();
  const fileId = crypto.randomUUID();

  beforeAll(async () => {
    A = await signUpClient("a");
    B = await signUpClient("b");

    // A tworzy sesję importu, potem plik powiązany z tą sesją (model docelowy: wiele plików/sesję).
    const sess = await A.supabase
      .from("import_sessions")
      .insert({ id: sessionId, user_id: A.id, status: "processing", raw_input: null });
    expect(sess.error).toBeNull();

    const file = await A.supabase.from("import_files").insert({
      id: fileId,
      user_id: A.id,
      session_id: sessionId,
      file_path: `${A.id}/${sessionId}/${fileId}.txt`,
      file_name: "notatki.txt",
      file_mime: "text/plain",
    });
    expect(file.error).toBeNull();
  });

  afterAll(async () => {
    await A.supabase.auth.signOut();
    await B.supabase.auth.signOut();
  });

  it("właściciel widzi swój plik (RLS select)", async () => {
    const { data, error } = await A.supabase.from("import_files").select("id, file_name").eq("id", fileId).single();
    expect(error).toBeNull();
    expect(data?.file_name).toBe("notatki.txt");
  });

  it("B nie widzi cudzego pliku (RLS select → pusto)", async () => {
    const { data } = await B.supabase.from("import_files").select("id").eq("id", fileId);
    expect(data).toEqual([]);
  });

  it("B nie wstawia pliku z cudzym user_id (RLS insert with check)", async () => {
    const { error } = await B.supabase.from("import_files").insert({
      user_id: A.id, // podszycie się pod A
      session_id: sessionId,
      file_path: `${A.id}/${sessionId}/${crypto.randomUUID()}.txt`,
      file_name: "podszycie.txt",
    });
    expect(error).not.toBeNull();
  });

  it("FK session_id wskazuje import_sessions(id) — nieistniejąca sesja odrzucona", async () => {
    const { error } = await A.supabase.from("import_files").insert({
      user_id: A.id,
      session_id: "00000000-0000-4000-8000-000000000000",
      file_path: `${A.id}/martwa/${crypto.randomUUID()}.txt`,
      file_name: "martwa-sesja.txt",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23503"); // foreign_key_violation
  });
});
