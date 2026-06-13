import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { editPendingItem, ItemNotEditableError, setAcceptanceStatus } from "@/lib/services/items-mutation";

// Mutacje `items` przeciw lokalnemu Supabase. Dwóch userów przez signUp (config.toml
// enable_confirmations=false → sesja od razu). Sprawdzamy: izolację RLS (B nie rusza itemów A),
// status-guard `pending` w bulk UPDATE, oraz derywację operational_status z typu przy edycji.

const URL = process.env.SUPABASE_TEST_URL ?? "";
const ANON = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const ready = Boolean(URL && ANON);
const d = ready ? describe : describe.skip;

function client() {
  return createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signUpClient(tag: string) {
  const supabase = client();
  const email = `s03-${tag}-${Math.floor(Math.random() * 1e9)}@test.local`;
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
      acceptance_status: "pending",
      operational_status: "new",
      ...over,
    })
    .select("id")
    .single<{ id: string }>();
  if (error) throw error;
  return data.id;
}

async function statusOf(supabase: SupabaseClient, id: string): Promise<string> {
  const { data, error } = await supabase
    .from("items")
    .select("acceptance_status")
    .eq("id", id)
    .single<{ acceptance_status: string }>();
  if (error) throw error;
  return data.acceptance_status;
}

d("items-mutation — RLS + status-guard + derywacja (integracja)", () => {
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

  it("B nie zmienia itemu A (RLS → updatedIds puste, item nadal pending)", async () => {
    const itemId = await insertItem(A.supabase, A.id);
    const res = await setAcceptanceStatus(B.supabase, [itemId], "accepted");
    expect(res.updatedIds).toEqual([]);
    expect(await statusOf(A.supabase, itemId)).toBe("pending");
  });

  it("bulk z guardem pending zmienia tylko pendingi i zwraca ich id", async () => {
    const pendingId = await insertItem(A.supabase, A.id, { acceptance_status: "pending" });
    const acceptedId = await insertItem(A.supabase, A.id, { acceptance_status: "accepted" });

    const res = await setAcceptanceStatus(A.supabase, [pendingId, acceptedId], "rejected");

    expect(res.updatedIds).toEqual([pendingId]);
    expect(await statusOf(A.supabase, pendingId)).toBe("rejected");
    expect(await statusOf(A.supabase, acceptedId)).toBe("accepted"); // niezmieniony (guard)
  });

  it("edit utrwala pola i derywuje operational_status z typu (note→task→note)", async () => {
    const noteId = await insertItem(A.supabase, A.id, { type: "note", operational_status: null });

    const toTask = await editPendingItem(A.supabase, noteId, { title: "Nowy", description: "opis", type: "task" });
    expect(toTask.type).toBe("task");
    expect(toTask.operational_status).toBe("new");
    expect(toTask.title).toBe("Nowy");
    expect(toTask.description).toBe("opis");
    expect(toTask.acceptance_status).toBe("pending"); // edycja NIE akceptuje

    const backToNote = await editPendingItem(A.supabase, noteId, { title: "Nowy", description: null, type: "note" });
    expect(backToNote.operational_status).toBeNull();
    expect(backToNote.description).toBeNull();
  });

  it("edit nie-pending itemu → ItemNotEditableError", async () => {
    const acceptedId = await insertItem(A.supabase, A.id, { acceptance_status: "accepted" });
    await expect(
      editPendingItem(A.supabase, acceptedId, { title: "X", description: null, type: "note" }),
    ).rejects.toBeInstanceOf(ItemNotEditableError);
  });
});
