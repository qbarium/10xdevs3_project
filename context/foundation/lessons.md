# Lessons Learned

> Rejestr tylko do dodawania powtarzających się reguł i wzorców. Odczytywany ponownie na początku przez /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Formatuj celowanymi ścieżkami, nigdy całe repo w trakcie fazy

- **Context**: Faza `/10x-implement` dotykająca plików, w repo z husky + lint-staged (auto-format plików staged przy commitcie).
- **Problem**: `npm run format` (= `prettier --write .`) w trakcie Fazy 2 F-01 przeformatował 5 plików niezwiązanych z fazą (CLAUDE.md, .claude/.10x-cli-manifest.json, plan-brief.md, plan-review.md, roadmap.md), tworząc brudne ścieżki spoza zestawu dotkniętych plików; trzeba było je cofać `git restore` (co trafiło na blokadę uprawnień). Psuje czystość zestawu w rytuale commitu fazy.
- **Rule**: W trakcie fazy formatuj wyłącznie celowanym `prettier --write <konkretne-pliki>` (lub `eslint --fix` na plikach dotkniętych fazą). Nigdy `npm run format` / `prettier --write .` na całym repo — husky + lint-staged i tak sformatuje pliki staged przy commitcie.
- **Applies to**: implement, impl-review

## Walidacja wejścia API: zod dla złożonego/wielopolowego, ręczna dla pojedynczego pola skalarnego

- **Context**: Endpoint API, gdzie wejście to pojedyncze pole skalarne (np. jeden `string` z `trim` + odrzuceniem pustego). Konkretnie: `POST /api/profile/byok-key` w S-01 (byok-key-config, Faza 2) — body `{ apiKey }`.
- **Problem**: Pierwotna hard rule mówiła płasko „API routes: validate input with zod", ale plan opisał ręczną ekstrakcję (`request.json()` → `trim` → 400 na pustym), a zod nie był zależnością projektu. Dosłowne trzymanie się płaskiej reguły oznaczałoby dodanie zod ad hoc w trakcie fazy — nowa zależność wymaga `npm audit` + zgody (safe-ops) i jest scope creepem poza zatwierdzonym planem.
- **Rule**: Skodyfikowane w hard rule (`CLAUDE.md` / `AGENTS.md`): **wejście złożone/wielopolowe** (obiekty, wiele pól, zagnieżdżenia, enumy) → **walidacja zod przed jakimkolwiek efektem ubocznym, bez wyjątku**; **pojedyncze pole skalarne** → dozwolona walidacja ręczna (`trim` + odrzucenie pustego), bez konieczności dodawania zod. Wprowadzenie zod projektowo (gdy pojawi się wejście złożone) to osobna zmiana z `npm audit`. Każde odchylenie od reguły zgłoś przy bramce, by człowiek je zaakceptował.
- **Applies to**: implement, impl-review, plan, plan-review

## FK dziecka z `on delete restrict` może zablokować kaskadę dziadka — wybieraj akcję ON DELETE świadomie

