---
date: 2026-06-24T19:23:24+02:00
researcher: Jakub
git_commit: 1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b
branch: main
repository: qbarium/10xdevs3_project
topic: "S-10 session-items-detail — master-detail elementów sesji w dzienniku importu"
tags: [research, codebase, import-sessions, items, master-detail, edit-dialog, trash, rls, ssr-island]
status: complete
last_updated: 2026-06-24
last_updated_by: Jakub
---

# Research: S-10 `session-items-detail` — master-detail elementów sesji w dzienniku importu

**Date**: 2026-06-24T19:23:24+02:00
**Researcher**: Jakub
**Git Commit**: 1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b (`1ae9915`, `main`)
**Repository**: qbarium/10xdevs3_project

## Research Question

Ugruntować w aktualnej bazie kodu wycinek **S-10** (`session-items-detail`): w dzienniku sesji importu (`/import-sessions`, zbudowanym w S-08) użytkownik wybiera sesję i widzi po prawej **wszystkie jej elementy** (wszystkie stany akceptacji — `pending`/`accepted`/`rejected`/`deleted` — rozróżniane etykietą, bez filtrów), z możliwością podglądu, edycji i usunięcia elementu przez **reużycie** `EditItemDialog` (S-05) i move-to-trash (S-06). Wybrana sesja w adresie strony. Cel: dać `/10x-plan` twardy grunt — co reużyć bez przebudowy, co dobudować, gdzie leży ryzyko.

## Summary

**Wycinek jest w ~80% reużyciem; dobudowuje jedno brakujące ogniwo danych i jeden layout.** Konkretnie:

