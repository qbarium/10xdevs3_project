import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSession, failSession, finalizeEmpty, persistItems } from "@/lib/services/import-session";

// Integ-test serwisu sesji importu + RPC persist_classification przeciw lokalnemu Supabase (S-02 Faza 3).
// Dowodzi: atomowy zapis (itemy + status sesji), mapowanie operational_status, completed_no_items,
// failSession oraz izolację RLS itemów wstawionych przez RPC. Czyta pola przez count (lint-safe).

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";

const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  const email = `s02e-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("signUp nie zwrócił usera (sprawdź enable_confirmations=false)");
  return { supabase, id };
}

d("import-session serwis + RPC (S-02 Faza 3)", () => {
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

  it("persistItems: atomowy zapis itemów + finalizacja sesji (completed_with_items)", async () => {
    const { id } = await createSession(A.supabase, A.id, "wsad A");
    const count = await persistItems(A.supabase, id, [
      { type: "task", title: "Zadanie", description: "opis" },
      { type: "note", title: "Notatka", description: "" },
    ]);
    expect(count).toBe(2);

    // Sesja sfinalizowana z item_count=2.
    const sess = await A.supabase
      .from("import_sessions")
      .select("id", { count: "exact", head: true })
      .eq("id", id)
      .eq("status", "completed_with_items")
      .eq("item_count", 2);
    expect(sess.count).toBe(1);

    // S-04: RPC persist_classification wstawia 'new' dla KAŻDEGO typu (było: tylko task, note → null);
    // oba itemy 'pending'.
    const taskNew = await A.supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("import_session_id", id)
      .eq("type", "task")
      .eq("operational_status", "new");
    expect(taskNew.count).toBe(1);

    const noteNew = await A.supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("import_session_id", id)
      .eq("type", "note")
      .eq("operational_status", "new");
    expect(noteNew.count).toBe(1);

    const pending = await A.supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("import_session_id", id)
      .eq("acceptance_status", "pending");
    expect(pending.count).toBe(2);

    // RLS: user B nie widzi itemów wstawionych przez RPC dla sesji A.
    const bView = await B.supabase
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("import_session_id", id);
    expect(bView.count).toBe(0);
  });

  it("finalizeEmpty: status completed_no_items, item_count 0", async () => {
    const { id } = await createSession(A.supabase, A.id, "pusty wynik");
    await finalizeEmpty(A.supabase, id);
    const sess = await A.supabase
      .from("import_sessions")
      .select("id", { count: "exact", head: true })
      .eq("id", id)
      .eq("status", "completed_no_items")
      .eq("item_count", 0);
    expect(sess.count).toBe(1);
  });

  it("failSession: status failed + kod w error_message", async () => {
    const { id } = await createSession(A.supabase, A.id, "błąd");
    await failSession(A.supabase, id, "provider");
    const sess = await A.supabase
      .from("import_sessions")
      .select("id", { count: "exact", head: true })
      .eq("id", id)
      .eq("status", "failed")
      .eq("error_message", "provider");
    expect(sess.count).toBe(1);
  });
});
