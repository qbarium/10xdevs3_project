# Naprawa 17 zgłoszeń „Inne" z produkcji — krótki plan

> Pełny plan: `context/changes/prod-feedback-fixes/plan.md`
> Triage źródłowy: `context/changes/prod-feedback-fixes/backlog.md`

## Co i dlaczego

17 uwag testerów z produkcji (wpisy typu `other`) to backlog defektów i próśb o funkcje w TaskerLight. Naprawiamy realne bugi i drobny UX (11 zgłoszeń) pełnym flow z weryfikacją Playwright, a 6 dużych featurów świadomie odkładamy z komentarzem na prod. Cel: podnieść jakość odbioru bez rozjazdu zakresu.

## Punkt wyjścia

Aplikacja po S-15 (redesign) i S-17 (pomoc). Powłoka nawigacyjna jest statycznym Astro, więc elementy zależne od stanu (licznik „Do akceptacji", wskaźnik klucza) nie reagują na mutacje w wyspach React. Modal edycji (Radix) ma lukę w blokowaniu tła, kosz nie ma usuwania pojedynczego wpisu, a warstwa tekstu stanu `done` używa trzech różnych słów.

## Pożądany stan końcowy

10 napraw działa i jest zweryfikowanych E2E na lokalnym Taskerze; testy jednostkowe, lint, tsc i build zielone. 6 featurów udokumentowanych jako dług. Na produkcji każdy ticket ma poprawny status i komentarz. Gałąź `feature/prod-feedback-fixes` gotowa do ręcznej weryfikacji użytkownika — **niezmergowana**.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Podział 17 zgłoszeń | 11 napraw + 6 triage | Odróżnić realne bugi od dużych featurów; nie budować na siłę | Plan |
| Kolejność | Najpierw bugi, potem featury | Wymóg użytkownika | Użytkownik |
| Licznik pending + wskaźnik klucza | Most `CustomEvent` wyspa→powłoka | Istnieje precedens (`item-topbar-events.ts`); bez przebudowy powłoki | Plan (recon) |
| Terminologia `done` | „Zakończone" (badge/filtr) + „Zakończ" (akcja) | Ujednolicenie do kanonu L5; tylko warstwa tekstu | Plan |
| Tablet: strona za długa | `dvh` + `initial-scale=1` w `Layout.astro` | Klasyczne źródło problemu 100vh + skala po rotacji | Plan (recon) |
| Okno edycji (pętla) | Blokada `onInteractOutside` + rozerwanie dwóch modali | Pętla wynika ze współistnienia dwóch Radix Dialog | Plan (recon) |
| Kosz: usuń pojedynczy | Nowy `DELETE /api/items/:id` + serwis + UI | Brak endpointu pojedynczego; wzór `emptyTrash` | Plan (recon) |
| Kod i tickety | Kod lokalnie (bez merge); status+komentarz na prod | Wymóg użytkownika (obserwuje prod, weryfikuje ręcznie po mnie) | Użytkownik |

## Zakres

**W zakresie:** marka→link, checkboxy w dark, ikona „Do akceptacji", terminologia „zakończone", reaktywny wskaźnik klucza, reaktywny licznik pending, scrollbar na tablecie, wysokość/skala powłoki na tablecie, blokada+pętla okna edycji, usuwanie pojedynczego wpisu z kosza.

**Poza zakresem:** audio/nagrywanie (V2), edycja wspomagana AI, podział/powielenie/łączenie w torze, redesign interakcji listy, pull-to-refresh, tuning promptu klasyfikatora; zmiana modelu stanów; merge do `main`.

## Architektura / Podejście

Fazy w kolejności rosnącej złożoności. Drobne zmiany prezentacyjne (powłoka, CSS, tekst) → mosty reaktywne wyspa↔powłoka (`CustomEvent`) → modal edycji → pełny łańcuch kosza (endpoint→serwis→hook→UI) → triage. Każda faza domknięta scenariuszem Playwright w `e2e/`; fazy tabletowe w emulacji dotyku. Implementację faz deleguję do pod-agentów; skille, operacje prod/board/git — orkiestrator.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Marka→link | Logo prowadzi do `/ingest` | — (trywialne) |
| 2. Checkboxy dark | Widoczny checkbox w ciemnym | Regresja w jasnym |
| 3. Ikona „Do akceptacji" | Odrębna ikona | Dobór kształtu |
| 4. Terminologia | Spójne „Zakończone"/„Zakończ" | Zamrożone stringi w testach |
| 5. Wskaźnik klucza | Reaktywny status w powłoce | Synchronizacja most-wyspa |
| 6. Licznik pending | Reaktywny badge + weryfikacja listy | Objaw #1 może być nieodtwarzalny |
| 7. Scrollbar tablet | Widoczny pasek na dotyku | Wygląd na desktopie |
| 8. Wysokość powłoki | `dvh` + skala | Regresja layoutu wszystkich stron |
| 9. Okno edycji | Blokada tła, koniec pętli | Interakcja dwóch Radix Dialog na dotyku |
| 10. Kosz: usuń 1 | Trwałe usunięcie pojedynczego | Nowy endpoint + izolacja RLS |
| 11. Triage | 6 komentarzy na prod | — |

**Wymagania wstępne:** dostęp do prod (jest), lokalny Tasker + Docker Supabase (żyją), port 4321 wolny, Playwright/Chromium (zainstalowany).
**Szacowany nakład pracy:** ~duży; 10 faz naprawczych + triage, każda z osobnym E2E.

## Otwarte ryzyka i założenia

- Fix 6/8: część objawów tabletowych może być nieodtwarzalna headless — wtedy weryfikuję to, co się da, a resztę odnotowuję (nie udaję potwierdzenia).
- Fix 8: zmiana w `Layout.astro` jest globalna — konieczna kontrola regresji na innych stronach.
- Konto testowe lokalne ma skonfigurowany klucz BYOK — do testów usuwania/dodawania klucza trzeba to uwzględnić.

## Kryteria sukcesu (podsumowanie)

- 10 napraw przechodzi E2E i widać efekt na lokalnym Taskerze.
- Testy jednostkowe/lint/tsc/build zielone.
- Na produkcji 17 ticketów ma poprawny status i komentarz; gałąź niezmergowana, gotowa do odbioru.
