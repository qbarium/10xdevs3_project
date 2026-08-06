<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Plan**: `context/changes/ui-redesign/plan.md`
- **Tryb**: Głęboki
- **Data**: 2026-08-04
- **Werdykt (jak znaleziono)**: DO POPRAWY
- **Werdykt po sortowaniu**: SOLIDNY (7/7 ustaleń naprawionych)
- **Ustalenia**: 0 krytycznych, 5 ostrzeżeń, 2 obserwacje

## Werdykty

| Wymiar | Werdykt (jak znaleziono) | Ustalenia |
|-----------|---------|---------|
| Zgodność ze stanem końcowym | OSTRZEŻENIE | F5 |
| Oszczędne wykonanie | OSTRZEŻENIE | F6 |
| Dopasowanie architektoniczne | OSTRZEŻENIE | F2 |
| Martwe punkty | OSTRZEŻENIE | F1, F3 |
| Kompletność planu | OSTRZEŻENIE | F4, F7 |

Po naniesieniu wszystkich poprawek każdy wymiar przechodzi → **SOLIDNY**.

## Ugruntowanie

14/14 ścieżek ✓ · symbole ✓ (`created_at`/`updated_at` w typie `Item` — `types.ts:134-138`; `navigateHref` — `state-filter.ts:66`; `optimizeDeps.include` — `astro.config.mjs`; `bg-cosmic` ×13 plików rozłożone na fazy) · brief↔plan ✓. Podagent (general-purpose) zweryfikował 5 ryzykownych twierdzeń + promień rażenia + wzorce.

## Co potwierdzone (bez działania)

- 5 kontraktów testów w `ItemCard` celuje w tag/atrybut/tekst (`<h3>` :163, `<article data-item-id>` :73-74, `aria-label="Zaznacz: {title}"` :85, „Zatwierdź" :179), nie w klasy CSS → restyle bezpieczny.
- Logika reconcile (item znika po zmianie stanu) żyje w hookach/`selection.ts`/`operational-view.ts`, nie w JSX → odporna na restyle.
- `sonner` da się uczynić świadomym motywu bez `next-themes` i bez providera.
- Zbiór konsumentów `Layout` (12) kompletny; brak stron 404/500.
- Brak duplikatu kodu motywu (plan buduje od zera — poprawnie).
- Rozjazd aliasu hooków (`components.json` `@/hooks` vs `src/components/hooks/`) już wychwycony w planie (Faza 2).
- Sekcja Progress przetworzy się w `/10x-implement` — rozjazdy tytułów faz 2/3/5 są kosmetyczne (precedens 4 wdrożonych archiwalnych planów: parser trzyma się numeru fazy, nie pełnego tytułu; `## Postęp`/`### Faza` i skróty tytułów są tolerowane).

## Ustalenia

### F1 — Powłoka: licznik „Do akceptacji" i status klucza bez źródła danych

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 2 §2 (powłoka) + Uwagi o wydajności
- **Szczegóły**: Sidebar ma pokazywać licznik pendingów i konto „ze statusem klucza", ale `middleware.ts:23` wkłada do `locals.user` tylko użytkownika auth Supabase — bez tych danych (status klucza dziś leci osobnym zapytaniem `/api/profile/byok-key`; licznik pending nie istnieje na stronach spoza `/items`). Powłoka owija 8 stron. Plan deklaruje „bez nowych zapytań" (Uwagi o wydajności), a licznik/status by je wymagały.
- **Poprawka A ⭐ Zalecana**: `AppLayout` liczy pending lekkim `count` (`head:true`) + pobiera hint klucza raz na render powłoki; aktualizacja notatki wydajności.
  - Siła: dostarcza spec z makiety; `count` tani. Kompromis: +1–2 zapytania na render strony chronionej. Pewność: WYSOKA.
- **Poprawka B**: Powłoka bez dynamicznych liczb — „Do akceptacji" bez licznika, status klucza tylko na `/profile`.
  - Siła: zero nowych zapytań/zmian zachowania. Kompromis: odejście od makiety.
- **Decyzja**: NAPRAWIONE (Poprawka A) — dodano źródło danych powłoki w kontrakcie Fazy 2 §2 + zaktualizowano Uwagi o wydajności (dwa lekkie zapytania na render).

### F2 — Zakładki zakresu: reużycie `state-filter.ts` częściowe, `<a href>` zerwie podfiltr „active"

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Dopasowanie architektoniczne
- **Lokalizacja**: Faza 3 §2
- **Szczegóły**: Plan: „zakładki jako `<a>`, reużywając `navigateHref` — zero zmian w logice". Ale `resolveStateSelection` (`state-filter.ts:82-84`) ma gałąź `{kind:"subfilter"}` dla rodziny „active" (active/new/in_progress) — kliencki re-fetch bez nawigacji, nie `href`. Czyste `<a href>` zerwałyby podfiltr (reset strony + czyszczenie zaznaczenia). `navigateHref` jest prywatna (`:66`, bez `export`).
- **Poprawka**: Na `<a href>` konwertuj tylko 4 zakładki zakresu (active/done/cancelled/trash — nawigacja); podfiltr „active" zostaw jako kontrolkę kliencką (gałąź subfilter). Wyeksportuj `navigateHref` lub czytaj `resolveStateSelection(...).href`. Popraw kontrakt (nie „zero zmian w logice").
- **Decyzja**: NAPRAWIONE — kontrakt Fazy 3 §2 przepisany na rozgałęzienie navigate↔subfilter.