1. **Schemat danych wystarcza bez zmian.** Tabela `items` ma nullable FK `import_session_id` (`on delete set null`) oraz **dedykowany indeks `items_session_idx`** pokrywający lookup po sesji. RLS (`items_select_own`: `auth.uid() = user_id`) izoluje per-user niezależnie od jawnego predykatu. Zapytanie „wszystkie elementy sesji X dla bieżącego usera, wszystkie stany akceptacji" = `eq('import_session_id', id)` **bez** filtra `acceptance_status`. **Brak migracji, brak nowego indeksu.**
2. **Brakujące ogniwo: endpoint `GET /api/import-sessions/[id]/items`.** Nie istnieje (w `src/pages/api/import-sessions/` jest tylko `retry.ts`). Buduje się go jako odchudzony wariant `GET /api/items` (S-09): auth guard → walidacja UUID ścieżki → serwis → `{ ok:true, items }`. **Bez parametru `view`** — sesja to scope (`import_session_id`), nie widok. Kształt błędu `{ ok:false, code, error }` (kanon z `lessons.md`).
3. **`EditItemDialog` (S-05) reużywalny w całości** — przyjmuje pełny `Item`, sam fetchuje (`useItemMutation.editItem`), woła callbacki `onSaved`/`onNotFound`/`onOpenChange`. **Optimistic concurrency JEST wdrożone** (wbrew temu, co sugerował wpis `lessons.md` o odłożeniu): klient wysyła `expectedUpdatedAt`, serwer robi compare-and-swap. **Kontrakt krytyczny: panel musi trzymać `updated_at` dosłownie z odpowiedzi API, bez re-formatowania.**
4. **Move-to-trash (S-06) reużywalny** — to nie komponent, lecz `useItemMutation.moveToTrash(ids)` → `POST /api/items/bulk {action:"trash"}`. Zwraca tylko `count`. **Move-to-trash NIE odłącza itemu od sesji** (`import_session_id` zostaje; zmienia się tylko `acceptance_status: accepted → deleted`), więc element pozostaje widoczny w panelu sesji — przejdzie na read-only.
5. **Read-only dla `rejected`/`deleted` jest wymuszony po stronie serwera** (edycja → 404, trash → no-op) niezależnie od UI. Panel S-10 odpowiada **wyłącznie za prezentację**: nie renderować akcji edit/trash dla tych dwóch stanów (wzorzec badge'a pochodzenia jak w `TrashItemsView`).
6. **Główne ryzyko = dup-React SSR na wyspie** (`lessons.md`, S-08). To dokładnie ta strona. Dołożenie hooka master-detail do wyspy wymaga potwierdzenia realnym renderem **dev SSR** (re-optymalizacja w trakcie sesji), nie zielonym buildem ani zimnym renderem.

## Detailed Findings

### 1. Powierzchnia `/import-sessions` (wyspa S-08) — gdzie wpiąć master-detail

- **Strona:** `src/pages/import-sessions.astro` — `prerender = false`, user z `Astro.locals` (middleware), filtry sort/status jako **formularz GET** (reload SSR, nie klient). Pobiera dane serwerowo przez `getImportSessions()` i przekazuje **odchudzone DTO** `SessionRowData[]` do wyspy: `<SessionsList client:load rows={rows} />`. Layout single-column `max-w-2xl`. **Brak** parametru wybranej sesji i **brak** layoutu master-detail — to nowa powierzchnia S-10.
- **Wyspa:** `SessionsList.tsx` (czysty render `<ul>`) → `SessionRow.tsx` (wiersz + hook) → `useSessionRetry.ts` (maszyna stanów retry; `POST /api/import-sessions/retry`). `SessionRowData` (`SessionRow.tsx:19-27`) celowo NIE niesie `raw_input` ani elementów — to lekki wiersz dziennika.
- **Serwis:** `src/lib/services/import-session.ts` — `getImportSessions` (lista, sort + filtr status, LEFT JOIN `import_files`, `eq('user_id')`, bez paginacji — MVP), `getSessionForRetry`, `reopenSession` (atomowy TOCTOU guard `failed → processing`).
- **Wybór sesji w adresie:** strona już czyta query params w SSR (sort/status) — ten sam mechanizm obsłuży `?session=<id>` lub trasę dynamiczną. **Rozstrzyga `/10x-plan`** (patrz Open Questions).

### 2. Wzorzec items API/serwis/hook (S-09) — szablon nowego endpointu

- **Endpoint `GET /api/items`** (`src/pages/api/items/index.ts:30-51`): `prerender=false`, auth guard → 401; walidacja `view` ręczna (`isMainView`) → 400; reszta kryteriów tolerancyjnym `parseListCriteria` (fallbacki, nie rzut); sukces `{ ok:true, items }`, błąd `{ ok:false, code, error }` przez `json()` z `@/lib/http`.
- **Serwis `listItems(supabase, userId, criteria)`** (`src/lib/services/items.ts:57-100`): `from("items").select(ITEM_COLUMNS).eq("user_id", userId)`, potem `switch(view)` nakłada predykaty na `acceptance_status`/`operational_status`, dalej filtr typu, search (`buildSearchOrFilter`, escaping LIKE), sort + tie-break. `ITEM_COLUMNS` (`items.ts:14-15`) = pełen zestaw kolumn `Item`.
- **`list-criteria`** (`src/lib/services/list-criteria.ts`): typ `ListCriteria` (`:36-43`), `parseListCriteria` (tolerancyjny, `:82-95`), `criteriaToQuery` (emituje tylko nie-domyślne pola, round-trip, `:101-110`).
- **Hook `useItemList`** (`src/components/hooks/useItemList.ts`): `buildListUrl`/`mapListResponse`/`fetchList` (czyste, testowalne) + logika: debounce frazy, abort poprzedniego żądania, „ostatnie żądanie wygrywa" (token), sync URL (`pushState`/`replaceState`), `applyOptimistic`, obsługa `popstate`.
- **Kluczowa różnica dla S-10:** istniejący `GET /api/items` zawsze **zawęża** do jednej kombinacji stanów przez `view`; **nie ma trybu „wszystkie stany jednej sesji"**. Nowy endpoint to **scope po `import_session_id`** + brak filtra `acceptance_status`. Kształt odpowiedzi i typ `Item` reużywalne 1:1.

### 3. Kontrakty reużycia: `EditItemDialog` (S-05) + move-to-trash (S-06)

**(A) `EditItemDialog`** — `src/components/items/EditItemDialog.tsx`
- Propsy (`:25-33`): `item: Item` (pełny wiersz, nie id), `open: boolean`, `onOpenChange(open)`, `onSaved(updated: Item)`, `onNotFound(id)`. W pełni kontrolowany przez rodzica; wzorzec montowania z `key={item.id}` wymusza remount/reset pól (`PendingItemsView.tsx:343-354`, `AcceptedItemsView.tsx:443-454`).
- Sam fetchuje przez `useItemMutation().editItem(id, input, expectedUpdatedAt)` (`:51,81-85`); rodzic tylko reaguje. Toasty emituje dialog.
- Edytuje `title`/`description`/`type` + `operationalStatus` — **selektor stanu widoczny tylko gdy `acceptance_status === "accepted"`** (`:54,201`). Walidacja klienta: niepusty `title` (`edit-form.ts`).
- **Endpoint `PATCH /api/items/[id]`**: body `{ title, description|null, type, operationalStatus, expectedUpdatedAt }`; odpowiedzi `200 {ok:true,item}`, `404 not_found`, `409 conflict`, `400 bad_request`, `401`, `500`.
- **Optimistic concurrency wdrożone:** serwer robi `.eq("updated_at", expectedUpdatedAt)` (`items-mutation.ts:235`). **Panel S-10 musi przekazać `updated_at` dosłownie z odpowiedzi listy** (re-format `toISOString()` → fałszywy 409).

**(B) move-to-trash** — brak osobnego komponentu
- `useItemMutation().moveToTrash(ids: string[]): Promise<number|null>` → `POST /api/items/bulk` `{ ids, action:"trash" }` (`useItemMutation.ts:54,70-96`).
- Endpoint `src/pages/api/items/bulk.ts`: body `{ ids: UUID[1..100], action }`; sukces `{ ok:true, action, updatedIds, count }`.
- **Guard serwerowy:** `moveToTrash` w serwisie robi `.eq("acceptance_status","accepted")` (`items-mutation.ts:139-149`) — tylko `accepted → deleted`, inne stany = no-op (count 0), stan operacyjny nietknięty.
- Wyzwalanie w `AcceptedItemsView.tsx`: per-item bez dialogu (`:384-394`), bulk z dialogiem potwierdzenia tylko na select-all (`:174-182, 404-441`); UI optimistic (wygaszenie wiersza, po sukcesie `applyOptimistic(filter)`).
- Restore (analogicznie, dwukierunkowo): `restoreFromTrash` → `bulk(ids,"restore")`, serwis: `deleted→accepted` + `rejected→pending` (`items-mutation.ts:161-182`).

**(3) Wiersz listy i read-only (FR-011)**
- **Brak współdzielonego `ItemRow`** — każdy widok renderuje własny `<article>` inline ze wspólnym wzorcem. Akcje per widok: `PendingItemsView` (zatwierdź/odrzuć/edytuj), `AcceptedItemsView` (edytuj/do-kosza + badge stanu), `TrashItemsView` (**tylko przywróć** + badge pochodzenia `acceptanceOriginLabel`, `TrashItemsView.tsx:271-284`).
- **Read-only egzekwowany dwuwarstwowo:** (1) klient — istniejące widoki separują stany przez routing, więc po prostu nie renderują zakazanych akcji; (2) **serwer — autorytatywny guard**: edycja `in('acceptance_status',['pending','accepted'])` → 404 dla `rejected`/`deleted` (`items-mutation.ts:231,248-249`), trash `eq('accepted')` → no-op.
- **Konsekwencja dla S-10:** panel pokazuje wszystkie 4 stany na **jednej** liście, więc nie może polegać na separacji przez routing — musi **per-item** zdecydować, że Edytuj/Do-kosza są widoczne tylko dla `pending`/`accepted`. To czysto kosmetyczne (serwer i tak odrzuci), ale wymagane dla poprawnego UX.

### 4. Model danych + RLS — `items` / `import_sessions`

- **`items`** (`supabase/migrations/20260610052532_classification_schema.sql:49-60`): `import_session_id uuid references import_sessions(id) on delete set null` (nullable, `:52`); enumy `item_type` (`:12`), `acceptance_status` = pending/accepted/rejected/deleted (`:16`), `operational_status` = new/in_progress/done/cancelled (nullable, `:19`/`:57`). Od S-04 RPC/backfill zawsze ustawia `operational_status` dla każdego typu (`20260615152731_operational_status_all_types.sql`).
- **`import_sessions`** (`...classification_schema.sql:30-39`): `user_id → auth.users on delete cascade`, status enum `import_session_status` (`:23-24`), relacja 1:N do `import_files` (`20260610173614_import_files.sql:9`, `on delete cascade`).
- **RLS:** włączone na obu; cztery polityki per-operacja na `items` (`:96-111`) i `import_sessions` (`:78-93`), wszystkie `auth.uid() = user_id` (wzorzec `(select auth.uid())`). SELECT na `items` ograniczony do właściciela → zapytanie `import_session_id = ? [AND user_id = ?]` jest **poprawnie izolowane** (cudzy `import_session_id` zwróci 0 wierszy).
- **RPC:** jedyna funkcja DB dotykająca `items` to `persist_classification(p_session_id, p_items)` (`security invoker`). Move-to-trash/restore/empty to guarded UPDATE/DELETE w serwisie (`items-mutation.ts`), nie RPC.
- **Typy** (`src/types.ts`): `Item` (`:121-132`, `import_session_id` i `operational_status` poprawnie nullable), `ImportSession` (`:85-94`), `ImportSessionWithFile` (`:115-118`).
- **Indeks:** `items_session_idx on items(import_session_id)` (`...classification_schema.sql:67`) — pokrywa lookup sesji. **Werdykt: zapytanie realizowalne bez migracji i bez nowego indeksu.**

## Code References

> Permalinki przypięte do commita `1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b`. Odniesienia `file:line` w treści powyżej są klikalne lokalnie.

- [`src/pages/import-sessions.astro`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/pages/import-sessions.astro) — strona dziennika; SSR fetch + wyspa `SessionsList`; tu rośnie layout master-detail
- [`src/components/import-sessions/SessionRow.tsx#L19-L27`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/components/import-sessions/SessionRow.tsx#L19-L27) — `SessionRowData` (lekki wiersz, bez elementów)
- [`src/components/hooks/useSessionRetry.ts`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/components/hooks/useSessionRetry.ts) — wzorzec hooka wyspy (state machine + fetch)
- [`astro.config.mjs#L13-L31`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/astro.config.mjs#L13-L31) — fix dup-React SSR (`resolve.dedupe` + `ssr.noExternal`)
- [`src/pages/api/items/index.ts#L30-L51`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/pages/api/items/index.ts#L30-L51) — szablon endpointu GET (auth → walidacja → serwis → `{ok,items}`)
- [`src/lib/services/items.ts#L57-L100`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/lib/services/items.ts#L57-L100) — `listItems` + `ITEM_COLUMNS` (wzorzec zapytania per-user)
- [`src/components/items/EditItemDialog.tsx#L25-L33`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/components/items/EditItemDialog.tsx#L25-L33) — propsy dialogu edycji (kontrakt reużycia)
- [`src/components/hooks/useItemMutation.ts`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/components/hooks/useItemMutation.ts) — `editItem` / `moveToTrash` / `restoreFromTrash`
- [`src/lib/services/items-mutation.ts#L139-L182`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/lib/services/items-mutation.ts#L139-L182) — guardy move-to-trash/restore (read-only enforcement)
- [`src/pages/api/items/[id].ts`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/pages/api/items/%5Bid%5D.ts) — `PATCH` edycji (compare-and-swap `expectedUpdatedAt`)
- [`src/pages/api/items/bulk.ts`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/pages/api/items/bulk.ts) — `POST` bulk (trash/restore/accept/reject)
- [`supabase/migrations/20260610052532_classification_schema.sql#L49-L67`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/supabase/migrations/20260610052532_classification_schema.sql#L49-L67) — schemat `items` + RLS + `items_session_idx`
- [`src/types.ts#L121-L132`](https://github.com/qbarium/10xdevs3_project/blob/1ae99158bcb95b64bec99c0335cc2d9f7ffaa47b/src/types.ts#L121-L132) — `interface Item` (kształt odpowiedzi nowego endpointu)

## Architecture Insights

- **SSR-first + island hydration.** `/import-sessions` renderuje listę serwerowo i hydratuje wyspę `client:load`. Filtry to formularz GET (reload), nie klient. S-10 może iść tą samą drogą (SSR initial dla `?session=` w URL) albo dołożyć klientowy fetch panelu (wzorzec `useItemList`). Hybryda jest naturalna; `/10x-plan` wybiera.
- **Scope vs view.** Listy główne (S-09) filtrują przez `view` (jedna kombinacja stanów). Panel sesji to **scope** (`import_session_id`) bez `view` — wszystkie stany naraz. To nie wariant `GET /api/items`, lecz nowy, węższy endpoint o tym samym kształcie odpowiedzi.
- **Granica read-only jest na serwerze, nie w UI.** `editItem`/`moveToTrash` mają guardy stanu, więc bezpieczeństwo nie zależy od tego, co panel wyrenderuje. UI panelu odpowiada tylko za czytelność (akcje vs badge read-only).
- **Optimistic concurrency to żywy kontrakt, nie dług.** Wbrew wpisowi `lessons.md` (który zapowiadał odłożenie do S-05) — w bazie kodu CAS na `updated_at` **jest** wdrożone. Każdy nowy konsument edycji (panel S-10) musi nieść `updated_at` dosłownie. To korekta stanu wiedzy względem `lessons.md`.
- **Move-to-trash zachowuje przynależność do sesji.** Zmienia tylko `acceptance_status`; `import_session_id` zostaje → element nie znika z panelu sesji, lecz przechodzi na `deleted` (read-only). Spójne z „pokaż wszystkie stany akceptacji".

## Historical Context (from prior changes)

- **`context/foundation/lessons.md` — „Bug widoczny tylko w `dev`: dup-React na wyspie SSR" (linie 54–59).** Dotyczy **dokładnie** `/import-sessions` (`SessionsList → SessionRow → useSessionRetry`). Fix w `astro.config.mjs` (`dedupe` + `ssr.noExternal`) jest na miejscu, ale **dołożenie nowego hooka master-detail do tej wyspy wymaga potwierdzenia realnym dev SSR z re-optymalizacją w trakcie sesji** — zielony `npm run build` (przy `output:"server"` nie SSR-uje stron) ani zimny render NIE są dowodem.
- **`lessons.md` — „Edycja bez optimistic concurrency = lost update" (40–45).** Zapowiadał odłożenie CAS do S-05. **Aktualny kod już ma CAS** (`items-mutation.ts:235`) — patrz korekta w Architecture Insights.
- **`lessons.md` — „Ujednolicony kształt błędu API `{ok:false,code,error}`" (47–52).** Nowy endpoint dziedziczy ten kształt, nie wymyśla podzbioru.
- **`lessons.md` — „zod dla złożonego, ręczna dla skalara" (12–17).** Nowy `GET /api/import-sessions/[id]/items` to GET bez body; jedyne wejście to UUID w ścieżce → walidacja ręczna (jak `isMainView` w `items/index.ts:37`) jest zgodna z regułą.
- **`lessons.md` — „FK dziecka z `on delete restrict`…" (19–24)** i **„Modeluj wg kardynalności" (26–31).** Tło decyzji `import_session_id on delete set null` i osobnej tabeli `import_files` — potwierdzone w migracjach; nic do zmiany w S-10.
- **Archiwa wycinków bazowych:** `context/archive/2026-06-13-import-session-log-retry/` (S-08), `2026-06-15-unified-list-and-edit/` (S-05), `2026-06-16-trash-lifecycle/` (S-06), `2026-06-20-list-filters-search/` (S-09) — pełne plany/decyzje powierzchni, które S-10 reużywa.

## Related Research

- Brak wcześniejszego `research.md` dla tego change-id (pierwszy artefakt badawczy S-10).
- Wzorce kodu pochodzą z zarchiwizowanych zmian S-05/S-06/S-08/S-09 (wyżej) — to ich kod jest „aktualnym stanem" badanym tutaj.

## Open Questions

Do rozstrzygnięcia w `/10x-plan` (żadne nie blokuje — wszystkie mają rozsądne domyślne):

1. **Adres wybranej sesji:** query param `?session=<uuid>` na istniejącej stronie (jeden plik, zachowuje filtry sort/status w URL, layout dwukolumnowy) **vs** trasa dynamiczna `/import-sessions/[id]`. Rekomendacja badania: query param — mniejszy rozjazd z istniejącą stroną i filtrami. Roadmapa wymaga tylko „sesja w adresie strony".
2. **SSR vs klient dla prawego panelu:** render SSR przy wejściu z `?session=` w URL **vs** wyłącznie klientowy fetch po kliknięciu (uogólnienie `useItemList`/`fetchList`). Najpewniej hybryda. Jeśli dochodzi nowy hook na wyspie → obowiązuje weryfikacja dev SSR (ryzyko dup-React).
3. **Zakres elementów panelu:** roadmapa/`change.md` mówią „wszystkie stany akceptacji, rozróżniane etykietą, bez filtrów" → endpoint nie filtruje `acceptance_status` (zwraca też `rejected`/`deleted`). Potwierdzić, że kosz ma być widoczny w panelu sesji (tak wynika z briefu).
4. **Zachowanie po akcji:** po `onSaved` (edycja) — podmiana itemu w stanie panelu w miejscu; po move-to-trash — element przechodzi na `deleted` i **zostaje** widoczny read-only (bo `import_session_id` niezmieniony). Czy panel re-fetchuje listę sesji, czy aktualizuje stan lokalnie (jak `applyOptimistic` w listach głównych)? Rekomendacja: lokalna podmiana stanu, spójnie z istniejącym wzorcem.
5. **Sort/empty-state prawego panelu** (drobne): kolejność elementów (np. `created_at`) i komunikat „sesja bez elementów" — do ustalenia w planie; sort w pamięci na ≤100 elementach jest akceptowalny (indeks jednokolumnowy wystarcza do lookupu).
