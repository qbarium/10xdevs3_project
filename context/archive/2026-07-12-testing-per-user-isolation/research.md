---
date: 2026-07-12T01:02:28+0200
researcher: Jakub
git_commit: f3f0dd4f7036d2ba393e08920e830945e5ebd3c7
branch: main
repository: qbarium/10xdevs3_project
topic: "Per-user isolation (IDOR) — grounding risk #2 for the Faza 2 integration-test rollout"
tags: [research, codebase, security, idor, rls, per-user, isolation, test-plan-phase-2]
status: complete
last_updated: 2026-07-12
last_updated_by: Jakub
---

# Research: Izolacja per-user (IDOR) — ugruntowanie ryzyka #2 dla Fazy 2 wdrożenia testów

**Date**: 2026-07-12T01:02:28+0200
**Researcher**: Jakub
**Git Commit**: f3f0dd4f7036d2ba393e08920e830945e5ebd3c7
**Branch**: main
**Repository**: qbarium/10xdevs3_project

## Research Question

Ugruntować w bieżącym kodzie powierzchnię ryzyka dla **Fazy 2** tabeli §3 *Phased Rollout* w
`context/foundation/test-plan.md` — „Izolacja per-user (IDOR)", warstwa **integration**, pokrywająca:

- **Ryzyko #2** — użytkownik A odczytuje lub mutuje itemy/sesje użytkownika B (brak kontroli
  własności, nie tylko „zalogowany").

Konkretnie: jak endpointy (`[id]`/`bulk`/`trash`/`retry`/`session items`) pilnują właściciela,
czy pilnuje tego **tylko baza (RLS)** czy **też kod serwera**, i **których scenariuszy IDOR jeszcze
nie pokrywają istniejące testy** — żeby `/10x-plan` mógł zaplanować testy integracyjne wg zasady
koszt × sygnał (§1 test-planu), unikając anty-wzorca „test tylko dla właściciela / atrapa bazy
omijająca reguły dostępu".

## Summary

**Najważniejsze ustalenie: izolacja per-user jest solidna i już w dużej mierze otestowana — więc
Faza 2 to audyt + domknięcie konkretnych luk + przypięcie regresji, nie pisanie od zera** (identyczna
sytuacja jak Faza 1).

Trzy niezależne warstwy izolacji, wszystkie potwierdzone:

- **Jedna fabryka klienta, zawsze w zasięgu użytkownika.** Cały kod aplikacji przechodzi przez
  jedyny `createClient(headers, cookies)` w `src/lib/supabase.ts:5-27`, używający `SUPABASE_KEY`
  (klucz **anon/publishable**, związany z ciasteczkiem sesji). **Nigdzie w `src/**` nie ma klienta
  service-role** — klucz service-role nie jest nawet zadeklarowany w `astro.config.mjs`. Skutek: RLS
  jest **zawsze** aktywne; nie istnieje ścieżka omijająca reguły dostępu bazy.
- **RLS kompletne i poprawne.** Cztery tabele domenowe (`profiles`, `import_sessions`, `items`,
  `import_files`) + bucket Storage `import-files` mają RLS włączone z kompletem 4 polityk
  per-operacja, wyłącznie `to authenticated`, warunek `(select auth.uid()) = <właściciel>`. Zero
  polityk `USING (true)`, zero polityk dla `anon`. Jedyny RPC (`persist_classification`) jest
  `SECURITY INVOKER` → respektuje RLS, nie omija go.
