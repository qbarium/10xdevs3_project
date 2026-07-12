# Regresja cyklu życia itemu (plan testów — Faza 4) — Plan implementacji

## Przegląd

Faza 4 planu testów pokrywa **ryzyko #5**: „refaktor list/mutacji cicho łamie
model dwóch wymiarów stanu". Dokładamy **trzy testy integracyjne round-trip** do
`tests/integration/items-mutation.integration.test.ts`, które przypinają dwa
inwarianty cyklu kosza na prawdziwej, lokalnej bazie, oraz dopisujemy notatkę do
§6.6 planu testów. **Zero zmian w kodzie produkcyjnym** — to faza testowa, nie
zmiana produktu.

## Analiza stanu obecnego

Model dwóch wymiarów to **dwie niezależne kolumny enum** na tabeli `items`:
`acceptance_status` (`pending|accepted|rejected|deleted`) i `operational_status`
(`new|in_progress|done|cancelled`). Widoki (Do akceptacji / Aktywne / Zakończone /
Anulowane / Kosz) są **wyprowadzane** z pary tych kolumn w locie, nie
przechowywane. Wszystkie mutacje idą przez jeden plik
(`src/lib/services/items-mutation.ts`), odczyty przez drugi
(`src/lib/services/items.ts`, funkcja `listItems`).

Pokrycie trzech inwariantów jest nierówne i to ono wyznacza pracę fazy:

| Inwariant | Gdzie egzekwowany | Stan pokrycia dzisiaj |
| --- | --- | --- |
| (a) kosz pamięta stan operacyjny | `moveToTrash`/`restoreFromTrash` przez **nietykanie** `operational_status` (`items-mutation.ts:143-191`) | **zero testów** |
| (b) `rejected→pending` wraca do bramki | drugi strzeżony UPDATE w `restoreFromTrash` (`items-mutation.ts:181-187`) | kształt zapytania przypięty atrapą (`items-mutation.test.ts:154-172`); realne przejście DB + powrót do widoku — **luka** |
| (c) zrealizowane znika z Aktywnych | allowlista `active` (`items.ts:86`) + rekonsyliacja kliencka | **już przypięte** (`items-operational.integration.test.ts:98-126`, `operational-view.test.ts:38-56`) |

Istniejące testy cyklu kosza w `items-mutation.integration.test.ts:270-307` to
**wyłącznie testy izolacji per-user (IDOR) z Fazy 2** — pilnują, że użytkownik B
nie rusza itemów użytkownika A. Wymiar cyklu życia (round-trip właściciela) jest
całkowicie otwarty. Te same funkcje, ortogonalna troska.

## Pożądany stan końcowy

Po tej fazie `npm run test:integration` (na lokalnym Supabase) uruchamia trzy nowe
testy, które przechodzą i **zapalają się na czerwono**, gdy refaktor złamie
inwariant (a) lub (b):

- item `in_progress`/`done` przechodzi cykl kosz→przywróć bez utraty stanu
  operacyjnego,
