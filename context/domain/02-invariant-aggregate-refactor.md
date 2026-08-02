---
title: "Refaktor niezmiennik → agregat: Item jako strażnik maszyny stanów akceptacji (DDD, L5 element ②)"
created: 2026-08-02
type: refactor-plan
based_on: context/domain/01-domain-distillation.md
project: TaskerLight
method: "Prompt DDD „niezmienniki → agregat" z 10xDevs M4L5. Tryb: TYLKO ODCZYT kodu produkcyjnego; produkt to PLAN, nie implementacja. Dowody plik:linia zweryfikowane w repo na created."
---

# Refaktor niezmiennik → agregat: `Item` (maszyna stanów akceptacji)

**To jest PLAN, nie implementacja.** Buduje na destylacji `01-domain-distillation.md` — nie wyprowadza domeny od nowa. Bierze niezmiennik wskazany tam jako #1 (najbardziej rdzeniowy i najsłabiej pilnowany) i projektuje agregat-strażnika, który czyni „nie da się przejść nielegalnie" prawdą **niezależnie od trasy wywołania**. Granica L5: projektujemy maszynę stanów wpisu, nie przeprojektowujemy pojęć biznesowych poza nią.

**Legenda dowodów:** **[E]** evidence (zweryfikowane plik:linia), **[I]** inference (wniosek), **[U]** unknown (biała plama).

---

## KROK 1 — Potwierdzenie listy niezmienników (z `01`, bez wyprowadzania od nowa)

Destylacja zdefiniowała niezmienniki N1–N11 ze statusem egzekwowania. Tu potwierdzam te dotyczące agregatu `Item` i **uzupełniam jeden realny brak** ujawniony przy weryfikacji kodu (N3-bis).

| # | Niezmiennik (skrót) | Status wg `01` | Potwierdzenie plik:linia |
|---|---|---|---|
| N2 | Dwa niezależne wymiary stanu; kosz rusza tylko akceptację, operacyjny nietknięty | EGZEKWOWANY (serwis) | **[E]** `moveToTrash` `items-mutation.ts:143-153` (brak dotknięcia `operational_status`); round-trip test `items-mutation.integration.test.ts:318-341` |
| **N3** | **Legalne przejścia akceptacji:** `pending→accepted/rejected`, `accepted→deleted`, `deleted→accepted`, `rejected→pending`; hard-delete tylko „Wyczyść kosz" | **EGZEKWOWANY w serwisie, NARUSZALNY poza nim** | **[E]** guardy `WHERE`/`eq` `items-mutation.ts:104,128,148,176,185,204`; brak CHECK/trigger `classification_schema.sql:49-60,96-111` |
| N3-bis | **[BRAK w `01`, uzupełnienie]** Stan „narodzin" wpisu ∈ {`pending` (z klasyfikacji), `accepted` (ręczny)} — żaden inny stan nie jest legalnym stanem początkowym | **NARUSZALNY** (tylko konwencja serwisu/RPC) | **[E]** `persist_classification` wstawia `pending` (`operational_status_all_types.sql:49`); `createManualItem` wstawia `accepted` (`items-mutation.ts:75`); baza dopuszcza INSERT dowolnego enuma (dowód niżej) |
| N4 | Przejścia operacyjne — 4 wzajemnie przechodnie; graf w menu to UI | EGZEKWOWANY (cecha, nie luka) | **[E]** `operationalActionSchema` dopuszcza wszystkie 4 `validation/items.ts:39-42`; kuracja UX `operational-transitions.ts:14-27` |
| N5 | Wpis edytowalny tylko `pending`/`accepted`; optimistic concurrency (409) | EGZEKWOWANY (serwis+endpoint) | **[E]** `editItem` guard `.in(EDITABLE_ACCEPTANCE)` `items-mutation.ts:240`; compare-and-swap `:244`; mapowanie 409/404 `[id].ts:47-61` |
| N6 | Wpis ręczny: niezmienniki (`accepted`+`new`+`session=NULL`) ustala SERWER | EGZEKWOWANY (serwis+zod) | **[E]** `createManualItem` `items-mutation.ts:62-83`; `createItemSchema` bez pól stanu `validation/items.ts:92-103` |
| R4 | „Każdy wpis ma stan operacyjny" | **tylko DEKLAROWANY** (kolumna nullable) | **[E]** `operational_status operational_status,` bez `not null`/CHECK `classification_schema.sql:57`; typ `OperationalStatus \| null` `types.ts:135` |

