import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createManualItem,
  editItem,
  emptyTrash,
  ItemConflictError,
  ItemNotEditableError,
  moveToTrash,
  restoreFromTrash,
  setAcceptanceStatus,
} from "@/lib/services/items-mutation";

// Mutacje `items` przeciw lokalnemu Supabase. Dwóch userów przez signUp (config.toml
// enable_confirmations=false → sesja od razu). Sprawdzamy: izolację RLS (B nie rusza itemów A),
// status-guard `pending` w bulk UPDATE, oraz edycję S-05: accepted edytowalny, `operational_status`
// zachowany przy edycji, compare-and-swap na `updated_at` (nieaktualny → ItemConflictError).

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

interface ItemRow {
  acceptance_status: string;
  operational_status: string | null;
  type: string;
  title: string;
  description: string | null;
  updated_at: string;
}

async function rowOf(supabase: SupabaseClient, id: string): Promise<ItemRow> {
  const { data, error } = await supabase
    .from("items")
    .select("acceptance_status, operational_status, type, title, description, updated_at")
    .eq("id", id)
    .single<ItemRow>();
  if (error) throw error;
  return data;
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

  it("createManualItem wstawia item ręczny: accepted / new / NULL session (S-07), potwierdzone w bazie", async () => {
    const item = await createManualItem(A.supabase, A.id, { title: "Ręczny", description: "opis", type: "note" });
    expect(item.acceptance_status).toBe("accepted");
    expect(item.operational_status).toBe("new");
    expect(item.import_session_id).toBeNull();
    expect(item.type).toBe("note");
    expect(item.title).toBe("Ręczny");
    expect(item.description).toBe("opis");
    expect(item.user_id).toBe(A.id);
    // Potwierdzenie ZAPYTANIEM do bazy (nie tylko zwrotką serwisu) — wiersz faktycznie utrwalony.
    const row = await rowOf(A.supabase, item.id);
    expect(row.acceptance_status).toBe("accepted");
    expect(row.operational_status).toBe("new");
  });

  it("createManualItem pod RLS izoluje per-user — B tworzy własny item, A go nie widzi", async () => {
    const item = await createManualItem(B.supabase, B.id, { title: "B-item", description: null, type: "task" });
    expect(item.user_id).toBe(B.id);
    // RLS: klient A nie widzi wiersza B → rowOf (.single()) rzuca (brak wiersza).
    await expect(rowOf(A.supabase, item.id)).rejects.toThrow();
  });

  it("B nie zmienia itemu A (RLS → wynik pusty, item nadal pending)", async () => {
    const itemId = await insertItem(A.supabase, A.id);
    const res = await setAcceptanceStatus(B.supabase, [itemId], "accepted");
    expect(res).toEqual([]); // setAcceptanceStatus zwraca Item[] (S-10) — B nie złapał żadnego wiersza
    expect(await statusOf(A.supabase, itemId)).toBe("pending");
  });

  it("bulk z guardem pending zmienia tylko pendingi i zwraca ich id", async () => {
    const pendingId = await insertItem(A.supabase, A.id, { acceptance_status: "pending" });
    const acceptedId = await insertItem(A.supabase, A.id, { acceptance_status: "accepted" });

    const res = await setAcceptanceStatus(A.supabase, [pendingId, acceptedId], "rejected");

    expect(res.map((r) => r.id)).toEqual([pendingId]);
    expect(await statusOf(A.supabase, pendingId)).toBe("rejected");
    expect(await statusOf(A.supabase, acceptedId)).toBe("accepted"); // niezmieniony (guard)
  });

  it("bulk accept pomija item odrzucony w innej karcie, zmienia tylko pending (scenariusz 3.8)", async () => {
    const rejectedId = await insertItem(A.supabase, A.id, { acceptance_status: "rejected" });
    const pendingId = await insertItem(A.supabase, A.id, { acceptance_status: "pending" });

    const res = await setAcceptanceStatus(A.supabase, [rejectedId, pendingId], "accepted");

    expect(res.map((r) => r.id)).toEqual([pendingId]); // tylko pending → count = 1, nie 2
    expect(await statusOf(A.supabase, rejectedId)).toBe("rejected"); // odrzucony NIE nadpisany na accepted
    expect(await statusOf(A.supabase, pendingId)).toBe("accepted");
  });

  it("edit accepted z bieżącym stanem ZACHOWUJE postęp i utrwala pola (S-05)", async () => {
    // accepted z postępem `in_progress` — wysłanie bieżącego stanu (prefill UI) NIE resetuje postępu.
    const acceptedId = await insertItem(A.supabase, A.id, {
      type: "note",
      acceptance_status: "accepted",
      operational_status: "in_progress",
    });
    const before = await rowOf(A.supabase, acceptedId);

    const updated = await editItem(
      A.supabase,
      acceptedId,
      { title: "Nowy", description: "opis", type: "task", operationalStatus: "in_progress" },
      before.updated_at,
    );
    expect(updated.type).toBe("task");
    expect(updated.title).toBe("Nowy");
    expect(updated.description).toBe("opis");
    expect(updated.acceptance_status).toBe("accepted"); // edycja NIE akceptuje ani nie cofa
    expect(updated.operational_status).toBe("in_progress"); // KLUCZOWE: postęp zachowany
  });

  it("edit accepted może JAWNIE zmienić stan operacyjny (rewizja UX: stan edytowalny w dialogu)", async () => {
    const acceptedId = await insertItem(A.supabase, A.id, {
      type: "task",
      acceptance_status: "accepted",
      operational_status: "new",
    });
    const before = await rowOf(A.supabase, acceptedId);

    const updated = await editItem(
      A.supabase,
      acceptedId,
      { title: "T", description: null, type: "task", operationalStatus: "done" },
      before.updated_at,
    );
    expect(updated.operational_status).toBe("done"); // jawnie zmieniony z 'new' na 'done'
  });

  it("edit pending działa tym samym guardem (IN pending|accepted)", async () => {
    const pendingId = await insertItem(A.supabase, A.id, { type: "idea", operational_status: "new" });
    const before = await rowOf(A.supabase, pendingId);

    const updated = await editItem(
      A.supabase,
      pendingId,
      { title: "P2", description: null, type: "task", operationalStatus: "new" },
      before.updated_at,
    );
    expect(updated.title).toBe("P2");
    expect(updated.description).toBeNull();
    expect(updated.acceptance_status).toBe("pending");
  });

  it("nieaktualny updated_at (równoległa edycja) → ItemConflictError", async () => {
    const id = await insertItem(A.supabase, A.id, { acceptance_status: "accepted", operational_status: "new" });
    const original = await rowOf(A.supabase, id);

    // pierwsza edycja przesuwa `updated_at`
    await editItem(
      A.supabase,
      id,
      { title: "A", description: null, type: "task", operationalStatus: "new" },
      original.updated_at,
    );
    // druga z NIEAKTUALNYM (oryginalnym) znacznikiem → konflikt, bez cichego nadpisania
    await expect(
      editItem(
        A.supabase,
        id,
        { title: "B", description: null, type: "task", operationalStatus: "new" },
        original.updated_at,
      ),
    ).rejects.toBeInstanceOf(ItemConflictError);
  });

  it("edit nieedytowalnego (rejected) → ItemNotEditableError", async () => {
    const rejectedId = await insertItem(A.supabase, A.id, { acceptance_status: "rejected" });
    const row = await rowOf(A.supabase, rejectedId);
    await expect(
      editItem(
        A.supabase,
        rejectedId,
        { title: "X", description: null, type: "note", operationalStatus: "new" },
        row.updated_at,
      ),
    ).rejects.toBeInstanceOf(ItemNotEditableError);
  });

  it("B nie edytuje itemu A (RLS → ItemNotEditableError, item A bez zmian)", async () => {
    // Symetria pokrycia z bulk: ścieżka editItem też musi być izolowana per-user. Pod RLS B-a follow-up
    // SELECT po `id` zwraca null (item A niewidoczny) ⇒ ItemNotEditableError, a wiersz A pozostaje nietknięty.
    const acceptedId = await insertItem(A.supabase, A.id, {
      acceptance_status: "accepted",
      operational_status: "in_progress",
      title: "A-oryginał",
    });
    const before = await rowOf(A.supabase, acceptedId);

    await expect(
      editItem(
        B.supabase,
        acceptedId,
        { title: "Wrogi zapis", description: "hack", type: "note", operationalStatus: "done" },
        before.updated_at,
      ),
    ).rejects.toBeInstanceOf(ItemNotEditableError);

    const after = await rowOf(A.supabase, acceptedId);
    expect(after.title).toBe("A-oryginał"); // brak cichego nadpisania
    expect(after.operational_status).toBe("in_progress");
    expect(after.updated_at).toBe(before.updated_at); // wiersz nietknięty
  });

  // --- IDOR cyklu kosza: mutacje polegające WYŁĄCZNIE na RLS (najsłabsze ogniwo obrony w głąb) ---
  // moveToTrash/restoreFromTrash/emptyTrash NIE dokładają jawnego `.eq("user_id")` (świadoma decyzja,
  // patrz items-mutation.ts:6-7) — izolację trzyma sam RLS. Te testy przypinają, że B nie przenosi,
  // nie przywraca ani nie opróżnia kosza itemów A, a wiersze A pozostają nietknięte z perspektywy A.
  // Każdy scenariusz idzie przez klienta user-scoped B (signUpClient("b") = anon key + sesja, RLS aktywny),
  // nigdy service-role — inaczej RLS byłoby omijane i test niczego by nie dowodził. Kształt asercji jak
  // przy setAcceptanceStatus (:124-129): puste `updatedIds`/przeżycie wiersza ORAZ ponowny odczyt A.

  it("B nie przenosi do kosza itemu A (moveToTrash pod RLS → updatedIds puste, item A nadal accepted)", async () => {
    const itemId = await insertItem(A.supabase, A.id, { acceptance_status: "accepted" });
    const res = await moveToTrash(B.supabase, [itemId]);
    expect(res.updatedIds).toEqual([]); // B nie złapał żadnego wiersza (RLS wyklucza item A)
    expect(await statusOf(A.supabase, itemId)).toBe("accepted"); // stan A nietknięty (NIE 'deleted')
  });

  it("B nie przywraca z kosza itemu A (restoreFromTrash pod RLS → item A nadal w koszu)", async () => {
    // A ma item w koszu — wstawiony bezpośrednio jako 'deleted' (DB nie waliduje tranzycji akceptacji;
    // guard statusu żyje w serwisie, nie w bazie), co jest tańszym setupem niż moveToTrash przez A.
    const itemId = await insertItem(A.supabase, A.id, { acceptance_status: "deleted" });
    const res = await restoreFromTrash(B.supabase, [itemId]);
    expect(res).toEqual([]); // żaden wiersz nie przywrócony przez B
    expect(await statusOf(A.supabase, itemId)).toBe("deleted"); // item A nadal w koszu (nie 'accepted')
  });

  it("B nie opróżnia kosza A (emptyTrash B kasuje własny kosz, item A w koszu przetrwał)", async () => {
    // emptyTrash jest GLOBALNY (bez wejścia `ids`) — kasuje cały kosz wołającego. IDOR dowodzimy przez
    // PRZEŻYCIE wiersza A: B ma własny item w koszu, woła emptyTrash, item A zostaje nietknięty. Nie da się
    // tego zrobić przez "B kasuje item A po id" — takiego wejścia nie ma, dowód idzie przez przeżycie A.
    const itemA = await insertItem(A.supabase, A.id, { acceptance_status: "deleted" });
    const itemB = await insertItem(B.supabase, B.id, { acceptance_status: "deleted" });

    const res = await emptyTrash(B.supabase);

    expect(res.deletedCount).toBeGreaterThanOrEqual(1); // B faktycznie skasował swój kosz (≥ itemB)
    await expect(rowOf(B.supabase, itemB)).rejects.toThrow(); // item B zniknął → emptyTrash B naprawdę zadziałał
    const row = await rowOf(A.supabase, itemA); // KLUCZOWE: item A przetrwał globalny hard-delete B
    expect(row.acceptance_status).toBe("deleted");
  });
});