- item `rejected` po przywróceniu wraca do bramki walidacji (kolumna `pending`
  **oraz** obecność w widoku „Do akceptacji"),
- mieszana selekcja `[rejected, deleted]` w jednym `restoreFromTrash` rozdziela
  się poprawnie na `pending` i `accepted`.

§6.6 planu testów zyskuje notatkę Fazy 4 (round-trip właściciela na wspólnym
serwisie mutacji, pułapka determinizmu restore).

### Kluczowe odkrycia:

- Wzorzec i wszystkie helpery są gotowe w `items-mutation.integration.test.ts`:
  `signUpClient` (`:29`), `insertItem` (`:39`, domyślnie `pending`/`new`), `rowOf`
  (`:81`, zwraca `acceptance_status` + `operational_status` + `updated_at`),
  `statusOf` (`:62`). Nowe testy dołączają do **istniejącego bloku `describe`**
  (reużycie użytkownika `A` z `beforeAll`), tuż za testami IDOR kosza (`:307`).
- `moveToTrash(supabase, ids)` zwraca `{ updatedIds }`; `restoreFromTrash(supabase, ids)`
  zwraca `Item[]` (świeże wiersze) — potwierdzone przez istniejące testy
  (`:280`, `:289`) i badanie.
- Asercję widoku dla (b) daje `listItems(supabase, userId, defaultCriteria('pending'))`
  — wzorzec z `items-operational.integration.test.ts:106-108`. Wymaga **dodania
  dwóch importów** do pliku testu (dziś nieobecnych): `listItems` z
  `@/lib/services/items`, `defaultCriteria` z `@/lib/services/list-criteria`.
- Wstawienie itemu wprost jako `rejected`/`deleted` przez `insertItem` jest legalne
  i tańsze niż przechodzenie przez mutację — baza nie waliduje tranzycji akceptacji
  (guard żyje w serwisie), tak robi już istniejący test restore (`:288`).

## Czego NIE robimy

- **Nie dokładamy testu inwariantu (c)** — jest już przypięty na serwerze i
  kliencie; nowy test tylko powtarzałby implementację, co §5 planu testów wprost
  odradza.
- **Nie dokładamy nowego testu jednostkowego.** Typ fazy „unit + integration" jest
  spełniony przez istniejący unit kształtu (b) (`items-mutation.test.ts:154-172`) +
  nowe testy integracyjne. Unit dla (a) („payload pomija `operational_status`") tylko
  powielałby implementację i nie złapałby resetu kolumny przez bazę.
- **Nie pokrywamy pułapki NULL** w wymiarze operacyjnym (accepted + `operational_status=NULL`
  niewidoczny we wszystkich widokach) — sąsiad (c), poza rdzeniem ryzyka #5.
- **Nie pokrywamy trybu awarii nietransakcyjnego** `restoreFromTrash` (dwa UPDATE-y,
  drugi rzuca → stan częściowy) — kosztowny do sprowokowania, świadomie niepokryty
  (analogicznie do §7 planu testów).
- **Nie zmieniamy kodu produkcyjnego** ani strategii §1–§5 planu testów (zamrożona).

## Podejście do implementacji

Trzy nowe przypadki `it` w istniejącym bloku `describe`
(`items-mutation.integration.test.ts`), reużywające helpery i użytkownika `A` z
`beforeAll`. Każdy test asertuje realny stan **przez odczyt z bazy** (`rowOf`), a
nie tylko przez zwrotkę serwisu — bo dowodem inwariantu jest to, że kolumna
przeżyła w bazie, nie że serwis zbudował właściwe zapytanie (to już pokrywa unit).
Na końcu: notatka do §6.6.

## Krytyczne szczegóły implementacji

- **Restore jest deterministyczny, nie pamięciowy.** Nie ma kolumny „poprzedni
  stan"; `deleted` może pochodzić tylko z koszowania `accepted`, a `rejected` tylko
  z odrzucenia `pending`. Inwariant (a) dotyczy **wyłącznie `operational_status`**.
  **Nie asertuj** „odrzucone wraca jako odrzucone" — to fałszywe oczekiwanie;
  `rejected` po przywróceniu staje się `pending`, i tak ma być.
- **Rozbieżność plan testów ↔ badanie — rację ma badanie.** §5 planu testów pisze
  „przywrócone wraca do poprzedniego stanu", co sugeruje pamięć stanu akceptacji.
  Badanie (i kod) pokazują determinizm. Zasada §1.3 planu testów rozstrzyga na
  korzyść badania. Test kodujemy wg zachowania z kodu, nie wg sformułowania z §5.
- **`listItems(pending)` zwraca wszystkie pendingi użytkownika `A` z całego
  przebiegu** (inne testy w pliku też wstawiają pendingi). Asercja widoku dla (b)
  musi być `expect(ids).toContain(id)`, **nigdy** równość całej listy. Jeśli liczba
  pendingów przekroczy okno strony i test zacznie migotać, zawęź kryterium
  wyszukiwaniem po unikalnym tytule (wzorzec `.toContain` jak
  `items-operational.integration.test.ts:111`).

## Faza 1: Testy round-trip cyklu życia itemu

### Przegląd

Trzy testy integracyjne round-trip przypinające inwarianty (a) i (b) plus mieszaną
selekcję restore, oraz notatka do książki kucharskiej §6.6.

### Wymagane zmiany:

#### 1. Test inwariantu (a) — kosz pamięta stan operacyjny

**Plik**: `tests/integration/items-mutation.integration.test.ts`

**Cel**: Dowieść, że koszowanie i przywracanie nie tykają `operational_status` —
item z postępem `in_progress` (i wariant `done`) po cyklu kosz→przywróć wraca z
tym samym stanem operacyjnym.

**Kontrakt**: Nowy `it` w istniejącym bloku `describe`, reużywa `A`, `insertItem`,
`rowOf`, `moveToTrash`, `restoreFromTrash`. Scenariusz: `insertItem(A.supabase, A.id,
{ acceptance_status:'accepted', operational_status:'in_progress' })` (analogicznie
drugi item z `done`) → `moveToTrash(A.supabase, [id])`, asercja `rowOf`:
`acceptance_status==='deleted'` **i** `operational_status==='in_progress'`
(nietknięty) → `restoreFromTrash(A.supabase, [id])`, asercja `rowOf`:
`acceptance_status==='accepted'` **i** `operational_status==='in_progress'` (przeżył
round-trip). Wariant `done` asertuje `operational_status==='done'` po przywróceniu.

#### 2. Test inwariantu (b) — `rejected→pending` wraca do bramki (kolumna + widok)

**Plik**: `tests/integration/items-mutation.integration.test.ts`

**Cel**: Dowieść, że przywrócenie itemu `rejected` odkłada go do bramy walidacji —
nie tylko na poziomie kolumny, ale realnie w widoku „Do akceptacji".

**Kontrakt**: Nowy `it`, plus **dwa nowe importy na górze pliku**: `listItems` z
`@/lib/services/items`, `defaultCriteria` z `@/lib/services/list-criteria`.
Scenariusz: `insertItem(A.supabase, A.id, { acceptance_status:'rejected' })` (nadaj
unikalny tytuł) → `restoreFromTrash(A.supabase, [id])` → asercja kolumny `rowOf`:
`acceptance_status==='pending'` → asercja widoku: `listItems(A.supabase, A.id,
defaultCriteria('pending'))` — `.items.map(i=>i.id)` **zawiera** `id`
(`toContain`, nie równość — patrz Krytyczne szczegóły).

#### 3. Test mieszanej selekcji restore

**Plik**: `tests/integration/items-mutation.integration.test.ts`

**Cel**: Dowieść, że dwa strzeżone UPDATE-y w `restoreFromTrash` nie kolidują —
jedno wywołanie na `[rejected, deleted]` rozdziela itemy na właściwe gałęzie.

**Kontrakt**: Nowy `it`, reużywa helpery. Scenariusz: `rejectedId = insertItem(...,
{ acceptance_status:'rejected' })`, `deletedId = insertItem(..., { acceptance_status:'deleted',
operational_status:'in_progress' })` → `restoreFromTrash(A.supabase, [rejectedId,
deletedId])` (zwrotka `Item[]` zawiera oba id) → asercje `rowOf`:
`rejectedId → acceptance_status==='pending'`; `deletedId → acceptance_status==='accepted'`
**i** `operational_status==='in_progress'` (zachowany).

#### 4. Notatka Fazy 4 do książki kucharskiej

**Plik**: `context/foundation/test-plan.md`

**Cel**: Dopisać do §6.6 notatkę o tym, czego faza nauczyła — dla przyszłego autora
testów cyklu życia.

**Kontrakt**: Nowy punkt „Faza 4 — regresja cyklu życia itemu (lipiec 2026)" w §6.6,
2–3 zdania: round-trip właściciela na wspólnym serwisie mutacji jako najtańszy
sensowny sygnał; pułapka „kosz pamięta **tylko** wymiar operacyjny, restore jest
deterministyczny (`deleted→accepted`, `rejected→pending`), nie odtwarza poprzedniego
stanu akceptacji"; mieszana selekcja dowodzi niekolidujących guardów.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Testy integracyjne przechodzą: `npm run test:integration`
- Nowe testy faktycznie się wykonują (nie `describe.skip` — wymaga ustawionych
  `SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY` i działającego lokalnego Supabase)
- Linting przechodzi: `npm run lint`

#### Weryfikacja ręczna:

- **Dowód, że testy mają zęby**: tymczasowo dopisz `operational_status:'new'` do
  payloadu `moveToTrash` (`items-mutation.ts`) → test (a) czerwony; cofnij.
  Tymczasowo „uprość" `restoreFromTrash` do jednego UPDATE
  `.in('acceptance_status',['deleted','rejected']).update({acceptance_status:'accepted'})`
  → test (b) czerwony; cofnij.
- Lokalny Supabase działa (kontenery Docker `Up`) przed uruchomieniem testów
- §6.6 planu testów zawiera sensowną notatkę Fazy 4 (przejrzane przez człowieka)

**Uwaga implementacyjna**: Po dodaniu testów i przejściu weryfikacji automatycznej
zatrzymaj się na weryfikację ręczną (dowód zębów) przed odhaczeniem fazy. Bloki fazy
używają zwykłych punktorów; odpowiadające im pola wyboru są w sekcji `## Postęp`.

---

## Strategia testowania

### Testy jednostkowe:

- Brak nowych. Kształt zapytania (b) już przypięty (`items-mutation.test.ts:154-172`);
  nowy unit powielałby implementację.

### Testy integracyjne:

- Trzy nowe testy round-trip (opisane w Fazie 1), wszystkie w istniejącym bloku
  `describe` w `items-mutation.integration.test.ts`.
- Warstwa: funkcja serwisowa na prawdziwej lokalnej bazie z RLS (nie żądanie HTTP —
  e2e poza zakresem, §4/§7 planu testów).

### Kroki testowania ręcznego:

1. Uruchom `npm run test:integration` — trzy nowe testy zielone.
2. Wprowadź regresję w `moveToTrash` (dopisek `operational_status:'new'`) →
   potwierdź czerwony test (a) → cofnij.
3. Wprowadź regresję „jeden UPDATE" w `restoreFromTrash` → potwierdź czerwony
   test (b) → cofnij.

## Uwagi dotyczące migracji

Brak — faza testowa, bez zmian schematu i kodu produkcyjnego.

## Referencje

- Powiązane badania: `context/changes/testing-item-lifecycle-regression/research.md`
- Nadrzędny plan testów: `context/foundation/test-plan.md` §2 (ryzyko #5), §3 (Faza 4),
  §6.2/§6.6
- Wzorzec testu: `tests/integration/items-mutation.integration.test.ts:270-307`
  (blok kosza, IDOR — round-trip dołącza tuż za nim)
- Wzorzec asercji widoku: `tests/integration/items-operational.integration.test.ts:98-126`
- Serwis: `src/lib/services/items-mutation.ts:143-191` (`moveToTrash`/`restoreFromTrash`)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po
> zakończeniu kroku. Nie zmieniaj nazw tytułów kroków.

### Faza 1: Testy round-trip cyklu życia itemu

#### Automatyczne

- [x] 1.1 Test inwariantu (a) — round-trip `move→restore` zachowuje `operational_status` (`in_progress` + `done`) — dodany, zielony
- [x] 1.2 Test inwariantu (b) — `rejected→pending`: kolumna + widok `listItems('pending')` (dodane importy `listItems`/`defaultCriteria`) — dodany, zielony
- [x] 1.3 Test mieszanej selekcji — `restoreFromTrash([rejected, deleted])` rozdziela na `pending`/`accepted` — dodany, zielony
- [x] 1.4 `npm run test:integration` przechodzi, nowe testy wykonane (nie pominięte)
- [x] 1.5 `npm run lint` przechodzi

#### Ręczne

- [x] 1.6 Dowód zębów: regresja w `moveToTrash` zapala test (a); regresja „jeden UPDATE" w `restoreFromTrash` zapala test (b); oba cofnięte
- [x] 1.7 §6.6 planu testów uzupełnione notatką Fazy 4 (przejrzane)
