# Testy kontraktu klasyfikatora i stanu sesji (Faza 3 planu testów) — Plan implementacji

## Przegląd

Faza 3 wdrożenia planu testów (`context/foundation/test-plan.md` §3, wiersz „Kontrakt klasyfikatora + stan sesji") przypina **regresją** istniejący kontrakt odpowiedzi klasyfikatora i model stanu sesji. Badanie potwierdziło, że wszystkie cztery zachowania (walidacja kontraktu, „0 itemów" jako sukces, limit 100, stan sesji + ponowienie) już istnieją w kodzie i są zgodne z intencją planów S-02/S-08 — nie łatamy braków w produkcie, tylko **domykamy brakujące ścianki pokrycia testami**.

Zakres domknięcia (ustalony w wywiadzie planistycznym):

- **Rodzina „naruszenie kontraktu itemu"** na warstwie `classify()` — pięć wariantów braku/niepoprawności pola obowiązkowego (dziś testowany jest tylko zły `type`).
- **Rozróżnienie „0 itemów" ≠ „pusty `content`"** — para asercji, która pilnuje najczęściej mylonego „nie-błędu" ryzyka #6.
- **Cichy strip nadmiarowego pola** — item z dodatkowym polem to sukces z odrzuconym polem, nie błąd kontraktu.
- **Granica dokładnie 100** — strażnik off-by-one obok istniejącego 101.
- **Spłaszczenie przyczyn na endpoincie** — jeden pin, że naruszenie kontraktu → `200 failed/contract`.
- **Sesja `storage` trwale nie-do-ponowienia** — krótki pin + notka w negatywnej przestrzeni (§7).

Brak nowego kodu produkcyjnego. Wynik to dopisy do istniejących plików testowych (konwencja repo: test obok modułu) i dwie notki w `test-plan.md`.

## Analiza stanu obecnego

Ścieżka kontraktu: `POST /api/ingest/classify` → `runClassification` (`classify-core.ts`) → `classify()` (`classifier.ts`) → `parseChatResponse` (`request.ts`) + zod (`schema.ts`). Ten sam rdzeń woła endpoint ponowienia (`retry.ts`).

**Walidacja kontraktu jest czterowarstwowa** (`classifier.ts`):

1. Ciało HTTP jako JSON (`classifier.ts:88-93`) → `ClassifierContractError`.
2. Koperta OpenAI (`parseChatResponse`, `request.ts:59-72`): `finish_reason:"length"`, `refusal`, brak/pusty `content` → `ClassifierContractError`.
3. Treść jako JSON i wyciągnięcie `.items` (`classifier.ts:98-103`); brak klucza `items` → `payload = undefined`.
4. zod na tablicy itemów (`classifier.ts:105-108`): `classificationResultSchema.safeParse(payload)`; `!success` → `ClassifierContractError`.

**Schemat itemu** (`schema.ts:13-20`): `type` (enum 5 typów), `title` (`min(1)`), `description` (`string`, może być pusty). Zwykły `z.object` bez `.strict()` → **nadmiarowe pola są cicho usuwane, nie odrzucane**.

**Rdzeń** (`classify-core.ts:56-90`): `> 100` → `failed/too_many_items` (twarde odrzucenie całego wsadu, `failSession`); `=== 0` → `completed_no_items` (`finalizeEmpty`, bez RPC); reszta → `persistItems` → `completed_with_items`; wyjątek → `mapClassifyError` → `failed/<kod>`. Mapowanie na HTTP w `classifyResultToResponse` (`classify-core.ts:98-110`): `too_many_items` → `422 ok:false`, pozostałe (w tym `failed` z klasyfikacji) → `200 ok:true`.

**Model stanu sesji** (`classification_schema.sql:23-24`): enum `('processing','completed_with_items','completed_no_items','failed')` — bez `pending`, bez `succeeded`. Ponowienie tylko dla `failed`, przez atomową bramkę TOCTOU `reopenSession` (`WHERE status='failed'`).

### Co jest już przypięte (nie dublować)

