import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { listItems } from "@/lib/services/items";
import {
  createManualItem,
  deleteFromTrash,
  editItem,
  emptyTrash,
  ItemConflictError,
  ItemNotEditableError,
  moveToTrash,
  restoreFromTrash,
  setAcceptanceStatus,
} from "@/lib/services/items-mutation";
import { defaultCriteria } from "@/lib/services/list-criteria";

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

  // --- deleteFromTrash (F10): twardy DELETE POJEDYNCZEGO wiersza, ograniczony do kosza + izolowany RLS. ---
  // Bliźniak emptyTrash, ale celowany w jeden `id`. Dwie własności krytyczne dla bezpieczeństwa: (1) guard
  // `.in(status, [rejected,deleted])` NIE pozwala skasować itemu aktywnego (pending/accepted) tym kanałem;
  // (2) izolacja per-user trzyma się wyłącznie na RLS (bez jawnego `.eq(user_id)`), więc B nie kasuje wpisu A.

  it("deleteFromTrash kasuje TYLKO wiersz w koszu (rejected/deleted); pending i accepted NIETKNIĘTE (guard statusu)", async () => {
    const deletedId = await insertItem(A.supabase, A.id, { acceptance_status: "deleted" });
    const rejectedId = await insertItem(A.supabase, A.id, { acceptance_status: "rejected" });
    const acceptedId = await insertItem(A.supabase, A.id, { acceptance_status: "accepted" });
    const pendingId = await insertItem(A.supabase, A.id, { acceptance_status: "pending" });

    // (1) wiersz w koszu (deleted) → faktycznie skasowany (deletedCount=1, zniknął z bazy)
    expect((await deleteFromTrash(A.supabase, deletedId)).deletedCount).toBe(1);
    await expect(rowOf(A.supabase, deletedId)).rejects.toThrow();

    // (2) wiersz w koszu (rejected) → także skasowany (oba statusy kosza w guardzie)
    expect((await deleteFromTrash(A.supabase, rejectedId)).deletedCount).toBe(1);
    await expect(rowOf(A.supabase, rejectedId)).rejects.toThrow();

    // (3) item AKTYWNY (accepted) → guard statusu wyklucza → nic nie skasowane, wiersz żyje w stanie accepted
    expect((await deleteFromTrash(A.supabase, acceptedId)).deletedCount).toBe(0);
    expect(await statusOf(A.supabase, acceptedId)).toBe("accepted");

    // (4) item pending → tak samo pominięty; nie da się „usunąć trwale" czegoś spoza kosza tym endpointem
    expect((await deleteFromTrash(A.supabase, pendingId)).deletedCount).toBe(0);
    expect(await statusOf(A.supabase, pendingId)).toBe("pending");
  });

  it("B nie usuwa wpisu z kosza A (deleteFromTrash pod RLS → 0 skasowanych, wiersz A przetrwał)", async () => {
    // IDOR po `id`: deleteFromTrash celuje w konkretny wiersz, więc gdyby izolacja polegała na czymś innym niż
    // RLS, B skasowałby wpis A po jego id. Dowód: B woła na id wpisu A → 0 skasowanych, a wiersz A żyje.
    const itemA = await insertItem(A.supabase, A.id, { acceptance_status: "deleted" });
    const res = await deleteFromTrash(B.supabase, itemA);
    expect(res.deletedCount).toBe(0); // RLS (items_delete_own) wyklucza wiersz A z DELETE-a B
    expect(await statusOf(A.supabase, itemA)).toBe("deleted"); // wiersz A nietknięty (nadal w koszu)
  });

  // --- Round-trip cyklu życia itemu (Faza 4, ryzyko #5): dwuwymiarowy model stanu trzyma przy cyklu kosza ---
  // acceptance_status × operational_status to dwa NIEZALEŻNE wymiary (FR-009). moveToTrash/restoreFromTrash
  // tykają wyłącznie acceptance_status; operational_status musi przeżyć podróż do kosza i z powrotem, a restore
  // jest DETERMINISTYCZNY ze statusu źródłowego (deleted→accepted, rejected→pending) — nie odtwarza "poprzedniego"
  // stanu akceptacji z pamięci. Round-trip właściciela (nie IDOR): asercja przez odczyt z bazy (rowOf), bo dowodem
  // inwariantu jest przeżycie kolumny w bazie, nie kształt zapytania (to pokrywa unit items-mutation.test.ts).

  it("round-trip kosza zachowuje operational_status (in_progress i done przeżywają move→restore)", async () => {
    const inProgressId = await insertItem(A.supabase, A.id, {
      acceptance_status: "accepted",
      operational_status: "in_progress",
    });
    const doneId = await insertItem(A.supabase, A.id, {
      acceptance_status: "accepted",
      operational_status: "done",
    });

    await moveToTrash(A.supabase, [inProgressId, doneId]);
    const trashedInProgress = await rowOf(A.supabase, inProgressId);
    expect(trashedInProgress.acceptance_status).toBe("deleted");
    expect(trashedInProgress.operational_status).toBe("in_progress"); // kosz NIE resetuje wymiaru operacyjnego
    expect((await rowOf(A.supabase, doneId)).operational_status).toBe("done");

    await restoreFromTrash(A.supabase, [inProgressId, doneId]);
    const restoredInProgress = await rowOf(A.supabase, inProgressId);
    expect(restoredInProgress.acceptance_status).toBe("accepted");
    expect(restoredInProgress.operational_status).toBe("in_progress"); // przeżył pełny round-trip
    const restoredDone = await rowOf(A.supabase, doneId);
    expect(restoredDone.acceptance_status).toBe("accepted");
    expect(restoredDone.operational_status).toBe("done");
  });

  it("round-trip: przywrócony rejected wraca do bramki walidacji (kolumna pending + widok Do akceptacji)", async () => {
    // Inwariant (b): restore jest deterministyczny ze statusu źródłowego (rejected → pending), więc item
    // realnie ODKŁADA SIĘ z powrotem do bramy walidacji. Dowodzimy tego na DWÓCH poziomach: kolumny ORAZ
    // widoku „Do akceptacji" (samo `pending` w kolumnie to za mało — zdanie o inwariancie dotyczy widoku).
    const id = await insertItem(A.supabase, A.id, { acceptance_status: "rejected" });

    await restoreFromTrash(A.supabase, [id]);

    // (1) kolumna: rejected → pending (NIE „wraca jako odrzucone" — restore nie odtwarza pamięci akceptacji)
    expect((await rowOf(A.supabase, id)).acceptance_status).toBe("pending");

    // (2) widok: item faktycznie widoczny w „Do akceptacji". toContain (nie równość) — listItems('pending')
    // zwraca wszystkie pendingi A z całego przebiegu pliku.
    const pendingIds = (await listItems(A.supabase, A.id, defaultCriteria("pending"))).items.map((i) => i.id);
    expect(pendingIds).toContain(id);
  });

  it("round-trip mieszany: restoreFromTrash([rejected, deleted]) rozdziela na pending i accepted (guardy nie kolidują)", async () => {
    // Inwariant (b) część druga: dwa strzeżone UPDATE-y w restoreFromTrash nie kolidują — jedno wywołanie na
    // mieszanej selekcji rozdziela itemy na właściwe gałęzie. To ten test zapala się na czerwono, gdyby ktoś
    // „uprościł" restore do jednego UPDATE (rejected poleciałby wtedy na accepted, nie pending).
    const rejectedId = await insertItem(A.supabase, A.id, { acceptance_status: "rejected" });
    const deletedId = await insertItem(A.supabase, A.id, {
      acceptance_status: "deleted",
      operational_status: "in_progress",
    });

    const restored = await restoreFromTrash(A.supabase, [rejectedId, deletedId]);
    // zwrotka Item[] to suma obu guarded UPDATE-ów — zawiera oba przywrócone id
    expect(restored.map((i) => i.id).sort()).toEqual([rejectedId, deletedId].sort());

    // rejected → pending (bramka walidacji); deleted → accepted z ZACHOWANYM stanem operacyjnym
    expect((await rowOf(A.supabase, rejectedId)).acceptance_status).toBe("pending");
    const deletedRow = await rowOf(A.supabase, deletedId);
    expect(deletedRow.acceptance_status).toBe("accepted");
    expect(deletedRow.operational_status).toBe("in_progress");
  });
});
