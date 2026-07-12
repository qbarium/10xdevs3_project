import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createSession } from "@/lib/services/import-session";
import { getSessionItems, listItems } from "@/lib/services/items";
import { setOperationalStatus } from "@/lib/services/items-mutation";
import { defaultCriteria } from "@/lib/services/list-criteria";

// Stan operacyjny S-04 przeciw lokalnemu Supabase. Dwóch userów przez signUp (config.toml
// enable_confirmations=false → sesja od razu). Sprawdzamy: izolację RLS (B nie zmienia stanu
// itemu A), guard `accepted` w setOperationalStatus (pending/rejected pominięte), oraz rozłączność
// trzech podzbiorów odczytu filtra głównego (Aktywne/Zakończone/Anulowane).

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  const email = `s04-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
  const { data, error } = await supabase.auth.signUp({ email, password: "test-password-123" });
  if (error) throw error;
  const id = data.user?.id;
  if (!id) throw new Error("signUp nie zwrócił usera (sprawdź enable_confirmations=false)");
  return { supabase, id };
}

async function insertItem(
  supabase: SupabaseClient,
  userId: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  const { data, error } = await supabase
    .from("items")
    .insert({
      user_id: userId,
      import_session_id: null,
      type: "task",
      title: "T",
      description: null,
      acceptance_status: "accepted",
      operational_status: "new",
      ...over,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

async function operationalOf(supabase: SupabaseClient, id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("items")
    .select("operational_status")
    .eq("id", id)
    .single<{ operational_status: string | null }>();
  if (error) throw error;
  return data.operational_status;
}

d("items-operational — RLS + guard accepted + rozłączne podzbiory (integracja S-04)", () => {
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

  it("B nie zmienia stanu itemu A (RLS → updatedIds puste, stan bez zmian)", async () => {
    const itemId = await insertItem(A.supabase, A.id, { acceptance_status: "accepted", operational_status: "new" });
    const res = await setOperationalStatus(B.supabase, [itemId], "done");
    expect(res.updatedIds).toEqual([]);
    expect(await operationalOf(A.supabase, itemId)).toBe("new");
  });

  it("guard accepted: zmienia tylko accepted, pomija pending; zwraca id accepted", async () => {
    const acceptedId = await insertItem(A.supabase, A.id, { acceptance_status: "accepted", operational_status: "new" });
    const pendingId = await insertItem(A.supabase, A.id, { acceptance_status: "pending", operational_status: "new" });

    const res = await setOperationalStatus(A.supabase, [acceptedId, pendingId], "done");

    expect(res.updatedIds).toEqual([acceptedId]); // pending pominięty (guard accepted), count = 1 nie 2
    expect(await operationalOf(A.supabase, acceptedId)).toBe("done");
    expect(await operationalOf(A.supabase, pendingId)).toBe("new"); // niezmieniony (guard)
  });

  it("listItems (active/done/cancelled) zwraca rozłączne podzbiory accepted", async () => {
    const activeNew = await insertItem(A.supabase, A.id, { operational_status: "new" });
    const activeInProgress = await insertItem(A.supabase, A.id, { operational_status: "in_progress" });
    const doneId = await insertItem(A.supabase, A.id, { operational_status: "done" });
    const cancelledId = await insertItem(A.supabase, A.id, { operational_status: "cancelled" });
    // pending (z dowolnym stanem operacyjnym) NIE wpada do żadnego widoku accepted.
    const pendingId = await insertItem(A.supabase, A.id, { acceptance_status: "pending", operational_status: "new" });

    const active = (await listItems(A.supabase, A.id, defaultCriteria("active"))).items.map((i) => i.id);
    const done = (await listItems(A.supabase, A.id, defaultCriteria("done"))).items.map((i) => i.id);
    const cancelled = (await listItems(A.supabase, A.id, defaultCriteria("cancelled"))).items.map((i) => i.id);

    // Aktywne = new ∪ in_progress; nie zawiera done/cancelled/pending.
    expect(active).toContain(activeNew);
    expect(active).toContain(activeInProgress);
    expect(active).not.toContain(doneId);
    expect(active).not.toContain(cancelledId);
    expect(active).not.toContain(pendingId);

    // Zakończone = done; rozłączne z Aktywne i Anulowane.
    expect(done).toContain(doneId);
    expect(done).not.toContain(activeNew);
    expect(done).not.toContain(cancelledId);

    // Anulowane = cancelled; rozłączne z Aktywne i Zakończone.
    expect(cancelled).toContain(cancelledId);
    expect(cancelled).not.toContain(doneId);
    expect(cancelled).not.toContain(activeNew);
  });

  // --- IDOR odczytu itemów: getSessionItems (podwójny filtr user_id+import_session_id) + listItems ---
  // Cudza sesja → pusta lista (nie błąd, nie cudze dane), a aktywna lista B nie zawiera itemu A.
  // Domyka lukę „listItems testowany dziś tylko jednym userem" — przypina WYKLUCZENIE cross-user.
  it("B nie odczytuje itemów sesji A (getSessionItems pusto) ani nie widzi ich w listItems", async () => {
    // A: sesja + aktywny item w niej (accepted/new → wpada do widoku „active").
    const { id: sessionA } = await createSession(A.supabase, A.id, "wsad A");
    const itemA = await insertItem(A.supabase, A.id, { import_session_id: sessionA });

    // getSessionItems: cudza sesja → pusta lista (podwójny filtr user_id + import_session_id + RLS), nie błąd.
    const bSessionItems = await getSessionItems(B.supabase, B.id, sessionA);
    expect(bSessionItems.items).toEqual([]);
    expect(bSessionItems.total).toBe(0);

    // Właściciel A widzi item sesji (kontrola pozytywna — pusto u B nie jest artefaktem złego setupu).
    const aSessionItems = await getSessionItems(A.supabase, A.id, sessionA);
    expect(aSessionItems.items.map((i) => i.id)).toContain(itemA);

    // B ma własny aktywny item — wykluczenie itemu A staje się znaczące (lista B nie jest pusta).
    const itemB = await insertItem(B.supabase, B.id);

    // listItems: aktywna lista B zawiera własny item B, ale NIE item A (domknięcie cross-user).
    const bActive = (await listItems(B.supabase, B.id, defaultCriteria("active"))).items.map((i) => i.id);
    expect(bActive).toContain(itemB);
    expect(bActive).not.toContain(itemA);
  });
});
