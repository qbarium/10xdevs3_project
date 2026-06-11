# Pierwsza bramkowana generacja (S-02) — Plan implementacji

## Przegląd

S-02 to **gwiazda przewodnia** TaskerLighta: pierwszy moment, w którym surowy wsad realnie zamienia się w sklasyfikowane itemy. Zalogowany użytkownik ze skonfigurowanym kluczem BYOK (z S-01) wkleja tekst lub wrzuca plik `.txt`/`.md`, klika submit, widzi **blokujący wskaźnik aktywności** podczas synchronicznej klasyfikacji przez OpenAI (timeout 60 s), a po jej zakończeniu — wygenerowane **typowane itemy jako pendingi** w widoku „Elementy do akceptacji". Wycinek dowodzi najbardziej ryzykownego założenia produktu: że klasyfikacja AI poprawnie typuje wsad (mierzone acceptance rate ≥ 70%).

Zakres jest pełny (paste + plik), ale fazy są zaprojektowane tak, by rozpaść się na **dwa niezależnie mergowalne PR-y** na granicy ścieżki wejścia:

- **PR1 (Fazy 1–5)** — ścieżka wklejania end-to-end, mergowalna BEZ Supabase Storage. To samodzielnie dowodzi gwiazdę przewodnią.
- **PR2 (Fazy 6–8)** — ścieżka plikowa (Storage + dekodowanie kodowań + upload), dokłada się do działającego rdzenia z PR1.

## Analiza stanu obecnego

- **Fundament BYOK gotowy (F-01 + S-01):** `decryptApiKey(envelope)` (`src/lib/services/byok-crypto.ts:53`), tabela `profiles` z kluczem zaszyfrowanym i RLS (`supabase/migrations/20260608200206_profiles.sql`), helper statusu klucza i bramkowanie US-06 (`src/lib/services/profile-key.ts`, `src/components/profile/MissingKeyBanner.astro`). S-02 odszyfrowuje klucz usera tuż przed wywołaniem.
- **Logger/masker FR-026 gotowy:** `logger.{info,warn,error}` + `reportError` (`src/lib/services/logger.ts`), masker `sk-…` (`src/lib/services/mask.ts:35`). S-02 loguje wyłącznie metadane, nigdy treści wsadu ani klucza.
- **Wzorzec migracji+RLS:** 4 polityki per-operacja, `(select auth.uid()) = id`, rola `authenticated` (`supabase/migrations/20260608200206_profiles.sql`).
- **Kanoniczny wzorzec UI:** strona SSR z guardem → host React island z propsem serwerowym → island woła hook → hook woła JSON endpoint (`src/pages/profile.astro` + `src/components/profile/ApiKeyManager.tsx` + `src/components/hooks/useApiKey.ts` + `src/pages/api/profile/byok-key.ts`).
- **Rozdział testów:** `*.test.ts` (unit/CI, mockowane — `vitest.config.ts`) vs `*.integration.test.ts` (lokalny Supabase + KEK — `vitest.integration.config.ts`).
- **shadcn dostępne:** `button`, `input`, `label`, `card`, `alert`. Brakuje `textarea`, `dialog`.
- **Brak w repo (S-02 wprowadza po raz pierwszy):** jakiegokolwiek wywołania `fetch` z `AbortController`/timeoutem; zależności `zod`; biblioteki dekodowania kodowań; jakiegokolwiek kodu OpenAI; Supabase Storage (wyłączone w `supabase/config.toml`, brak bucketa). **Nie ma i nie będzie globalnego klucza OpenAI w env** — klucz jest wyłącznie per-user z profilu (model BYOK).
- **Runtime:** Workers Free (CPU 10 ms); 60 s klasyfikacji to wall-clock fetch-wait (nie liczy się do CPU), więc na Free typowy wsad przechodzi; weryfikacja lokalnie na `wrangler dev`.

## Pożądany stan końcowy

