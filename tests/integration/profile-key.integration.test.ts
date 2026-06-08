import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Serwis profile-key wołany przez endpoint /api/profile/byok-key — pełna ścieżka POST→GET→DELETE
// nad lokalnym Supabase (RLS przez klienta usera) + roundtrip koperty tym samym KEK.
// KEK statyczny (32 bajty base64) wstrzyknięty mockiem `astro:env/server` — crypto bez zależności
// od `.dev.vars`. Faktoria nie odwołuje się do zmiennych zewnętrznych (hoisting vi.mock ponad importy).
vi.mock("astro:env/server", () => {
  let binary = "";
  for (let i = 0; i < 32; i++) binary += String.fromCharCode(7);
  return { BYOK_KEK: btoa(binary) };
});

import { decryptApiKey } from "@/lib/services/byok-crypto";
import { deleteApiKey, getKeyStatus, saveApiKey } from "@/lib/services/profile-key";

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";

const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  const email = `s01-svc-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("signUp nie zwrócił usera (sprawdź enable_confirmations=false)");
  return { supabase, id };
}

d("profile-key serwis — zapis/status/usuń + roundtrip koperty", () => {
  let A: Awaited<ReturnType<typeof signUpClient>>;
  const plain = "sk-proj-INTEGRACYJNY-KLUCZ-TESTOWY-AB12";

  beforeAll(async () => {
    A = await signUpClient("a");
  });

  afterAll(async () => {
    await A.supabase.auth.signOut();
  });

  it("saveApiKey: configured:true, hint prefiks+sufiks, updatedAt ustawiony", async () => {
    const status = await saveApiKey(A.supabase, A.id, plain);
    expect(status.configured).toBe(true);
    expect(status.hint).toBe("sk-…AB12");
    expect(status.updatedAt).toBeTruthy();
  });

  it("koperta w DB odszyfrowuje się tym samym KEK do oryginału", async () => {
    const { data, error } = await A.supabase.from("profiles").select("api_key_encrypted").eq("id", A.id).single();
    expect(error).toBeNull();
    const envelope = data?.api_key_encrypted as string;
    expect(envelope).toBeTruthy();
    expect(await decryptApiKey(envelope)).toBe(plain);
  });

  it("getKeyStatus: configured:true z hintem (bez koperty)", async () => {
    const status = await getKeyStatus(A.supabase, A.id);
    expect(status.configured).toBe(true);
    expect(status.hint).toBe("sk-…AB12");
  });

  it("deleteApiKey zeruje → getKeyStatus configured:false", async () => {
    await deleteApiKey(A.supabase, A.id);
    expect(await getKeyStatus(A.supabase, A.id)).toEqual({
      configured: false,
      hint: null,
      updatedAt: null,
    });
  });

  it("getKeyStatus na braku wiersza → configured:false (idempotentne)", async () => {
    const B = await signUpClient("b");
    expect(await getKeyStatus(B.supabase, B.id)).toEqual({
      configured: false,
      hint: null,
      updatedAt: null,
    });
    await B.supabase.auth.signOut();
  });

  it("deleteApiKey na braku wiersza → no-op (idempotentne)", async () => {
    const C = await signUpClient("c");
    await expect(deleteApiKey(C.supabase, C.id)).resolves.toBeUndefined();
    await C.supabase.auth.signOut();
  });
});
