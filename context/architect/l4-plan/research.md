---
change_id: refactor-opportunities
topic: "Refactor opportunities — przepływ zapisu kształtu w tldraw (10xDevs M4L4)"
date: 2026-08-01
researcher: Jakub (10xDevs, moduł 4, lekcja 4)
repository: tldraw (obce repo open-source; analiza, nie praca nad nim)
git_commit: 4a1256c85
branch: main
prior: context/changes/shape-save-flow/research.md
method: 3 równolegli sub-agenci (obecny kształt / historia+intencjonalność / wykonalność migracji) w trybie eksploracji, bez zmian w kodzie; rygor evidence / inference / unknown
status: complete (zweryfikowany ast-grep — Krok A3)
last_updated: 2026-08-02
verified_commit: 4a1256c85
tags: [research, refactor-opportunities, shape, editor, store, tlschema, migrations, sync, verified]
---

# Research: Refactor opportunities — zapis kształtu w tldraw

## Cel

Analiza z L3 (`shape-save-flow/research.md`) udokumentowała dług i ryzyka przepływu zapisu kształtu. Ta zmiana odpowiada na pytanie, które tamta celowo zostawiła otwarte: **KTÓRE z tych problemów warto naprawić, w jakim docelowym kształcie i w jakiej kolejności.** Eksploracja, nie decyzja — ranking to propozycja dla osobnej sesji planowania.

## Metoda

Trzej równolegli sub-agenci, każdy na innej soczewce z lekcji: **(1) obecny kształt** (co jest w kodzie dziś), **(2) historia i intencjonalność** (czy to świadoma decyzja, czy dług — archeologia gita, bo repo nie prowadzi ADR-ów), **(3) wykonalność migracji** (odwracalna ścieżka, blast radius, istniejące osłony, pierwszy krok). Znaczniki: **[evidence]** = potwierdzone `plik:linia`, **[inference]** = wywnioskowane, **[unknown]** = biała plama. Twierdzenia strukturalne/liczbowe czekają na twardą weryfikację `ast-grep` (Krok A3).

## Lista kandydatów i klasyfikacja (do audytu)

Każdy problem z L3, z klasyfikacją: **KANDYDAT** = naprawa zmienia strukturę kodu / dokłada barierę; **nie-kandydat** = brakujący test / właściwość architektury (wejście do oceny kosztu, nie refaktor).

| # | Problem (z L3) | Klasyfikacja |
|---|---|---|
| **K1** | Rozjazd props↔migracja bez bariery (triada ręcznie synchronizowana w pliku kształtu) | **KANDYDAT** |
| **K2** | Wersjonowanie schematu ↔ sync-core (migracja klient↔serwer) | **KANDYDAT** (badany, potem odrzucony — patrz ranking) |
| **K3** | Cichy upsert przy kolizji `id` w `createShapes` | **KANDYDAT** |
| — | Luki testowe (walidatory kształtu bez testów; rollback `updateShapes`; readonly; nieznany typ) | nie-kandydat (brakujące osłony → tani zysk / wejście) |
| — | Szew typów (`TLShape` w ~176 plikach) + `api-report` | nie-kandydat (tani/głośny, `tsc`/CI łapie) |
| — | Kolejność walidacja-przy-zapisie / migracja-przy-odczycie w `Store.put` | nie-kandydat (właściwość architektury, `[inference]`) |

Żaden kandydat nie okazał się problemem **pojęć domenowych** (granica do L5) — wszystkie trzy to struktura/kontrakt kodu. [evidence, wszystkie trzy soczewki zgodne]

---

## Analiza kandydatów

### K1 — Rozjazd props↔migracja w pliku kształtu