### F3 — „Badge stanu tylko na zadaniach" nieaktualne po backfillu S-04; kryterium 3.9 myli bramkę

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 3 §1 (meta wiersza) + kryterium ręczne 3.9
- **Szczegóły**: Plan opisuje badge „tylko gdy `operational_status` (funkcjonalnie: zadania)", a 3.9 każe zweryfikować „badge tylko na zadaniach". Migracja `20260615152731_operational_status_all_types.sql` zrobiła backfill `NULL→'new'` dla wszystkich typów (`types.ts:76-77`). Warunek renderu (`ItemCard.tsx:100`) bez zmian bezpieczny, ale przy bramce ręcznej badge pojawi się też na notatkach/pomysłach → fałszywy fail albo pokusa dodania type-checka (regresja zachowania).
- **Poprawka**: Popraw parentezę i 3.9: badge tam, gdzie `operational_status` ustawiony (po S-04 — praktycznie wszystkie accepted, nie tylko zadania), warunek bez zmian.
- **Decyzja**: NAPRAWIONE — 3 zsynchronizowane korekty (Faza 3 §1 + ręczna weryfikacja + kryterium 3.9).

### F4 — Pipeline fontów niedookreślony: subset latin-ext bez CDN/nowego narzędzia

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 1 §3
- **Szczegóły**: Faza 1 zakłada statyczne `.woff2` (subset latin+latin-ext, wybrane grubości) komitowane do repo, ale nie mówi, jak powstają. W repo brak narzędzia do fontów i katalogu fontów. Oficjalne wydanie IBM Plex nie serwuje gotowego subsetu latin-ext per grubość — trzeba go wytworzyć (pyftsubset = nowe narzędzie) albo przyjąć pełne pliki. Fontsource nierozważony.
- **Poprawka A ⭐ Zalecana**: `@fontsource/ibm-plex-sans` + `@fontsource/ibm-plex-mono` (npm) — self-hostowane, pre-subsetowane po unicode-range z latin-ext; grubości importem. Zero CDN, zero ręcznego subsettingu.
  - Siła: standard; latin-ext pewny; to CSS+fonty, nie runtime JS (bez wpływu na dup-React). Kompromis: 2 zależności npm (+ `npm audit`).
- **Poprawka B**: Ręczne `.woff2` w `public/fonts/`.
  - Siła: assety w repo. Kompromis: trzeba pozyskać już zsubsetowane pliki (pyftsubset) albo przyjąć pełne (cięższe).
