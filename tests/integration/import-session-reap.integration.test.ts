import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { reapStaleProcessing } from "@/lib/services/import-session";

// Integ-test reapera nieświeżych sesji `processing` (Faza 5 / runtime ryzyka #3) przeciw lokalnemu
// Supabase. Dowodzi: (1) `processing` starsza niż próg → `failed` z kodem `timeout`; (2) świeża
// `processing` nietknięta; (3) reaper jest per-user (RLS + jawny user_id) — A nie rusza sesji B.
// Próg reapera to 5 min; „nieświeżą" symulujemy jawnym `created_at` 10 min w przeszłości.

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";

const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

const TEN_MIN_AGO = () => new Date(Date.now() - 10 * 60_000).toISOString();

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  const email = `s5reap-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("signUp nie zwrócił usera (sprawdź enable_confirmations=false)");
  return { supabase, id };
}

/** Wstawia sesję `processing` z JAWNYM `created_at` (do symulacji nieświeżości). */
async function insertProcessing(supabase: SupabaseClient, userId: string, createdAtIso: string): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await supabase
    .from("import_sessions")
    .insert({ id, user_id: userId, status: "processing", raw_input: "reap test", created_at: createdAtIso });
  if (error) throw error;
  return id;
}

async function statusOf(
  supabase: SupabaseClient,
  id: string,
): Promise<{ status: string; error_message: string | null }> {
  const { data, error } = await supabase.from("import_sessions").select("status, error_message").eq("id", id).single();
  if (error) throw error;
  return data;
}

d("reapStaleProcessing (Faza 5 / runtime ryzyka #3)", () => {
  let A: Awaited<ReturnType<typeof signUpClient>>;
  let B: Awaited<ReturnType<typeof signUpClient>>;

  beforeAll(async () => {
    A = await signUpClient("a");
    B = await signUpClient("b");
  });

  afterAll(async () => {
    await A.supabase.auth.signOut();
    await B.supabase.auth.signOut();
  });

  it("nieświeża `processing` (starsza niż próg) → failed z kodem timeout", async () => {
    const staleId = await insertProcessing(A.supabase, A.id, TEN_MIN_AGO());
    await reapStaleProcessing(A.supabase, A.id);
    const s = await statusOf(A.supabase, staleId);
    expect(s.status).toBe("failed");
    expect(s.error_message).toBe("timeout");
  });

  it("świeża `processing` (młodsza niż próg) → nietknięta", async () => {
    const freshId = await insertProcessing(A.supabase, A.id, new Date().toISOString());
    await reapStaleProcessing(A.supabase, A.id);
    const s = await statusOf(A.supabase, freshId);
    expect(s.status).toBe("processing");
  });

  it("reaper usera A nie rusza nieświeżej `processing` usera B (RLS + jawny user_id)", async () => {
    const bStaleId = await insertProcessing(B.supabase, B.id, TEN_MIN_AGO());
    await reapStaleProcessing(A.supabase, A.id); // A reapuje TYLKO swoje
    const s = await statusOf(B.supabase, bStaleId);
    expect(s.status).toBe("processing"); // sesja B nietknięta — reaper jest per-user
  });
});