- **Context**: Tabela `items` z dwoma FK: `user_id → auth.users on delete cascade` ORAZ `import_session_id → import_sessions on delete restrict`; jednocześnie `import_sessions.user_id → auth.users on delete cascade`. Plan S-02 (first-gated-generation, Faza 1), wychwycone w `/10x-plan-review`.
- **Problem**: Przy usuwaniu wiersza `auth.users` kaskada chce skasować `import_sessions`, ale `items` wciąż je referują. `RESTRICT` jest **nieodraczalny i sprawdzany natychmiast** → zgłasza błąd i blokuje całe usunięcie konta, mimo że `items` i tak zniknęłyby własną kaskadą `user_id`. Plan wybrał `restrict` dla ochrony audit trail („nie da się skasować sesji z itemami"), nie dostrzegając kolizji z intencją `on delete cascade` z `auth.users` na tej samej tabeli — sprzeczność wewnątrz jednej migracji.
- **Rule**: Gdy tabela-dziecko referuje i rodzica, i dziadka, a oba mają kaskadę z tego samego korzenia, NIE używaj `on delete restrict` na FK do rodzica — `RESTRICT` jest nieodraczalny i wywróci kaskadę dziadka. Wybierz akcję świadomie: `set null` (link zrywalny, dziecko zostaje — wymaga nullable FK), `cascade` (dziecko ginie z rodzicem) albo `no action` (domyślny, **odraczalny** do końca instrukcji — przepuszcza kaskadę, a przy samodzielnym `DELETE` nadal chroni przed osieroceniem). Rozstrzygnięcie S-02: `set null` (kolumna i tak nullable pod itemy ręczne z S-07; FR-015 złagodzony do best-effort audit trail).
- **Applies to**: plan, plan-review, implement, impl-review

## Modeluj schemat wg docelowej kardynalności relacji, nie wg ograniczenia MVP

- **Context**: S-02 (first-gated-generation, Faza 6): referencja pliku wsadu do sesji importu. MVP wymusza „jeden plik na submit", więc kuszące było dodanie kolumn `file_*` wprost na `import_sessions` (1:1).
- **Problem**: „Jeden plik na submit" to ograniczenie UI/logiki uploadu, NIE domeny — docelowo sesja może mieć wiele plików. Kolumny `file_*` zabetonowałyby 1:1 w schemacie; rozszerzenie do 1:N wymagałoby później migracji rozbijającej kolumny na osobną tabelę.
- **Rule**: Gdy relacja jest konceptualnie 1:N, modeluj ją osobną tabelą z FK od razu (`import_files` → `import_sessions`), nawet jeśli MVP ogranicza ją do 1:1. Ograniczenie liczby egzekwuj w warstwie aplikacji, nie w kształcie schematu — schemat ma odzwierciedlać domenę, nie chwilowy zakres MVP.
- **Applies to**: plan, plan-review, implement

## Konfiguracja wrażliwa na bezpieczeństwo: waliduj fail-closed w kodzie, nie ufaj env

- **Context**: Warstwa LLM S-02 (`src/lib/config/ai.ts`): `OPENAI_BASE_URL`/`OPENAI_STORE` jako `envField` `access:"public"` z domyślnymi; odszyfrowany klucz BYOK leci w `Authorization` do `baseUrl` (`classifier.ts`), a `store:false` to inwariant prywatności wsadu. Wychwycone w `/10x-impl-review` (F2).
- **Problem**: Parametry wrażliwe brane z env bez walidacji (inaczej niż `CLASSIFICATION_HASH_SALT`, fail-closed). Nadpisanie `OPENAI_BASE_URL` wrogą wartością → egress klucza BYOK do dowolnego hosta; `OPENAI_STORE=true` → cicha retencja treści wsadu mimo guardrailu. Env to nie granica zaufania.
- **Rule**: Parametr konfiguracji, którego błędna wartość łamie inwariant bezpieczeństwa/prywatności (cel egress sekretu, „nie przechowuj", endpoint auth) waliduj **fail-closed w kodzie przy odczycie** — rzuć i odmów, zamiast cicho zaufać env. Allowlistę dozwolonych wartości (np. hostów egress) trzymaj w KODZIE, nie w env (env mogłoby ją rozszerzyć). Realizacja S-02: `assertSafeBaseUrl` (https + allowlista) + `assertNoStore` w `ai.ts`.
- **Applies to**: implement, impl-review, plan, plan-review

## Edycja bez optimistic concurrency = „lost update" — świadome ograniczenie solo-MVP

- **Context**: S-03 (validation-accept-reject), edycja pendingu (`PATCH /api/items/[id]`, `editPendingItem`). Guard UPDATE to `eq('acceptance_status','pending')` — chroni przed edycją itemu, którego AKCEPTACJA zmieniła się gdzie indziej (→ 404), ale NIE przed dwiema równoległymi edycjami tego samego wciąż-`pending` itemu.
- **Problem**: Dwie karty otwierają dialog edycji tego samego pendingu; obie zapisują → druga nadpisuje pierwszą bez ostrzeżenia (classic lost update). Brak compare-and-swap.
- **Rule**: Świadomie zaakceptowane jako znane ograniczenie w S-03 — ryzyko znikome (RLS izoluje per-user; wymaga tej samej osoby edytującej ten sam item w 2 kartach naraz; solo-MVP). Utwardzenie (optimistic concurrency: klient wysyła `updated_at` z chwili otwarcia, serwis dokłada `eq('updated_at', oczekiwane)` → 409 „element zmieniony, odśwież") odłożone do **S-05** (`unified-list-and-edit`, które i tak dotyka edycji) lub do momentu pojawienia się realnej współbieżności / multi-device. Decyzja użytkownika 2026-06-14.
- **Applies to**: plan, plan-review, implement

## Ujednolicony kształt odpowiedzi błędu endpointów API: `{ ok:false, code, error }`

- **Context**: Nowe endpointy S-03 (`src/pages/api/items/bulk.ts`, `src/pages/api/items/[id].ts`) zwracały błędy jako `{ ok:false, code }` (sam kod maszynowy: `unauthorized`/`bad_request`/`internal`/`not_found`), podczas gdy sąsiednie endpointy (`profile/byok-key.ts`, `ingest/classify.ts`) zwracały `{ ok:false, error: "komunikat PL" }`. Wychwycone w `/10x-impl-review` (F4).
- **Problem**: Dwa różne kształty kontraktu błędu w jednym API. Nieszkodliwe (hooki konsumują tylko `res.status`/`data.ok`, oba warianty generyczne bez wycieku DB/sieci), ale niespójne — utrudnia przyszłą obsługę błędów po stronie klienta i czytanie kodu. `classify.ts:165` już pokazywał poprawny superset `{ ok:false, code, error }`, więc rozjazd był ominięciem istniejącego wzorca, nie brakiem wzorca.
- **Rule**: Endpointy API zwracają błędy w jednym ujednoliconym kształcie `{ ok:false, code, error }`: `code` maszynowo-czytelny (logika/rozróżnianie po stronie klienta), `error` to komunikat PL dla człowieka/UI; oba generyczne (bez szczegółów DB/sieci/`cause`). Nowy endpoint dziedziczy ten kształt, nie wymyśla własnego podzbioru. Sukces analogicznie `{ ok:true, ... }`.
- **Applies to**: implement, impl-review, plan, plan-review

## Bug widoczny tylko w `dev`: odtwórz prawdziwy tryb awarii — zielony build i zimny render nie są dowodem

- **Context**: Diagnoza/naprawa błędu runtime widocznego wyłącznie w `npm run dev` (Astro `output:"server"` + React islands + Vite). S-08: `/import-sessions` wywalał SSR „Invalid hook call / more than one copy of React", gdy wyspa React wołała hook (`SessionsList → SessionRow → useSessionRetry`).
- **Problem**: Przyczyną był wyścig **optymalizatora deps Vite — wyłącznie dev**: `react` i `react-dom/server` lądowały w różnych generacjach pre-bundla (różne `?v=`) przy re-optymalizacji wyzwolonej zależnością odkrytą późno w sesji (`zod`, `astro/env/runtime`). Build prod (Rollup, bez pre-bundlingu) tego nie ma. Dwukrotnie ogłoszono „naprawione" bez dowodu: (1) na zielonym `npm run build` — który przy `output:"server"` NIE renderuje stron przez SSR, więc nie wykrywa crashu runtime; (2) na czystym renderze na zimnym starcie — który nie wyzwala wyścigu (ten wymaga re-optymalizacji w trakcie sesji). Efekt: fałszywe „naprawione" + powtórny crash u użytkownika.
- **Rule**: Zanim ogłosisz naprawę błędu widocznego tylko w dev, odtwórz go w jego DOKŁADNYM trybie awarii (tu: re-optymalizacja w trakcie sesji, nie zimny start) albo potwierdź strukturalnie, że przyczyna zniknęła. NIGDY nie traktuj zielonego `npm run build` (przy `output:"server"` nie SSR-uje stron) ani czystego zimnego renderu jako dowodu działania dev SSR. Rozstrzygnij, czy błąd jest dev-only (mechanizm Vite `optimizeDeps`/`?v=`) czy prod (Rollup) — i potwierdź prod ODDZIELNIE (`npm run preview` = artefakt prod), zanim nazwiesz coś „blokerem produkcji". Fix tej klasy w Astro: `vite.resolve.dedupe` + `vite.ssr.noExternal` dla `react`/`react-dom` (nigdy `audit fix --force`/downgrade).
- **Applies to**: implement, impl-review, research

## Usuwając encję z plikiem — kasuj obiekt w Storage jawnie (kaskada FK go nie tknie)

- **Context**: Usuwanie encji / cleanup, gdy wiersz DB referuje obiekt w Supabase Storage. Konkretnie: planowane usuwanie sesji importu / polityka cleanup (V2). Pliki wsadu żyją w buckecie `import-files`, a referencja (`file_path`) w tabeli `import_files` (FK `on delete cascade` do `import_sessions`/`auth.users`). Upload: `file-upload.ts`; download przy retry: `session-input.ts`.
- **Problem**: Kaskada FK w bazie kasuje wyłącznie WIERSZ `import_files`, NIE obiekt w Storage — Storage to osobny system, którego `on delete cascade` nie dotyka. Bez jawnego usunięcia obiektu w buckecie zostają osierocone bajty (rosnący, nieodzyskiwany koszt). W MVP nieujawnione, bo usuwania sesji nie ma (FR-015/FR-016: „polityka cleanup poza MVP", sesje bez TTL).
- **Rule**: Usuwając encję, której wiersz DB referuje obiekt w Storage, JAWNIE wołaj `supabase.storage.from("import-files").remove([...paths])` w tej samej operacji co usunięcie wiersza — nigdy nie licz na kaskadę FK (nie dotyka Storage). Wzorzec best-effort jak sprzątanie sieroty w `file-upload.ts:82`. Dotyczy wprowadzenia usuwania sesji / cleanupu w V2.
- **Applies to**: plan, plan-review, implement, impl-review
