---
date: 2026-07-30T15:00:00+02:00
researcher: Claude (10x-research)
git_commit: 7e6764ae5860244a32f96cff239abbb3e6f65790
branch: main
repository: 10xdevs3_project
topic: "Warstwa E2E — pełna ścieżka user-facing (Playwright): mock klasyfikatora, ścieżka danych, asercje, lokatory"
tags: [research, e2e, playwright, mock, classifier, auth, storageState]
status: complete
last_updated: 2026-07-30
last_updated_by: Claude (10x-research)
---

# Research: Warstwa E2E — pełna ścieżka user-facing (Playwright)

**Date**: 2026-07-30T15:00:00+02:00
**Researcher**: Claude (10x-research)
**Git Commit**: 7e6764ae5860244a32f96cff239abbb3e6f65790
**Branch**: main
**Repository**: 10xdevs3_project

## Research Question

Ugruntuj fazę „Warstwa E2E — pełna ścieżka user-facing" planu testów. Dwa ryzyka: **R-E1** (item przetrwa odświeżenie strony) i **R-E2** (smoke pełnej ścieżki sukcesu z PRD). Najwyższy priorytet: **jak zamockować klasyfikator AI na granicy HTTP dla E2E**, skoro klasyfikacja jest server-side (Astro API → Worker → dostawca AI), więc `page.route()` Playwrighta jej nie przechwyci. Dodatkowo: ścieżka generacji, persystencja+reload, auth przez `storageState`, lokatory dostępnościowe.

## Summary