Zalogowany użytkownik z kluczem BYOK wchodzi na `/ingest`, wkleja tekst (lub w PR2 wrzuca plik), klika „Klasyfikuj". UI blokuje interakcję, pokazuje wskaźnik aktywności („analizujemy wsad"), a po klasyfikacji przechodzi w jeden z trzech stanów końcowych: „zakończona z N itemami" (z auto-przejściem do walidacji), „zakończona bez itemów" lub „niepowodzenie" (z „Spróbuj ponownie"). Po sukcesie z itemami użytkownik trafia na `/items` (filtr główny „Elementy do akceptacji") i widzi wszystkie swoje pendingi jako typowane itemy (read-only). Każdy item jest powiązany z sesją importu (audit trail). Surowy wsad trafia wyłącznie do OpenAI (`store:false`), klucz nigdy nie pojawia się w logach, RLS izoluje dane każdego usera.

**Weryfikacja:** `/ingest` (po zalogowaniu, z kluczem) klasyfikuje wklejony tekst i pokazuje pendingi na `/items`; bez klucza pokazuje bramkę US-06; integ-test potwierdza izolację RLS (`items`/`import_sessions`) i atomowy zapis; unit-test waliduje kontrakt JSON, resolver i sanityzację; logi zawierają tylko metadane.

### Kluczowe odkrycia:

- F-01/S-01 dostarczają komplet BYOK — S-02 tylko woła `decryptApiKey` i `getKeyStatus`, nie dotyka prymitywów (`src/lib/services/byok-crypto.ts:53`, `src/lib/services/profile-key.ts:40`).
- Responses API używa `text.format` dla Structured Outputs (NIE `response_format` jak Chat Completions) — resolver buduje dwa kształty żądania (`docs/api/openai_resonses_api.txt`, wytyczne §8).
- Pole `user` jest w Responses API **deprecated** → następcą jest `safety_identifier` (cel FR-025) — dla gałęzi Responses celujemy w `safety_identifier`, dla Chat Completions używamy `user`.
- Conversations API jest nieistotny dla single-shot — wołamy bezstanowo, bez `conversation`/`previous_response_id` (potwierdzone w `docs/api/openai_conversation_api.txt`).
- Atomowość zapisu na Supabase (brak transakcji klienta) realizujemy przez Postgres RPC w kontekście usera (SECURITY INVOKER → RLS egzekwowane).

## Czego NIE robimy

- **Akceptacji / odrzucenia / edycji pendingów** (US-02/US-03, FR-007/FR-010) — to S-03. S-02 kończy na read-only liście pendingów.
- **Stanów operacyjnych zadania** (US-04, FR-009) — to S-04. Kolumna `operational_status` istnieje w schemacie, ale S-02 jej nie zmienia (poza domyślną wartością).
- **Ręcznego dodawania itemów** (US-08, FR-028) — to S-07. FK `import_session_id` jest nullable pod ten przyszły wycinek, ale S-02 zawsze go wypełnia.
- **Dziennika sesji importu + retry z dziennika** (US-07, FR-027) — to S-08. S-02 tworzy sesje i obsługuje manualny „Spróbuj ponownie" w UI submitu, ale nie buduje widoku dziennika.
- **Audio jako wsad** (FR-004, FR-019) — poza MVP; resolver nie planuje modelu transkrypcji.
- **Wyboru modelu w UI** (FR-023) — model stały z konfiguracji.
- **Gałęzi Responses w pełni** — w S-02 tylko szew (rzuca „nieobsługiwany w MVP"); ciało dopiszemy, gdy przełączymy na model rozumujący.
- **Utrwalania pól `confidence`/`importance`/`tags`** (FR-005) — MVP używa tylko `type`/`title`/`description`.
- **Auto-retry** — tylko manualny „Spróbuj ponownie" (FR-006).
- **Upgrade'u do Workers Paid z góry** — zostajemy na Free; upgrade tylko jeśli prod realnie utnie na CPU.
- **Tool-calling / rozmowy wieloturowej / wielu dostawców** (wytyczne §3).

## Podejście do implementacji

Osiem faz w kolejności zależności danych. PR1: **Dane → Warstwa klasyfikacji → Endpoint → Frontend paste+modal → Widok pendingów**. PR2: **Storage → Dekodowanie+upload → Frontend drag-drop**. Warstwa LLM jest cienka i czysta (umowa `classify(rawText, opts) → ClassifiedItem[]`), unit-testowalna z mockiem `fetch`; resolver oddziela endpointy i zostawia szew `model:mock` pod E2E. Bezpieczeństwo na trzech poziomach: RLS (izolacja per-user przez klienta z cookies, bez service_role), szyfrowanie at-rest klucza (F-01), masker logów + `store:false` + hash identyfikatora (FR-025/FR-026). Synchroniczny pipeline z `AbortController` 60 s; atomowy zapis przez RPC.

## Krytyczne szczegóły implementacji

- **Edge runtime — brak FS w runtime.** Prompt klasyfikacji jest **importowanym modułem** (`src/lib/ai/prompt.ts`), bundlowanym przy budowaniu — nigdy `readFile` w runtime. HMAC liczymy przez Web Crypto (jak F-01), nie przez `node:crypto` zależne od `nodejs_compat`.
- **Dwa kształty Structured Outputs.** Chat Completions: `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`. Responses: `text: { format: { type: "json_schema", name, strict: true, schema } }`. Strict wymaga `additionalProperties: false` i wszystkich pól jako `required` na każdym poziomie — schemat musi to spełniać, inaczej API odrzuci żądanie.
- **`user` deprecated w Responses → `safety_identifier`.** Gałąź Responses (szew) ma używać `safety_identifier`; gałąź Chat Completions używa `user`. Oba dostają ten sam HMAC (FR-025).
- **Kolejność i cykl życia klucza (PRD cascade).** Sekwencja w endpoincie: guard `locals.user` → odszyfruj klucz BYOK (brak klucza → kod „brak klucza", nie 500) → utwórz sesję `processing` → `classify()` → finalizuj sesję. Klucz żyje w pamięci procesu tylko na czas operacji; NIGDY nie trafia do logu, treści odpowiedzi ani query stringa (FR-026).
- **`store: false` jawnie.** Ustawiane w treści każdego żądania, nie poleganie na domyślnej wartości API (guardrail prywatności).
- **Safety net 100 (FR-020).** Jeśli klasyfikator zwróci > 100 itemów — traktuj jako anomalię: NIE zapisuj żadnego itemu, sesja → `failed`, UI stan 4. To nie limit produktowy widoczny dla usera.
- **0 itemów to poprawny wynik (FR-005).** Pusta tablica → sesja `completed_no_items`, UI stan 3 („nie znaleziono itemów").
- **Obcięta odpowiedź = błąd.** `max_completion_tokens`/`max_output_tokens` musi być dość wysoki, by nie obciąć JSON; `finish_reason: "length"` / `incomplete_details.reason: "max_output_tokens"` → traktuj jak naruszenie kontraktu (sesja `failed`), bo obcięty JSON nie przejdzie zod.
- **Timeout 60 s.** `AbortController` + `setTimeout`; `AbortError` → sesja `failed` (timeout), wsad zachowany. `clearTimeout` w `finally`.
- **Atomowość zapisu.** Sesja + itemy zapisywane przez Postgres RPC (`SECURITY INVOKER`, RLS egzekwowane) — wstawienie itemów i finalizacja statusu sesji w jednej transakcji; częściowy zapis niemożliwy (guardrail audit trail).
- **Logi: metadane-only w środowiskach wdrożonych.** Timing, zużycie tokenów, `finishReason`/status, wybór resolvera. Surowy wsad w logach tylko lokalnie za jawną flagą, NIGDY w prod/preview — niezależnie od poziomu logowania (wytyczne §7).

---

## Faza 1: Dane — `import_sessions` + `items` + enumy + RLS + typy

### Przegląd

Dwie domenowe tabele z czterema enumami i twardą izolacją RLS. Pełny model dwóch niezależnych wymiarów (akceptacja × operacyjny) od razu — S-02 używa tylko `pending`, ale S-03/S-04/S-06 budują na tym schemacie bez migracji. Enumy po angielsku w bazie; polskie etykiety mapuje warstwa UI.

### Wymagane zmiany:

#### 1. Migracja schematu klasyfikacji

**Plik**: `supabase/migrations/<YYYYMMDDHHmmss>_classification_schema.sql` (utworzyć przez `npx supabase migration new classification_schema`)

**Cel**: nośnik sesji importu i typowanych itemów z RLS per-user. Sesja jest osobnym bytem (audit trail); każdy item z klasyfikacji jest z nią powiązany kluczem obcym.

**Kontrakt**: cztery typy enum + dwie tabele + RLS ON z czterema politykami per-operacja na każdej (na `user_id`). FK `items.import_session_id` jest jawnym elementem schematu (guardrail audit trail, FR-015), nullable pod przyszły S-07. SQL pokazany w całości, bo ustanawia model domenowy dla całego strumienia A:

```sql
create type item_type as enum ('task', 'note', 'idea', 'decision', 'other');
create type acceptance_status as enum ('pending', 'accepted', 'rejected', 'deleted');
create type operational_status as enum ('new', 'in_progress', 'done', 'cancelled');
create type import_session_status as enum
  ('processing', 'completed_with_items', 'completed_no_items', 'failed');

create table public.import_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status import_session_status not null default 'processing',
  raw_input text,                       -- treść paste; dla pliku (PR2) referencja w osobnych kolumnach
  item_count integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  import_session_id uuid references public.import_sessions (id) on delete set null,  -- FK audit trail (FR-015); nullable (NULL = legalny stan: itemy ręczne z S-07 nie mają sesji). SET NULL: usunięcie sesji czyści link, item zostaje; kaskada user_id usuwa item przy usunięciu konta
  type item_type not null,
  title text not null,
  description text,
  acceptance_status acceptance_status not null default 'pending',
  operational_status operational_status,   -- tylko dla type='task'; null dla pozostałych
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index items_user_acceptance_idx on public.items (user_id, acceptance_status);
create index items_session_idx on public.items (import_session_id);
create index import_sessions_user_idx on public.import_sessions (user_id);

alter table public.import_sessions enable row level security;
alter table public.items enable row level security;
-- + po cztery polityki per-operacja (select/insert/update/delete) to authenticated
--   using/with check ((select auth.uid()) = user_id) na OBU tabelach (wzorzec z profiles).
```

Uwaga: `on delete set null` na FK — usunięcie sesji świadomie czyści `import_session_id` w powiązanych itemach (NULL to legalny stan, jak dla itemów ręcznych z S-07), a itemy zostają. Usunięcie konta usera nadal usuwa wszystko: `items.user_id` i `import_sessions.user_id` mają `on delete cascade`, a `SET NULL` to akcja (UPDATE referujących wierszy), nie sprawdzenie więzu — więc nie blokuje kaskady niezależnie od kolejności (inaczej niż nieodraczalny `RESTRICT`). Powiązanie item↔sesja jest utrzymywane, dopóki sesja istnieje (best-effort audit trail, FR-015 złagodzony). Polityki RLS rozpisać jawnie dla obu tabel (8 polityk łącznie), per wzorzec `profiles`.

#### 2. Typy domenowe

**Plik**: `src/types.ts`

**Cel**: lekkie, ręczne typy wierszy i kontraktu klasyfikatora (bez `supabase gen types`).

**Kontrakt**: unie literałowe odwzorowujące enumy (`ItemType`, `AcceptanceStatus`, `OperationalStatus`, `ImportSessionStatus`); interfejsy `Item` i `ImportSession` zgodne z kolumnami; oraz `ClassifiedItem` — kontrakt zwracany przez klasyfikator (`{ type: ItemType; title: string; description: string }`, bez pól DB). Reużyć styl istniejących typów (`Profile`, `ByokKeyStatus`).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Migracja aplikuje się czysto lokalnie: `npx supabase db reset`
- Linting przechodzi: `npm run lint`
- Build/typecheck przechodzi: `npm run build`
- Integ-test RLS przechodzi: `npm run test:integration`

#### Weryfikacja ręczna:

- RLS zweryfikowane: user A nie odczytuje/nie modyfikuje `items`/`import_sessions` usera B (Studio/SQL lub integ-test)
- FK `items.import_session_id` faktycznie istnieje w migracji i wskazuje `import_sessions(id)` (oględziny + integ-test wstawienia)
- Migracja wypchnięta na cloud `npx supabase db push` — za jawną zgodą użytkownika

---

## Faza 2: Warstwa klasyfikacji — config, prompt, resolver, request, walidator, hash

### Przegląd

Cienka warstwa LLM za umową `classify(rawText, opts) → ClassifiedItem[]`: konfiguracja z env, prompt jako importowany moduł, resolver endpointu (Chat Completions w pełni + szew Responses + szew `mock`), konstruktor żądania ze Structured Outputs, walidator zod na granicy, HMAC identyfikatora (FR-025) oraz czysta sanityzacja wejścia (FR-002). Cała faza jest logiką bez I/O DB — unit-testowalna z mockiem `fetch`.

### Wymagane zmiany:

#### 1. Konfiguracja AI + env schema

**Pliki**: `src/lib/config/ai.ts` (nowy), `astro.config.mjs`

**Cel**: czytać parametry warstwy z `astro:env/server` z wartościami domyślnymi; trzymać zamknięty zbiór modeli klasycznych.

**Kontrakt**: `astro.config.mjs` `env.schema` dostaje (wszystkie `context: "server"`): `CLASSIFIER_MODEL`, `OPENAI_BASE_URL`, `OPENAI_TEMPERATURE`, `OPENAI_MAX_TOKENS`, `OPENAI_STORE`, `CLASSIFICATION_HASH_SALT` (`access: "secret"`); opcjonalnie parametry rozumujące (martwe dla gpt-4o-mini). `ai.ts` eksportuje odczytane wartości (z domyślnymi: model `gpt-4o-mini`, baseURL `https://api.openai.com/v1`, temperature `0.5`, maxTokens `16000`, store `false`, timeout `60000`), zbiór `CLASSIC_MODELS` (z wytycznych §4) i `AI_REQUEST_TIMEOUT_MS`. Sól traktowana jak sekret (fail-closed na braku, analogicznie do KEK). Domyślne `OPENAI_MAX_TOKENS=16000` jest **świadomie podniesione** z proponowanych w wytycznych §6 `8000`: przy safety-net 100 itemów/sesję daje ~160 tokenów/item z narzutem JSON — bufor na wielozdaniowe `description`, by poprawnie duży wsad nie kończył się obcięciem (`finish_reason: "length"` → błąd kontraktu → sesja `failed`). To sufit, nie koszt typowego wsadu (płatność za faktycznie wygenerowane tokeny).

#### 2. Prompt klasyfikacji (moduł)

**Plik**: `src/lib/ai/prompt.ts` (nowy)

**Cel**: trzymać instrukcję systemową jako importowaną stałą — iterowalną w devie przez hot reload, bez odczytu z dysku w runtime.

**Kontrakt**: `export const CLASSIFICATION_PROMPT: string`. Zawiera: rolę klasyfikatora, pięć typów z definicjami, instrukcje jakościowe FR-020 („nie rozbijaj zdań na sub-itemy, łącz powiązane myśli"), wyraźną definicję kiedy `other` jest właściwy (mitygacja nadużywania `other`, FR-008), oraz polecenie zwrotu wyłącznie ustrukturyzowanego wyniku zgodnego ze schematem.

#### 3. Schemat kontraktu (zod + json_schema)

**Plik**: `src/lib/ai/schema.ts` (nowy)

**Cel**: jedno źródło prawdy o kształcie itemu — zod do walidacji granicznej i odpowiadający `json_schema` (strict) do Structured Outputs.

**Kontrakt**: `classifiedItemSchema` (zod: `type` enum z pięciu, `title` niepusty, `description` string) i `classificationResultSchema` (tablica). `buildJsonSchema()` zwraca obiekt `json_schema` z `additionalProperties: false` i wszystkimi polami `required` (wymóg strict). Dopuszcza nadmiarowe pola modelu na poziomie parsowania, ale ich nie utrwala (FR-005). Walidacja > 100 itemów obsługiwana w serwisie (Faza 3), nie w schemacie (to anomalia, nie błąd kontraktu).

#### 4. Resolver endpointu

**Plik**: `src/lib/ai/resolver.ts` (nowy)

**Cel**: z nazwy modelu wybrać ścieżkę — bez override w configu (wytyczne §4).

**Kontrakt**: `resolveEndpoint(model): { kind: "chat" | "responses" | "mock" }`. Porównanie bez wielkości liter: `mock` → `mock`; nazwa w `CLASSIC_MODELS` → `chat`; wszystko inne → `responses`. Wybór logowany dla diagnostyki.

#### 5. Konstruktor żądania + parser odpowiedzi

**Plik**: `src/lib/ai/request.ts` (nowy)

**Cel**: zbudować body żądania per endpoint i wyciągnąć tekst wyniku z odpowiedzi.

**Kontrakt**: `buildChatRequest({ model, prompt, input, temperature, maxTokens, store, userHash })` → obiekt body Chat Completions (`messages` system+user, `response_format` json_schema strict, `store`, `user`). Gałąź Responses to **szew** — `buildResponsesRequest(...)` rzuca `UnsupportedModelError` („model rozumujący nieobsługiwany w MVP"). `parseChatResponse(json)` zwraca surowy tekst z `choices[0].message.content`, rozpoznaje `finish_reason: "length"` (→ błąd obcięcia) i `refusal`. Szkic body (nieoczywiste nazwy pól Structured Outputs):

```
// Chat Completions (/v1/chat/completions)
{
  model, messages: [{role:"system",content:prompt},{role:"user",content:input}],
  temperature, max_completion_tokens: maxTokens, store: false, user: userHash,
  response_format: { type: "json_schema", json_schema: { name: "classification", strict: true, schema } }
}
```

#### 6. Hash identyfikatora (FR-025)

**Plik**: `src/lib/services/user-hash.ts` (nowy)

**Cel**: stabilny, nieodwracalny identyfikator usera dla abuse detection po stronie OpenAI.

**Kontrakt**: `hashUserId(userId): Promise<string>` — HMAC-SHA256(userId, `CLASSIFICATION_HASH_SALT`) przez Web Crypto, wynik hex. Fail-closed na braku soli. Wołany wewnątrz `classify` (Faza 2 #8) tuż przed budową żądania — NIE przez endpoint. Wynik trafia do `user` (Chat) / `safety_identifier` (Responses).

#### 7. Sanityzacja wejścia (FR-002)

**Plik**: `src/lib/text/sanitize.ts` (nowy)

**Cel**: czysta, współdzielona normalizacja wsadu (client w Fazie 4, server-side defensywnie w Fazie 3, plik w PR2).

**Kontrakt**: `sanitizeInput(raw): string` — normalizacja Unicode NFC, usunięcie znaków sterujących poza LF i tabulacją, trim. Funkcja **tylko normalizuje, nie odrzuca po długości**. Eksportuje stałą `INPUT_MAX_CHARS = 100000` (UTF-16 code units, zgodnie z `String.length`) — to **limit wyłącznie dla paste** (FR-002), egzekwowany przez wołającego (endpoint paste, Faza 3), NIE wewnątrz `sanitizeInput` i NIE dla wejścia plikowego (patrz Faza 7).

#### 8. Umowa klasyfikacji

**Plik**: `src/lib/ai/classifier.ts` (nowy)

**Cel**: spiąć resolver → request → `fetch` → parser → zod w jedną umowę, z timeoutem i obsługą mocka.

**Kontrakt**: `classify(rawText, { apiKey, userId, signal }): Promise<ClassifiedItem[]>`. Resolver `mock` → atrapa (na razie punkt rozgałęzienia; ciało przy wejściu E2E). `chat` → `hashUserId(userId)` (jedyne miejsce hashowania — wewnątrz `classify`, tuż przed budową żądania) → `buildChatRequest({ …, userHash })` → `fetch(baseURL+"/chat/completions", { signal, headers: Authorization Bearer apiKey })` → parse → `JSON.parse` → `classificationResultSchema.parse`. Błędy mapowane na typowane wyjątki (`ClassifierAuthError` dla 401, `ClassifierContractError` dla naruszenia zod/parse/obcięcia, `ClassifierProviderError` dla 5xx/429, `AbortError` przechodzi). Klucz nigdy nie logowany.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Unit: `sanitizeInput` (NFC, znaki sterujące, trim, limit), `resolveEndpoint` (chat/responses/mock), `buildChatRequest` (poprawne pola + strict schema), `classificationResultSchema` (akceptuje poprawny kontrakt, odrzuca błędny, ignoruje nadmiarowe pola), `hashUserId` (stabilność + brak surowego id) — `npm test`
- `classify` z mockiem `fetch`: happy path, 401→`ClassifierAuthError`, 5xx→`ClassifierProviderError`, obcięcie→`ClassifierContractError` — `npm test`
- `npm audit` czysty po dodaniu `zod`
- Linting + build: `npm run lint`, `npm run build`

#### Weryfikacja ręczna:

- Lokalny smoke z realnym kluczem BYOK: `classify` na przykładowym wsadzie zwraca sensownie typowane itemy (oględziny)
- Logi z `classify` (sukces i błąd) NIE zawierają fragmentu klucza ani treści wsadu (poza lokalną flagą)

---

## Faza 3: Endpoint klasyfikacji — guard, BYOK, timeout, atomowy zapis

### Przegląd

JSON endpoint `POST /api/ingest/classify` spinający warstwę z Fazy 2 z bazą: guard sesji, odszyfrowanie klucza BYOK, sesja `processing`, `classify()` z `AbortController` 60 s, atomowy zapis sesji+itemów przez RPC, mapowanie na 4 stany, higiena logów FR-026.

### Wymagane zmiany:

#### 1. RPC atomowego zapisu

**Plik**: `supabase/migrations/<YYYYMMDDHHmmss>_persist_classification.sql` (nowy)

**Cel**: zapisać itemy i sfinalizować status sesji w jednej transakcji (atomowość audit trail).

**Kontrakt**: funkcja `persist_classification(p_session_id uuid, p_items jsonb)` `language plpgsql security invoker` — wstawia itemy powiązane z sesją (`type`/`title`/`description`, `acceptance_status='pending'`, `operational_status` = `'new'` dla `task`, inaczej `null`), ustawia `import_sessions.status='completed_with_items'` + `item_count`; działa pod RLS usera. Pusta tablica obsługiwana po stronie serwisu (status `completed_no_items`, bez wywołania RPC).

#### 2. Serwis sesji importu

**Plik**: `src/lib/services/import-session.ts` (nowy)

**Cel**: hermetyzować cykl życia sesji nad klientem Supabase z RLS.

**Kontrakt**: `createSession(supabase, userId, rawInput): Promise<{id}>` (status `processing`); `persistItems(supabase, sessionId, items): Promise<number>` (woła RPC, zwraca count); `finalizeEmpty(supabase, sessionId)` (status `completed_no_items`); `failSession(supabase, sessionId, code)` (status `failed`, `error_message` = kod bez szczegółów wrażliwych).

#### 3. Endpoint `/api/ingest/classify`

**Plik**: `src/pages/api/ingest/classify.ts` (nowy)

**Cel**: synchroniczna ścieżka klasyfikacji paste, bramkowana sesją i kluczem, z generycznymi błędami.

**Kontrakt**: `export const prerender = false`; `POST`. Sekwencja: guard `locals.user` (brak → 401); `text` z `request.json()` → `sanitizeInput` → pusty/za długi → 400; `createClient(headers, cookies)` (null → 500); `getKeyStatus`/odczyt `api_key_encrypted` → brak → 409 z kodem `missing_key` (US-06/FR-024); `decryptApiKey` (`KekNotConfiguredError` → 503); `createSession('processing')`; `classify(text, {apiKey, userId, signal})` w `AbortController(60s)` (classify hashuje `userId` wewnętrznie — endpoint nie woła `hashUserId`); wynik > 100 → `failSession` + 422 kod `too_many_items`; `[]` → `finalizeEmpty` + 200 `{status:'completed_no_items'}`; itemy → `persistItems` + 200 `{sessionId, status:'completed_with_items', itemCount}`. Błędy: `ClassifierAuthError` → `failSession` + 200 `{status:'failed', code:'invalid_key'}` (US-07; UI pokaże stan 4); `AbortError` → `failSession` + 200 `{status:'failed', code:'timeout'}`; `ClassifierProviderError`/`ClassifierContractError` → `failSession` + 200 `{status:'failed', code:'provider'|'contract'}`. Wszystkie odpowiedzi JSON; żaden komunikat nie zawiera klucza ani treści wsadu; logi tylko metadane (timing, tokeny jeśli dostępne, status, resolver).

> Uwaga projektowa: błędy klasyfikacji zwracają **200 ze stanem `failed`** (nie kody 5xx), bo z perspektywy UI to jeden z czterech normalnych stanów przebiegu (FR-006), a nie awaria transportu. Twarde 4xx/5xx rezerwujemy dla błędów żądania (brak auth, złe body, brak klucza, KEK).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Integ-test (lokalny Supabase, mock `classify`): `POST` tworzy sesję, zapisuje pendingi atomowo, zwraca poprawny status; `[]` → `completed_no_items`; >100 → `failed` bez zapisu itemów; brak klucza → 409 `missing_key` — `npm run test:integration`
- Integ-test RLS: itemy/sesje zapisane endpointem widzi tylko ich właściciel — `npm run test:integration`
- Unit endpointu z mockiem serwisów (mapowanie kodów/stanów, higiena logów) — `npm test`
- Linting + build: `npm run lint`, `npm run build`

#### Weryfikacja ręczna:

- Lokalnie (`wrangler dev`, realny klucz): `curl`/REST z wklejonym tekstem tworzy sesję i pendingi; status `completed_with_items`
- Zapis przy niepoprawnym kluczu → sesja `failed`, kod `invalid_key`, bez fragmentu klucza w logu
- Zapis przy podmienionym KEK → 503 generyczny; klucz nie wycieka
- Log udanej i nieudanej klasyfikacji zawiera wyłącznie metadane (oględziny konsoli / `wrangler tail`)

---

## Faza 4: Frontend paste + 4-stanowy blokujący modal

### Przegląd

Chroniona strona `/ingest` z React island: pole `Textarea` z licznikiem i sanityzacją client-side (FR-002), submit, oraz blokujący modal z czterema stanami przebiegu klasyfikacji (US-01/FR-006). Bramka US-06, gdy brak klucza.

### Wymagane zmiany:

#### 1. Komponenty shadcn

**Plik**: `src/components/ui/{textarea,dialog}.tsx` (przez `npx shadcn@latest add textarea dialog`)

**Cel**: prymitywy pola wsadu i blokującego modalu (styl „new-york"). **Kontrakt**: po dodaniu `npm audit` (hard rule — audyt nowych zależności radix).

#### 2. Hook klasyfikacji

**Plik**: `src/components/hooks/useClassification.ts` (nowy)

**Cel**: maszyna stanów submitu + `fetch` do endpointu.

**Kontrakt**: `useClassification()` → `{ state, run(text), reset }`, gdzie `state` ∈ `idle | processing | completed_with_items | completed_no_items | failed` (+ `sessionId`, `itemCount`, `errorCode`). `run` woła `POST /api/ingest/classify`, mapuje odpowiedź/kod na stan; nie ujawnia szczegółów technicznych.

#### 3. Island formularza wsadu

**Plik**: `src/components/ingest/IngestForm.tsx` (nowy)

**Cel**: pole wsadu z licznikiem i bramką submitu.

**Kontrakt**: props `initialKeyStatus: ByokKeyStatus`. `Textarea` z licznikiem `n/100000`, blokada wprowadzania po limicie, `sanitizeInput` na zmianie/wklejeniu (natychmiastowy efekt w liczniku, FR-002). Submit wyłączony, gdy `!configured` (zamiast tego widoczna bramka). Po submit otwiera `ClassificationModal` i woła `run`.

#### 4. Blokujący modal 4 stanów

**Plik**: `src/components/ingest/ClassificationModal.tsx` (nowy)

**Cel**: widoczna blokada interakcji + cztery stany przebiegu (FR-006).

**Kontrakt**: `Dialog` bez zamykania w stanie `processing` (wskaźnik + „analizujemy wsad", brak anulowania); `completed_with_items` → „sesja zawiera N itemów" + „Przejdź do walidacji teraz" + auto-odliczanie → nawigacja do `/items`; `completed_no_items` → komunikat + „Zamknij"; `failed` → komunikat wg `errorCode` (np. „Klucz API OpenAI jest niepoprawny lub wygasł — sprawdź ustawienia" dla `invalid_key`) + „Spróbuj ponownie". Klasy przez `cn()`.

#### 5. Strona `/ingest` + routing

**Pliki**: `src/pages/ingest.astro` (nowy), `src/middleware.ts`, `src/components/Topbar.astro`

**Cel**: SSR host z guardem i statusem klucza; ochrona trasy i nawigacja.

**Kontrakt**: `prerender=false`; `Astro.locals.user` + serwerowy `getKeyStatus` → jeśli `!configured` render `<MissingKeyBanner/>` (S-01), inaczej `<IngestForm client:load initialKeyStatus={...}/>`. Dodać `/ingest` do `PROTECTED_ROUTES`; link „Nowy wsad" w `Topbar` (gałąź zalogowanego).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Unit hooka/util (mapowanie stanu, licznik/limit) jeśli wydzielone testowalnie — `npm test`
- `npm audit` czysty po dodaniu `textarea`/`dialog`
- Linting + build: `npm run lint`, `npm run build`

#### Weryfikacja ręczna:

- `/ingest` bez zalogowania → redirect na signin; bez klucza → bramka US-06
- Licznik aktualizuje się i blokuje przy 100 000 znaków; sanityzacja widoczna przy wklejeniu
- Submit → modal `processing` blokuje interakcję bez anulowania; po sukcesie auto-przejście do `/items`
- Stan „bez itemów" i „niepowodzenie" (np. po podmianie klucza na błędny) renderują poprawne komunikaty i akcje

---

## Faza 5: Widok walidacyjny (read-only lista pendingów)

### Przegląd

Strona `/items` — zalążek jednolitej listy (FR-008) z filtrem głównym „Elementy do akceptacji": read-only lista wszystkich pendingów usera (FR-006). Akcje accept/reject/edit i model zaznaczania → S-03.

### Wymagane zmiany:

#### 1. Serwis odczytu pendingów

**Plik**: `src/lib/services/items.ts` (nowy)

**Cel**: pobrać pendingi usera przez klienta z RLS.

**Kontrakt**: `getPendingItems(supabase, userId): Promise<Item[]>` — `select` z `items` gdzie `acceptance_status='pending'`, sort po `created_at desc`. RLS gwarantuje izolację (filtr `user_id` redundantny względem RLS, ale jawny).

#### 2. Mapowanie etykiet PL

**Plik**: `src/lib/labels.ts` (nowy)

**Cel**: mapować angielskie enumy bazy na polskie etykiety UI (separacja danych od prezentacji).

**Kontrakt**: `itemTypeLabel(type)`, `operationalStatusLabel(status)` itd. — czyste funkcje z tabel mapowania (zgodnie z tabelą enumów w `change.md`).

#### 3. Lista pendingów

**Plik**: `src/components/items/PendingItemsList.astro` (nowy)

**Cel**: read-only prezentacja typowanych itemów.

**Kontrakt**: props `items: Item[]`. Renderuje licznik N i listę kart (`Card`): badge typu (etykieta PL), `title`, `description`. Brak jakichkolwiek akcji (granica S-03). Pusty stan: „Brak elementów do akceptacji".

#### 4. Strona `/items` + routing

**Pliki**: `src/pages/items.astro` (nowy), `src/middleware.ts`, `src/components/Topbar.astro`

**Cel**: SSR host widoku z guardem.

**Kontrakt**: `prerender=false`; guard + serwerowy `getPendingItems(user.id)` → `<PendingItemsList items={...}/>`. Dodać `/items` do `PROTECTED_ROUTES`; link „Elementy do akceptacji" w `Topbar`. To cel auto-przejścia z modalu (Faza 4).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Unit `labels.ts` (kompletne mapowanie enum→PL) — `npm test`
- Linting + build: `npm run lint`, `npm run build`

#### Weryfikacja ręczna:

- Po klasyfikacji z itemami `/items` pokazuje wszystkie pendingi usera (nie tylko z bieżącej sesji)
- Itemy pokazują poprawny typ (PL), title, description; brak akcji accept/reject
- `/items` bez zalogowania → redirect; user widzi tylko swoje pendingi
- Pusty stan renderuje się poprawnie (po klasyfikacji bez itemów)

**Uwaga implementacyjna**: Po Fazie 5 PR1 jest kompletny i mergowalny. PRZED mergem do `main` (= auto-deploy na prod) potwierdź lokalnie na `wrangler dev`, że pełna ścieżka paste działa; upgrade do Workers Paid rozważ tylko jeśli prod realnie utnie na CPU (deploy-plan Faza 8). Zatrzymaj się na ręczne potwierdzenie człowieka przed PR.

---

## Faza 6: Storage + referencja pliku (start PR2)

### Przegląd

Włączenie Supabase Storage, prywatny bucket na pliki wsadu z RLS per-user, oraz osobna tabela `import_files` (relacja sesja → wiele plików; model docelowy) na referencję pliku (FR-015). Pierwsza faza ścieżki plikowej — dokłada się do działającego rdzenia z PR1.

### Wymagane zmiany:

#### 1. Włączenie Storage + bucket + RLS

**Pliki**: `supabase/config.toml`, `supabase/migrations/<YYYYMMDDHHmmss>_storage_import_files.sql` (nowy)

**Cel**: prywatny bucket z izolacją per-user przez ścieżkę.

**Kontrakt**: `[storage] enabled = true` w config.toml; migracja tworzy bucket `import-files` (prywatny) i polityki RLS na `storage.objects` ograniczające dostęp do obiektów w prefiksie `${auth.uid()}/...` (per-operacja, rola `authenticated`). Konwencja ścieżki: `<user_id>/<session_id>/<file_id>.<ext>` (`file_id` = `import_files.id`, UUID; nazwą obiektu w Storage jest `file_id`, nie nazwa od usera).

#### 2. Tabela plików `import_files`

**Pliki**: `supabase/migrations/<YYYYMMDDHHmmss>_import_files.sql` (nowy), `src/types.ts`

**Cel**: powiązać sesję z plikami w storage (audit trail; retencja dziedziczona z sesji). Osobna tabela zamiast kolumn na `import_sessions` — relacja sesja → **wiele plików** (model docelowy). „Jeden plik na submit" w MVP to ograniczenie UI/logiki uploadu, NIE schematu.

**Kontrakt**: nowa tabela `import_files` (`id` uuid PK, `user_id` uuid FK→`auth.users` ON DELETE CASCADE, `session_id` uuid FK→`import_sessions` ON DELETE CASCADE, `file_path` text not null, `file_name` text not null, `file_mime` text, `created_at` timestamptz); indeksy na `session_id` i `user_id`; RLS ON + cztery polityki per-operacja na `user_id` (wzorzec `items`/`import_sessions`). `file_path` = pełny klucz obiektu `<user_id>/<session_id>/<id>.<ext>`; nazwą obiektu jest `id` (UUID), `file_name` trzyma oryginalną nazwę od usera. `src/types.ts`: `ImportSession` bez pól plikowych; nowy interfejs `ImportFile`. Dla wsadu paste sesja po prostu nie ma wierszy `import_files`.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Migracje aplikują się czysto: `npx supabase db reset`
- Integ-test storage RLS: user A nie czyta obiektu usera B; ścieżka spoza prefiksu odrzucona — `npm run test:integration`
- Linting + build: `npm run lint`, `npm run build`

#### Weryfikacja ręczna:

- Bucket `import-files` istnieje i jest prywatny (Studio)
- Upload/odczyt obiektu działa tylko dla właściciela ścieżki
- Migracje + bucket na cloud — za jawną zgodą użytkownika

---

## Faza 7: Dekodowanie kodowań + upload pliku

### Przegląd

Odczyt i normalizacja plików tekstowych: obowiązkowe UTF-8 (z BOM) i Windows-1250, walidacja typu/rozmiaru (FR-018, 300 KB), sanityzacja server-side (FR-003), zapis do storage i rozszerzenie endpointu o ścieżkę plikową.

### Wymagane zmiany:

#### 1. Dekoder kodowań

**Plik**: `src/lib/text/decode.ts` (nowy)

**Cel**: zdekodować bajty pliku do UTF-8 stringa wg obsługiwanych kodowań; nieczytelny → błąd.

**Kontrakt**: `decodeFile(bytes: Uint8Array): { text: string; encoding: string }`. Kolejność: wykryj/zdejmij BOM → UTF-8; fallback Windows-1250. Preferuj natywny `TextDecoder` (Encoding Standard obejmuje `windows-1250`); jeśli workerd nie wspiera danej etykiety — dodać `iconv-lite` (pure-JS, `npm audit`). Nieczytelny w żadnym obsługiwanym kodowaniu → `UnsupportedEncodingError` z listą obsługiwanych. Wynik przechodzi przez `sanitizeInput` (Faza 2).

#### 2. Serwis uploadu pliku

**Plik**: `src/lib/services/file-upload.ts` (nowy)

**Cel**: zwalidować i zapisać plik w storage, zwrócić referencję.

**Kontrakt**: `uploadImportFile(supabase, userId, sessionId, file): Promise<{id, path, name, mime}>` — generuje `file_id` (UUID), waliduje rozszerzenie `.txt`/`.md` i rozmiar ≤ 300 KB (FR-018; przekroczenie → `FileTooLargeError`/`UnsupportedFileTypeError`), zapisuje obiekt pod `<userId>/<sessionId>/<file_id>.<ext>` i wstawia wiersz `import_files` (RLS po `user_id`).

#### 3. Rozszerzenie endpointu o plik

**Plik**: `src/pages/api/ingest/classify.ts`

**Cel**: obsłużyć wsad plikowy w tej samej synchronicznej ścieżce co paste.

**Kontrakt**: rozróżnienie po `Content-Type` (JSON `{text}` vs `multipart/form-data` z plikiem). Dla pliku: utwórz sesję → upload do storage (wiersz w `import_files`) → `decodeFile` → `sanitizeInput` → dalej identyczna ścieżka klasyfikacji jak paste. **Limit wejścia dla pliku to wyłącznie rozmiar 300 KB (FR-018)** — `INPUT_MAX_CHARS` (limit paste, FR-002) NIE jest egzekwowany na zdekodowanej treści: plik ≤ 300 KB idzie do klasyfikacji nawet > 100k znaków, bo mieści się w oknie 128k tokenów `gpt-4o-mini` (górne oszacowanie ~75–100k tokenów wejścia dla 300 KB; monitorować przez `wrangler tail`, kalibrować `OPENAI_MAX_TOKENS`/model jeśli okno zacznie być ciasne). Błędy dekodowania/rozmiaru → sesja `failed` z odpowiednim kodem (lub 400 przed utworzeniem sesji dla walidacji rozmiaru/typu).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Unit `decodeFile`: UTF-8, UTF-8+BOM, Windows-1250 (polskie znaki), plik nieczytelny → błąd z listą — `npm test`
- Integ-test: upload `.txt` → sesja z referencją pliku + pendingi; plik > 300 KB → odrzucony; zły typ → odrzucony — `npm run test:integration`
- `npm audit` czysty (jeśli dodano `iconv-lite`)
- Linting + build: `npm run lint`, `npm run build`

#### Weryfikacja ręczna:

- Plik `.txt` UTF-8 i plik Windows-1250 z polskimi znakami klasyfikują się poprawnie (oględziny itemów)
- Plik > 300 KB i plik `.pdf` odrzucone z przyjaznym komunikatem
- Referencja pliku zapisana w sesji; obiekt w storage pod ścieżką usera

---

## Faza 8: Frontend drag-and-drop pliku

### Przegląd

Strefa drag-and-drop `.txt`/`.md` zintegrowana z istniejącym formularzem wsadu z PR1 — jeden element wsadu na submit (paste XOR plik).

### Wymagane zmiany:

#### 1. Strefa drop

**Plik**: `src/components/ingest/FileDropZone.tsx` (nowy)

**Cel**: przyjąć jeden plik przez drag-and-drop lub wybór, z walidacją client-side.

**Kontrakt**: props `onFile(file)`, `disabled`. Walidacja rozszerzenia `.txt`/`.md` i rozmiaru ≤ 300 KB przed submitem (FR-018) z komunikatem; akceptuje jeden plik (single-file).

#### 2. Integracja z formularzem

**Plik**: `src/components/ingest/IngestForm.tsx`

**Cel**: tryb wsadu paste XOR plik w jednym formularzu.

**Kontrakt**: `IngestForm` zyskuje `FileDropZone`; wybór pliku wyłącza pole paste i odwrotnie (jeden element wsadu, FR-018/FR-019 mitygacja). Submit pliku woła endpoint jako `multipart/form-data`; modal i ścieżka stanów bez zmian (Faza 4).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Unit walidacji pliku (typ/rozmiar) jeśli wydzielona — `npm test`
- Linting + build: `npm run lint`, `npm run build`

#### Weryfikacja ręczna:

- Drop pliku `.txt`/`.md` → klasyfikacja → pendingi na `/items`
- Plik za duży / zły typ → komunikat przed submitem
- Wybór pliku i pole paste wzajemnie się wykluczają (jeden element wsadu)

**Uwaga implementacyjna**: Po Fazie 8 PR2 jest kompletny. Potwierdź lokalnie pełną ścieżkę plikową przed mergem; zatrzymaj się na ręczne potwierdzenie człowieka przed PR.

---

## Strategia testowania

### Testy jednostkowe (CI — `npm test`):

- Warstwa LLM: `sanitizeInput`, `resolveEndpoint`, `buildChatRequest` (strict schema), `classificationResultSchema`, `hashUserId`, `parseChatResponse`; `classify` z mockiem `fetch` (happy path + 401/5xx/obcięcie).
- `decodeFile` (UTF-8/BOM/Windows-1250/nieczytelny), `labels.ts`, walidacja pliku.
- Endpoint z mockiem serwisów: mapowanie kodów/stanów, higiena logów (brak klucza/wsadu).

### Testy integracyjne (lokalnie — `npm run test:integration`, Supabase + KEK + sól):

- RLS `items`/`import_sessions` (izolacja per-user); RLS `storage.objects` (PR2).
- Endpoint z mockiem `classify`: atomowy zapis (sesja+itemy), `completed_no_items`, safety net > 100 (brak zapisu), brak klucza → 409.
- Upload pliku → sesja z referencją (PR2).

### Szew E2E (poza S-02):

- Resolver rozpoznaje `model:mock` jako punkt rozgałęzienia; ciało atrapy (deterministyczne itemy) powstaje dopiero przy wejściu testów E2E (wytyczne §3).

### Kroki testowania ręcznego:

1. Zaloguj się, skonfiguruj klucz (S-01), wejdź `/ingest`, wklej tekst → modal → pendingi na `/items`.
2. Wklej wsad bez treści klasyfikowalnej → stan „bez itemów".
3. Podmień klucz na błędny → stan „niepowodzenie" (`invalid_key`) + „Spróbuj ponownie".
4. (PR2) Wrzuć plik `.txt` UTF-8 i Windows-1250 → poprawne itemy; plik > 300 KB → odrzucony.
5. Oględziny logów: tylko metadane, brak klucza i treści wsadu.

## Uwagi dotyczące wydajności

60 s klasyfikacji to wall-clock fetch-wait do OpenAI — nie liczy się do CPU Workers, więc plan Free wystarcza dla typowych wsadów. Reakcja UI < 200 ms poza samą klasyfikacją (NFR); modal pokazuje wskaźnik na czas oczekiwania. `max_completion_tokens` ustawiony dość wysoko, by nie obcinać JSON. Duże wsady (do 100 itemów) monitorować przez `wrangler tail` — jeśli pojawi się „Exceeded CPU", rozważyć Workers Paid + `cpu_ms:60000` (deploy-plan Faza 8). To bramka wydajności po fakcie, nie prerekwizyt.

## Uwagi dotyczące migracji

PR1: dwie migracje (`classification_schema`, `persist_classification`) — lokalnie `supabase db reset` (idempotentne), na cloud `supabase db push` za jawną zgodą. PR2: dwie migracje storage + jeden config.toml. Rollback PR1: `drop` tabel `items`/`import_sessions` + typów enum (izolowane, brak wpływu na `profiles`/`auth`). Brak danych do migracji (nowe tabele). Nowe sekrety do wgrania przed prod: `CLASSIFICATION_HASH_SALT` (+ opcjonalne `CLASSIFIER_MODEL`/`OPENAI_*` jeśli odbiegają od domyślnych) — `wrangler secret put`/panel, za jawną zgodą.

## Referencje

- Roadmapa: `context/foundation/roadmap.md` → S-02 (`first-gated-generation`, gwiazda przewodnia)
- PRD: US-01, FR-002, FR-003, FR-005, FR-006, FR-015, FR-018, FR-020, FR-023, FR-025, FR-026; NFR (klasyfikacja synchroniczna, prywatność wsadu)
- Wytyczne LLM (wiążące): `docs/api/tasker-light-llm-wytyczne.md`
- Dokumentacja API: `docs/api/openai_resonses_api.txt`, `docs/api/openai_conversation_api.txt`
- Fundament BYOK: `src/lib/services/byok-crypto.ts:53`, `src/lib/services/profile-key.ts`, `src/components/profile/MissingKeyBanner.astro`
- Wzorce: `supabase/migrations/20260608200206_profiles.sql` (migracja+RLS), `src/pages/api/profile/byok-key.ts` (endpoint), `src/pages/profile.astro` + `src/components/profile/ApiKeyManager.tsx` (SSR+island), `src/lib/services/logger.ts`/`mask.ts` (FR-026)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dodaj ` — <commit sha>`, gdy krok zostanie zrealizowany. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Dane — `import_sessions` + `items` + enumy + RLS + typy

#### Automatyczne

- [x] 1.1 Migracja aplikuje się czysto lokalnie (`npx supabase db reset`) — 41b6512
- [x] 1.2 Linting przechodzi (`npm run lint`) — 41b6512
- [x] 1.3 Build/typecheck przechodzi (`npm run build`) — 41b6512
- [x] 1.4 Integ-test RLS przechodzi (`npm run test:integration`) — 41b6512

#### Ręczne

- [x] 1.5 RLS zweryfikowane: user A nie widzi/nie modyfikuje `items`/`import_sessions` usera B
- [x] 1.6 FK `items.import_session_id` istnieje w migracji i wskazuje `import_sessions(id)`
- [x] 1.7 Migracja wypchnięta na cloud (`supabase db push`) — za jawną zgodą

### Faza 2: Warstwa klasyfikacji — config, prompt, resolver, request, walidator, hash

#### Automatyczne

- [x] 2.1 Unit sanityzacji/resolvera/request/schematu/hash przechodzi (`npm test`) — 10b29a7
- [x] 2.2 Unit `classify` z mockiem fetch (happy + 401/5xx/obcięcie) przechodzi (`npm test`) — 10b29a7
- [x] 2.3 `npm audit` czysty po dodaniu `zod` — 10b29a7
- [x] 2.4 Linting przechodzi (`npm run lint`) — 10b29a7
- [x] 2.5 Build/typecheck przechodzi (`npm run build`) — 10b29a7

#### Ręczne

- [x] 2.6 Lokalny smoke z realnym kluczem zwraca sensownie typowane itemy
- [x] 2.7 Logi z `classify` nie zawierają fragmentu klucza ani treści wsadu

### Faza 3: Endpoint klasyfikacji — guard, BYOK, timeout, atomowy zapis

#### Automatyczne

- [x] 3.1 Integ-test endpointu (atomowy zapis, `no_items`, >100, brak klucza) przechodzi (`npm run test:integration`) — 26b0770
- [x] 3.2 Integ-test RLS itemów/sesji z endpointu przechodzi (`npm run test:integration`) — 26b0770
- [x] 3.3 Unit endpointu (mapowanie kodów/stanów, higiena logów) przechodzi (`npm test`) — 26b0770
- [x] 3.4 Linting przechodzi (`npm run lint`) — 26b0770
- [x] 3.5 Build/typecheck przechodzi (`npm run build`) — 26b0770

#### Ręczne

- [x] 3.6 Lokalnie (`wrangler dev`, realny klucz) wklejony tekst tworzy sesję + pendingi (`completed_with_items`)
- [x] 3.7 Niepoprawny klucz → sesja `failed`/`invalid_key`, bez fragmentu klucza w logu
- [x] 3.8 Podmieniony KEK → 503 generyczny, klucz nie wycieka
- [x] 3.9 Logi klasyfikacji zawierają wyłącznie metadane

### Faza 4: Frontend paste + 4-stanowy blokujący modal

#### Automatyczne

- [x] 4.1 Unit hooka/util (stan, licznik/limit) przechodzi jeśli wydzielony (`npm test`) — 1f639d9
- [x] 4.2 `npm audit` czysty po dodaniu `textarea`/`dialog` — 1f639d9
- [x] 4.3 Linting przechodzi (`npm run lint`) — 1f639d9
- [x] 4.4 Build/typecheck przechodzi (`npm run build`) — 1f639d9

#### Ręczne

- [x] 4.5 `/ingest` bez zalogowania → redirect; bez klucza → bramka US-06
- [x] 4.6 Licznik blokuje przy 100 000 znaków; sanityzacja widoczna przy wklejeniu
- [x] 4.7 Submit → modal `processing` blokuje bez anulowania; sukces → auto-przejście do `/items`
- [x] 4.8 Stany „bez itemów" i „niepowodzenie" renderują poprawne komunikaty i akcje

### Faza 5: Widok walidacyjny (read-only lista pendingów)

#### Automatyczne

- [x] 5.1 Unit `labels.ts` (mapowanie enum→PL) przechodzi (`npm test`) — e221a3c
- [x] 5.2 Linting przechodzi (`npm run lint`) — e221a3c
- [x] 5.3 Build/typecheck przechodzi (`npm run build`) — e221a3c

#### Ręczne

- [x] 5.4 `/items` pokazuje wszystkie pendingi usera (nie tylko z bieżącej sesji)
- [x] 5.5 Itemy: poprawny typ (PL), title, description; brak akcji accept/reject
- [x] 5.6 `/items` bez zalogowania → redirect; user widzi tylko swoje pendingi
- [x] 5.7 Pusty stan renderuje się poprawnie
- [x] 5.8 PR1 potwierdzony lokalnie na `wrangler dev` przed mergem (gate Workers Paid)

### Faza 6: Storage + referencja pliku (start PR2)

#### Automatyczne

- [x] 6.1 Migracje aplikują się czysto (`npx supabase db reset`) — c32547e
- [x] 6.2 Integ-test storage RLS (izolacja per-user) przechodzi (`npm run test:integration`) — c32547e
- [x] 6.3 Linting przechodzi (`npm run lint`) — c32547e
- [x] 6.4 Build/typecheck przechodzi (`npm run build`) — c32547e

#### Ręczne

- [x] 6.5 Bucket `import-files` istnieje i jest prywatny
- [x] 6.6 Upload/odczyt obiektu działa tylko dla właściciela ścieżki
- [x] 6.7 Migracje + bucket na cloud — za jawną zgodą

### Faza 7: Dekodowanie kodowań + upload pliku

#### Automatyczne

- [x] 7.1 Unit `decodeFile` (UTF-8/BOM/Windows-1250/nieczytelny) przechodzi (`npm test`) — 7daa3c1
- [x] 7.2 Integ-test uploadu (`.txt` → sesja+referencja; >300 KB i zły typ odrzucone) przechodzi (`npm run test:integration`) — 7daa3c1
- [x] 7.3 `npm audit` czysty (jeśli dodano `iconv-lite`) — 7daa3c1
- [x] 7.4 Linting przechodzi (`npm run lint`) — 7daa3c1
- [x] 7.5 Build/typecheck przechodzi (`npm run build`) — 7daa3c1

#### Ręczne

- [x] 7.6 Plik UTF-8 i Windows-1250 z polskimi znakami klasyfikują się poprawnie
- [x] 7.7 Plik > 300 KB i zły typ odrzucone z przyjaznym komunikatem
- [x] 7.8 Referencja pliku w sesji; obiekt w storage pod ścieżką usera

### Faza 8: Frontend drag-and-drop pliku

#### Automatyczne

- [x] 8.1 Unit walidacji pliku (typ/rozmiar) przechodzi jeśli wydzielony (`npm test`)
- [x] 8.2 Linting przechodzi (`npm run lint`)
- [x] 8.3 Build/typecheck przechodzi (`npm run build`)

#### Ręczne

- [x] 8.4 Drop pliku `.txt`/`.md` → klasyfikacja → pendingi na `/items`
- [x] 8.5 Plik za duży / zły typ → komunikat przed submitem
- [x] 8.6 Pole paste i plik wzajemnie się wykluczają (jeden element wsadu)
- [x] 8.7 PR2 potwierdzony lokalnie przed mergem
