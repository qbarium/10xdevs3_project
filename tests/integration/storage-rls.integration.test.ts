import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Testy RLS prywatnego bucketa `import-files` (storage.objects) — S-02 Faza 6 (PR2).
// Izolacja per-user idzie po PIERWSZYM segmencie ścieżki <user_id>/..., nie po kolumnie
// (storage.objects nie ma user_id). Dwóch userów przez signUp (config.toml
// enable_confirmations=false → sesja od razu, bez service_role); wzorzec z
// `classification-rls.integration.test.ts`. WYMAGA włączonego Storage (config.toml
// [storage] enabled=true) + zrestartowanego stacka (kontener storage UP).

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";

const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

const BUCKET = "import-files";

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  // email unikalny per przebieg; hasło spełnia minimum 6 znaków (config.toml).
  const email = `s02-storage-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("signUp nie zwrócił usera (sprawdź enable_confirmations=false)");
  return { supabase, id };
}

d("RLS: storage bucket import-files (S-02 Faza 6)", () => {
  let A: Awaited<ReturnType<typeof signUpClient>>;
  let B: Awaited<ReturnType<typeof signUpClient>>;
  const sessionId = crypto.randomUUID();
  const fileId = crypto.randomUUID();
  let pathA = "";
  const body = new Blob(["poufny wsad usera A"], { type: "text/plain" });

  beforeAll(async () => {
    A = await signUpClient("a");
    B = await signUpClient("b");
    // Konwencja Faza 7: <user_id>/<session_id>/<file_id>.<ext>. A wgrywa pod własny prefiks.
    pathA = `${A.id}/${sessionId}/${fileId}.txt`;
    const up = await A.supabase.storage.from(BUCKET).upload(pathA, body, { contentType: "text/plain" });
    expect(up.error).toBeNull();
  });

  afterAll(async () => {
    // Sprzątanie: właściciel usuwa swój obiekt (RLS delete na własnym prefiksie).
    await A.supabase.storage.from(BUCKET).remove([pathA]);
    await A.supabase.auth.signOut();
    await B.supabase.auth.signOut();
  });

  it("właściciel pobiera swój obiekt (RLS select)", async () => {
    const { data, error } = await A.supabase.storage.from(BUCKET).download(pathA);
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    const text = await data?.text();
    expect(text).toContain("poufny wsad usera A");
  });

  it("B nie pobiera cudzego obiektu (RLS select → błąd, nie dane)", async () => {
    const { data, error } = await B.supabase.storage.from(BUCKET).download(pathA);
    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });

  it("B nie wgrywa do cudzego prefiksu (RLS insert odrzucony)", async () => {
    const intruder = new Blob(["proba B"], { type: "text/plain" });
    const { error } = await B.supabase.storage
      .from(BUCKET)
      .upload(`${A.id}/${sessionId}/${crypto.randomUUID()}.txt`, intruder, { contentType: "text/plain" });
    expect(error).not.toBeNull();
  });

  it("A nie wgrywa poza własny prefiks (RLS insert odrzucony)", async () => {
    const stray = new Blob(["poza prefiksem"], { type: "text/plain" });
    const { error } = await A.supabase.storage
      .from(BUCKET)
      .upload(`${B.id}/${sessionId}/${crypto.randomUUID()}.txt`, stray, { contentType: "text/plain" });
    expect(error).not.toBeNull();
  });
});