- **Decyzja**: NAPRAWIONE (Poprawka A) — Faza 1 §3, jej uwaga implementacyjna, „Krytyczne szczegóły" (Fonty i polskie znaki) i wiersz w `plan-brief.md` przełożone na Fontsource.

### F5 — Landing (`Welcome.astro`) osadza `<Topbar/>` — żadna faza go nie odpina

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność ze stanem końcowym
- **Lokalizacja**: Faza 7 §1 (landing) + Faza 8 §1 (usunięcie Topbar)
- **Szczegóły**: Plan kadruje powłokę jako „8 chronionych stron", a `Topbar` do usunięcia w Fazie 8 „jeśli nic go nie woła". `Topbar` ma 9. konsumenta poza tym zbiorem: `Welcome.astro:32` (publiczne `/`). Faza 7 restyluje landing, ale w kontrakcie nie mówi o zdjęciu `<Topbar/>` ani czym zastąpić nawigację. Skutek: Faza 8 nie usunie `Topbar.astro` albo landing zostanie ze starym paskiem.
- **Poprawka**: W kontrakcie Fazy 7 zdejmij `<Topbar/>` z `Welcome.astro` + zdefiniuj nawigację landingu (marka + „Zaloguj/Zarejestruj", bez powłoki); domknij warunek usunięcia w Fazie 8.
- **Decyzja**: NAPRAWIONE — Faza 7 §1 (zdjęcie Topbar + nawigacja landingu) + Faza 8 §1 (warunek usunięcia z grepem `Topbar`).

### F6 — Granica Faz 3↔4 na `PendingItemsView` rozmyta

- **Waga**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Oszczędne wykonanie
- **Lokalizacja**: Faza 3 §2 vs Faza 4 §1
- **Szczegóły**: Faza 3 §2 wciąga `PendingItemsView.tsx` do „trio widoków… wspólny wzorzec… zakładki zakresu", ale „Do akceptacji" (`/items`) nie ma zakładek zakresu i dostaje własny wygląd triage w Fazie 4. Pending edytowany w obu fazach bez wskazania, co robi która.
- **Poprawka**: Doprecyzuj — Faza 3 daje Pendingowi tylko wspólne prymitywy (`ItemCard`, kontrolki-pigułki, paginacja); pasek zbiorczy + wiersz triage robi Faza 4; Pending nie ma zakładek zakresu.
- **Decyzja**: NAPRAWIONE — cel Fazy 3 §2 doprecyzowany (zakres zakładek + granica z Fazą 4).

### F7 — Domknięcia: drift specyfikacji + luka w grepie Fazy 8

- **Waga**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 8 §2 (grep) + `ui-design-system.md` §Wzorce
- **Szczegóły**: (a) `ui-design-system.md` §Wzorce wciąż wymienia „źródło sesji" w meta wiersza, a plan je świadomie wycina — „trwałe prawo" powinno odnotować wyjątek. (b) `Banner.astro` (`src/components/Banner.astro`, baner błędów configu w `Layout`, 9 hex w scoped `<style>`: info/warning/error) nie jest przypisany do żadnej fazy, a wzorce grepa Fazy 8 nie łapią surowego hex w scoped `<style>`.
- **Poprawka**: (a) Zaktualizuj `ui-design-system.md` (oznacz „źródło sesji" jako wyjątek). (b) Przypisz `Banner.astro` do Fazy 8 i rozszerz grep o hex `#[0-9a-fA-F]{3,6}` w scoped `<style>`.
- **Decyzja**: NAPRAWIONE (oba) — `ui-design-system.md` §Wzorce (wyjątek) + Faza 8 §1 (Banner.astro) + Faza 8 §2 (rozszerzony grep).

## Ślad edycji

- `plan.md` — Fazy 1 §3, 2 §2, 3 §1+§2, 7 §1, 8 §1+§2 + Uwagi o wydajności + Krytyczne szczegóły.
- `plan-brief.md` — wiersz „Fonty" (Fontsource).
- `ui-design-system.md` — §Wzorce, wyjątek „źródło sesji".
- `change.md` — `status: planned → plan_reviewed`.