| Powierzchnia | Plik | Pokryte |
| --- | --- | --- |
| Kontrakt (`classify()`, fetch-stub) | `src/lib/ai/classifier.test.ts` | happy path (N=1), klucz nie w URL/body, `store:false`, 401→Auth, 500→Provider, obcięcie (`length`)→Contract, **zły `type`**→Contract |
| Rdzeń (`classify()` mock) | `src/lib/ai/classify-core.test.ts` | mapowanie 4 stanów na HTTP (422/200), happy path, 0-itemów, **101**→too_many_items, AuthError→invalid_key, cause providera NIE w logach |
| Endpoint ingest | `src/pages/api/ingest/classify.test.ts` | 401/400/409, happy, 0-itemów, 101→422, AuthError→invalid_key, AbortError→timeout, ścieżka pliku (typ/rozmiar/encoding/storage/empty), higiena logów |
| Endpoint retry | `src/pages/api/import-sessions/retry.test.ts` | 401/400, happy paste, re-fail→kod, missing_key, not_retryable, TOCTOU race, RLS 404, **storage download fail**→storage, encoding, empty |
| Czysty mapper hooka | `src/components/hooks/useSessionRetry.test.ts` | wszystkie kształty odpowiedzi retry |

### Luki, które domyka ta faza

- **Rodzina pól itemu**: brak `title`, `title:""`, brak `type`, brak `description`, brak klucza `items` — dziś reprezentowana tylko przez zły `type`.
- **„0 itemów" vs „pusty `content`"**: brak jawnej pary na warstwie `classify()` (istnieje 0-itemów na rdzeniu, ale nie kontrast z pustym `content`).
- **Nadmiarowe pole cicho odrzucone**: brak strażnika, że to sukces (regresja przy ewentualnym `.strict()`).
- **Granica dokładnie 100**: testowane tylko 101.
- **Spłaszczenie kontraktu na endpoincie**: `classify.test.ts` ma `invalid_key`/`timeout`, ale NIE `contract`.
- **Sesja `storage` trwale nie-do-ponowienia**: istnieje „download storage → storage", brak asercji nieodwracalności (brak reopenu/klasyfikacji).

## Pożądany stan końcowy

Zestaw jednostkowy (`npm test`) zawiera regresję, która:

- zaświeci się na czerwono, gdy dowolne pole obowiązkowe itemu przestanie być egzekwowane na granicy zod;
- utrwala, że poprawne `{"items":[]}` to sukces (`[]`), a pusty `content` to `ClassifierContractError` — dwie różne ścieżki;
- utrwala, że nadmiarowe pole jest cicho odrzucane (item bez tego pola), nie odrzucane jako błąd;
- utrwala ostrą granicę limitu (dokładnie 100 przechodzi);
- utrwala, że naruszenie kontraktu spłaszcza się na endpoincie do `200 failed/contract`;
- utrwala, że sesja z nieudanym uploadem (`storage`) jest w praktyce nie-do-ponowienia.

Plan testów (`test-plan.md`) nazywa sesję `storage` jako świadomy, znany tryb awarii (§7) i ma notkę per faza 3 (§6.6).

**Weryfikacja stanu końcowego:** `npm test` przechodzi w całości; nowe testy padają, jeśli tymczasowo osłabić dowolne pole w `classifiedItemSchema` albo zmienić `>` na `>=` w `MAX_ITEMS`.

### Kluczowe odkrycia

- Wzorzec mockowania warstwy kontraktu: `vi.mock("astro:env/server", …)` + `vi.stubGlobal("fetch", fetchMock)` + helper `mockResponse` — gotowy w `src/lib/ai/classifier.test.ts:5-36`. Nowe scenariusze to kolejne `it()` z inną `body` koperty.
- Wzorzec mockowania rdzenia/endpointu: `vi.mock("@/lib/ai/classifier", () => ({ classify: vi.fn() }))` — sterujesz wynikiem, ćwiczysz dyspozytor. Wzór w `classify-core.test.ts:7` i `classify.test.ts:10`.
- Przyczyny naruszenia kontraktu są rozróżnialne **tylko** na poziomie `classify()` (wszystkie rzucają `ClassifierContractError` z innym komunikatem); na wyjściu HTTP kolapsują do kodu `"contract"` (`mapClassifyError`, `classify-core.ts:45`).
- Brak klucza `items` w treści → `payload = undefined` → `safeParse(undefined)` pada (`classifier.ts:100-108`) — czyli ta sama gałąź `ClassifierContractError` co złamany item.
- `nadmiarowe pole`: schemat bez `.strict()` (`schema.ts:13-17`) usuwa pola nadmiarowe; oczekiwany wynik to item **bez** tego pola.