- **Asymetria odczyt vs mutacja (rdzeń powierzchni ryzyka #2).** Odczyty mają **jawny** filtr
  `.eq("user_id", userId)` (obrona w głąb) **plus** RLS. Mutacje (`editItem`, `setAcceptanceStatus`,
  `setOperationalStatus`, `moveToTrash`, `restoreFromTrash`, `emptyTrash`, `finalizeEmpty`,
  `failSession`, `reopenSession`) polegają **wyłącznie na RLS** — bez redundantnego `.eq("user_id")`
  — jako świadoma decyzja projektowa. Wyjątek: `getSessionForRetry` dokłada jawny `.eq("user_id")`
  **przed** mutacją (jedyna jawna kontrola własności w kodzie serwera). Ta asymetria to najsłabsze
  ogniwo mapy: gdyby RLS kiedykolwiek zostało wyłączone/zmienione migracją, ścieżki mutacji
  straciłyby izolację, a odczyty częściowo by ją utrzymały.

**Reakcje endpointów na cudzy/nieistniejący zasób nie wyciekają informacji o istnieniu:** PATCH
`/api/items/[id]` → **404** (cudzy edytowalny item nieodróżnialny od nieistniejącego, nie 409); GET
`/api/import-sessions/[id]/items` → **pusta lista 200**; POST `/api/import-sessions/retry` → **404**;
POST `/api/items/bulk` i `/api/items/operational` → **ciche pominięcie** (count z realnie zmienionych
wierszy); POST `/api/items/trash/empty` → globalne tylko na własnym koszu (brak wejścia `ids`).

**Istniejące pokrycie IDOR (nie duplikować):** warstwa tabeli (RLS select/update) dla `profiles`
(`profiles-rls`), `items`+`import_sessions` (`classification-rls`), `import_files`, `storage`; oraz
warstwa **serwisu** dla `editItem`, `setAcceptanceStatus`, `setOperationalStatus`, `createManualItem`
(izolacja A/B jawnie asertowana) i RPC `persist_classification` (B nie widzi itemów A).

**Luki do domknięcia w Fazie 2 (realne, sprawdzone w plikach):**

1. **Cykl kosza** — `moveToTrash` / `restoreFromTrash` / `emptyTrash` (mutacje polegające *wyłącznie*
   na RLS) nie mają żadnego testu IDOR.
2. **Ponowienie sesji** — `getSessionForRetry` / `reopenSession` (jedyna ścieżka z *jawnym*
   sprawdzeniem własności w kodzie serwera, dokładnie „czy też kod serwera" z mapy §2) nie mają testu
   IDOR.
3. **Odczyty cross-user** — `getSessionItems`, `listItems`, `getImportSessions` (obrona w głąb przez
   jawny `.eq("user_id")`) nieprzypięte między dwoma użytkownikami (`listItems` testowany dziś tylko
   jednym użytkownikiem, na rozłączność podzbiorów).

**Rekomendowany kształt Fazy 2** (do doprecyzowania w `/10x-plan`): warstwa **integration**, prawdziwy
lokalny Supabase, dwóch użytkowników (A/B) wzorcem `signUp` + anon key (RLS aktywny), przez **funkcje
serwisowe, które wołają endpointy** (nie surowa tabela, nie e2e/HTTP — patrz Open Questions). Żaden
scenariusz nie wymaga service-role ani realnego dostawcy AI.

## Detailed Findings

### Powierzchnia klienta Supabase — brak drogi omijającej RLS

- **Jedna fabryka.** `src/lib/supabase.ts:5-27` — `createClient(requestHeaders, cookies)` woła
  `createServerClient` z `@supabase/ssr` z `SUPABASE_URL` + `SUPABASE_KEY` (`supabase.ts:3,9`).
  `SUPABASE_KEY` to klucz **publiczny/anon** (`astro.config.mjs:80-81` deklaruje tylko `SUPABASE_URL`
  i `SUPABASE_KEY`; brak deklaracji klucza service-role; `context/deployment/deploy-plan.md:149`
  potwierdza „klucz publishable, nie service_role").
- **Sesja z ciasteczka.** `getAll()` (`supabase.ts:11-16`) parsuje nagłówek `Cookie`, `setAll()`
  (`supabase.ts:17-24`) zapisuje ciasteczka z wymuszonym `SameSite=Lax`. Klient działa w kontekście
  JWT zalogowanego użytkownika → RLS egzekwuje.
- **Brak service-role w `src/**`.** Zero użyć `SERVICE_ROLE`/`serviceRole`/`SUPABASE_SERVICE`.
  `service_role` występuje w `src/**` **wyłącznie w komentarzach dokumentujących, że go NIE ma**
  (`src/lib/services/import-session.ts:1`, `src/lib/services/items-mutation.ts:1`,
  `src/lib/services/profile-key.ts:2`, `src/pages/api/items/index.ts:14`,
  `src/pages/api/items/bulk.ts:3` i in.). Jedyny import z `@supabase/supabase-js` w `src/**` to
  `import type { SupabaseClient }` (tylko typ).
- **Middleware.** `src/middleware.ts:17` tworzy klient user-scoped, ustawia **tylko**
  `context.locals.user` (`middleware.ts:23`, z `supabase.auth.getUser()`; `middleware.ts:25` = null);
  `src/env.d.ts:1-5` deklaruje na `App.Locals` tylko `user`. `context.locals.supabase` NIE jest
  ustawiany — każdy endpoint sam tworzy klient tą samą fabryką po bramce `locals.user`. Middleware
  dokłada origin-check CSRF dla metod mutujących (`middleware.ts:13-15` → 403; S-14).

### RLS w migracjach — kompletne, zawężone do właściciela

Wszystkie tabele: RLS włączone + komplet 4 polityk per-operacja, `to authenticated`, warunek
`(select auth.uid()) = <właściciel>`. Brak polityk `anon`, brak `USING (true)`.

- **`profiles`** (`supabase/migrations/20260608200206_profiles.sql`): RLS `:13`; własność = kolumna
  `id` (1:1 z `auth.users`, `:7`); polityki SELECT `:16-18`, INSERT `:20-22`, UPDATE `:24-27`, DELETE
  `:31-33`. Uwaga: **brak triggera `handle_new_user`** — wiersz `profiles` zakłada aplikacja (upsert
  pod RLS `auth.uid()=id`).
- **`import_sessions`** (`supabase/migrations/20260610052532_classification_schema.sql`): RLS `:73`;
  `user_id ... not null references auth.users on delete cascade` (`:32`); polityki SELECT `:78-80`,
  INSERT `:82-84`, UPDATE `:86-89`, DELETE `:91-93`.
- **`items`** (tenże plik): RLS `:74`; `user_id ... not null` (`:51`); `import_session_id ... on
  delete set null` (`:52`, świadomie, nie wektor izolacji); polityki SELECT `:96-98`, INSERT
  `:100-102`, UPDATE `:104-107`, DELETE `:109-111`.
- **`import_files`** (`supabase/migrations/20260610173614_import_files.sql`): RLS `:23`; `user_id ...
  not null` (`:8`); polityki `:29-44`.
- **Storage `import-files`** (`supabase/migrations/20260610173611_storage_import_files.sql`): bucket
  prywatny; izolacja przez **prefiks ścieżki** `(storage.foldername(name))[1] = auth.uid()::text`,
  nie kolumnę FK; polityki `:20-50`.
- **RPC `persist_classification`** — `SECURITY INVOKER` (`20260610075357_persist_classification.sql:10`
  oraz obowiązująca wersja S-04 `20260615152731_operational_status_all_types.sql:34`). `set
  search_path = public`. `items.user_id` wyprowadzany z `import_sessions.user_id` sesji (nie z
  payloadu klienta). **Brak funkcji `SECURITY DEFINER` w repo** (grep = 0). Bezpieczne dziś dzięki
  `SECURITY INVOKER`; gdyby zmieniono na `DEFINER`, brak jawnego `auth.uid()` w ciele stałby się luką.

### Kontrakt własności per endpoint (warstwa serwera ponad RLS)

- **PATCH `/api/items/[id]`** (`src/pages/api/items/[id].ts:24-62`): `editItem` używa `.eq("id", id)`
  + guard statusu + follow-up SELECT (`src/lib/services/items-mutation.ts:230-258`), **bez jawnego
  `user_id`** — izolacja z RLS `items_update_own`. Cudzy/nieistniejący → `ItemNotEditableError` →
  **404** (`[id].ts:57-58`). Cudzy nieodróżnialny od nieistniejącego (brak wycieku). `id` nie-UUID →
  400. **Brak metody DELETE** dla pojedynczego itemu.
- **POST `/api/items/bulk`** (`src/pages/api/items/bulk.ts:22-57`): akcje `accept`/`reject`/`trash`/
  `restore`; serwisy `setAcceptanceStatus`/`moveToTrash`/`restoreFromTrash` używają `.in("id", ids)`
  + guard statusu, **bez `user_id`** → RLS wyklucza cudze wiersze → **ciche pominięcie**; `count`/
  `updatedIds` tylko z własnych+uprawnionych (`bulk.ts:42-52`).
- **POST `/api/items/operational`** (`src/pages/api/items/operational.ts:23-46`): `setOperationalStatus`
  (`items-mutation.ts:124-129`: `.in("id", ids).eq("acceptance_status","accepted")`), **bez
  `user_id`** → ciche pominięcie.
- **POST `/api/items/trash/empty`** (`src/pages/api/items/trash/empty.ts:23-37`): `emptyTrash`
  (`items-mutation.ts:201-206`: `.delete().in("acceptance_status",["rejected","deleted"])`), **bez
  `ids`, bez `user_id`** → globalny hard-delete tylko własnego kosza (RLS `items_delete_own`).
- **GET `/api/import-sessions/[id]/items`** (`src/pages/api/import-sessions/[id]/items.ts:24-50`):
  `getSessionItems` (`src/lib/services/items.ts:144-148`: `.eq("user_id", userId).eq("import_session_id",
  sessionId)`) — **jawny podwójny filtr** + RLS. Cudza/nieistniejąca sesja → **pusta lista 200**,
  bez osobnego sprawdzania istnienia. `id` nie-UUID → 400.
- **POST `/api/import-sessions/retry`** (`src/pages/api/import-sessions/retry.ts:25-125`):
  `getSessionForRetry` (`src/lib/services/import-session.ts:204-209`: `.eq("user_id", userId).eq("id",
  sessionId)`) — **jawna kontrola własności w kodzie serwera** → cudza/nieistniejąca = null → **404**
  (`retry.ts:51`). Dopiero po przejściu tego guardu wołane są `reopenSession` (`import-session.ts:227-232`,
  tylko `.eq("id")`, RLS) i ewentualnie `failSession`. Nie-`failed` własna → 409; brak klucza BYOK → 409.
- **GET `/api/items`** (`src/pages/api/items/index.ts:33-58`) i **GET `/api/import-sessions`**
  (`src/pages/api/import-sessions/index.ts:23-45`): `listItems` (`items.ts:78`) i `getImportSessions`
  (`import-session.ts:131`) mają **jawny** `.eq("user_id", userId)` + RLS.

### Istniejące pokrycie testów integracyjnych — delta

**Sprzęt.** `vitest.integration.config.ts` (env `node`, `include ["**/*.integration.test.ts"]`,
`env: loadEnv("test", cwd, "")`, `testTimeout 30000`, **brak `setupFiles`**). Skrypt
`test:integration` (`package.json:17`) = `vitest run --config vitest.integration.config.ts` — **NIE
stawia Supabase**; wymaga `npx supabase start` + `SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY` w
`.env.test.local` (wzór `.env.test.example`). Bez env → `describe.skip` (zielono, ale nie uruchomione).
`supabase/config.toml`: `enable_confirmations=false` (sesja od razu po `signUp`, bez service-role),
`minimum_password_length=6`. 9 plików w `tests/integration/`; **brak wspólnego helpera** —
`client()`/`signUpClient(tag)` skopiowane inline w każdym pliku (świadoma konwencja).

**Kanoniczny wzorzec dwóch użytkowników** (`tests/integration/classification-rls.integration.test.ts`,
`profiles-rls.integration.test.ts`): `signUpClient("a")`/`signUpClient("b")` → `{ supabase, id }`
(dwa niezależne klienty zalogowane, RLS aktywny); guard `ready`/`describe.skip`; triada asercji IDOR:
(1) właściciel widzi swój zasób, (2) B `.select().eq("id", zasóbA)` → `[]`, (3) B `.update(...)` → `[]`
+ ponowny odczyt A potwierdza brak zmiany; opcjonalnie anon → `[]`.

**Co JEST pokryte (nie duplikować):**

| Ścieżka | Poziom | Plik | Asercja IDOR |
|---|---|---|---|
| `profiles` select/update | tabela (RLS) | `profiles-rls.integration.test.ts:55-66` | B nie widzi/nie zmienia wiersza A |
| `items`+`import_sessions` select/update | tabela (RLS) | `classification-rls.integration.test.ts:79-92` | B nie widzi/nie zmienia itemu/sesji A |
| `createManualItem` | serwis | `items-mutation.integration.test.ts:117-122` | item B niewidoczny dla A |
| `setAcceptanceStatus` | serwis | `items-mutation.integration.test.ts:124-129` | B → `updatedIds` puste, item A `pending` |
| `editItem` | serwis | `items-mutation.integration.test.ts:242-265` | B → `ItemNotEditableError`, wiersz A nietknięty |
| `setOperationalStatus` | serwis | `items-operational.integration.test.ts:79-84` | B → `updatedIds` puste, stan A bez zmian |
| RPC `persist_classification` | serwis | `import-session.integration.test.ts:86-91` | B nie widzi itemów sesji A |
| `import_files` / storage | tabela (RLS) | `import-files-rls`/`storage-rls` | izolacja per-user |

**Co NIE jest pokryte (luki Fazy 2):**

1. **Cykl kosza** — `moveToTrash`, `restoreFromTrash`, `emptyTrash` (`items-mutation.ts:143-206`):
   mutacje polegające **wyłącznie na RLS**, zero testu IDOR. `items-mutation.integration.test.ts` NIE
   importuje tych funkcji. To najsłabsze ogniwo (mutacja bez jawnego `user_id`).
2. **Ponowienie sesji** — `getSessionForRetry` (`import-session.ts:199-209`) i `reopenSession`
   (`import-session.ts:226-232`): `import-session.integration.test.ts` testuje `createSession`,
   `persistItems`, `finalizeEmpty`, `failSession` — **nie** retry/reopen. To jedyna ścieżka z
   **jawnym** sprawdzeniem własności w kodzie serwera (`.eq("user_id")` → 404), dokładnie „czy też
   kod serwera" z mapy §2.
3. **Odczyty cross-user** — `getSessionItems` (`items.ts:138-148`), `listItems` (`items.ts:72-78`),
   `getImportSessions` (`import-session.ts:118-131`): `items-operational` testuje `listItems` tylko
   **jednym** użytkownikiem (rozłączność podzbiorów, `:97-125`); brak asercji, że lista B **wyklucza**
   zasoby A. `getSessionItems` (podwójny filtr `user_id`+`import_session_id`) nietestowany cross-user
   (`classification-rls` uderza w surową tabelę, nie w ten serwis).

## Code References

Permalinki przypięte do commita `f3f0dd4` (`https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/...`):

**Powierzchnia klienta / brak service-role:**
- [`src/lib/supabase.ts#L5-L27`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/src/lib/supabase.ts#L5-L27) — jedyna fabryka klienta (anon key + ciasteczko).
- [`src/middleware.ts#L13-L26`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/src/middleware.ts#L13-L26) — origin-check CSRF + `locals.user`.
- [`astro.config.mjs#L80-L81`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/astro.config.mjs#L80-L81) — deklaracja env (tylko `SUPABASE_URL`/`SUPABASE_KEY`, brak service-role).

**RLS / migracje:**
- [`supabase/migrations/20260610052532_classification_schema.sql#L73-L111`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/supabase/migrations/20260610052532_classification_schema.sql#L73-L111) — RLS + polityki `items`/`import_sessions`.
- [`supabase/migrations/20260608200206_profiles.sql#L13-L33`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/supabase/migrations/20260608200206_profiles.sql#L13-L33) — RLS + polityki `profiles`.
- [`supabase/migrations/20260615152731_operational_status_all_types.sql#L31-L64`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/supabase/migrations/20260615152731_operational_status_all_types.sql#L31-L64) — RPC `persist_classification` (SECURITY INVOKER).

**Kontrakt własności endpointów / serwisy:**
- [`src/lib/services/items-mutation.ts#L143-L206`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/src/lib/services/items-mutation.ts#L143-L206) — `moveToTrash`/`restoreFromTrash`/`emptyTrash` (mutacje solely-RLS; **luka #1**).
- [`src/lib/services/items-mutation.ts#L224-L258`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/src/lib/services/items-mutation.ts#L224-L258) — `editItem` (RLS + follow-up SELECT → 404).
- [`src/lib/services/import-session.ts#L199-L232`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/src/lib/services/import-session.ts#L199-L232) — `getSessionForRetry` (jawny `user_id`) + `reopenSession` (**luka #2**).
- [`src/lib/services/items.ts#L72-L148`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/src/lib/services/items.ts#L72-L148) — `listItems` + `getSessionItems` (jawny `user_id`; **luka #3**).
- [`src/pages/api/items/%5Bid%5D.ts#L24-L62`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/src/pages/api/items/%5Bid%5D.ts#L24-L62) — PATCH → 404 na cudzy/nieistniejący.
- [`src/pages/api/import-sessions/retry.ts#L25-L125`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/src/pages/api/import-sessions/retry.ts#L25-L125) — retry → 404 na cudzy/nieistniejący.

**Testy referencyjne / sprzęt:**
- [`tests/integration/classification-rls.integration.test.ts`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/tests/integration/classification-rls.integration.test.ts) — kanoniczna triada IDOR (tabela `items`/`import_sessions`).
- [`tests/integration/items-mutation.integration.test.ts#L242-L265`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/tests/integration/items-mutation.integration.test.ts#L242-L265) — IDOR serwisu `editItem`.
- [`tests/integration/import-session.integration.test.ts`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/tests/integration/import-session.integration.test.ts) — serwis sesji + RPC (bez retry/reopen).
- [`vitest.integration.config.ts`](https://github.com/qbarium/10xdevs3_project/blob/f3f0dd4f7036d2ba393e08920e830945e5ebd3c7/vitest.integration.config.ts) — env, include, timeout; brak setupFiles.

## Architecture Insights

- **Obrona w głąb z jedną warstwą nośną.** Izolacja per-user stoi na RLS (warstwa nośna, wspólna dla
  wszystkich ścieżek), a odczyty dokładają jawny `.eq("user_id")` jako druga warstwa. Test QA powinien
  celować w **inwariant** („A nie sięga po dane B, przy odczycie i zmianie"), a nie w pojedynczą
  funkcję — inaczej pominie fakt, że mutacje trzyma sam RLS.
- **Asymetria odczyt/mutacja jest świadoma i warta przypięcia.** Komentarze w kodzie (`items-mutation.ts:6-7`,
  `import-session.ts:64-65`) wprost tłumaczą brak `.eq("user_id")` w mutacjach jako poleganie na RLS.
  To nie luka przy user-scoped kliencie, ale jest to najsłabsze ogniwo defense-in-depth — dlatego
  test regresji na mutacjach (kosz) ma realną wartość: zaświeci się, gdyby ktoś osłabił RLS.
- **„Cudzy = nieistniejący" jako inwariant prywatności.** Wszystkie ścieżki zwracają dla cudzego
  zasobu ten sam wynik co dla nieistniejącego (404 / pusta lista / ciche pominięcie), nigdy 409 ani
  cudzych danych — brak wycieku informacji o istnieniu. To osobny inwariant wart asercji obok „nie da
  się zmienić".
- **Warstwa testu = serwis, nie surowa tabela, nie e2e.** Endpointy to cienkie opakowania, które
  wołają funkcję serwisową i mapują jej wynik/błąd na HTTP. Ownership żyje w parze serwis + RLS.
  Test przez **funkcję serwisową** (jak istniejące `items-mutation`/`items-operational`) daje sygnał
  na dokładnie tej warstwie, gdzie mieszka logika — taniej niż e2e (którego nie ma; test-plan §4) i z
  wyższym sygnałem niż surowa tabela (która pomija guardy statusu i mapowanie błędów serwisu).

## Historical Context (from prior changes)

- `context/changes/testing-security-privacy-invariants/` (Faza 1, zarchiwizowana
  `context/archive/2026-07-07-testing-security-privacy-invariants/`) — ten sam tryb „audyt + domknięcie
  luki + pin", ta sama zasada „oracle nie z kształtu tego, co testujesz". Wzorzec do naśladowania w
  strukturze planu i w dyscyplinie niedublowania.
- `context/archive/2026-06-13-validation-accept-reject/plan.md` (S-03) — wprowadził ujednolicony model
  zaznaczania i pierwsze filtry Pending→Aktywne/Kosz; edycja bez optimistic concurrency = świadome
  ograniczenie (lost-update), ujednolicony kształt błędu API `{ok:false,code,error}` (lessons.md).
- `context/archive/2026-06-16-trash-lifecycle/plan.md` (S-06) — cykl kosza: model dwóch wymiarów stanu,
  zachowanie stanu operacyjnego przy przenoszeniu/przywracaniu; brak per-item permanent delete.
- `context/archive/2026-06-13-import-session-log-retry/plan.md` (S-08) — dziennik sesji + retry;
  polityka retry sprawdza stan klucza przed ponowieniem.
- `context/archive/2026-07-02-csrf-hardening/plan.md` (S-14) — origin-check fail-closed w middleware
  PRZED `getUser()`, na mutujących endpointach; predykat `isTrustedRequest` czysty i otestowany.

## Related Research

- `context/archive/2026-07-07-testing-security-privacy-invariants/research.md` — Faza 1 (ryzyka #1/#4),
  ten sam sprzęt testowy i te same wnioski o warstwach obrony; bezpośredni poprzednik metodologiczny.
- Kanon nadrzędny: `context/foundation/test-plan.md` §2 (mapa ryzyka #2 + tabela „Wskazówki reagowania
  na ryzyko" wiersz #2 — definiuje, co ta faza ma udowodnić), §3 Faza 2, §6.2/§6.4 (książka kucharska
  do wypełnienia), §7 (przestrzeń negatywna).

## Open Questions

Do rozstrzygnięcia w `/10x-plan` (decyzje projektowe, nie fakty o kodzie):

1. **Warstwa testu: serwis vs HTTP-endpoint.** Rekomendacja badania: **serwis** (prawdziwy lokalny
   Supabase, dwóch userów, funkcje serwisowe, które wołają endpointy) — zgodnie z „najtańszym sensownym
   testem" mapy §2 i granicą „brak e2e" (§4). HTTP-endpoint (import handlera `POST`/`GET` + syntetyczny
   `APIContext` z ciasteczkami A/B) dawałby kontrakt statusów (404 vs pusto vs ciche pominięcie), ale
   wymaga symulacji middleware (`locals.user`) i realnych ciasteczek sesji — kruche, drogie, poza
   wzorcem 9 istniejących plików. **Do potwierdzenia w planie; przestrzeń negatywna §7 powinna zapisać,
   że warstwa HTTP-e2e jest świadomie poza zakresem.**
2. **Utwardzenie mutacji (dodać jawny `.eq("user_id")`)?** Audyt pokazał, że mutacje polegają wyłącznie
   na RLS. Dodanie redundantnego filtra to obrona w głąb, ale **zmiana produktu**, nie test.
   Rekomendacja (spójna z Fazą 1 „przypnij granicę, nie utwardzaj"): **poza zakresem**; przypiąć
   obecne zachowanie testem, a utwardzenie zostawić jako kandydata na osobną zmianę (odnotować w
   otwartych ryzykach).
3. **Nowy plik vs rozszerzenie istniejących.** Rekomendacja: rozszerzać pliki dopasowane do modułu
   serwisu (`items-mutation.integration.test.ts` dla kosza; `import-session.integration.test.ts` dla
   retry/reopen; `items-operational.integration.test.ts` dla `listItems` cross-user), a §6.2 książki
   kucharskiej wskazać istniejący `classification-rls.integration.test.ts` jako kanoniczny wzorzec.
   Alternatywa: jeden nowy plik `per-user-isolation.integration.test.ts` — czytelniejszy jako kanon,
   ale łamie konwencję „plik per serwis".
4. **Wspólny helper `signUpClient` vs inline.** Ekstrakcja `tests/integration/_helpers.ts` zmniejszyłaby
   duplikację 9 plików, ale to zmiana konwencji (dziś świadomie inline). Rekomendacja: **inline** dla
   spójności; ekstrakcję odnotować jako opcję w §6.2/§7.
5. **`emptyTrash` — jak testować IDOR bez `ids`.** Funkcja kasuje własny kosz globalnie (bez wejścia
   identyfikującego wiersze). Test IDOR: A ma item w koszu; B woła `emptyTrash`; asercja, że item A w
   koszu **przetrwał**. Do potwierdzenia jako kształt asercji w planie.
6. **Aktualizacja §6.2/§6.4 + §3 stan + §7 + §8.** Faza kończy się podfazą wpisującą wzorzec testu IDOR
   do §6.2 i §6.4 książki kucharskiej, notatkę per-faza do §6.6, przestrzeń negatywną (HTTP-e2e,
   utwardzenie mutacji) do §7, datę do §8; oraz wyrównaniem §3 (Faza 1 `change opened`→`complete`;
   Faza 2 folder + status). Do potwierdzenia w planie.
