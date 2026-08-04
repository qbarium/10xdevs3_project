<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Plan**: context/changes/ui-redesign/plan.md
- **Zakres**: Faza 3 z 8 (Wpisy — lista, zakładki zakresu, karta wpisu + dialogi)
- **Data**: 2026-08-05
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych, 2 ostrzeżenia, 3 obserwacje
- **Commit fazy**: 7457085

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

## Kryteria sukcesu (weryfikacja)

- **3.1 Lint** — PASS (niezależnie: `npm run lint` czysty; tylko znane ostrzeżenia `astro-eslint-parser` o `projectService`).
- **3.2 Build** — PASS (niezależnie: `npm run build` kompletny; ostrzeżenie sitemapy `site` znane, niezwiązane).
- **3.3 Testy jednostkowe** — PASS (niezależnie: `npm test` = 574/574; kontrakty zamrożone `labels.test` + `state-filter.test` = 31/31).
- **3.4 E2E zimny start** — PASS (nie re-run w tym przeglądzie — E2E jest local-only i kosztowne; oznaczone zielone w commicie 7457085 „3/3 bez re-optymalizacji dep" i **strukturalnie potwierdzone**: wszystkie depy nowych wysp już przypięte w `ssr.optimizeDeps.include`).

## Kontrakty nienaruszalne (E2E) — 100% zachowane

`<h3>` tytuł (ItemCard.tsx:161), `<article data-item-id>` (135-136), `aria-label="Zaznacz: {title}"` (152), przycisk „Zatwierdź" (239), role ARIA prymitywów bez zmian. Zero ryzyka regresji uchwytów testów.

## Ustalenia

### F1 — Wyścig hydracji w mostku topbar↔lista (możliwa utrata zdarzenia)

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Bezpieczeństwo i jakość (Niezawodność)
- **Lokalizacja**: src/components/hooks/useItemTopbarBridge.ts:43-44; src/components/items/item-topbar-events.ts:27-33
- **Szczegóły**: Faza 3 wyniosła szukajkę i akcję główną z wyspy listy do OSOBNYCH wysp topbara; koordynacja idzie ulotnymi zdarzeniami `window` (bez bufora/replay). Wyspa listy rejestruje listenery dopiero w `useEffect([])` po montażu. Obie wyspy hydrują się niezależnie (`client:load`), a topbar jest lżejszy niż wyspa listy (sonner/dialogi/wiele depów) → może zhydrować się pierwszy. W oknie „topbar interaktywny, mostek listy jeszcze nie zarejestrowany" `dispatchItemSearch`/`dispatchItemAction` przepada. To NOWA klasa zachowania względem starego układu (SearchBox był W wyspie listy, obsługa synchroniczna) — lekko podważa deklarację „zero zmian zachowania". Ekspozycja niska: (a) start strony poprawny bez zdarzeń — SSR+URL zasiewają obie wyspy tą samą frazą; (b) okno to dziesiątki–setki ms; (c) zgubiona akcja to no-op (user kliknie ponownie); (d) zgubiona fraza odzyskiwalna kolejnym naciśnięciem. Realnie groźny tylko „wklej całą frazę natychmiast po załadowaniu". Sprzątanie listenerów i wzorzec „latest ref" — poprawne (zweryfikowane).
- **Poprawka A ⭐ Zalecana**: Reconcyliacja przy montażu mostka — w `useItemTopbarBridge` przy rejestracji odczytać bieżącą frazę z URL (źródło prawdy) i dociągnąć różnicę względem `settledCriteria.q`.
  - Siła: Domyka wyścig u źródła; URL jest już źródłem prawdy, więc reconcyliacja tania i bezpieczna.
  - Kompromis: Kilka linii dodatkowej logiki w mostku; drobny narzut czytania URL przy montażu.
  - Pewność: MED — wzorzec prosty, ale nie zweryfikowany testem w tej fazie; wymaga ostrożności, by nie wywołać zbędnego fetchu, gdy fraza już zasiana.
  - Martwy punkt: Nie zmierzono realnego czasu okna hydracji na docelowym sprzęcie.
- **Poprawka B**: Zaakceptować świadomie i udokumentować jako znane ograniczenie (aneks w planie).
  - Siła: Zero kodu; ekspozycja obiektywnie niska, degradacja łagodna i odzyskiwalna.
  - Kompromis: Deklaracja „zero zmian zachowania" pozostaje z drobnym wyjątkiem; ryzyko zostaje na produkcji.
  - Pewność: MED — zależy od tolerancji na rzadki, odzyskiwalny przypadek brzegowy.
  - Martwy punkt: Brak pomiaru, jak często realnie trafia scenariusz „paste natychmiast po load".
- **Decyzja**: NAPRAWIONO (Poprawka A skorygowana) — mechanizm zmieniony z „odczyt z URL" (niewystarczający: zgubiona fraza żyje w inpucie topbara, nie w URL, który pisze tylko wyspa listy po fetchu) na **replay ostatniej frazy z bufora na `window`**. Zmiana w `item-topbar-events.ts` (bufor `__tlItemSearchLatest` + `readLatestItemSearch`) i `useItemTopbarBridge.ts` (replay `source==="topbar"` przy montażu). Zweryfikowano: eslint czysty, `npm test` 574/574.

### F2 — Zakres szerszy niż litera Fazy 3 (mechanizm topbara + przecieki Faz 4/6)

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/items/TopbarItemAction.tsx; PendingItemsView.tsx:247; SessionEntriesView.tsx:139
- **Szczegóły**: Plan §2 Fazy 3 mówił tylko „szukajka przeniesiona do topbara". Powstał pełny mechanizm koordynacji zdarzeń okna (`item-topbar-events`, `useItemTopbarBridge`, `TopbarItemSearch`) — uzasadniona hydraulika (topbar żyje w `AppLayout`, osobne drzewo wysp) — ORAZ `TopbarItemAction` (akcja główna: „Dodaj wpis"/„Wyczyść kosz"), nieopisana wprost w §2, lecz wpięta w zaprojektowany w Fazie 2 „slot akcji głównej". Dodatkowo dwie migracje tokenów dotknęły materiału późniejszych faz: rekolor kontenera paska zbiorczego w `PendingItemsView` (restyle triage = Faza 4) i 1 linia stanu pustego w `SessionEntriesView` (plik Fazy 6). Wszystko wyłącznie prezentacyjne (tokeny + zaokrąglenia), zachowanie i endpointy nietknięte; przecieki są obronne (pozostawienie paska na `bg-white/5` dałoby niemal niewidoczny element na jasnej powłoce z Fazy 2). Rdzeń Fazy 4 (mockup-wierny wiersz triage, kolory statusów zaznaczenia) i Fazy 6 (baner sesji) pozostają realną robotą — fazy nie zostały „wydrążone".
- **Poprawka**: Udokumentować jako aneks w planie (wzorzec aneksów „Zrealizowano inaczej / Redukcja zakresu 2026-08-04" już obecny w Fazach 1-2) — odnotować mechanizm zdarzeń + `TopbarItemAction` w §2 Fazy 3 oraz obronne przecieki tokenów do Faz 4/6.
- **Decyzja**: NAPRAWIONO — aneks „Zrealizowano — dopowiedzenie zakresu (2026-08-05, commit 7457085 + przegląd Fazy 3)" dopisany do §2 Fazy 3 w `plan.md`.

### F3 — Martwy kod produkcyjny po konwersji Select→zakładki

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/items/state-filter.ts:78-86 (`resolveStateSelection`), :102-104 (`stateSelectLabel`), typ `StateSelection`
- **Szczegóły**: Faza 3 przełączyła `StateFilterSelect` na bezpośrednie wołanie `navigateHref`/`stateSelectValue`/`STATE_FILTER_OPTIONS`. `resolveStateSelection` i `stateSelectLabel` (+ rozłączny typ `StateSelection`) nie są już wołane przez ŻADEN komponent — jedyne referencje to `state-filter.test.ts` (potwierdzone grepem). NIUANS: `state-filter.test.ts` to jeden z **zamrożonych** plików kontraktowych — usunięcie funkcji pociąga edycję zamrożonego testu, więc to nie trywialne „skasuj 2 funkcje" w trakcie fazy.
- **Poprawka**: Odłożyć do Fazy 8 (Sprzątanie) — tam legalnie usunąć osierocone funkcje + typ wraz z ich testami (poza zamrożeniem zakresu tej fazy). Nie ruszać w Fazie 3.
- **Decyzja**: ODNOTOWANO do Fazy 8 — cel dopisany do Kontraktu Fazy 8 §1 w `plan.md` („Martwy kod z Fazy 3 (przegląd F3)"). Kod nietknięty w tej fazie (świadomie, chroni zamrożony `state-filter.test.ts`).

### F4 — `dialog.tsx:29 bg-black/50` niepoprawiony (jedyna wprost nazwana instrukcja Bloku 3)

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: src/components/ui/dialog.tsx:29
- **Szczegóły**: Plan §3 Fazy 3: „Drobne straye (np. `dialog.tsx:29` `bg-black/50`) → token tła overlayu." Plik nie był w commicie Fazy 3; l. 29 nadal ma `... fixed inset-0 z-50 bg-black/50`. To jedyna konkretnie nazwana instrukcja Bloku 3, która nie została wykonana. Wpływ wizualny znikomy — `bg-black/50` to neutralny scrim (domyślka shadcn) czytelny w obu motywach.
- **Poprawka**: Zamienić `bg-black/50` na token tła overlayu (spójne też z Fazą 8; można teraz albo domknąć w Fazie 8).
- **Decyzja**: NAPRAWIONO — plan był tu odrobinę wadliwy (token overlayu nie istniał), więc utworzono go: `--overlay: oklch(0 0 0 / 0.5)` w `:root` (ten sam scrim w obu motywach, parytet z domyślką shadcn) + `--color-overlay` w `@theme inline`; `dialog.tsx:29` `bg-black/50` → `bg-overlay`. Zweryfikowano: `npm run build` zielony (Tailwind generuje utility), grep bez realnych trafień `bg-black/50`. Grep 8.5 zostaje czysty bez wyjątku.

### F5 — Nieaktualny komentarz nagłówkowy modułu `state-filter.ts`

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/items/state-filter.ts:1-3
- **Szczegóły**: Komentarz mówi o „konsolidacji osi stanu do JEDNEJ rozwijanej listy" i „Komponent StateFilterSelect (Faza 2) tylko woła te funkcje i wykonuje ich werdykt". Po Fazie 3 komponent to zakładki `<a>` + przyciski podfiltra (nie `Select`) i nie wykonuje werdyktu `resolveStateSelection`. Dryf dokumentacji.
- **Poprawka**: Zaktualizować komentarz modułu do stanu zakładkowego.
- **Decyzja**: NAPRAWIONO — nagłówek `state-filter.ts:1-5` przepisany na stan zakładkowy (zakładki `<a href>` + podfiltr „active"), z adnotacją o martwych `resolveStateSelection`/`stateSelectLabel` do usunięcia w Fazie 8. Docstringi martwych funkcji zostawione (znikną z nimi w Fazie 8).

## Zweryfikowane jako poprawne (potwierdzenie solidności)

- **Dup-React (SSR/dev)**: wszystkie depy nowych wysp (`react`, `lucide-react`, `@radix-ui/react-slot`, `class-variance-authority`, `clsx`, `tailwind-merge`) już przypięte w `ssr.optimizeDeps.include` — zero nowo odkrywanych depów, brak ryzyka regresji.
- **Sprzątanie listenerów**: każdy `addEventListener` ma parujący `removeEventListener` w cleanupie `useEffect`.
- **Brak pętli echo**: dyskryminator `source` ("topbar"/"list") poprawnie rozdziela nadawcę.
- **SSR-safe**: brak dostępu do `window`/`document` w ciele modułu/komponentu — wszystko w efektach/handlerach.
- **Parytet debounce + czyszczenie zaznaczenia**: fraza z topbara przechodzi tą samą ścieżką `applyCriteria`→debounce 300 ms; `setSelected(new Set())` zachowane.
- **Higiena tokenów**: grep zaszytych kolorów po plikach objętych Fazą 3 (`components/items`, `components/lists`, `pages/items`) — czysty. Pozostałości (`SessionBanner.astro`) należą do Fazy 6.
- **`cn()`**: konsekwentnie; brak ręcznej konkatenacji klas. Hooki w `src/components/hooks/` (konwencja repo).