## Czego NIE robimy

- **Nie testujemy warstwy koperty poza „pustym content"** — `refusal` i nie-JSON body/content zostają obsłużone w kodzie, ale bez strażnika regresji (decyzja: rodzina pól itemu, nie pełna koperta).
- **Nie dublujemy** istniejących testów 101 / storage / mapowania 4 stanów / higieny logów.
- **Nie ruszamy strategii §1–§5** planu testów — tylko §7 (negatywna przestrzeń) i §6.6 (notka per faza).
- **Nie testujemy jakości klasyfikacji AI** (czy dobrze klasyfikuje) — §7 planu, poza zakresem; testujemy obsługę odpowiedzi, nie jej trafność.
- **Nie ruszamy runtime części ryzyka #3** (realne zachowanie Cloudflare Workers pod granicznym wsadem) — to Faza 5.
- **Nie utwardzamy kodu produkcyjnego** — sesja `storage` pozostaje nie-do-ponowienia; przypinamy istniejące zachowanie, nie zmieniamy go.

## Podejście do implementacji

Trzy fazy, każda samodzielnie weryfikowalna przez `npm test` i przechodząca przez kolumny boardu jako osobne pod-zgłoszenie. Kolejność: najpierw trzon (warstwa `classify()`), potem drobne strażniki brzegowe rozproszone po rdzeniu/endpoincie/retry, na końcu dokumentacja. Wszystkie asercje idą do **istniejących** plików testowych; nie tworzymy nowych plików.

## Faza 1: Rodzina kontraktu itemu + nie-błędy

### Przegląd

Domknięcie warstwy `classify()` w `src/lib/ai/classifier.test.ts` z atrapą `fetch`. Trzon fazy: pięć wariantów naruszenia pola itemu, trzy „nie-błędy" i jawny „poprawne N". Wszystkie asercje na typie wyjątku (`ClassifierContractError`) albo na zwróconej wartości — tam, gdzie przyczyny są rozróżnialne.

### Wymagane zmiany

#### 1. Rodzina „naruszenie kontraktu itemu"

**Plik**: `src/lib/ai/classifier.test.ts`

**Cel**: przypiąć, że każde brakujące lub niepoprawne pole obowiązkowe itemu jest odrzucane na granicy zod jako `ClassifierContractError` — dziś reprezentowane tylko przez zły `type`.

**Kontrakt**: pięć nowych `it()` w bloku `describe("classify — gałąź chat …")`, każdy z `body` koperty z jednym itemem naruszającym schemat, asercja `await expect(runClassify()).rejects.toThrow(ClassifierContractError)`:

| Scenariusz | Treść itemu w `content` |
| --- | --- |
| brak `title` | `{ type: "task", description: "x" }` |
| `title` pusty (`min(1)`) | `{ type: "task", title: "", description: "x" }` |
| brak `type` | `{ title: "x", description: "y" }` |
| brak `description` | `{ type: "task", title: "x" }` |
| brak klucza `items` w treści | `content = JSON.stringify({ foo: 1 })` (→ `payload = undefined` → zod pada) |

Wzorzec koperty jak w istniejącym „odpowiedź łamiąca kontrakt itemów" (`classifier.test.ts:105-111`): `body: { choices: [{ message: { content }, finish_reason: "stop" }] }`.

#### 2. Nie-błędy: strip nadmiarowego pola + para 0-itemów / pusty content

**Plik**: `src/lib/ai/classifier.test.ts`

**Cel**: przypiąć trzy zachowania, które łatwo pomylić z awarią — cichy strip nadmiarowego pola, `{"items":[]}` jako sukces, pusty `content` jako błąd kontraktu.

**Kontrakt**: trzy nowe `it()`:

