import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Testy RLS tabeli `profiles` przeciw lokalnemu Supabase. Dwóch userów tworzymy przez
// signUp (config.toml enable_confirmations=false → sesja od razu, bez service_role),
// po czym sprawdzamy, że user nie odczytuje ani nie modyfikuje wiersza drugiego.

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";

const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  // email unikalny per przebieg; hasło spełnia minimum 6 znaków (config.toml).
  const email = `s01-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("signUp nie zwrócił usera (sprawdź enable_confirmations=false)");
  return { supabase, id };
}

d("profiles RLS — izolacja per-user", () => {
  let A: Awaited<ReturnType<typeof signUpClient>>;
  let B: Awaited<ReturnType<typeof signUpClient>>;

  beforeAll(async () => {
    A = await signUpClient("a");
    B = await signUpClient("b");
    // A zapisuje swój wiersz profilu (klucz to dowolny tekst — to test RLS, nie crypto).
    const { error } = await A.supabase
      .from("profiles")
      .upsert({ id: A.id, api_key_encrypted: "v1.iv.ct", api_key_hint: "sk-…AAAA" }, { onConflict: "id" });
    expect(error).toBeNull();
  });

  afterAll(async () => {
    await A.supabase.auth.signOut();
    await B.supabase.auth.signOut();
  });

  it("A widzi własny wiersz", async () => {
    const { data, error } = await A.supabase.from("profiles").select("id, api_key_hint").eq("id", A.id).single();
    expect(error).toBeNull();
    expect(data?.id).toBe(A.id);
    expect(data?.api_key_hint).toBe("sk-…AAAA");
  });

  it("B nie widzi wiersza A (RLS select)", async () => {
    const { data } = await B.supabase.from("profiles").select("id").eq("id", A.id);
    expect(data).toEqual([]);
  });

  it("B nie modyfikuje wiersza A (RLS update → 0 wierszy)", async () => {
    const { data } = await B.supabase.from("profiles").update({ api_key_hint: "HACKED" }).eq("id", A.id).select();
    expect(data).toEqual([]);
    // A nadal ma oryginalny hint.
    const check = await A.supabase.from("profiles").select("api_key_hint").eq("id", A.id).single();
    expect(check.data?.api_key_hint).toBe("sk-…AAAA");
  });

  it("anon bez sesji nie czyta profiles (RLS)", async () => {
    // Klient z kluczem anon, BEZ signUp → rola `anon`. Polityki są `to authenticated`,
    // więc żaden wiersz nie jest widoczny (RLS filtruje do pustego zbioru, bez błędu).
    const anon = client();
    const { data } = await anon.from("profiles").select("id").eq("id", A.id);
    expect(data).toEqual([]);
  });
});