**Obecny kształt.** Każdy plik kształtu trzyma *triadę do ręcznej synchronizacji*: (1) walidatory propsów — `arrowShapeProps` (`packages/tlschema/src/shapes/TLArrowShape.ts:237-254`), (2) identyfikatory wersji — `arrowShapeVersions = createShapePropsMigrationIds('arrow', …)` (`:272-281`, 8 wpisów), (3) migracje `up`/`down` — `arrowShapeMigrations` (`:296-472`). Ten sam wzorzec w `TLGeoShape.ts` (props `:176-191`, wersje `:193-206`, migracje `:222+`) i w każdym pliku kształtu. [evidence] Helpery są czysto mechaniczne — `createShapePropsMigrationIds` (`records/TLShape.ts:538-543`) zamienia liczby na stringi-id; `createShapePropsMigrationSequence` (`:506-510`) to **funkcja tożsamościowa**. Nic nie łączy zmiany walidatora z obowiązkiem migracji. [evidence] `validateMigrations` (`store/src/lib/migrate.ts:492-519`) pilnuje **tylko** numeracji sekwencji (ciągłość +1), nie zawartości. Snapshot **zserializowanego schematu nie istnieje** — w repo jest 10 plików `.snap` (raport L3: „glob=0"), ale wszystkie to snapshoty testów komponentów/komend, a **0** zawiera `schemaVersion`/`sequences`. Luka jest dokładnie tam, gdzie wskazuje K1; wzorzec `toMatchSnapshot` jest przy tym w repo **oswojony** (10 użyć), więc pierwszy krok jest jeszcze tańszy. [evidence]

**Werdykt intencjonalności: świadome ograniczenie nośne — ale z udowodnionym, nawracającym kosztem.** Triada to celowy projekt **3. generacji** migracji: commit `4f70a4f4e` „New migrations again (#3220)" (David Sheldrick, 2024), tag `galaxy brain`; release notes wprost: *„this time was traumatic enough"*. Ręczny **z konieczności** — migracje niosą semantyczne transformacje danych, których nie da się wygenerować (`TLArrowShape.ts:308-331` liczy `isPrecise`; `:344-427` przebudowuje rekordy; `:454-457` *„Explicitly no down state so that we force clients to update"*). [evidence] ALE strażnik jest **słaby**: `migrations.test.ts:2799-2809` sprawdza tylko, że każdy migrator został *wywołany raz* — nie parytet props↔wersja. I koszt jest **realny**: łańcuch commitów desync — `43edeb09b` (zapomniana migracja down #3334), `9915f2b0f` („Fix migrations #2302" — łańcuch `croppingShapeId` powodował **UTRATĘ DANYCH**, wykryty w pliku od użytkownika), `bfc8b6a90`, `5221da51b`, `1e41074bf`. [evidence] → To **znany ostry brzeg**, nie narosły dług — i nie przebudowa, lecz **guard**.

**Wykonalność.** Fundament pod guard **już istnieje**: `StoreSchema.serialize()` (`store/src/lib/StoreSchema.ts:762-772`) daje deterministyczny snapshot `{schemaVersion, sequences}`, testowany jednostkowo (`StoreSchema.test.ts:132-181`). CI **nie ma** żadnego checku schematu; `api-check` go **nie łapie** (numery wersji nie trafiają do `api-report.api.md`). Pierwszy krok — test charakteryzujący `expect(createTLSchema().serialize()).toMatchSnapshot()` w `packages/tlschema`: zero blast radius produkcyjnego (test-only), w pełni odwracalny, natychmiast zamienia cichy rozjazd w czerwony test. [evidence + inference]

### K2 — Wersjonowanie schematu ↔ sync-core

**Obecny kształt.** Serwer ma własny `StoreSchema` (`sync-core/src/lib/TLSyncRoom.ts:311`) i migruje rekordy per-wire w obu kierunkach: **up** przy przyjęciu (`addDocument :1188-1194`, `patchDocument :1229-1281`), **down** przy rozsyłce (`migrateDiffOrRejectSession :803-852`). Granica wersji ustalana przy connect (`handleConnectRequest :1005-1056`), z rozróżnieniem `CLIENT_TOO_OLD` / `SERVER_TOO_OLD` (`getVersionMismatchReason :987-1003`). [evidence]

**Werdykt intencjonalności: świadomy projekt nośny.** Kontrakt wprost w doc-komentarzu: `TLSyncRoom.ts:132-136` *„client writes are migrated before the authorizer runs…"*; `:1034-1050` *„If the client's store is at a different version to ours, it could cause corruption…"*. Dwie osie wersji (protokół `TLSYNC_PROTOCOL_VERSION=8` vs sekwencje schematu) **celowo** rozdzielone. Geneza od `d7002057d` (#2475), przerób na `getMigrationsSince` w `4f70a4f4e` (#3220), świeże utwardzenie `93acb3a4e` (#9212). [evidence]

**Wykonalność.** Abstrakcja dojrzała i wpięta; blast **ogromny** (`TLSyncRoom.ts` 1626 linii, `TLSyncClient.ts` 989, `TLSocketRoom.ts` 1107; fan-in 8 plików). Osłony **ciężkie** (~11k linii testów, m.in. `upgradeDowngrade.test.ts` 1329, `TLSyncRoom.test.ts` 2317). **Uczciwa ocena: to nie jest zepsute i nie ma inkrementalnej ścieżki refaktoru bez dotknięcia protokołu.** [evidence + inference]

### K3 — Cichy upsert przy kolizji `id` w `createShapes`

**Obecny kształt.** `createShapes` (`editor/src/lib/editor/Editor.ts:8573-8766`) generuje nowe `id` tylko gdy brak podanego (`:8604-8606`), **nie sprawdza kolizji** własnego `id` (`store.has` użyte tylko dla `parentId` `:8615`), kończy na `store.put` (`:8762`). Editor traktuje wywołanie jako *create* (`onBeforeCreate :8743`, event `created-shapes :8760`). Ale `Store.put` (`store/src/lib/Store.ts:620-695`) to **udokumentowany upsert** (docstring `:602-604`) — przy istniejącym `id` wchodzi w gałąź *update* (`:641-660`, `handleBeforeChange`, faza `updateRecord`), cicho, bez strażnika. → Niespójność: te same dane trafiają w dwie różne ścieżki side-effectów zależnie od stanu store. [evidence]

**Werdykt intencjonalności: ROZDZIELNY.** `Store.put`-upsert = **zamierzony i udokumentowany** (docstring; test kontraktu `Store.test.ts:125-129` „put updates records whose ids are already present"). Brak strażnika w `createShapes` = **[unknown]** — dziedziczony z `put`, nigdy jawnie zdecydowany, nigdy zgłoszony jako bug (grep historii = 0 zgłoszeń kolizji `id`). Osobny czasownik `updateShapes` istnieje → create/update to rozdzielne API, co czyni ciche update-on-collision **utajoną luką**; wzorzec strażnika istnieje gdzie indziej w tym pliku (`Editor.ts:9938`, `:4988`), więc pominięcie nie wynika z braku wzorca. [evidence + unknown]

**Wykonalność.** Guard należy do **`createShapes`** (wąski, właściwy), **nie** do `Store.put` (uniwersalna ścieżka: remote-merge `:634`, migracje `:885/:1105` — ruszenie złamałoby zamierzony upsert i test `S2`). `createShapes.test.ts` (`packages/tldraw/src/test/commands/`, 156 (raport: 157) linii) **nie ma** testu kolizji `id` (0 wzmianek collision/duplicate). Pierwszy krok — test charakteryzujący na poziomie edytora (`createShapes` z dwoma tym samym `id` → asercja obecnego zachowania), potem grunt pod opcjonalny `warn` w `Editor.ts:8573`. Zero blast radius, odwracalny. [evidence + inference]

---

## Refactor opportunities (ranked)

### #1 — K1: guard na rozjazd props↔migracja (snapshot schematu)

- **Obecny → docelowy kształt:** triada ręcznie synchronizowana bez bariery → **deterministyczny snapshot zserializowanego schematu jako test**, który przy każdej niezamierzonej zmianie sekwencji świeci na czerwono i wymusza *świadomy* bump. **Guard, nie przebudowa** — architektura migracji zostaje nietknięta.
- **Czemu #1 (koszt długu vs koszt zmiany):** jedyny kandydat z **udowodnionym, powtarzającym się kosztem** (bugi desync, w tym utrata danych — #2302), przy **słabym** dzisiejszym strażniku, a naprawa jest **tania i odwracalna** i stoi na **gotowym** fundamencie (`serialize()`). Najlepszy stosunek wartość/ryzyko.
- **Blast radius:** test-only, zero kodu produkcyjnego.
- **Szkic inkrementalnej ścieżki:** (1) snapshot całego `createTLSchema().serialize()` jako charakteryzacja → (2) opcjonalnie test parytetu „każdy kształt z propsami ma sekwencję migracji" → (3) opcjonalnie wpięcie do CI obok `api-check`.
- **Pierwszy krok-prerekwizyt:** `expect(createTLSchema().serialize()).toMatchSnapshot()` w `packages/tlschema`.

### #2 — K3: domknięcie cichej luki create/upsert w `createShapes`

- **Obecny → docelowy kształt:** metoda nazwana *create*, po cichu robiąca *update* przy kolizji `id` → **charakteryzacja obecnego zachowania testem** + (do decyzji w planie) opcjonalne **ostrzeżenie** przy kolizji w `createShapes` (intencja *create-only*), **bez** ruszania zamierzonego upsertu w `Store.put`.
- **Czemu #2:** realna utajona luka i czysta, wąska ścieżka — ale intencja jest `[unknown]` i **brak udowodnionego kosztu** (0 zgłoszeń), więc niżej niż K1.
- **Blast radius:** wąski (`createShapes`); `Store.put` nietykany (upsert zamierzony + zablokowany testem `S2`).
- **Szkic inkrementalnej ścieżki:** (1) test charakteryzujący kolizji `id` → (2) decyzja w planie: `warn` vs status quo → (3) jeśli `warn`, wpięcie w `Editor.ts:8573`.
- **Pierwszy krok-prerekwizyt:** test kolizji `id` w `createShapes.test.ts`.

### Rozważone i odrzucone

- **K2 — wersjonowanie schematu ↔ sync-core — ODRZUCONE jako refaktor.** Historia i wykonalność zgodnie: to **świadomy, dojrzały, działający** protokół (autorytet schematu po stronie serwera, up/down per-wire, dwie osie wersji), z ogromnym blast radius i ~11k linii testów — **nie jest zepsuty**, a inkrementalna ścieżka nie istnieje bez dotknięcia protokołu. Adekwatny ruch to **nie refaktor, lecz udokumentowanie inwariantu** (dwie osie: `TLSYNC_PROTOCOL_VERSION` vs `sequences`; reguła „down wymaga record-scope + `down`") jako notatki/ADR, ewentualnie test charakteryzujący `getVersionMismatchReason`. Analogia do demo: „przepływ już jest zoptymalizowany".
- **Luki testowe** (walidatory kształtu bez testów, rollback `updateShapes`, readonly, nieznany typ) — nie-kandydaci strukturalni, ale **najtańszy zysk**: to brakujące osłony, naturalne do dołożenia obok #1/#2.

## Weryfikacja twierdzeń (ast-grep) — Krok A3

Twardo sprawdzone `ast-grep` (przez `npx`, bez instalacji w repo) + `grep`/`find`/`wc`. Reguła lekcji: liczy `ast-grep`/`grep`, każde zero potwierdza `grep`. Weryfikacja na tym samym checkout co analiza (`4a1256c85`).

| Twierdzenie (podpiera) | Werdykt | Dowód |
|---|---|---|
| Brak snapshotu **schematu** (#1) | ✅ doprecyzowane | 10 plików `.snap` w repo, ale **0** zawiera `schemaVersion`/`sequences` — to snapshoty komponentów/komend; snapshotu schematu brak. `toMatchSnapshot` już oswojony (10 użyć). |
| Triada w plikach kształtów (#1) | ✅ potwierdzone | **12** plików w `tlschema/src/shapes` z `createShapePropsMigrationIds` (Arrow…Video) |
| Liczba wersji: arrow 8 / geo 12 (#1) | ✅ potwierdzone | `arrowShapeVersions` 8 (`AddLabelColor:1`…`AddRichTextAttrs:8`); `geoShapeVersions` 12 (`AddUrlProp:1`…`AddFlipProps:12`) |
| Fundament guardu `serialize()` (#1) | ✅ potwierdzone | `StoreSchema.ts:762` `serialize()`, używany `:591` |
| `createShapes` bez strażnika `id` (#2) | ✅ potwierdzone twardo | `this.store.has` w `Editor.ts` = 8 miejsc; w `createShapes` (8573–8766) **tylko** `:8615` (parentId) — własnego `id` nie sprawdza |
| `Store.put` = upsert udokumentowany (#2) | ✅ potwierdzone | `Store.ts:603` docstring „…same ID already exists, it will be updated" |
| Test kontraktu upsert (#2) | ✅ potwierdzone | `Store.test.ts:125` `[S2] put updates records whose ids are already present` |
| `createShapes.test.ts` brak testu kolizji (#2) | ✅ potwierdzone | `packages/tldraw/src/test/commands/createShapes.test.ts` — **156** (raport: 157) linii, **0** wzmianek collision/duplicate |
| Rozmiary rdzenia sync (odrzucenie K2) | ✅ potwierdzone | `TLSyncRoom` 1626, `TLSyncClient` 989, `TLSocketRoom` 1107 linii |

**Wniosek:** żaden werdykt nie obala pozycji rankingu. Sedno #1 (brak snapshotu schematu przy gotowym `serialize()`, triada w 12 plikach) i #2 (`createShapes` bez strażnika `id`, upsert w `Store.put` zamierzony i testowany) potwierdzone twardo. Jedyna korekta merytoryczna: w repo istnieje 10 plików `.snap` (nie „zero"), ale żaden nie jest snapshotem schematu — luka stoi tam, gdzie #1 ją wskazał.

## Ograniczenia i unknowns

- **[unknown]** Intencja braku strażnika w `createShapes` (K3) — historia nie rozstrzyga w żadną stronę.
- **[unknown]** Czy wyżej w stosie (narzędzia UI generujące kształty) istnieje osobna deduplikacja `id` przed `createShapes` — poza zakresem tej ścieżki.
- **[unknown]** Dokładny zakres sync-owych workflow e2e (`playwright-*.yml`, `staging-e2e.yml`) — treści nie audytowano.
- **Twierdzenia strukturalne/liczbowe** zostały zweryfikowane `ast-grep` + `grep`/`find` — patrz sekcja „Weryfikacja twierdzeń" wyżej. Jedyna korekta: w repo jest 10 plików `.snap` (nie „zero"), ale żaden nie jest snapshotem schematu.
