import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Testy RLS tabel `items` / `import_sessions` przeciw lokalnemu Supabase (S-02 Faza 1).
// Dwóch userów przez signUp (config.toml enable_confirmations=false → sesja od razu, bez
// service_role); sprawdzamy izolację select/update oraz że FK `items.import_session_id`
// wskazuje `import_sessions(id)`. Wzorzec z `profiles-rls.integration.test.ts`.

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";

const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

// Poprawny format UUID, którego praktycznie na pewno nie ma w bazie — do testu naruszenia FK.
const NONEXISTENT_SESSION = "00000000-0000-4000-8000-000000000000";

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  // email unikalny per przebieg; hasło spełnia minimum 6 znaków (config.toml).
  const email = `s02-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("signUp nie zwrócił usera (sprawdź enable_confirmations=false)");
  return { supabase, id };
}

d("RLS: items + import_sessions (S-02 Faza 1)", () => {
  let A: Awaited<ReturnType<typeof signUpClient>>;
  let B: Awaited<ReturnType<typeof signUpClient>>;
  // Generujemy id po stronie klienta (kolumna akceptuje jawne `id`); kolumna ma default
  // gen_random_uuid(), ale jawne id czyni test deterministycznym i omija odczyt luźno
  // typowanego `data` (unika unsafe-any / non-null assertion w lint).
  const sessionId = crypto.randomUUID();
  const itemId = crypto.randomUUID();

  beforeAll(async () => {
    A = await signUpClient("a");
    B = await signUpClient("b");

    // A tworzy sesję importu (status processing).
    const sess = await A.supabase
      .from("import_sessions")
      .insert({ id: sessionId, user_id: A.id, status: "processing", raw_input: "poufny wsad usera A" });
    expect(sess.error).toBeNull();

    // A tworzy item powiązany z sesją (type=task → operational_status ustawialny).
    const item = await A.supabase.from("items").insert({
      id: itemId,
      user_id: A.id,
      import_session_id: sessionId,
      type: "task",
      title: "Zadanie A",
      description: "opis A",
      acceptance_status: "pending",
      operational_status: "new",
    });
    expect(item.error).toBeNull();
  });

  afterAll(async () => {
    await A.supabase.auth.signOut();
    await B.supabase.auth.signOut();
  });

  it("właściciel widzi swoją sesję i swój item", async () => {
    const sess = await A.supabase.from("import_sessions").select("id").eq("id", sessionId).single();
    expect(sess.error).toBeNull();
    expect(sess.data?.id).toBe(sessionId);
    const item = await A.supabase.from("items").select("id, title").eq("id", itemId).single();
    expect(item.data?.title).toBe("Zadanie A");
  });

  it("B nie widzi cudzej sesji ani itemu (RLS select)", async () => {
    const sessions = await B.supabase.from("import_sessions").select("id").eq("id", sessionId);
    expect(sessions.data).toEqual([]);
    const items = await B.supabase.from("items").select("id").eq("id", itemId);
    expect(items.data).toEqual([]);
  });

  it("B nie modyfikuje cudzego itemu (RLS update → 0 wierszy)", async () => {
    const { data } = await B.supabase.from("items").update({ title: "HACKED" }).eq("id", itemId).select();
    expect(data).toEqual([]);
    // A nadal ma oryginalny tytuł.
    const check = await A.supabase.from("items").select("title").eq("id", itemId).single();
    expect(check.data?.title).toBe("Zadanie A");
  });

  it("FK items.import_session_id wskazuje import_sessions(id) — nieistniejąca sesja odrzucona", async () => {
    const { error } = await A.supabase.from("items").insert({
      user_id: A.id,
      import_session_id: NONEXISTENT_SESSION,
      type: "note",
      title: "item z martwą sesją",
    });
    expect(error).not.toBeNull();
    expect(error?.code).toBe("23503"); // foreign_key_violation
  });

  it("anon bez sesji nie czyta items/import_sessions (RLS)", async () => {
    // Klient z kluczem anon, BEZ signUp → rola `anon`. Polityki są `to authenticated`,
    // więc żaden wiersz nie jest widoczny (RLS filtruje do pustego zbioru, bez błędu).
    const anon = client();
    expect((await anon.from("items").select("id").eq("id", itemId)).data).toEqual([]);
    expect((await anon.from("import_sessions").select("id").eq("id", sessionId)).data).toEqual([]);
  });
});
