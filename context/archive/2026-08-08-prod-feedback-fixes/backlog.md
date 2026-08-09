# Backlog triage — 17 zgłoszeń „Inne" z produkcji

> Dziennik zmiany `prod-feedback-fixes` (S-18). Źródło: wpisy typu `other`, `accepted`, aktywne, konta produkcyjnego. Każdy wpis = ticket. Klasa i decyzja ustalone w triage; właściwy plan fazowy → `plan.md` (`/10x-plan`).
>
> **Zasady wykonania:** kod tylko lokalnie na branchu `feature/prod-feedback-fixes` (ZERO merge). Status + komentarz ticketu edytowane NA PRODUKCJI (Supabase). Weryfikacja: Playwright + testy jednostkowe. Kolejność: najpierw bugi, potem featury.

## A. Do naprawy — bugi i drobny UX (pełny flow)

Kolejność wykonania (od prostych/niezależnych ku złożonym):

| # | id | Tytuł | Problem (parafraza) | Podejście techniczne | Weryfikacja Playwright |
|---|----|-------|---------------------|----------------------|------------------------|
| 1 | f4dc0119 | Link w logo TaskerLight | Logo + napis „TaskerLight" w powłoce to `<div>`, nie odnośnik — nie prowadzi do skrzynki. | `AppSidebar.astro`: marka jako `<a href="/ingest">` (zachować układ, `aria-label`). | Klik w markę → nawigacja na `/ingest`. |
| 2 | ef87e4f8 | Checkboxy niewidoczne w dark | Checkboxy na listach jednakowo stylowane w jasnym i ciemnym — tło zlewa się w dark. | Styl checkboxa (komponent listy / `ui`): kontrastowe tło+ramka w dark (tokeny motywu). | Dark mode, lista → checkbox ma widoczny kontrast (atrybut/kolor). |
| 3 | 2d65d300 | Ikona „Do akceptacji" = skrzynki | „Do akceptacji" ma tę samą (lub zbyt podobną) ikonę co skrzynka wejściowa; ma dostać własną. | `Icon.astro`: nowy wariant; `AppSidebar.astro`: podmiana ikony „Do akceptacji". | Sidebar: ikona „Do akceptacji" ≠ ikona skrzynki (inny `data`/kształt). |
| 4 | 164608bf | Terminologia „zakończone" | Akcja stanu = „zrobione", filtr/badge = „zakończone" — niespójne. (Propozycja zniesienia stanów per typ → triage, patrz sekcja C.) | Ujednolicić teksty akcji do „zakończone"/„Zakończ" (kanon L5). Tylko warstwa tekstu. | Lista: etykieta akcji i filtr/badge używają spójnego słowa. |
| 5 | 80c4f735 | Odświeżanie statusu klucza | Status klucza w `/profile` nie odświeża się po dodaniu/usunięciu — wymaga reload. | `ApiKeyManager.tsx` (+ ewentualny wskaźnik w powłoce): odśwież stan po mutacji bez przeładowania. | `/profile`: usuń/dodaj klucz → widok statusu zmienia się bez reload. |
| 6 | 6fa2b64b | Częściowa akceptacja + licznik | Po częściowej akceptacji nieaktualne elementy zostają do zmiany strony; licznik („cyferka") nie aktualizuje się bez reload. | Widok „Do akceptacji": po akceptacji części usuń je z listy i przelicz licznik reaktywnie. | Zaakceptuj część pozycji → znikają z listy, licznik spada, bez reload. |
| 7 | be20465a | Scrollbar niewidoczny na tablecie | Przy listach dłuższych niż ekran na tablecie nie widać paska przewijania. | CSS przewijanego kontenera: widoczny/utrzymany scrollbar (nie znika przy dotyku); ewentualnie `overflow` powłoki. | Emulacja tabletu, długa lista → kontener przewijalny, pasek obecny. |
| 8 | 0a23baea | Strona za długa na tablecie | Opcje profilu/ustawień poniżej dolnej krawędzi; strona przewija się daleko za ekran (możliwe po zmianie orientacji). | Layout `/profile` (i pokrewne) w powłoce: poprawić wysokość/scroll obszaru treści na wąskim/tabletowym viewport. | Emulacja tabletu (portret+pejzaż): opcje osiągalne w obszarze przewijania, brak „martwej" przestrzeni. |
| 9 | 62217cc8 + ac90c2a4 | Okno edycji — blokada tła i pętla | (a) UI poza oknem edycji nie jest zablokowane → przypadkowe kliknięcia/zamknięcia. (b) Na tablecie tap poza oknem → dialog „odrzuć / wróć do edycji"; „wróć do edycji" wpada w nieskończoną pętlę. | Modal edycji: prawdziwy backdrop blokujący tło (focus trap / `inert`); naprawić obsługę „wróć do edycji", by zamykała dialog zamiast go re-wyzwalać. | Otwórz edycję → klik/tap poza oknem nie klika tła; dialog „wróć do edycji" zamyka się raz i wraca do edycji (bez pętli). |
| 10 | 02790656 | Usuń pojedynczy wpis z kosza | W koszu brak usuwania pojedynczego wpisu trwale — jest tylko „Wyczyść kosz" (masowo). | `TrashItemsView` + endpoint: akcja „usuń trwale" per wpis (spójna z modelem `deleted`). | Kosz: usuń pojedynczy wpis → znika, reszta zostaje; „Wyczyść kosz" nadal działa. |

## B. Uwaga o powiązaniach

- #9 to **para** (`62217cc8` blokada tła + `ac90c2a4` pętla) — wspólny kod modala edycji, jedna faza, dwa tickety na prod.
- #7/#8 (`be20465a`, `0a23baea`) — oba tabletowe/layout, ale różne powierzchnie (listy vs profil); osobne fazy, wspólna metoda weryfikacji (emulacja tabletu).
- #2/#3 (`ef87e4f8`, `2d65d300`) i #1 (`f4dc0119`) — powłoka/ikony; drobne, mogą pójść szybko.

## C. Do odłożenia — triage (potwierdzić zasadność, komentarz na prod, NIE budować w tym slice)

| id | Tytuł | Powód odłożenia | Działanie na prod |
|----|-------|-----------------|-------------------|
| a3beda31 | Jednoguzikowy tryb nagrywania | Audio POZA MVP → V2 (OQ2 rozstrzygnięte 2026-07-20). | Komentarz „audio poza MVP, zaplanowane na V2"; status zostaje `new`. |
| 9fc5f4a8 | Edycja wpisu wspomagana AI | Duża nowa funkcja AI (dyktowanie/edycja przez model) — osobny wycinek. | Komentarz „zasadne, wymaga osobnej większej zmiany"; `new`. |
| 663d01fd | Podział/powielenie/łączenie w torze | Duża nowa funkcja (split/merge/duplicate w stagingu) — osobny wycinek. | Komentarz jw.; `new`. |
| a6a328ce | Redesign interakcji listy | Zmiana modelu interakcji (klik=szczegóły, ikony, „oko/szczegóły") — osobny wycinek UX po S-15. | Komentarz jw.; `new`. |
| 1c0077b1 | Pull-to-refresh na tablecie | Gest natywny (pociągnięcie w dół) — nieodtwarzalny w Playwright headless; wątpliwa wartość dla SSR. | Komentarz „gest natywny poza zakresem/weryfikacją; osobna zmiana"; `new`. |
| 3eca2a93 | Poprawić prompt klasyfikacji | Tuning promptu; w testach klasyfikator = `mock`, realna weryfikacja wymaga klucza modelu — osobna zmiana z prawdziwym modelem. | Komentarz „tuning promptu, poza zakresem tej rundy (mock w testach)"; `new`. |

> Werdykt „triage" ≠ „anulowany". `cancelled` rezerwuję dla zgłoszeń **niepotwierdzonych / nieodtwarzalnych** podczas weryfikacji (np. bug, którego nie da się odtworzyć). Featury odłożone zostają `new` z komentarzem, żeby user widział je jako świadomie zaplanowany dług, nie odrzucone.

## Pełne UUID ticketów (do operacji PATCH na prod)

| prefix | pełny UUID | faza |
|---|---|---|
| f4dc0119 | f4dc0119-e225-4837-9f52-10eb04365941 | 1 |
| ef87e4f8 | ef87e4f8-2365-490d-a875-25d5dc3ffd75 | 2 |
| 2d65d300 | 2d65d300-265e-44b8-a608-b86939ee4496 | 3 |
| 164608bf | 164608bf-1ca6-4fff-bfa9-b06e4955993c | 4 |
| 80c4f735 | 80c4f735-5b5b-460f-947d-3c72bf12c242 | 5 |
| 6fa2b64b | 6fa2b64b-84f3-4da9-ab68-b8192552c09a | 6 |
| be20465a | be20465a-754c-4f54-baba-c20b2f61eeb6 | 7 |
| 0a23baea | 0a23baea-98a7-41cb-80c7-24165cd44eff | 8 |
| 62217cc8 | 62217cc8-d4e5-4331-a242-10984a4ac9de | 9 |
| ac90c2a4 | ac90c2a4-31d3-4468-8048-77ff7998b926 | 9 |
| 02790656 | 02790656-f350-47df-8f26-06db431add02 | 10 |
| a3beda31 | a3beda31-df6e-41e1-a429-bcd5dacd1dbc | 11 (triage) |
| 9fc5f4a8 | 9fc5f4a8-e2f8-4a21-b6a8-916d71679da1 | 11 (triage) |
| 663d01fd | 663d01fd-dda3-4a48-9e10-5b90798e6053 | 11 (triage) |
| a6a328ce | a6a328ce-486b-4cb0-9df1-5af568cbbb71 | 11 (triage) |
| 1c0077b1 | 1c0077b1-a212-49d7-9957-1f3bc083b2fd | 11 (triage) |
| 3eca2a93 | 3eca2a93-0d09-4169-8223-4632de60c199 | 11 (triage) |