- **nadmiarowe pole cicho odrzucone** — `content` z itemem `{ type:"task", title:"x", description:"y", foo:"bar" }`; asercja `expect(await runClassify()).toEqual([{ type:"task", title:"x", description:"y" }])` (bez `foo`). To pozytywna asercja (sukces), nie `rejects`.
- **poprawne `{"items":[]}` → `[]`** — `content = JSON.stringify({ items: [] })`; asercja `expect(await runClassify()).toEqual([])`. Jawne utrwalenie, że pusta tablica to sukces, nie błąd.
- **pusty `content` → `ClassifierContractError`** — `body: { choices: [{ message: { content: "" }, finish_reason: "stop" }] }`; asercja `rejects.toThrow(ClassifierContractError)`. Komentarz w teście: to kontrast do `{"items":[]}` — pusta *treść koperty* to naruszenie kontraktu (`parseChatResponse`, `request.ts:67-70`), a nie zero itemów.

#### 3. Jawny „poprawne N" (N > 1)

**Plik**: `src/lib/ai/classifier.test.ts`

**Cel**: uzupełnić change.md scenariusz „poprawne N" — istniejący happy path testuje tylko N=1.

**Kontrakt**: jeden `it()` z `content` zawierającym trzy różnotypowe itemy; asercja `toEqual` na trzyelementowej, zwalidowanej tablicy (kolejność i pola zachowane).

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`
- Typecheck przechodzi (część `npm run lint` — reguły z typami)

#### Sanity mutacyjny (agent, jednorazowo)

- Agent tymczasowo zmienia `title: z.string().min(1)` → `z.string()` w `schema.ts`, uruchamia `npm test`, potwierdza czerwony test „title pusty", cofa zmianę (dowód, że test faktycznie egzekwuje granicę — nie jest zielony przypadkiem).

**Uwaga implementacyjna**: Całą fazę wykonuje i weryfikuje agent (testy jednostkowe + sanity mutacyjny). Po zielonym `npm test` agent kontynuuje do Fazy 2 — bez delegowania weryfikacji człowiekowi.

---

## Faza 2: Strażniki brzegowe i spłaszczenie

### Przegląd

Trzy małe, rozproszone dopisy do istniejących plików rdzenia/endpointu/retry. Każdy celuje w **nowy kąt**, nie dubluje istniejącego pokrycia (101, storage-download, mapowanie stanów są już przypięte).

### Wymagane zmiany

#### 1. Granica dokładnie 100 przechodzi

**Plik**: `src/lib/ai/classify-core.test.ts`

**Cel**: strażnik off-by-one — dziś testowane jest tylko 101 (`items(101)` → `too_many_items`); brak dowodu, że dokładnie 100 przechodzi.

**Kontrakt**: jeden `it()` w bloku `describe("runClassification …")`: `vi.mocked(classify).mockResolvedValue(items(100))`, `vi.mocked(persistItems).mockResolvedValue(100)`; asercja `toEqual({ status:"completed_with_items", itemCount:100 })` + `persistItems` wołane raz, `failSession` NIE wołane. Komplementarny do istniejącego „> 100 → failed/too_many_items" (`classify-core.test.ts:78-83`).

#### 2. Spłaszczenie kontraktu na endpoincie → `200 failed/contract`

**Plik**: `src/pages/api/ingest/classify.test.ts`

**Cel**: przypiąć, że naruszenie kontraktu — niezależnie od przyczyny — spłaszcza się na wyjściu HTTP do jednego kodu `"contract"` przy `200 ok:true` (bo `failed` to normalny stan przepływu, nie awaria transportu). Dziś endpoint testuje `invalid_key` i `timeout`, ale nie `contract`.

**Kontrakt**: jeden `it()` w bloku `describe("POST /api/ingest/classify")`: `vi.mocked(classify).mockRejectedValue(new ClassifierContractError("dowolny"))`; asercja `res.status === 200`, `body.status === "failed"`, `body.code === "contract"`, `failSession` wołane z `"contract"`. Import `ClassifierContractError` z `@/types` (dołożyć do istniejącej listy importów błędów).

#### 3. Sesja `storage` trwale nie-do-ponowienia

**Plik**: `src/pages/api/import-sessions/retry.test.ts`

**Cel**: przypiąć nieodwracalność — sesja plikowa, której nie da się wczytać (`SessionInputStorageError`), przy ponowieniu znów kończy `failed/storage`, i to **przed** reopenem oraz klasyfikacją (nie da się ruszyć dalej, bo nie ma czego wczytać).

**Kontrakt**: jeden `it()` (rozszerza kąt istniejącego „download pliku pada → storage", `retry.test.ts:153-158`): `loadSessionInput` rzuca `SessionInputStorageError`; asercje — `body.code === "storage"`, `failSession` z `"storage"`, ORAZ `reopenSession` NIE wołane i `classify` NIE wołane (dowód, że sesja nie przechodzi do ponownej klasyfikacji). Komentarz: to świadomy tryb awarii, nazwany w §7 (Faza 3).

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Testy jednostkowe przechodzą: `npm test`
- Lint przechodzi: `npm run lint`

#### Sanity mutacyjny (agent, jednorazowo)

- Agent tymczasowo zmienia `>` → `>=` w `MAX_ITEMS` (`classify-core.ts`), uruchamia `npm test`, potwierdza czerwony test granicy 100, cofa zmianę.
- Agent tymczasowo mapuje `ClassifierContractError` na inny kod niż `"contract"` (`mapClassifyError`, `classify-core.ts:45`), uruchamia `npm test`, potwierdza czerwony test spłaszczenia, cofa zmianę.

**Uwaga implementacyjna**: Całą fazę wykonuje i weryfikuje agent. Po zielonym `npm test` agent kontynuuje do Fazy 3 — bez delegowania weryfikacji człowiekowi.

---

## Faza 3: Dokumentacja planu testów

### Przegląd

Dwie notki w `context/foundation/test-plan.md` — bez zmian w strategii §1–§5. §7 nazywa sesję `storage` jako świadomy tryb awarii; §6.6 dostaje notkę per faza 3 (konwencja książki kucharskiej z CLAUDE.md).

### Wymagane zmiany

#### 1. §7 — sesja `storage` jako świadomy tryb awarii

**Plik**: `context/foundation/test-plan.md`

**Cel**: udokumentować, że sesja z nieudanym uploadem pliku (`code:"storage"`) jest trwale nie-do-ponowienia — świadomy, znany tryb awarii, nie regresja do naprawy.

**Kontrakt**: nowy punkt w liście §7 („Czego świadomie NIE testujemy" / negatywna przestrzeń), w stylu istniejących wpisów (jedno zdanie + źródło). Źródło: badanie Fazy 3, Open Question 1. Odnotować, że zachowanie jest przypięte pinem (Faza 2), ale utwardzenie (odzyskiwalność uploadu) to osobna zmiana produktu, poza tą fazą.

#### 2. §6.6 — notka per faza 3

**Plik**: `context/foundation/test-plan.md`

**Cel**: dopisać 2–3 zdania o tym, czego nauczyła Faza 3 (konwencja: „Po każdej zrobionej fazie /10x-implement dopisuje tu 2–3 zdania").

**Kontrakt**: nowy punkt w §6.6 („Faza 3 — kontrakt klasyfikatora + stan sesji (lipiec 2026)"), w stylu istniejących wpisów Fazy 1 i 2. Treść: kontrakt był już zaimplementowany zgodnie z intencją (żadnego dryfu), faza domknęła pokrycie rodziny „bez pól" i rozróżnienia 0-itemów vs pusty content; kluczowa pułapka — przyczyny naruszenia rozróżnialne tylko na warstwie `classify()`, na HTTP kolapsują do `"contract"`.

### Kryteria sukcesu

#### Weryfikacja automatyczna (agent)

- `test-plan.md` zawiera nowy punkt §7 (sesja `storage`) oraz §6.6 (notka per faza 3) — agent grepuje nagłówki/treść
- Prettier nie zgłasza zmian po zapisie: `npm run format`
- `git diff context/foundation/test-plan.md` pokazuje zmiany wyłącznie w §6.6 i §7 — agent sprawdza zakres diffa, potwierdzając, że §1–§5 są nietknięte

**Uwaga implementacyjna**: Całą fazę wykonuje i weryfikuje agent. To ostatnia faza — po zielonej weryfikacji agent oznacza wiersz §3 planu testów jako `complete`.

---

## Strategia testowania

### Testy jednostkowe

- Warstwa kontraktu (`classifier.test.ts`): rodzina pól itemu, strip nadmiarowego pola, para 0-itemów / pusty content, poprawne N — wszystkie z atrapą `fetch` na spreparowanej kopercie OpenAI.
- Rdzeń (`classify-core.test.ts`): granica dokładnie 100.
- Endpoint (`classify.test.ts`): spłaszczenie kontraktu → `200 failed/contract`.
- Retry (`retry.test.ts`): storage trwale nie-do-ponowienia.

### Testy integracyjne

- Brak. Faza 3 jest w całości jednostkowa (§3 planu testów, kolumna „Typy testów": unit). Warstwa integracyjna to Faza 4 (regresja cyklu życia itemu) i nie należy tutaj.

### Weryfikacja wykonywana przez agenta

Cała faza jest wykonywana i weryfikowana przez agenta — brak kroków delegowanych człowiekowi (ani testów manualnych, ani przeglądu kodu).

1. `npm test` — cały zestaw jednostkowy zielony.
2. Sanity mutacyjny (jednorazowo, agent): osłab pole schematu lub zmień granicę limitu, potwierdź czerwony test, cofnij (szczegóły w kryteriach każdej fazy).
3. `git diff` — potwierdza, że zmiany dotyczą wyłącznie plików testowych i §6.6/§7 planu testów.

## Uwagi dotyczące wydajności

Brak implikacji wydajnościowych — czyste testy jednostkowe na mockach, bez I/O sieciowego ani bazy.

## Uwagi dotyczące migracji

Brak. Żadnych zmian w schemacie ani danych; wyłącznie testy i dokumentacja.

## Referencje

- Powiązane badania: `context/changes/testing-classifier-contract-session-state/research.md`
- Plan testów: `context/foundation/test-plan.md` §2 (ryzyka #3, #6), §3 (faza 3), §6.1/§6.4 (wzorce)
- Kontrakt klasyfikatora: `src/lib/ai/classifier.ts:39`, `src/lib/ai/request.ts:59-72`, `src/lib/ai/schema.ts:13-20`
- Rdzeń i mapowanie HTTP: `src/lib/ai/classify-core.ts:56-110`
- Istniejące testy do naśladowania: `src/lib/ai/classifier.test.ts`, `src/lib/ai/classify-core.test.ts`, `src/pages/api/ingest/classify.test.ts`, `src/pages/api/import-sessions/retry.test.ts`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Rodzina kontraktu itemu + nie-błędy

#### Automatyczne (agent)

- [x] 1.1 Testy jednostkowe przechodzą: `npm test` — 827c4d1
- [x] 1.2 Lint i typecheck przechodzą: `npm run lint` — 827c4d1
- [x] 1.3 Sanity mutacyjny: osłabienie `title.min(1)` → `z.string()` zapala test „title pusty" na czerwono; zmiana cofnięta — 827c4d1

### Faza 2: Strażniki brzegowe i spłaszczenie

#### Automatyczne (agent)

- [x] 2.1 Testy jednostkowe przechodzą: `npm test` — a202d54
- [x] 2.2 Lint przechodzi: `npm run lint` — a202d54
- [x] 2.3 Sanity mutacyjny: `>` → `>=` w `MAX_ITEMS` zapala test granicy 100 na czerwono; zmiana cofnięta — a202d54
- [x] 2.4 Sanity mutacyjny: zmapowanie `ClassifierContractError` na inny kod zapala test spłaszczenia na czerwono; zmiana cofnięta — a202d54

### Faza 3: Dokumentacja planu testów

#### Automatyczne (agent)

- [x] 3.1 `test-plan.md` zawiera nowy punkt §7 (sesja `storage`) oraz §6.6 (notka per faza 3)
- [x] 3.2 Prettier nie zgłasza zmian po zapisie: `npm run format`
- [x] 3.3 `git diff test-plan.md` dotyka wyłącznie §6.6 i §7 (§1–§5 nietknięte); wiersz §3 planu testów → `complete`