- **Krytyczna niewiadoma ROZWIĄZANA — nie mockujemy HTTP, używamy gotowego szwu w kodzie.** `classify()` wybiera gałąź na podstawie nazwy modelu; `resolveEndpoint("mock") → kind:"mock"`, a gałąź `kind === "mock"` w `src/lib/ai/classifier.ts:43-46` jest **celowo zostawionym szwem pod E2E** (komentarz: „ciało atrapy powstanie przy wejściu testów E2E"). Dziś rzuca `UnsupportedModelError` — trzeba dopisać ciało zwracające deterministyczne itemy. Włączenie: `CLASSIFIER_MODEL=mock` (publiczny envField, domyślnie `gpt-4o-mini`, `astro.config.mjs:84`). Gałąź mock jest **przed** `fetch` i przed użyciem `apiKey`, więc omija sieć, allowlistę hostów i prawdziwy klucz.
- **Przekierowanie `baseUrl` na lokalny mock NIE zadziała** — `ai.ts` waliduje `OPENAI_BASE_URL` fail-closed przeciw allowliście `["api.openai.com"]` (`assertSafeBaseUrl`, `config/ai.ts:40-54`). Potwierdza to `lessons.md` („Konfiguracja wrażliwa na bezpieczeństwo: waliduj fail-closed"). Szew `kind:"mock"` to jedyna czysta droga.
- **Ścieżka, widoki, DOM i lokatory w pełni zmapowane** (patrz niżej). Item w DOM to `<article data-item-id="<uuid>">` z **tytułem w `<h3>`** — stabilna kotwica asercji przetrwania po `reload()`.
- **`storageState` wystarcza do auth** — middleware autoryzuje wyłącznie z ciasteczek, a wejścia na strony to GET (bez bramki CSRF). Konto testowe **ma już skonfigurowany klucz BYOK** (na `/ingest` renderuje się `IngestForm`, nie onboarding).
- **Oba ryzyka realne i testowalne.** Korekta terminologii: stan „zrealizowane" w UI to etykieta **„Zrobione"** (dla typu `task`); „w realizacji" to **„W toku"**. Literały „Zrealizowane"/„w realizacji" NIE istnieją.

## Detailed Findings

### 1. Mock klasyfikatora AI na granicy kodu (KRYTYCZNE — rozwiązanie)

- Wybór gałęzi: `classify()` woła `resolveEndpoint(aiConfig.model)` (`src/lib/ai/classifier.ts:40`). `resolveEndpoint` (`src/lib/ai/resolver.ts:21-28`): `model.toLowerCase() === "mock"` → `{ kind: "mock" }`; nazwa w `CLASSIC_MODELS` → `chat`; reszta → `responses`.
- Szew E2E: `src/lib/ai/classifier.ts:43-46`:
  ```ts
  if (kind === "mock") {
    // Szew pod E2E (wytyczne §3) — ciało atrapy powstanie przy wejściu testów E2E.
    throw new UnsupportedModelError("Tryb mock nie ma jeszcze ciała atrapy (szew E2E).");
  }
  ```
  Gałąź mock jest **przed** `hashUserId`, `buildChatRequest` i `fetch` (`classifier.ts:51-74`) — atrapa nie dotyka sieci ani `opts.apiKey`.
- Włącznik: `CLASSIFIER_MODEL` — `astro.config.mjs:84` `envField.string({ context:"server", access:"public", default:"gpt-4o-mini" })`. Czytany w `src/lib/config/ai.ts:69` (`aiConfig.model`). `.dev.vars` **nie** definiuje `CLASSIFIER_MODEL` → normalny dev używa `gpt-4o-mini`.
- Bezpieczeństwo produkcji: atrapa jest martwa w prod (prod ma `gpt-4o-mini` → `kind:"chat"`). Osiągalna tylko gdy ktoś jawnie ustawi `CLASSIFIER_MODEL=mock`.
- **Wymóg wobec ciała atrapy (do planu):** deterministyczne itemy, z **tytułem wyprowadzalnym z wsadu**, aby test przez unikalny wsad (np. `E2E-<timestamp>`) kontrolował tytuł itemu — to daje jednocześnie izolację danych i pewną kotwicę asercji. Kontrakt zwrotu: `ClassifiedItem[]` = `{ type, title, description }[]` (`src/types.ts`), zgodny z `classificationResultSchema`.
- Istniejące testy jednostkowe **nie** dotykają realnej sieci: `classify.test.ts` mockuje `@/lib/ai/classifier` w całości (`vi.mock(... classify: vi.fn())`, `classify.test.ts:10`); testują logikę endpointu, nie klasyfikatora. Atrapa mock będzie więc wymagała własnego testu jednostkowego (kind:"mock" → deterministyczne itemy) — dziś nikt nie pokrywa tej gałęzi.

### 2. Ścieżka generacji — `POST /api/ingest/classify`

- Endpoint `src/pages/api/ingest/classify.ts:36` (`prerender=false`), dwa wejścia po `content-type` (`classify.ts:40`):
  - **paste (JSON):** `{ text }`, sanityzacja, min/max (`classify.ts:72-81`). Klient: `useClassification.ts:28,40-44`, `Content-Type: application/json`.
  - **plik (multipart):** pole `file`, `.txt/.md`, ≤300 KB (`classify.ts:47-71`).
- Odpowiedzi wyniku (mapowane w `src/lib/ai/classify-core.ts:98-110`): `200 { ok:true, sessionId, status:"completed_with_items", itemCount }`; `completed_no_items` (0); `422 too_many_items` (>100); `200 { ok:true, status:"failed", code }` przy błędzie klasyfikacji. Twarde błędy żądania: 401 / 400 / 413 / `409 missing_key` / `503` (KEK).
- Zapis: `createSession` (`src/lib/services/import-session.ts:17-28`, `id` generowane klientowo, `status:"processing"`), `persistItems` → RPC `persist_classification` (`supabase/migrations/20260615152731_operational_status_all_types.sql:31-64`) wstawia itemy jako `acceptance_status='pending'`, `operational_status='new'` (dla każdego typu).
- UI: `src/pages/ingest.astro:40-44` renderuje `IngestForm` **tylko gdy klucz BYOK skonfigurowany**. `IngestForm.tsx`: textarea `id="ingest-text"` (l.87), przycisk „Wyślij" (l.118), min 5 znaków. Po sukcesie `ClassificationModal` auto-przechodzi na **`/items`** (pending) po ~4 s lub przyciskiem „Przejdź do walidacji teraz" (`ClassificationModal.tsx:30-37`).

### 3. Akceptacja pending→accepted — `POST /api/items/bulk`

- Endpoint `src/pages/api/items/bulk.ts:22`, body `{ ids: uuid[], action: "accept"|"reject"|"trash"|"restore" }` (`src/lib/validation/items.ts:19-22`). Odpowiedź `{ ok:true, action, updatedIds, count, items }`.
- Serwis `setAcceptanceStatus` (`src/lib/services/items-mutation.ts:95-109`): UPDATE `acceptance_status` z guardem `WHERE acceptance_status='pending'` (już-nie-pending pomijane). `operational_status` NIE ruszany — item zachowuje `new`.
- Efekt: `pending → accepted` + `operational='new'` → item **znika z `/items`, pojawia się w `/items/active`**.
- UI (`PendingItemsView.tsx`): bulk „Zatwierdź zaznaczone" (l.250-259) lub per-item „Zatwierdź" na karcie (`ItemCard.tsx:170-179`; UWAGA: tekst „Zatwierdź", nie „Akceptuj"). Klient: `useItemMutation.ts:82-86` → `POST /api/items/bulk`.

### 4. Widoki server-rendered + DOM itemu (asercje po reload)

- **Widok wynika ze ŚCIEŻKI `.astro`, nie z query param** (`src/lib/services/list-criteria.ts:20-21`). `?view=` istnieje tylko w JSON API `GET /api/items`. Strony renderują wyspę `client:load`, a itemy są w initial HTML (hydration-stable) → po `page.reload()` karty są w SSR.
- Trasy: **`/items`** = pending „Do akceptacji" (`items.astro`); **`/items/active`** = „Wpisy" (`items/active.astro`); **`/items/done`** = „Zakończone" (`items/done.astro`). Predykaty (`src/lib/services/items.ts:81-97`): active = `accepted` + `operational IN (new,in_progress)`; done = `accepted` + `operational='done'`.
- **DOM pojedynczego itemu** (`src/components/items/ItemCard.tsx:73-165`), wspólny dla wszystkich widoków:
  - kontener `<article data-item-id="<uuid>" tabIndex={-1}>` (`ItemCard.tsx:74`) — rola `article`, bez nazwy; `data-item-id` to stabilny uchwyt.
  - **tytuł = `<h3>`** (`ItemCard.tsx:163`) → `getByRole('heading', { level: 3, name: <tytuł> })`. **Niezależny od stanu → najpewniejsza kotwica asercji przetrwania.**
  - opis `<p>` (tylko gdy niepusty), badge typu/stan = `<span>` bez roli → `getByText`.

### 5. Zmiana stanu operacyjnego → „Zrobione" (done)

- **Terminologia (korekta wobec briefu):** „zrealizowane" = `operational_status='done'`, etykieta **„Zrobione"** (typ `task`); per-typ nadpisania (`src/lib/labels.ts:25-30`): note→„Obsłużona", idea→„Obsłużony", decision→„Podjęta", other→„Obsłużone". „w realizacji" = **„W toku"** (`in_progress`).
- Bulk: `POST /api/items/operational` (`src/pages/api/items/operational.ts:23`), body `{ ids, status:"done" }`. Serwis `setOperationalStatus` (`items-mutation.ts:119-133`), guard `WHERE acceptance_status='accepted'`.
- UI: widok „Wpisy" (`/items/active`, `AcceptedItemsView.tsx:378-390`), 4 przyciski bulk: „Nowe"/„W toku"/**„Zrobione"**/„Anulowane" — **wymagają wcześniejszego zaznaczenia** (checkbox per-item lub „Zaznacz wszystkie"). Przy select-all pojawia się dialog „Zmienić stan N ... na „Zrobione"?".
- Alternatywa: Radix `Select` „Stan" w `EditItemDialog` (tylko `accepted`) — trigger rola `combobox` (`getByLabel('Stan')`), opcja „Zrobione" rola `option`.
- Efekt: item pozostaje `accepted`, `operational='done'` → znika z `/items/active`, pojawia w **`/items/done`**.
- UWAGA: `OperationalStatusBadge` ma martwy wariant interaktywny (verb „Zrealizuj"), ale na listach renderuje się jako read-only `<span>` (nie klikalny) — **nie** używać go do zmiany stanu.

### 6. Auth + storageState

- `PROTECTED_ROUTES = ["/profile","/ingest","/items","/import-sessions"]` (`src/middleware.ts:6`), dopasowanie `startsWith` (pokrywa `/items/active` itd.). Niezalogowany → `redirect("/auth/signin")` (`middleware.ts:28-32`). Zalogowany na `/` → `/ingest` (`middleware.ts:38-40`).
- Sesja wyłącznie z ciasteczek: `createClient(headers, cookies)` → `supabase.auth.getUser()` → `locals.user` (`middleware.ts:17-23`, `src/lib/supabase.ts:9-26`). **Werdykt: `storageState` wystarcza** — brak innego źródła sesji, wejścia na strony to GET (CSRF bramkuje tylko mutacje). `getUser()` robi round-trip; wygasłe tokeny są odświeżane, przy pełnym wygaśnięciu → `/auth/signin`.
- Fallback logowania (gdyby `storageState` zawiódł): `POST /api/auth/signin`; UI `SignInForm.tsx` — „Email" (textbox), „Hasło" (password → `getByLabel('Hasło')`), „Zaloguj się".

### 7. Lokatory (ściąga `getByRole`)

| Element | Lokator | Plik:linia |
|---|---|---|
| Pole wklejania | `getByRole('textbox', { name: 'Tekst do klasyfikacji' })` (lub `getByLabel`) | `IngestForm.tsx:84-95` |
| Wyślij | `getByRole('button', { name: 'Wyślij' })` | `IngestForm.tsx:118` |
| Modal — przejdź do walidacji | `getByRole('button', { name: 'Przejdź do walidacji teraz' })` | `ClassificationModal.tsx:110` |
| Pending: zatwierdź per-item | `getByRole('button', { name: 'Zatwierdź' })` | `ItemCard.tsx:170` |
| Pending: bulk zatwierdź | `getByRole('button', { name: 'Zatwierdź zaznaczone' })` | `PendingItemsView.tsx:250` |
| Zaznacz wszystkie | `getByRole('checkbox', { name: 'Zaznacz wszystkie' })` | `PendingItemsView.tsx:238` |
| Tytuł itemu (asercja) | `getByRole('heading', { level: 3, name: <tytuł> })` | `ItemCard.tsx:163` |
| Item (uchwyt) | `locator('[data-item-id="<uuid>"]')` / `locator('article', { hasText })` | `ItemCard.tsx:74` |
| Stan bulk „Zrobione" | `getByRole('button', { name: 'Zrobione' })` (po zaznaczeniu, na `/items/active`) | `AcceptedItemsView.tsx:384` |
| Nawigacja | `getByRole('link', { name: 'Wpisy' })` → `/items/active`, „Do akceptacji" → `/items`, „Skrzynka wejściowa" → `/ingest` | `Topbar.astro:13-27` |
| „Zakończone" (brak linku w topbarze) | `StateFilterSelect` (combobox „Filtr stanu wpisów") opcja „Zakończone" → `/items/done`, lub `page.goto('/items/done')` | `StateFilterSelect.tsx:51-57` |
| Email zalogowanego (asercja auth) | `getByText(<email>)` (span) | `Topbar.astro:11` |
| Profil: klucz API | `getByLabel(/Klucz API/)` (password), przycisk „Zapisz" | `ApiKeyManager.tsx:106-125` |

### 8. Pułapki (z obu badań)

1. `/ingest` pokazuje textarea **tylko z kluczem BYOK**; bez klucza — onboarding (brak pola). Konto testowe klucz ma.
2. `type=password` (Hasło, Klucz API) **nie ma roli `textbox`** → `getByLabel`.
3. `CardTitle` shadcn to `<div>`, nie heading — tylko tytuł itemu jest prawdziwym `h3`; tytuły kart → `getByText`.
4. „zrealizowane" = **„Zrobione"** (task); „W toku" nie „w realizacji".
5. Akceptacja = **„Zatwierdź"** / „Zatwierdź zaznaczone", nie „Akceptuj".
6. Ukryty `input[type=file]` bez nazwy → `input[type="file"]` + `setInputFiles` (nie `getByRole`).
7. `data-item-id` — stabilny uchwyt tam, gdzie brak dobrej roli/nazwy.
8. Zmiana stanu wymaga **zaznaczenia** (bulk) — najpierw checkbox, potem przycisk „Zrobione".

## Code References

- `src/lib/ai/classifier.ts:43-46` — szew mock E2E (do dopisania ciała atrapy)
- `src/lib/ai/resolver.ts:21-28` — `resolveEndpoint`, `mock` → `kind:"mock"`
- `src/lib/config/ai.ts:40-54` — `assertSafeBaseUrl` (allowlista `api.openai.com`, fail-closed)
- `astro.config.mjs:84` — `CLASSIFIER_MODEL` envField (public, default `gpt-4o-mini`)
- `src/pages/api/ingest/classify.ts:36-155` — endpoint klasyfikacji
- `src/lib/ai/classify-core.ts:98-110` — mapowanie wyniku → HTTP
- `src/lib/services/import-session.ts:17-61` — sesja + persist/finalize/fail
- `supabase/migrations/20260615152731_operational_status_all_types.sql:31-64` — RPC `persist_classification`
- `src/pages/api/items/bulk.ts:22-55` — accept/reject/trash/restore
- `src/pages/api/items/operational.ts:23-41` — zmiana stanu operacyjnego
- `src/lib/services/items.ts:81-97` — predykaty widoków (active/done/…)
- `src/components/items/ItemCard.tsx:73-165` — DOM itemu (`article[data-item-id]` + `h3`)
- `src/middleware.ts:6,17-40` — PROTECTED_ROUTES, auth z ciasteczek, redirecty
- `src/components/Topbar.astro:11-32` — nawigacja
- `src/components/items/StateFilterSelect.tsx:51-57` — filtr stanu (droga do „Zakończone")

## Architecture Insights

- **Szew testowalności wpięty w domenę.** Autor rozdzielił wybór endpointu (`resolver`, czysty) od I/O (`classifier`) i zostawił jawną gałąź `mock` — E2E ma zamierzony punkt zaczepienia bez hackowania sieci. To ta sama filozofia co ręczne dodawanie itemu (FR-028) jako droga testowa bez AI.
- **Granice bezpieczeństwa wykluczają mock po HTTP.** Allowlista hostów fail-closed (`ai.ts`) celowo blokuje przekierowanie na localhost — dlatego mock musi żyć w kodzie, nie w konfiguracji sieci.
- **Widok = ścieżka, render hydration-stable.** Itemy są w SSR HTML zanim wyspa się zhydratuje → `page.reload()` + asercja na `h3` testuje realną persystencję (DB → SSR), a nie stan po stronie klienta. To dokładnie spełnia intencję R-E1.

## Historical Context (z lessons.md)

- „Konfiguracja wrażliwa na bezpieczeństwo: waliduj fail-closed" — źródło allowlisty hostów; potwierdza, że mock musi omijać `baseUrl`.
- „Nie używaj top-level `return` we frontmatterze `.astro`" — dotyczy, jeśli faza dotknie stron `.astro`; redirecty zostają w middleware.
- „Dup-React SSR (dev)" — `astro.config.mjs` pinuje populację depów wyspy; E2E odpala dev (`astro dev`), więc render wysp musi być czysty. Weryfikować realnym renderem, nie zielonym buildem.
- „Ujednolicony kształt błędu API `{ ok:false, code, error }`" — kontrakt odpowiedzi endpointów (przydatne, jeśli test asertuje odpowiedź API).

## Weryfikacja wskazówek odpowiedzi na ryzyka

- **R-E1 (przetrwanie po reload) — POTWIERDZONE, z konkretną kotwicą.** Asercja: po `accept` przejdź na `/items/active`, wykonaj `page.reload()`, sprawdź `getByRole('heading',{level:3,name:<tytuł>})`. Tytuł jest w SSR HTML i niezależny od stanu → nie da się go „naiwnie" zaliczyć toastem/tytułem strony. „200 = zapisane" obalone: dopiero obecność po reload dowodzi persystencji w DB.
- **R-E2 (happy-path smoke) — POTWIERDZONE, z korektą terminologii.** Pełna ścieżka: (storageState) → `/ingest` wklej unikalny wsad → „Wyślij" → modal → `/items` → „Zatwierdź" → `/items/active` → zaznacz → **„Zrobione"** → `/items/done` → asercja itemu (h3). „Zrealizowane" nie istnieje jako literał — używać „Zrobione". Unikać happy-path bez końcowej asercji w `/items/done`.
- **Rozdział asercji R-E1 vs R-E2** (uwaga z briefu): E1 = wąski test persystencji (reload na `/items/active`); E2 = szeroki przebieg do `/items/done`. Nie łączyć w jeden.

## Open Questions

1. **Wstrzyknięcie `CLASSIFIER_MODEL=mock` do dev servera E2E** — czy `astro dev` (adapter cloudflare/miniflare) czyta tę zmienną z `process.env` (→ `webServer.env` w `playwright.config.ts`), czy tylko z `.dev.vars` (→ potrzebny osobny plik lub skrypt `dev:e2e`). Rozstrzygnąć empirycznie w implementacji (uruchomić dev z env i sprawdzić, czy `/ingest` klasyfikuje przez atrapę). NIE dodawać `mock` do współdzielonego `.dev.vars` (zepsułoby normalny dev).
2. **Seedowanie klucza BYOK** — konto testowe ma klucz, więc happy-path przejdzie. Dla niezależności testu od stanu konta rozważyć seed, ale jest kłopotliwy (idempotencja: gdy klucz jest, `/profile` pokazuje „Usuń", nie pole). Rekomendacja wstępna: polegać na istniejącym kluczu (mock i tak go nie używa), udokumentować założenie. Decyzja w planie.
3. **Izolacja i sprzątanie danych** — testy tworzą itemy przez atrapę. Unikalność: wsad z sufiksem czasowym → unikalny tytuł. Sprzątanie: `afterEach`/`afterAll` usuwa itemy testu (przez `POST /api/items/bulk` action `trash` + `empty`, albo bezpośrednio w DB). Zaprojektować w planie (kombinacja: unikalne ID + cleanup).
4. **E2E w CI** — `storageState` niesie prawdziwy token konta (gitignored), więc w CI go nie ma. Wpięcie E2E do CI wymaga dedykowanego konta testowego + logowania w globalnym setupie (secrets). To osobny, cięższy krok — dla wymogów lekcji (lokalne E2E) opcjonalny. Rekomendacja: E2E lokalnie teraz; CI jako świadomy follow-up z notatką w planie testów.
5. **Ciało atrapy — kształt** — proponowane: rozbij wsad na niepuste linie, każda → `{ type:"task", title: linia, description:"" }` (lub pierwsza linia jako pojedynczy item). Musi przejść `classificationResultSchema`. Test jednostkowy pinuje determinizm. Ostateczny kształt w planie.
