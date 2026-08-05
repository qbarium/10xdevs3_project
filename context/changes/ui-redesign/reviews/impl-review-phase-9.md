<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Plan**: context/changes/ui-redesign/plan.md
- **Zakres**: Faza 9 z 9 + 4 poprawki poza fazami (delta `5702c09..HEAD`)
- **Commity**: 4b0405e, 600ad5f, 5332180, c21324b, 4060d5f
- **Data**: 2026-08-06
- **Werdykt**: ZAAKCEPTOWANO
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 1 obserwacja

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Dowody weryfikacji

Delta źródeł `5702c09..HEAD` (16 plików, 5 commitów) zweryfikowana niezależnie przez dwóch pod-agentów + odtworzone bramki:

- **Faza 9 §1 (płaska oś stanu)** — MATCH. `StateFilterSelect.tsx` renderuje jeden `<nav>` z 6 pozycji `STATE_FILTER_OPTIONS` jako `<a href={navigateHref(view, type, opstatus)}>`; „Nowe"/„W toku" → `/items/active?opstatus=new|in_progress`; „Wszystko aktywne" wyświetlane jako „Aktywne" (tylko etykieta); podświetlenie wyłączne przez round-trip `stateSelectValue(view, opstatus)` (dokładnie jedna pozycja `aria-current="page"`). Model `state-filter.ts` zmieniony wyłącznie w komentarzach.
- **Faza 9 §2 (usunięcie podfiltra klienckiego)** — MATCH. `onSelectActiveSubfilter` i `ACTIVE_SUBFILTERS` — zero wystąpień w `src/`; oba call-site (`AcceptedItemsView`, `TrashItemsView`) na nowej 3-propowej sygnaturze; zachowanie serwerowe (opstatus przez URL) nietknięte.
- **Kontrakty zamrożone** — nienaruszone: `state-filter.test.ts` bez modyfikacji (diff pusty); eksporty `navigateHref`/`STATE_FILTER_OPTIONS`/`stateSelectValue` żyją; etykieta zbiorcza „Zrobione" generyczna (`operationalStatusLabel(target)` bez `type` → `labels.ts` „Zrobione"); reconcile nietknięty (`requestBulk`/`execute` bez zmian); `ItemCard.tsx` w ogóle poza deltą (`<h3>`, `<article data-item-id>`, „Zatwierdź", aria-label bezpieczne).
- **Bezpieczeństwo/wzorce** — czysto: brak `dangerouslySetInnerHTML`; `navigateHref` buduje href tylko z enumów (free-text `q` nie trafia do href → brak iniekcji); brak nowej wyspy/depa (`DropdownMenu` reużywa istniejący `ui/dropdown-menu.tsx` z przypiętej umbrelli `radix-ui`) → dup-React bez regresji; brak top-level `return` w 6 dotkniętych `.astro`; `cn()`/`class:list` poprawnie, zero zaszytych kolorów (same tokeny); zakładki jako `<a href>` (nawigacja), hooki z `@/components/hooks/`.
- **e2e** — `happy-path-smoke.spec.ts` wiernie zaktualizowany na menu „Zmień stan" → menuitem „Zrobione", asercja reconcile (`toBeHidden`) zachowana (nie maskuje regresji).

### Kryteria sukcesu (automatyczne, odtworzone 2026-08-06)

- `npm run lint` — **PASS** (exit 0; tylko znane szumy `astro-eslint-parser projectService`).
- `npm test` — **PASS** (55 plików, **556 testów**, w tym `labels.test`/`state-filter.test` — identyczna liczba jak przy Fazie 8).
- `npm run build` — **PASS** (exit 0; ostrzeżenie sitemap `site` to znany szum).
- `npm run e2e` — **NIE uruchamiane** w tym przeglądzie (ciężkie: lokalny Supabase + Playwright). Odhaczone przy `4060d5f`, weryfikacja wizualna (9.5–9.7) przy `4664a2d` (Playwright, oba motywy).

## Ustalenia

### F1 — Powłoka na sztywne 100vh przycina dolny rząd, gdy pojawi się baner

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość (niezawodność)
- **Lokalizacja**: src/layouts/AppLayout.astro:54
- **Szczegóły**: Refactor „nieruchomy pasek + scroll tylko listy" (600ad5f/5332180) dał powłoce `h-screen overflow-hidden` (sztywne 100vh). `Layout.astro:26-41` renderuje baner `missingConfigs` jako rodzeństwo w flow NAD powłoką (`body { height:100% }`). Gdy baner istnieje, powłoka nie odejmuje jego wysokości → dolny rząd (PageSize + Pagination, `shrink-0`) zjeżdża pod krawędź, a `overflow-hidden` oddaje go tylko scrollowi całego dokumentu. Druga, marginalna manifestacja: skrajnie niski viewport + zawinięty pasek zbiorczy (`flex-wrap`) → lista kurczy się do ~0. **Dziś nieosiągalne**: jedyny wpis `configStatuses` to Supabase, którego brak i tak redirectuje strony `fill` na signin — baner i powłoka nie współistnieją. Kruchość realna, bo `Banner.astro` zapowiada warianty (BYOK/warning) nieblokujące auth.
- **Poprawka**: W `Layout.astro` daj `body` kontekst pełnej wysokości jako kolumnę flex (`min-h-screen flex flex-col`), a w `AppLayout.astro:54` zamień `h-screen` na `flex-1 min-h-0` — powłoka zajmie resztę PO banerze, nie stałe 100vh.
  - Siła: Usuwa kruche sprzężenie u źródła; powłoka przestaje zakładać, że jest jedynym dzieckiem viewportu. Spójne z „jeden obszar scrolla" reszty layoutu.
  - Kompromis: Dotyka współdzielonego `Layout` (owija też landing/auth) — trzeba potwierdzić, że te strony renderują się dobrze pod `body` flex-column.
  - Pewność: MED — mechanizm potwierdzony strukturalnie, ale stan dziś nieosiągalny, więc naprawa prewencyjna.
  - Martwy punkt: Nie odtworzono wizualnie z realnym banerem (stan nieosiągalny bez rozszerzenia `configStatuses`); zachowanie landing/auth pod nowym `body` flex niesprawdzone.
- **Decyzja**: NAPRAWIONE + TEST (triaż 2026-08-06). Pierwotna propozycja (`body flex-col`) okazała się wadliwa — `flex-1` względem procentowego `height:100%` był nieokreślony, lista rozpychała dokument do 1231 px. Zastosowano opakowanie: nowy prop `Layout.fullHeight` owija baner + treść we wspólną kolumnę `h-screen overflow-hidden` (pewna jednostka `vh`); `AppLayout` przekazuje `fullHeight`, powłoka dostaje `flex-1 min-h-0`; landing/auth zostają w naturalnym flow (`display:contents`). Dodano regresyjny E2E `e2e/config-banner-shell-layout.spec.ts` ze szwem dev (`import.meta.env.DEV` + ciasteczko `e2e_config_banner` w `Layout.astro`, martwy w prod): wymusza baner u zalogowanego użytkownika i sprawdza, że baner jest widoczny, stopka (Na stronę + paginacja) zostaje w oknie, a `body.scrollHeight` mieści się w viewporcie (mierzone na `body`, bo `<astro-dev-toolbar>` zawyża `documentElement` tylko w dev). Bramki: `npm run lint` zielony, `npm run e2e` 4/4 zielone (potwierdzone headed).

### F2 — Usunięcie pozycji „Dziennik" poza jawnym zakresem planu

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/shell/AppSidebar.astro (blok usunięty w 4b0405e)
- **Szczegóły**: Commit 4b0405e usunął pozycję „Dziennik / wkrótce" (wyłączony placeholder, bez trasy, bez zachowania). Plan Fazy 2 §2 jawnie ją specyfikował („Dziennik — disabled, tag »wkrótce«"), a ręczny punkt 2.7 to odhaczył. Rozjazd plan↔kod czysto dokumentacyjny — uzasadnienie commita sensowne (brak funkcji w PRD/roadmapie), ale tekst planu nieaktualizowany. Zero wpływu na zachowanie.
- **Poprawka**: Dopisać aneks przy Fazie 2 §2 / punkcie 2.7 planu, że „Dziennik" usunięto jako martwy placeholder — albo świadomie zaakceptować rozjazd. Zero zmian w kodzie.
- **Decyzja**: NAPRAWIONE (triaż 2026-08-06). Dopisano aneks w `plan.md` przy Fazie 2 §2: „Dziennik" usunięty jako martwy placeholder (follow-up `4b0405e`), kryterium 2.7 pozostaje odhaczone (element istniał i działał w Fazie 2). Zero zmian w kodzie.