**Wniosek KROK 1.** Rdzeń agregatu `Item` to **N3** (legalność przejść akceptacji) + jego uzupełnienie **N3-bis** (legalny stan narodzin), sprzężone z długiem **R4** („zawsze niepusty stan operacyjny"). N2/N4/N5/N6 są już egzekwowane i stanowią kontekst, którego refaktor nie może zepsuć.

---

## KROK 2 — Wybór #1 i weryfikacja na trzech osiach

Weryfikuję rekomendację `01` (#1 = `Item` / maszyna stanów akceptacji) na trzech osiach.

**(a) Jak rdzeniowy dla sensu produktu — MAKSYMALNIE.** Brama akceptacji jest sednem produktu: „decyzja co to jest przesunięta z zapisu (drogiego) do przeglądu (taniego)", a sukces mierzony **acceptance rate ≥ 70%** (`01` KROK 0, KROK 2, cyt. `prd.md:24,43,292`). Legalność przejść akceptacji JEST mechaniką tej bramy — bez niej „akceptacja" nie znaczy nic. **[E]** klasyfikacja subdomen w `01` stawia „Brama akceptacji + typologia" jako jedyny **CORE**.

**(b) Jak rozsmarowany po warstwach — SILNIE.** Reguła żyje w co najmniej pięciu miejscach, w różnej postaci: guardy `WHERE` serwisu (`items-mutation.ts`), schematy zod (kształt, nie legalność — `validation/items.ts`), stała UX (`operational-transitions.ts`), enum + kolumna DB bez CHECK (`classification_schema.sql`), typ z `| null` (`types.ts`). Derywacja stanu narodzin dubluje się świadomie w DWÓCH miejscach (RPC SQL + `deriveOperationalStatus`, `items-mutation.ts:48`). To dokładnie obraz „wszędzie i nigdzie".

**(c) Realnie egzekwowany / deklarowany / naruszalny — NAJSŁABSZE ogniwo z rdzeniowych.** Egzekwowany **wyłącznie** w warstwie serwisu; poza nią **NARUSZALNY** — i to nie na poziomie modelu zagrożeń, lecz **udowodnione we własnym pakiecie testów** (dowód w KROK 3). Dla kontrastu: izolacja per-user (N10), atomowość zapisu klasyfikacji (N1) i higiena klucza BYOK (N7/N8/N11) są egzekwowane aż do bazy — więc nie one są kandydatem.

**Decyzja: ZGODA z rekomendacją `01`. Refaktorujemy `Item` jako agregat-strażnik maszyny stanów akceptacji (N3 + N3-bis + R4).** Uzasadnienie: to jedyny niezmiennik, który jest jednocześnie (a) maksymalnie rdzeniowy, (b) silnie rozsmarowany i (c) realnie naruszalny. Pozostali kandydaci przegrywają albo na rdzeniowości (ImportSession — supporting), albo na ryzyku (Profile/BYOK — wzorowo egzekwowany, kandydat na wzorzec, nie na refaktor). Mocniejszego wyboru dowody nie wspierają.

---

## KROK 3 — Diagnoza: gdzie dziś żyje reguła (i gdzie NIE żyje)

### 3.1 Warstwa serwisu — JEDYNY realny strażnik (guardy `WHERE`/`eq`)

Cała maszyna stanów akceptacji to klauzule `WHERE` na statusie źródłowym w `src/lib/services/items-mutation.ts`. Każda krawędź = jeden guard:

| Krawędź (przejście) | Metoda serwisu | Guard (dowód plik:linia) |
|---|---|---|
| `pending → accepted` / `pending → rejected` | `setAcceptanceStatus` | **[E]** `.eq("acceptance_status", "pending")` `items-mutation.ts:104` |
| `accepted → {new,in_progress,done,cancelled}` (operacyjny) | `setOperationalStatus` | **[E]** `.eq("acceptance_status", "accepted")` `items-mutation.ts:128` |
| `accepted → deleted` (do kosza) | `moveToTrash` | **[E]** `.eq("acceptance_status", "accepted")` `items-mutation.ts:148` |
| `deleted → accepted` (restore) | `restoreFromTrash` | **[E]** `.eq("acceptance_status", "deleted")` `items-mutation.ts:176` |
| `rejected → pending` (restore) | `restoreFromTrash` | **[E]** `.eq("acceptance_status", "rejected")` `items-mutation.ts:185` |
| hard-delete `{rejected,deleted}` (Wyczyść kosz) | `emptyTrash` | **[E]** `.in("acceptance_status", ["rejected","deleted"])` `items-mutation.ts:204` |
| edycja tylko `{pending,accepted}` | `editItem` | **[E]** `.in("acceptance_status", EDITABLE_ACCEPTANCE)` `items-mutation.ts:240` (+ `EDITABLE_ACCEPTANCE` `:18`) |

Stan narodzin (N3-bis) ustala **serwis + RPC**: `createManualItem` wstawia `accepted`/`new`/`session=NULL` (**[E]** `items-mutation.ts:71-76`); RPC `persist_classification` wstawia `pending`/`new` atomowo z finalizacją sesji (**[E]** `operational_status_all_types.sql:42-60`, `security invoker` `:34`).

**Kluczowa właściwość obecnego modelu:** guard `WHERE` NIE rzuca błędu — wiersz spoza dozwolonego statusu **po prostu nie pasuje** (`.select` go nie zwraca), więc bulk „pomija resztę bez błędu" (FR-007). To znaczy: nielegalne przejście **nigdy nie jest cicho wykonywane** (dobrze), ale też **nigdy nie jest nazwane** — reguła jest niewidoczna, rozproszona i wyrażona sześcioma niezależnymi literałami zamiast jedną tablicą prawdy. Wyjątek: `editItem` JUŻ dziś jest fail-fast — dyskryminuje 0 wierszy na `ItemConflictError` (→409) vs `ItemNotEditableError` (→404) (**[E]** `items-mutation.ts:248-258`, mapowanie `[id].ts:47-61`). To istniejący precedens dla docelowego wzorca.

### 3.2 Warstwy, które reguły NIE egzekwują

- **Baza (DB) — ZERO egzekucji przejść.** Enumy istnieją (`classification_schema.sql:12,16,19`), ale kolumna `acceptance_status` ma tylko `not null default 'pending'` (**[E]** `:56`) — żadnego CHECK ani triggera na legalność krawędzi. Grep po `supabase/migrations/**` za `trigger`/`check (`/`constraint` zwraca **wyłącznie** `with check ((select auth.uid()) = user_id)` polityk RLS — **[E]** zero constraintów wartościowych, zero triggerów.
- **RLS — pilnuje TYLKO własności wiersza.** `items_update_own`: `using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)` (**[E]** `classification_schema.sql:104-107`). Polityka nie odwołuje się do `acceptance_status` w ogóle → **UPDATE właściciela na dowolną wartość enuma przechodzi WITH CHECK.**
- **Walidacja (zod) — kształt, nie legalność.** `operationalActionSchema` celowo dopuszcza wszystkie 4 stany (**[E]** `validation/items.ts:39-42`); `bulkActionSchema` waliduje `action` i długość `ids`, ale nie zna stanu itemów (**[E]** `:19-22`). To poprawne (walidacja to nie miejsce na maszynę stanów), ale to znaczy, że zod NIE jest strażnikiem.
- **Typy — kodują dług.** `operational_status: OperationalStatus | null` (**[E]** `types.ts:135`) — `| null` istnieje wyłącznie dlatego, że kolumna jest nullable (R4).

### 3.3 Gdzie reguła jest NARUSZALNA — udowodnione, nie tylko wywnioskowane

Destylacja `01` oznaczyła NARUSZALNY jako **[I]** (model zagrożeń „bezpośredni PostgREST z JWT usera", bez zaobserwowanego exploitu). **Weryfikacja kodu podnosi to do [E] dla ścieżki INSERT:**

- **[E] Bezpośredni INSERT dowolnego stanu — demonstrowany w pakiecie testów.** `tests/integration/items-mutation.integration.test.ts` używa klienta z kluczem **anon + sesja usera** (RLS aktywny, NIE service-role — `:27-29,31-39`) i wstawia wprost item w stanie `deleted`: `insertItem(A.supabase, A.id, { acceptance_status: "deleted" })` (**[E]** `:290`, helper `:41-62`). Towarzyszący komentarz jest wprost: *„DB nie waliduje tranzycji akceptacji; guard statusu żyje w serwisie, nie w bazie"* (**[E]** `:288-289`). Ten sam test wstawia też `rejected` (`:347`) i `accepted` (`:281`) bez żadnej bramy. `classification-rls.integration.test.ts:53-63` analogicznie wstawia wybrany `acceptance_status`/`operational_status` klientem usera.
- **[I] Bezpośredni UPDATE nielegalnej krawędzi (np. `pending → deleted`, „przeskok bramy").** Nie zademonstrowany osobnym testem, ale **strukturalnie pewny** z odczytu polityki: `items_update_own` nie zawiera predykatu na `acceptance_status` (**[E]** `:104-107`), więc surowy `.update({ acceptance_status: 'deleted' }).eq('id', mójPending)` właściciela spełnia WITH CHECK. Test `classification-rls.integration.test.ts:86-92` potwierdza tylko, że RLS blokuje UPDATE **cudzego** wiersza — na własnym wierszu żadnej bramy przejścia nie ma.
- **[E] `operational_status = NULL` (R4).** Kolumna nullable (`:57`) → bezpośredni INSERT/UPDATE usera może zostawić item bez stanu operacyjnego. Backfill `NULL→'new'` był jednorazowy (`operational_status_all_types.sql:14-17`), a `NOT NULL` świadomie odłożono (**[E]** komentarz `:11-12` „twardy NOT NULL = opcjonalne utwardzenie później").

**Podsumowanie diagnozy.** Strażnikiem maszyny stanów jest **wyłącznie warstwa serwisu**, i to poprzez rozproszone, nienazwane guardy `WHERE`. Baza, RLS, zod i typy **nie egzekwują** legalności przejść. Naruszalność ścieżki INSERT jest **udowodniona** ([E]) we własnych testach; ścieżki UPDATE — strukturalnie pewna ([I]). To jest R5 z `01` — „największy strukturalny rozjazd gdzie żyje niezmiennik" — potwierdzony twardo.

---

## KROK 4 — Projekt agregatu-strażnika `Item`

Cel: `Item` (kanon: „wpis") jako **jedyne pojęciowe miejsce** legalnych przejść, z egzekucją domkniętą tak, by żadna trasa nie mogła jej ominąć. Nielegalne przejście **rzuca nazwany błąd domenowy** (fail-fast), nigdy nie mutuje stanu po cichu.

### 4.1 Nazwane błędy domenowe (fail-fast)

Zgodnie z precedensem `types.ts` (PascalCase + suffix `Error`, komunikat po polsku, dziedziczenie po bazie — np. `ByokCryptoError:13`, `ClassifierError:151`):

- **`IllegalAcceptanceTransitionError(from, to)`** — próba przejścia akceptacji spoza tablicy legalnych krawędzi (rdzeniowy nowy błąd).
- **`IllegalItemBirthStateError(state)`** — próba utworzenia wpisu w stanie ≠ {`pending`,`accepted`} (N3-bis).
- **`OperationalChangeNotAllowedError`** — zmiana stanu operacyjnego wpisu, który nie jest `accepted` (reguła bulku z `setOperationalStatus`). UWAGA na subtelność w 4.5.
- **Zostają bez zmian:** `ItemNotEditableError` (`items-mutation.ts:21`), `ItemConflictError` (`:33`) — już fail-fast, agregat je przejmuje.

### 4.2 Jedno źródło prawdy o krawędziach

Dziś legalność jest zaszyta w sześciu literałach `WHERE`. Docelowo — **jedna tablica**, z której derywują i metody agregatu, i (opcjonalnie) guardy bulku, i trigger DB. Wzorzec istnieje już dla wymiaru operacyjnego (`OPERATIONAL_TRANSITIONS`, `operational-transitions.ts:14-27`); brakuje bliźniaka dla akceptacji.

```text
// PSEUDOKOD (nie kod produkcyjny) — domena wpisu
ACCEPTANCE_TRANSITIONS = {
  accept:  { from: ['pending'],  to: 'accepted' },
  reject:  { from: ['pending'],  to: 'rejected' },
  trash:   { from: ['accepted'], to: 'deleted'  },
  restore: [ { from: 'deleted',  to: 'accepted' },     // cel deterministyczny ze źródła
             { from: 'rejected', to: 'pending'  } ],
}
BIRTH_STATES = ['pending', 'accepted']                 // N3-bis
```

### 4.3 Metody domenowe (sygnatury + pseudokod)

```text
// PSEUDOKOD — agregat-root Item (kanon: „wpis")
class Item {
  // NIEZMIENNIK TOŻSAMOŚCI: operational_status ZAWSZE ustawiony (nigdy null) — patrz R4/NOT NULL

  accept():        precondition acceptance == 'pending'
                   else throw IllegalAcceptanceTransitionError(acceptance, 'accepted')
                   acceptance = 'accepted'

  reject():        precondition acceptance == 'pending'
                   else throw IllegalAcceptanceTransitionError(acceptance, 'rejected')
                   acceptance = 'rejected'

  moveToTrash():   precondition acceptance == 'accepted'
                   else throw IllegalAcceptanceTransitionError(acceptance, 'deleted')
                   acceptance = 'deleted'          // operational_status NIETKNIĘTY (N2)

  restore():       if acceptance == 'deleted'  -> acceptance = 'accepted'; return
                   if acceptance == 'rejected' -> acceptance = 'pending';  return
                   throw IllegalAcceptanceTransitionError(acceptance, '<restore>')

  changeOperationalStatus(target): precondition acceptance == 'accepted'
                   else throw OperationalChangeNotAllowedError()
                   operational = target            // wszystkie 4 przechodnie (N4)

  edit(fields, expectedUpdatedAt): precondition acceptance in {'pending','accepted'}
                   else throw ItemNotEditableError()
                   // compare-and-swap na updated_at; rozjazd -> ItemConflictError (bez zmian vs dziś)
                   title/description/type = fields.*; operational = fields.operationalStatus

  hardDelete():    precondition acceptance in {'rejected','deleted'}   // tylko „Wyczyść kosz"
                   else throw IllegalAcceptanceTransitionError(acceptance, '<hard-delete>')
                   // fizyczne skasowanie wiersza

  static createManual(userId, input) -> Item:       // fabryka ręczna (N6)
                   new Item(acceptance='accepted', operational='new',
                            import_session_id=null, user_id=userId, ...input)

  static fromClassification(sessionUserId, classified) -> Item:   // pojęciowo; realizacja atomowa w RPC
                   new Item(acceptance='pending', operational='new', ...classified)
}
```

Każda metoda ma jawny `precondition`; niespełniony → **nazwany błąd**, nie cichy zapis. To jest cała maszyna stanów w JEDNYM czytelnym miejscu.

### 4.4 Gdzie osadzić egzekucję — dwie opcje i rekomendacja

**Opcja A — utwardzenie w bazie (CHECK/trigger + `NOT NULL`).**
- `NOT NULL` na `operational_status` (backfill już wykonany `operational_status_all_types.sql:14-17`, więc migracja jest bezpieczna) — zamyka R4.
- **Trigger** (nie CHECK!) na legalność przejść. Uzasadnienie techniczne **[E/I]**: CHECK jest per-wiersz i **nie widzi `OLD`**, więc nie potrafi wyrazić „`OLD→NEW` legalne" — porównanie stanu źródłowego z docelowym wymaga `BEFORE INSERT OR UPDATE` triggera. Jeden `TG_OP`-świadomy trigger: INSERT → `NEW.acceptance ∈ BIRTH_STATES`; UPDATE → `(OLD,NEW) ∈ ACCEPTANCE_TRANSITIONS`; naruszenie → `raise exception` (nazwany błąd DB).
- **Zaleta rozstrzygająca:** to JEDYNA warstwa, która łapie **bezpośredni PostgREST z JWT usera** — udowodnioną dziurę (3.3). Czyni „nie da się przejść nielegalnie" prawdą niezależnie od trasy.
- **Koszt:** logika przejść ląduje w PL/pgSQL — potencjalnie TRZECIE miejsce reguły (serwis TS + RPC + trigger). Ryzyko rozjazdu z tablicą TS.

```text
-- PSEUDOKOD migracji (plan — NIE wykonywać w L5)
alter table public.items alter column operational_status set not null;   -- R4

function assert_item_acceptance() returns trigger:
  if TG_OP = 'INSERT':
     if NEW.acceptance_status not in ('pending','accepted'):
        raise exception 'illegal birth acceptance_status: %', NEW.acceptance_status
     return NEW
  -- UPDATE:
  if NEW.acceptance_status <> OLD.acceptance_status and not (
        (OLD.acceptance_status='pending'  and NEW.acceptance_status in ('accepted','rejected'))
     or (OLD.acceptance_status='accepted' and NEW.acceptance_status='deleted')
     or (OLD.acceptance_status='deleted'  and NEW.acceptance_status='accepted')
     or (OLD.acceptance_status='rejected' and NEW.acceptance_status='pending')):
        raise exception 'illegal acceptance transition % -> %', OLD.acceptance_status, NEW.acceptance_status
  return NEW

create trigger items_acceptance_transition_guard
  before insert or update on public.items
  for each row execute function assert_item_acceptance();
```

**Opcja B — jeden aggregate root w warstwie serwisu TS.**
- `Item` (4.3) jako **jedyne wąskie gardło** mutacji; wszystkie endpointy przez niego. Nazwane błędy rzucane w procesie, mapowane na HTTP (4.6).
- **Zalety:** logika w jednym miejscu, w języku domeny; szybkie testy jednostkowe; bogate nazwane błędy; zgodność z dzisiejszą architekturą (serwisy trzymają logikę — `01` KROK 0).
- **Wada rozstrzygająca:** to granica **konwencyjna**, nie twarda — NIE łapie bezpośredniego PostgREST. Udowodniona dziura (3.3) zostaje otwarta.

**REKOMENDACJA: kombinacja warstwowa A + B, z jasnym podziałem ról.**

To nie kompromis „na wszelki wypadek" — to jedyny układ spełniający sedno #1 (R5: „niezależnie od trasy") bez utraty czytelności domeny:

1. **Agregat TS (B) — dom modelu i języka domeny.** Kanoniczne miejsce reguł, nazwanych błędów i semantyki; jedyne wąskie gardło dla ruchu aplikacji; pokryty szybkimi testami jednostkowymi. Tu żyje `Item`.
2. **Backstop DB (A) — twarda granica obrony w głąb.** Trigger + `NOT NULL` czynią niezmiennik prawdziwym także dla ruchu, który omija serwis (bezpośredni PostgREST). To domyka R5 i R4.
3. **`ACCEPTANCE_TRANSITIONS` (4.2) jako wspólne źródło prawdy** — trigger SQL i metody TS derywują z tej samej tablicy pojęciowej, minimalizując ryzyko rozjazdu (jeden test kontraktowy pilnuje zgodności obu list — patrz KROK 5).

**Ten układ powiela sprawdzony wzorzec projektu:** logika biznesowa w serwisie, ale niezmienniki naprawdę nośne są ALSO utwardzone w bazie — izolacja (RLS) i atomowość zapisu klasyfikacji (RPC/transakcja) już tak działają (`01` KROK 3, N1/N10). Maszyna stanów zasługuje na to samo traktowanie. **Jeśli fazowanie wymusza kolejność:** najpierw najtańsze utwardzenia DB, bo domykają realne dziury (R4 przez `NOT NULL` — niemal darmowe; R5 przez trigger), potem agregat TS jako refaktor czytelności. Sekwencję rozpisuje KROK 5.

**Gdzie agregat naturalnie żyje (dziś logika rozdzielona serwis TS + RPC SQL).** Niezmienniki **narodzin** (pending/new atomowo z sesją) już są POPRAWNIE w RPC `persist_classification` — to granica agregatu `ImportSession` (atomowy zapis, N1). Niezmienniki **przejść** żyją w serwisie. Zatem: agregat-root `Item` naturalnie mieszka w **warstwie serwisu** (moduł domenowy `src/lib/items/` lub zrefaktorowany `items-mutation.ts`), bo tam już zbiegają się wszystkie mutacje przejść i tam projekt ma system typów + nazwane błędy. Fabryka klasyfikacyjna (`fromClassification`) pozostaje realizowana atomowo przez RPC; fabryka ręczna (`createManual`) to `createManualItem`. Backstop DB pilnuje obu.

### 4.5 Atomowość

- **Pojedyncze przejścia** (accept/reject/trash/pojedynczy restore/operational/edit) to **jeden UPDATE = atomowy per statement** — bez zmian.
- **Jedyny przypadek wielo-statementowy: `restoreFromTrash` na selekcji mieszanej** (dwa UPDATE-y: `deleted→accepted` i `rejected→pending`). Dziś **świadomie NIE są wspólnie transakcyjne** (**[E]** komentarz `items-mutation.ts:161-163`: solo-MVP, per-item spójne, bez korupcji). Jeśli agregat ma gwarantować atomowość operacji „restore", całość idzie w **jednej transakcji** — najprościej jako RPC `restore_items(ids)` (wzorzec `persist_classification`: funkcja = niejawna transakcja, `SECURITY INVOKER` → RLS w kontekście usera), gdzie trigger z 4.4 waliduje każdy wiersz. **[I]** Priorytet niski — obecny stan nie koroduje; to domknięcie, nie naprawa.

### 4.6 Cienkie API/route: parse → metoda agregatu → mapowanie błędu na HTTP

Wzorzec już istnieje w `[id].ts:47-61` (ItemConflictError→409, ItemNotEditableError→404). Rozszerzamy go o nowe błędy:

```text
// PSEUDOKOD route (cienka warstwa)
parsed = schema.safeParse(body)                 // zod PRZED efektem (hard rule) -> 400
item   = load(id) ; item.accept()               // metoda agregatu (fail-fast)
persist(item)                                   // guarded UPDATE / RPC
return 200
catch IllegalAcceptanceTransitionError -> 409 { code:'illegal_transition' }   // stan już nie pozwala
catch OperationalChangeNotAllowedError -> 409 { code:'illegal_transition' }
catch IllegalItemBirthStateError       -> 422 { code:'unprocessable' }
catch ItemConflictError                -> 409 (bez zmian)
catch ItemNotEditableError             -> 404 (bez zmian)
```

**Napięcie z FR-007 — rozstrzygnięte uczciwie.** Bulk (accept/reject/trash/restore na tablicy `ids`) ma z definicji „działać na uprawnionych, resztę pomijać bez błędu" (**[E]** `bulk.ts:3-4`, `setAcceptanceStatus` komentarz `items-mutation.ts:86-88`). To NIE jest „loguj i jedź dalej" na nielegalnej operacji — to filtrowanie zbioru: nieuprawniony wpis **nigdy nie jest mutowany**. Fail-fast dotyczy **pojedynczego przejścia** (semantyka `editItem`): tam agregat rzuca. W bulku warstwa wsadowa **wywołuje metodę agregatu per wpis i łapie nazwany błąd jako „pominięty" (do count)**, zamiast go propagować — a `count` to liczba faktycznie zmienionych (**[E]** dzisiejsza semantyka `bulk.ts:47-52`). Zakazane przez prompt „ciche zaktualizowanie stanu" **nie zachodzi w żadnej ścieżce**: pojedyncza rzuca, bulk pomija bez mutacji, a backstop DB odrzuca twardo każdą nielegalną krawędź, która mimo wszystko dotrze do bazy (np. bulk bezpośredniego PostgREST próbujący `pending→deleted`). To domyka „nie da się przejść nielegalnie" totalnie.

---

## KROK 5 — Before/after, plan faz, testy

### 5.1 Before/after — każde dzisiejsze miejsce reguły

| # | Dziś (guard `WHERE`/stan) — plik:linia | Docelowo (agregat + backstop) |
|---|---|---|
| 1 | `setAcceptanceStatus` `.eq("acceptance_status","pending")` `items-mutation.ts:104` | `Item.accept()`/`.reject()` precondition `from=='pending'`; guard bulku derywowany z `ACCEPTANCE_TRANSITIONS`; **trigger DB** backstop |
| 2 | `setOperationalStatus` `.eq("acceptance_status","accepted")` `:128` | `Item.changeOperationalStatus()` precondition `accepted`; **bez triggera przejść operacyjnych** (patrz 5.5), tylko `NOT NULL` |
| 3 | `moveToTrash` `.eq("acceptance_status","accepted")` `:148` | `Item.moveToTrash()` precondition `accepted` |
| 4 | `restoreFromTrash` guardy `:176,185` (dwa UPDATE, nie-atomowe `:161-163`) | `Item.restore()` cel deterministyczny; opcjonalny RPC `restore_items` = jedna transakcja |
| 5 | `emptyTrash` `.in(["rejected","deleted"])` `:204` | `Item.hardDelete()` precondition `{rejected,deleted}` (kontekst „Wyczyść kosz") |
| 6 | `editItem` `.in(EDITABLE_ACCEPTANCE)` `:240` (JUŻ fail-fast) | `Item.edit()` precondition `{pending,accepted}`; logika przeniesiona do agregatu bez zmiany zachowania |
| 7 | `deriveOperationalStatus`→'new' `:48-50` + RPC `operational_status_all_types.sql:50` | fabryki agregatu ustawiają `new`; **`NOT NULL` + trigger INSERT** backstopują |
| 8 | `operational_status` nullable `classification_schema.sql:57` + typ `\| null` `types.ts:135` | migracja `SET NOT NULL`; typ → `OperationalStatus` (usunięcie `\| null` to downstream cleanup, **poza tą fazą**) |

### 5.2 Plan faz (M4L4: „dodaj test, zanim dotkniesz"; każda faza osobno odwracalna; mechanizm na zielono, egzekwowanie włączane jawnie)

Testy: Vitest — jednostkowe `*.test.ts` obok kodu (`vitest.config.ts`), integracyjne `*.integration.test.ts` w `tests/integration/` przeciw lokalnemu Supabase (**[E]** `vitest.integration.config.ts:12`, istniejący harness dwóch userów `items-mutation.integration.test.ts:31-62`).

| Faza | Cel | Test-first? | Odwracalność |
|---|---|---|---|
| **1 — Charakteryzacja** | Przypnij DZIŚ obowiązującą macierz: legalne przejścia przechodzą; nielegalne w bulku są pomijane, w edycji rzucają. **Dodaj test-świadek dziury:** bezpośredni PostgREST `pending→deleted` DZIŚ przechodzi (later flip). | **TAK** (same testy) | Trywialna (tylko nowe testy) |
| **2 — Mechanizm bez egzekucji** | Wprowadź `ACCEPTANCE_TRANSITIONS` + agregat `Item` (4.3) + nazwane błędy, w pełni pokryte unitami, **niepodłączone** do endpointów (lub jako pass-through odtwarzający dzisiejsze zachowanie). Zielono, zero zmiany zachowania. | TAK (unit agregatu) | Trywialna (nowe pliki) |
| **3 — Ruch przez agregat (egzekucja TS)** | Przełącz `editItem` i ścieżki pojedyncze na agregat; guardy bulku derywuj z tablicy. Mapowanie błędów w route (4.6). Legalne ścieżki bez zmian; nielegalne **pojedyncze** rzucają nazwany błąd. FR-007 bulku zachowane. | TAK (unit + endpoint) | Rewert do guardów `WHERE` |
| **4 — Backstop DB #1: `NOT NULL` (R4)** | Migracja: potwierdź brak NULL (backfill zrobiony) → `alter column operational_status set not null` (+ opcjonalny `default 'new'`). **Jawne włączenie egzekucji R4.** | TAK (integ.: INSERT non-task z null → odrzucony) | `drop not null` |
| **5 — Backstop DB #2: trigger przejść (R5)** | Migracja: trigger `items_acceptance_transition_guard` (INSERT: birth-states; UPDATE: legalne krawędzie). **Flip testu-świadka z Fazy 1:** `pending→deleted` bezpośrednim PostgREST → odrzucony. Twarda granica domknięta. | TAK (flip integ.) | `drop trigger` |
| **6 — (opcjonalna) atomowy restore** | RPC `restore_items` = jedna transakcja dla mieszanego restore (domyka `:161-163`). Niski priorytet — obecny stan nie koroduje. | TAK (integ. atomowości) | `drop function` + rewert |

Sekwencja realizuje „mechanizm ląduje na zielono (Fazy 1–2), egzekwowanie włącza się jawnie (Fazy 3/4/5)". Każda faza mergeowalna osobno, każda odwracalna jednym krokiem.

### 5.3 Przypadki testowe niezmiennika — LEGALNE (mają przejść)

- `pending → accepted` (accept); `pending → rejected` (reject).
- `accepted → deleted` (moveToTrash) — z zachowaniem `operational_status` (N2, round-trip `items-mutation.integration.test.ts:318-341`).
- `deleted → accepted` (restore); `rejected → pending` (restore) — cel deterministyczny.
- `restore` selekcji mieszanej `[rejected, deleted]` → rozdział na `pending`+`accepted` (dziś `:360-379`).
- hard-delete `{rejected, deleted}` przez „Wyczyść kosz".
- `accepted → {new, in_progress, done, cancelled}` — wszystkie 4 (N4, przechodniość).
- `edit` na `pending` ORAZ `accepted`; edycja `accepted` zachowuje `operational_status` (**[E]** `:158-178`).
- narodziny: klasyfikacja → `pending`/`new`; ręczny → `accepted`/`new`/`session=NULL`.

### 5.4 Przypadki testowe niezmiennika — NIELEGALNE (mają rzucić nazwany błąd / być odrzucone przez backstop)

- `pending → deleted` (przeskok bramy) → `IllegalAcceptanceTransitionError`; **bezpośredni PostgREST → trigger odrzuca** (flip Fazy 5).
- `accepted → pending` (cofnięcie akceptacji — nie ma takiej krawędzi) → błąd.
- `accepted → rejected` (reject legalny tylko z `pending`) → błąd.
- `rejected → accepted` wprost (restore prowadzi `rejected→pending`, nie `→accepted`) → błąd.
- `deleted → pending` wprost (restore prowadzi `deleted→accepted`) → błąd.
- `rejected → deleted` / `deleted → rejected` (brak krawędzi krzyżowej) → błąd.
- narodziny w stanie ≠ {`pending`,`accepted`} (INSERT `deleted`/`rejected`) → `IllegalItemBirthStateError`; **bezpośredni INSERT → trigger odrzuca** (dziś przechodzi, `:290`).
- hard-delete wpisu `pending`/`accepted` (Wyczyść kosz rusza tylko `{rejected,deleted}`) → nie kasuje.
- `operational_status = NULL` po `NOT NULL` (INSERT/UPDATE) → odrzucony przez DB (Faza 4).
- **kontrakt:** tablica TS `ACCEPTANCE_TRANSITIONS` == zbiór krawędzi triggera SQL (test pilnujący braku rozjazdu dwóch źródeł).

### 5.5 Subtelność do PRZYPILNOWANIA (nie zgaduj — [E])

**Zmiana `operational_status` na wpisie `pending` JEST legalna przez edycję.** `editItem` ustawia `operational_status` jawnie dla `{pending,accepted}` (**[E]** `items-mutation.ts:236,240`), a `editItemSchema` zawiera `operationalStatus` (**[E]** `validation/items.ts:66`). Reguła „operational tylko dla accepted" należy **wyłącznie do endpointu bulk** `setOperationalStatus` (`:128`), nie do edycji. Konsekwencja projektowa: **NIE dodawać triggera DB na przejścia operacyjne** — złamałby edycję `pending`. Wymiar operacyjny dostaje z backstopu DB **tylko `NOT NULL`**; regułę „bulk operational wymaga accepted" trzyma agregat/serwis (`changeOperationalStatus` + `OperationalChangeNotAllowedError`). Trigger przejść dotyczy **wyłącznie** wymiaru akceptacji.

### 5.6 Nowe „load-bearing" nazwy

- **Błędy domenowe:** `IllegalAcceptanceTransitionError`, `IllegalItemBirthStateError`, `OperationalChangeNotAllowedError`. (Zostają: `ItemNotEditableError`, `ItemConflictError`.)
- **Metody agregatu:** `Item.accept`, `Item.reject`, `Item.moveToTrash`, `Item.restore`, `Item.changeOperationalStatus`, `Item.edit`, `Item.hardDelete`, `Item.createManual`, `Item.fromClassification`.
- **Struktury/DB:** `ACCEPTANCE_TRANSITIONS` (tablica prawdy TS), `BIRTH_STATES`, funkcja SQL `assert_item_acceptance()` + trigger `items_acceptance_transition_guard`, opcjonalny RPC `restore_items`.

---

## Ograniczenia tego planu

- Tryb TYLKO ODCZYT; **żaden plik produkcyjny nie zmieniony**. To PLAN — implementacja poza zakresem L5.
- Dowody `plik:linia` odzwierciedlają stan repo na `created`. Naruszalność INSERT jest **[E]** (demonstrowana w `items-mutation.integration.test.ts`); naruszalność nielegalnego UPDATE własnego wiersza — **[I]** (strukturalnie pewna z polityki RLS, nie osobny exploit).
- Numeracja HTTP (409 vs 422 dla nielegalnego przejścia) to propozycja spójna z istniejącym `[id].ts`; ostateczny kod do potwierdzenia przy implementacji — **[U]** w zakresie preferencji zespołu.
- Plan celowo **nie rusza** pojęć biznesowych poza maszyną stanów wpisu (ujednolicenie języka item/wpis/element/entry, nazwy `completed_*`) — to osobne pozycje rankingu `01` (#2, #3).

## Podsumowanie

Refaktor bierze niezmiennik #1 z destylacji — legalność przejść akceptacji wpisu (N3), z uzupełnieniem o legalny stan narodzin (N3-bis) i dług „zawsze niepusty stan operacyjny" (R4) — i projektuje `Item` jako jedynego strażnika. Diagnoza potwierdza twardo: reguła żyje wyłącznie w sześciu rozproszonych guardach `WHERE` serwisu, a baza/RLS/zod/typy jej nie egzekwują; naruszalność ścieżki INSERT jest **udowodniona we własnym pakiecie testów** (bezpośredni user-scoped insert `acceptance_status:'deleted'` z komentarzem „DB nie waliduje tranzycji"). Projekt to agregat-root `Item` z metodami-preconditions rzucającymi nazwane błędy (fail-fast) i jedną tablicą `ACCEPTANCE_TRANSITIONS` zamiast sześciu literałów. Rekomendacja egzekucji: **kombinacja warstwowa** — agregat TS jako dom modelu i języka, plus twardy backstop DB (`NOT NULL` + `BEFORE INSERT/UPDATE` trigger), bo tylko baza łapie bezpośredni PostgREST, którego serwis ominąć nie może. Najważniejszy wniosek: „nie da się przejść nielegalnie" stanie się prawdą **niezależnie od trasy** dopiero po dołożeniu warstwy DB — sam agregat TS to granica konwencyjna, nie twarda. Plan sześciu odwracalnych faz jest test-first, z jawnym momentem włączenia egzekucji (Fazy 4–5) i flipem testu-świadka dziury.
