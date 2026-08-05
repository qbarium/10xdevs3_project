# Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna — Plan implementacji

## Przegląd

Redesign warstwy wizualnej TaskerLight do wariantu „technicznego" (IBM Plex Sans, ostre małe zaokrąglenia, gęste wiersze, kolorowy grzbień + chip per typ) w dwóch motywach — jasnym i ciemnym z przełącznikiem — oraz wprowadzenie trwałej powłoki nawigacyjnej (stały sidebar + topbar). Zmiana jest **czysto prezentacyjna**: zachowanie aplikacji (przepływy, stany, endpointy) pozostaje nietknięte. Prawem warstwy wizualnej jest `context/foundation/ui-design-system.md`, a źródłem prawdy — makieta `context/foundation/ui-mockup/taskerlight-list.html`.

Strategia (uzgodniona): **najpierw fundament** (ożywienie tokenów motywu + fonty + powłoka), **potem migracja powierzchni widok po widoku**. Całość na gałęzi `feature/ui-redesign`, fazy sekwencyjnie, **jeden PR na końcu** (bez merge per faza).

## Analiza stanu obecnego

- **Ciemny motyw istnieje w tokenach, ale jest martwy.** `src/styles/global.css` ma komplet semantycznych tokenów shadcn dla jasnego (`:root`) i ciemnego (`.dark`) — łącznie z gotową rodziną `--sidebar-*` i `@theme inline` mapującym je na utilities. Ale klasa `.dark` **nigdy nie trafia do DOM** i nie ma przełącznika. Warianty `dark:` w komponentach shadcn to martwy kod.
- **Dzisiejszy „ciemny" wygląd** pochodzi z `@utility bg-cosmic` (zaszyty gradient) + ręcznie malowanych `text-white`, `bg-white/5`, `text-blue-100/70`, gradientów `from-blue-200…`. Skala: **~171 wystąpień w 47 plikach** do przełożenia na tokeny (pełny inwentarz w `research.md` §1).
- **Powłoki nie ma.** Jest jeden `Layout.astro` (`<head>` + baner + `<slot/>`), a nawigacja to ręczny `Topbar.astro` bez stanu aktywnego. Ten sam wrapper (`bg-cosmic` + `max-w-6xl` + `<Topbar/>`) jest **skopiowany w 8 chronionych stronach**; landing osadza własny `<Topbar/>`.
- **Wszystkie trasy i widoki już istnieją** — zero do utworzenia. Redesign to przemalowanie, nie budowa.
- **Testy dają szeroki margines.** Żaden test nie asertuje klasy, stylu, koloru, zagnieżdżenia ani kolejności. Wszystkie asercje DOM żyją w 3 spec-ach Playwright (`e2e/`); Vitest jest czysto logiczny. Do zachowania jest **5 twardych kontraktów DOM** + zamrożone kontrakty tekstowe (patrz „Kluczowe odkrycia").
- **Znane pułapki środowiskowe** (z `lessons.md`): podwójny React w dev przy nowych wyspach (populacja depów w `ssr.optimizeDeps.include`), crash lintu przy top-level `return` w `.astro`, zakaz `npm run format` na całym repo w trakcie fazy.

## Pożądany stan końcowy

Użytkownik dostaje spójny, przeprojektowany interfejs w wariancie „technicznym", w dwóch motywach z przełącznikiem (bez mignięcia przy wejściu), owinięty stałą powłoką (sidebar + topbar) z podświetleniem aktywnej strony. Wszystkie widoki — łącznie z tymi spoza makiety (profil/BYOK, tryb „Pokaż wpisy", dialogi, modal klasyfikacji, auth, landing) — mówią jednym językiem wizualnym. Zachowanie i wszystkie testy przechodzą bez zmian.

**Zasada odwzorowania (nadrzędna).** Redesign odwzorowuje **układ i pozycje kontrolek** z makiety (grzbień, chip, filtry, szukajka, zakładki, akcje, meta wiersza) — nie tylko kolory. O tym, **które** elementy i dane pojawiają się na ekranie, decyduje jednak **realna aplikacja**, nie próbki z makiety: nie wymyślamy danych, których dziś nie ma, i nie gubimy funkcji, które są. Elementy wycięte (metadane przyszłości, „pewność %", przełącznik stylu) pomijamy; widoki spoza makiety wnioskujemy z jej języka; uchwyty testów zostają nietknięte.

Weryfikacja stanu końcowego: `npm run lint`, `npm run build`, `npm test` zielone; `npm run e2e` zielone na zimnym starcie (bez `--force`, bez `optimized dependencies changed. reloading`); ręczny przegląd każdego widoku w **obu** motywach zgodny z makietą.

### Kluczowe odkrycia

- **Infrastruktura tokenów jest, trzeba ją ożywić** — `global.css` ma `:root`/`.dark` + `@theme inline` + rodzinę `--sidebar-*`. Brakuje: klasy `.dark` w DOM, przełącznika, no-flash, oraz **tokenów kolorów per typ** (task/note/idea/decision/other — fg/bg/line) i operacyjnych (done/prog), których wartości podaje `ui-design-system.md` (tabele „Kolory per typ").
- **4 powtarzalne wzorce migracji** pokrywają większość z 171 wystąpień (`research.md` §1): (1) kontrolka-pigułka `border-white/10 bg-white/5 text-white/80`, (2) powłoka strony `bg-cosmic` + gradientowy nagłówek, (3) trio widoków accepted/pending/trash (identyczne), (4) trio kart auth (identyczne).
- **5 twardych kontraktów testów** (nienaruszalne): tytuł wpisu jako `<h3>` (`ItemCard.tsx`); karta jako `<article data-item-id>`; dokładne dostępne nazwy (`Skrzynka wejściowa`, `Tekst do klasyfikacji`, `Wyślij`, `Zatwierdź` — nie „Akceptuj", bulk `Zrobione`, checkbox `Zaznacz: {title}`); role ARIA z prymitywów shadcn (checkbox, textbox); dwa zachowania (redirect na `/items` po klasyfikacji; item **znika z DOM** po zmianie stanu — reconcile). Pełne odniesienia: `research.md` §2.
- **Kontrakty tekstowe zamrożone** przez `src/lib/labels.test.ts` (typy, stany operacyjne, akceptacja, sesje) i `src/components/items/state-filter.test.ts` (trasy zakresu). Restyle nie może zmienić tych stringów.
- **dup-React SSR** — nowa wyspa osiągalna z grafu musi mieć swoje późne depy w `astro.config.mjs` → `ssr.optimizeDeps.include`. `lucide-react` i zunifikowany `radix-ui` są przypięte; blok `shadcn add sidebar` dociąga Sheet/Tooltip/Separator/Skeleton z **podpakietów** `@radix-ui/*` → wymagają przypięcia. `next-themes` **nie wprowadzać**.
- **Zakładki zakresu = nawigacja multi-page.** Dziś to `StateFilterSelect` sterowany `state-filter.ts` (`navigateHref` buduje `/items/${view}`). Konwersja na stylowane linki jest prezentacyjna i **reużywa tę logikę** — dlatego linki, a nie interaktywny `tabs`.

## Czego NIE robimy

- **Przełącznika stylu i 5 dodatkowych presetów** (minimal/soft/brutal/terminal/neon) — tylko wariant „techniczny".
- **Metadanych przyszłości** — priorytet, termin, tagi; wraz z przełącznikiem „Metadane przyszłości" i banerem (`future-banner`, `fmeta`). Wycięte na mocy decyzji S-15.
- **„Pewności %"** w „Do akceptacji" (`conf` z makiety) — nie renderujemy.
- **ID źródła sesji na wierszu wpisu** (`S-…` z makiety) — nie dodajemy; powiązanie z sesją zostaje w trybie „Pokaż wpisy". (Daty utworzenia/modyfikacji **dodajemy** — to istniejące pola, patrz Faza 3.)
- **Nowych tras ani widoków** — wszystko istnieje.
- **Żadnych zmian zachowania** — endpointy, hooki, moduły logiki (`selection.ts`, `state-filter.ts`, `operational-view.ts`, walidacje) pozostają nietknięte co do zachowania.
- **Fontów z CDN** — makieta ładowała Google Fonts; my self-hostujemy (CSP Cloudflare).
- **Zmiany uchwytów testów** — role, dostępne nazwy, `data-item-id`, `<h3>`, etykiety widoków.
- **Utwardzania współbieżności edycji** (lost update z S-03) — poza zakresem tej zmiany.

## Podejście do implementacji

Fundament najpierw (Fazy 1–2), potem migracja powierzchni w spójnych grupach (Fazy 3–7), na końcu sprzątanie i pełna weryfikacja (Faza 8). Każda faza domyka się bramką ręczną (przegląd wzrokowy w obu motywach) zanim ruszy następna. Migracja korzysta z 4 powtarzalnych wzorców — najpierw wspólne helpery/warianty, potem hurtowe przełożenie plików z danej grupy. `bg-cosmic` usuwamy dopiero na końcu, gdy nic już go nie referuje.

## Krytyczne szczegóły implementacji

- **Kolejność no-flash motywu.** Cookie musi być czytane **serwerowo w `Layout.astro` przed pierwszym bajtem** — `<html>` renderuje `class="dark"` (lub bez) i dynamiczny `color-scheme` od razu. Wyspa-przełącznik tylko flipuje klasę na `document.documentElement` i zapisuje cookie. Odwrotna kolejność (klasa ustawiana po stronie klienta) daje mignięcie „jasne→ciemne".
- **dup-React: przypnij całą populację.** Po `shadcn add sidebar` dopisz do `ssr.optimizeDeps.include` każdy nowy podpakiet radix (Sheet→`@radix-ui/react-dialog`, Tooltip→`@radix-ui/react-tooltip`, Separator→`@radix-ui/react-separator`) **albo** przekieruj importy bloku na zunifikowany `radix-ui`. Weryfikuj **zimnym startem bez `--force`**; kryterium: zero `optimized dependencies changed. reloading` przy sesji pokrywającej render wysp + dialog (`zod`) + trasę API.
- **`.astro` i lint.** Żadnego top-level `return` we frontmatterze (crash reguły, którego `build` nie łapie). Po każdej edycji `.astro` uruchom `npm run lint`.
- **Aktywny stan sidebara.** Naiwny `startsWith` myli `/items` z `/items/active`. „Do akceptacji" (`/items`) wymaga **dopasowania dokładnego**; grupa „Wpisy" (`/items/active|done|cancelled|trash`) — **prefiksu** `/items/`.
- **Fonty i polskie znaki.** Subset musi obejmować **latin-ext** (ą, ć, ę, ł, ń, ó, ś, ź, ż), inaczej diakrytyki spadną na fallback. Fonty przez **Fontsource** (`@fontsource/ibm-plex-sans`/`-mono`, OFL) — `.woff2` self-hostowane z `node_modules` (pre-subset po unicode-range, w tym latin-ext), `@font-face` lokalny, zero `<link>` do CDN.
- **Alias hooków.** `components.json` mapuje `hooks` → `@/hooks`, a konwencja repo to `src/components/hooks/`. `shadcn add sidebar` wrzuci `useIsMobile` do `src/hooks/` — przenieś do konwencji repo i popraw import (albo ujednolić alias).
- **Format tylko celowanymi ścieżkami** — nigdy `npm run format` w trakcie fazy (przeformatuje pliki spoza zestawu; husky+lint-staged i tak sformatuje staged).

---

## Faza 1: Fundament motywu + fonty

### Przegląd

Ożywienie tokenów: klasa `.dark` w DOM, przełącznik motywu, brak mignięcia przez cookie serwerowe, uzupełnienie brakujących tokenów kolorów per typ. Plus self-host fontów IBM Plex Sans + Mono. Po tej fazie przełącznik działa na powierzchniach już opartych o tokeny (body, prymitywy shadcn); powierzchnie „cosmic" jeszcze się nie zmienią — to oczekiwane.

### Wymagane zmiany

#### 1. Mechanizm motywu (jasny/ciemny)

**Plik**: `src/layouts/Layout.astro`, nowa wyspa `src/components/ThemeToggle.tsx`, `src/components/ui/sonner.tsx`

**Cel**: Włączyć przełączanie motywu bez mignięcia. `Layout` czyta cookie serwerowo i renderuje `<html>` z poprawną klasą i `color-scheme` od pierwszego bajtu. Wyspa-przełącznik (ikona słońce/księżyc) flipuje klasę i zapisuje wybór. Toaster przestaje być na sztywno ciemny.

**Kontrakt**: Cookie `theme` o wartościach `light|dark` (`SameSite=Lax`, `path=/`), wzorzec jak `src/components/lists/page-size-pref.ts`. `Layout.astro` renderuje `<html class={theme==="dark"?"dark":""} style={"color-scheme:"+theme}>`; usunięty zaszyty `color-scheme: dark` (`Layout.astro:17`). `ThemeToggle` używa `lucide-react` (już przypięty — brak nowego depa). `sonner.tsx` czyta aktywny motyw zamiast `theme="dark"`.

#### 2. Uzupełnienie tokenów kolorów

**Plik**: `src/styles/global.css`

**Cel**: Dodać brakujące tokeny, których wymagają chipy, grzbiety i badge stanu — kolory per typ i operacyjne — w obu motywach.

**Kontrakt**: W `:root` i `.dark` dodać rodzinę per typ (`task`/`note`/`idea`/`decision`/`other`: `-fg`/`-bg`/`-line`) oraz operacyjne (`done`/`prog`), wartości **dosłownie** wg tabel „Kolory per typ" i „Stan operacyjny" z `ui-design-system.md`. Wystawić w `@theme inline`, by były dostępne jako utilities. Nie ruszać istniejących tokenów shadcn ani `--sidebar-*`.

#### 3. Fonty self-hosted

**Plik**: `package.json` (2 zależności `@fontsource/*`), `src/layouts/Layout.astro` (import CSS grubości) lub `src/styles/global.css`, wpięcie w `@theme`

**Cel**: Osadzić IBM Plex Sans + IBM Plex Mono lokalnie (self-host) i wpiąć jako font UI / mono, bez CDN.

**Kontrakt**: Fonty przez **Fontsource** (`@fontsource/ibm-plex-sans` + `@fontsource/ibm-plex-mono`) — pliki `.woff2` self-hostowane i pre-subsetowane po unicode-range (w tym **latin-ext** → pewne polskie diakrytyki); wybór grubości importem konkretnych plików CSS (Sans 400/500/600; Mono 400/500/700). `npm audit` **przed** instalacją (safe-ops). Import w `Layout.astro` (albo `@import` w `global.css`); wpięcie w `@theme` jako `--font-sans` (IBM Plex Sans) i `--font-mono` (IBM Plex Mono). Zero `<link>` do `fonts.googleapis.com`; to CSS + fonty, nie runtime JS — brak wpływu na dup-React/`optimizeDeps`. (Alternatywa — ręczne `.woff2` w `public/fonts/` — wymagałaby samodzielnego wytworzenia subsetu latin-ext; odrzucona na rzecz Fontsource.)

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`

#### Weryfikacja ręczna

- Przełącznik zmienia motyw jasny↔ciemny; body i prymitywy shadcn reagują.
- Odświeżenie strony w motywie ciemnym **nie miga** na jasno (no-flash z cookie).
- Diakrytyki polskie renderują się w IBM Plex Sans (nie fallback).
- Toaster (sonner) ma kolory zgodne z aktywnym motywem.

**Uwaga implementacyjna**: Fonty wchodzą jako zależności `@fontsource/*` (IBM Plex, OFL) — `npm audit` **przed** instalacją i akceptacja dwóch nowych zależności (safe-ops). Po edycji `.astro`/CSS uruchom `npm run lint`. Zatrzymaj się na bramkę ręczną przed Fazą 2.

---

## Faza 2: Powłoka nawigacyjna (sidebar + topbar)

### Przegląd

Zbudowanie trwałej powłoki na bloku shadcn `sidebar` i wpięcie jej w 8 chronionych stron przez nowy `AppLayout.astro`. Dodanie prymitywu `badge`. To najbardziej strukturalna i najbardziej „depowa" faza — tu domyka się ryzyko podwójnego Reacta.

### Wymagane zmiany

#### 1. Instalacja bloku sidebar + przypięcie depów

**Plik**: `astro.config.mjs`, `components.json`/`src/hooks/`, nowe `src/components/ui/{sidebar,sheet,tooltip,separator,skeleton}.tsx`

**Cel**: Zainstalować oficjalny blok sidebara i zabezpieczyć go przed regresją dup-React oraz rozjazdem aliasu hooków.

**Kontrakt**: `npx shadcn add sidebar` (audyt zależności **przed** instalacją zgodnie z safe-ops). Do `ssr.optimizeDeps.include` dopisać nowe podpakiety radix (Sheet/Tooltip/Separator) **lub** przekierować importy bloku na `radix-ui`. `useIsMobile` przenieść do `src/components/hooks/` (konwencja repo) i poprawić import. Weryfikacja zimnym startem bez `--force`.

**Zrealizowano inaczej (aneks 2026-08-04, commit 17d2e83).** Blok 1 nie został wykonany. Zamiast React-owego bloku shadcn `sidebar` powstała powłoka czysto Astro (`shell/AppSidebar.astro` + `Icon.astro` inline-SVG, `nav-active.ts`), bez nowych zależności. Ryzyko dup-React z instalacji bloku znika u źródła (brak nowej wyspy / podpakietu radix) → `astro.config.mjs`, prymitywy sheet/tooltip/separator/skeleton i przeniesienie `useIsMobile` są bezprzedmiotowe. Kryterium 2.3 spełnione trywialnie (brak nowej powierzchni do re-optymalizacji).

#### 2. Powłoka aplikacji

**Plik**: nowy `src/layouts/AppLayout.astro`, nowa wyspa sidebara `src/components/AppSidebar.tsx`, topbar (Astro lub wyspa)

**Cel**: Złożyć sidebar + topbar + `<slot/>` w jeden layout owijający strony chronione, z podświetleniem aktywnej pozycji.

**Kontrakt**: Sidebar odwzorowuje architekturę informacji z `ui-design-system.md` §„Powłoka": marka; CTA „Skrzynka wejściowa" (→`/ingest`); grupa **Przepływ** → „Do akceptacji" (→`/items`, z licznikiem); grupa **Biblioteka** → „Wpisy" (→`/items/active`), „Sesje importu" (→`/import-sessions`), „Dziennik" (**disabled**, tag „wkrótce" — nie trasa); stopka → „Ustawienia" (→`/profile`) + konto ze statusem klucza + wylogowanie. Topbar: tytuł+podtytuł strony (per widok), slot szukajki, slot akcji głównej, przełącznik motywu. Aktywny stan liczony z `Astro.url.pathname`: **dokładny** dla `/items`, **prefiks** `/items/` dla grupy „Wpisy". Stan zwinięcia sidebara w cookie (domyślny mechanizm bloku). **Źródło danych dynamicznych powłoki:** tożsamość konta z `Astro.locals.user` (gwarantowana przez middleware — renderuje się bezpiecznie); licznik „Do akceptacji" z lekkiego zapytania zliczającego (`count`, `head:true`, `acceptance_status='pending'`), a status klucza z odczytu hintu BYOK — oba wykonywane **raz na render `AppLayout`** (klient Supabase z cookies usera, RLS per-user). To świadome, celowane odstępstwo od „bez nowych zapytań" — udokumentowane w Uwagach o wydajności.

**Redukcja zakresu (aneks 2026-08-04).** Sterowane, utrwalane w cookie zwijanie sidebara oraz mobilny off-canvas drawer NIE powstały — powłoka Astro-only daje automatyczną szynę ikon 64 px przy ≤920 px (bez przełącznika i persistencji). Świadomie zaakceptowane jako wystarczające dla MVP; ew. utwardzenie (cookie-collapse / drawer) odrzucone jako UX-nicety poza rdzeniem.

#### 3. Wpięcie w strony + prymityw badge

**Plik**: `src/pages/{ingest,profile,import-sessions,items}.astro`, `src/pages/items/{active,done,cancelled,trash}.astro`, nowy `src/components/ui/badge.tsx`

**Cel**: Podmienić skopiowany wrapper `bg-cosmic`+`<Topbar/>` na `AppLayout` w 8 stronach; dodać `badge` jako prymityw pod chipy typu.

**Kontrakt**: Każda z 8 stron używa `AppLayout` zamiast `Layout`+ręczny wrapper; przekazuje tytuł/podtytuł/akcje do topbara. `Topbar.astro` przestaje być używany przez strony chronione (usunięcie odłożone do Fazy 8, gdy potwierdzone, że nic go nie woła). `badge` z wariantami per typ (task/note/idea/decision/other) w charakterze „tech" (WERSALIKI, ~10 px, ostre rogi ~3 px) — radix przez przypięty `radix-ui`. Migracja **treści** widoków (kolory wewnątrz) zostaje na Fazy 3–7; teraz tylko powłoka + wpięcie.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Zimny start dev bez `optimized dependencies changed. reloading` (sesja: render wysp + dialog + trasa API)
- Testy jednostkowe przechodzą: `npm test`

#### Weryfikacja ręczna

- Sidebar + topbar widoczne na wszystkich 8 stronach chronionych; nawigacja działa.
- Aktywna pozycja podświetla się poprawnie: `/items` (Do akceptacji) vs `/items/active` (Wpisy) rozróżnione.
- „Dziennik" jest nieaktywny z tagiem „wkrótce".
- Na wąskim ekranie sidebar zwija się zgodnie z zachowaniem bloku; konto i wylogowanie działają.
- Przełącznik motywu działa z topbara.

**Uwaga implementacyjna**: Audyt `npm audit` przed instalacją bloku. Zweryfikuj dup-React zimnym startem (bez `--force`) — to warunek „naprawione" dla tej klasy. Bramka ręczna przed Fazą 3.

---

## Faza 3: Wpisy — lista, zakładki zakresu, karta wpisu (+ dialogi)

### Przegląd

Migracja największej i najbardziej wrażliwej powierzchni. **Tu żyją kontrakty testów** — restyle musi je zachować co do joty. Obejmuje kartę wpisu, trio widoków (accepted/pending/trash), zakładki zakresu jako linki, toolbar, paginację i stany puste, plus dialogi Dodaj/Edytuj (item-scoped).

### Wymagane zmiany

#### 1. Karta wpisu

**Plik**: `src/components/items/ItemCard.tsx`

**Cel**: Przełożyć kartę na nowy język (grzbień per typ, chip przez `badge`, gęsty wiersz, badge stanu operacyjnego) zachowując wszystkie uchwyty.

**Kontrakt** (NIENARUSZALNE): tytuł pozostaje `<h3>`; karta pozostaje `<article data-item-id>`; checkbox zachowuje `aria-label="Zaznacz: {title}"`; przycisk „Zatwierdź" (nie „Akceptuj"); role ARIA prymitywów bez zmian. Grzbień i chip czytają tokeny per typ z Fazy 1. Stany wizualne: „zrealizowane" — przygaszony tytuł; „anulowane" — przekreślony. Bez „pewności %".

**Meta wiersza:** dodać linię meta — **datę utworzenia + datę ostatniej modyfikacji** (`created_at`, `updated_at` — oba są już na kliencie w typie `Item`, `updated_at` używany dziś przez `EditItemDialog`, więc **zero dotknięcia warstwy danych**), font monospace, wyraźnie rozróżnione (np. „utw. …" / „zm. …"); gdy modyfikacja = utworzenie, wskazane pokazać samą datę utworzenia (uniknięcie szumu). **Bez ID źródła sesji** na wierszu — powiązanie z sesją żyje w trybie „Pokaż wpisy". Badge stanu operacyjnego renderować **bez zmiany warunku** — gdy wpis ma `operational_status` (`ItemCard.tsx:100`: `badges.operational && item.operational_status`). Uwaga: po backfillu S-04 (`20260615152731_operational_status_all_types.sql`, `types.ts:76-77`) `operational_status` jest ustawiony dla **wszystkich** typów, nie tylko zadań — badge pojawi się na każdym wpisie accepted ze stanem. **Nie** dodawać type-checka „tylko zadania" (zmieniłby zachowanie).

#### 2. Trio widoków + zakładki + toolbar

**Plik**: `src/components/items/{AcceptedItemsView,PendingItemsView,TrashItemsView}.tsx`, `src/components/items/ListFilterBar.tsx`, `src/components/items/StateFilterSelect.tsx` (→ zakładki), `src/components/items/state-filter.ts` (reużycie), `src/components/lists/Pagination.tsx`, kontrolki-pigułki (`SearchBox`, `SortControl`, `PageSizeSelect`, `TypeFilter`)

**Cel**: Ujednolicić widoki na wspólny wzorzec listy; **zakładki zakresu dotyczą tylko widoków z zakresem** (`AcceptedItemsView`: aktywne/zakończone/anulowane + `TrashItemsView`: kosz) — „Do akceptacji"/`PendingItemsView` (`/items`) **nie ma zakładek zakresu**; toolbar z segmentowym filtrem typu + „Sortuj"; szukajka przeniesiona do topbara. **Granica z Fazą 4:** w Fazie 3 `PendingItemsView` dostaje tylko wspólne prymitywy (`ItemCard`, kontrolki-pigułki, paginacja); pasek zbiorczy + wiersz triage robi Faza 4.

**Kontrakt**: Cztery zakładki zakresu (Aktywne/Zakończone/Anulowane/Kosz) renderowane jako `<a href>` z aktywnością z adresu, biorąc URL z gałęzi „navigate" `state-filter.ts` (wyeksportuj `navigateHref` **albo** czytaj `resolveStateSelection(...).href`). **Uwaga — model jest heterogeniczny:** podfiltr rodziny „active" (active/new/in_progress; gałąź `{kind:"subfilter"}`, `state-filter.ts:82-84`) to **kliencki re-fetch bez nawigacji**, więc zostaje jako dotychczasowa kontrolka kliencka — czyste `<a href>` na tych pozycjach zerwałoby podfiltr (reset strony + czyszczenie zaznaczenia). Konwersja jest prezentacyjna **dla 4 zakładek zakresu**, ale **zachowuje** rozgałęzienie navigate↔subfilter (nie „zero zmian w logice"). Etykiety zakresów niezmienione (zamrożone przez `state-filter.test.ts`). Kontrolki-pigułki przechodzą z wzorca `bg-white/5…` na tokeny (`bg-surface`/`text-muted-foreground`/`border-border`).

**Zrealizowano — dopowiedzenie zakresu (aneks 2026-08-05, commit 7457085 + przegląd Fazy 3).** Przeniesienie szukajki do topbara wymusiło mechanizm koordynacji między osobnymi wyspami powłoki (Faza 2): moduł zdarzeń okna `item-topbar-events.ts` + mostek `useItemTopbarBridge.ts` + wyspy `TopbarItemSearch.tsx` i `TopbarItemAction.tsx`. `TopbarItemAction` (akcja główna „Dodaj wpis"/„Wyczyść kosz") wykracza poza dosłowne §2 (mowa była tylko o szukajce), ale wpina się w zaprojektowany w §2 Fazy 2 „slot akcji głównej" — zachowanie (dialog/potwierdzenie w wyspie listy, debounce, czyszczenie zaznaczenia) nietknięte. Przegląd Fazy 3 dołożył reconcyliację wyścigu hydracji w mostku (replay ostatniej frazy z bufora `window` — F1 raportu). Token `bg-surface` z §2 nie istnieje w `global.css` — użyto realnych `bg-muted`/`bg-background` (intencja „zejście z `bg-white/5…` na tokeny" spełniona). Dwa obronne przecieki migracji tokenów poza dosłowny zakres Fazy 3: rekolor kontenera paska zbiorczego w `PendingItemsView` (pełny restyle triage nadal w Fazie 4) oraz stan pusty `SessionEntriesView.tsx:139` (plik Fazy 6) — wyłącznie kolory na tokeny, by nie zostawiać niemal niewidocznych elementów na tokenowej powłoce.

#### 3. Dialogi Dodaj / Edytuj

**Plik**: `src/components/items/AddItemDialog.tsx`, `src/components/items/EditItemDialog.tsx`

**Cel**: Dostroić dialogi do nowego języka (są już w większości na tokenach).

**Kontrakt**: Zachować tryb `readOnly` podglądu i dostępne nazwy pól/akcji. Drobne straye (np. `dialog.tsx:29` `bg-black/50`) — do tokenu tła overlayu.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test` (w tym `labels.test`, `state-filter.test`)
- E2E przechodzi na zimnym starcie: `npm run e2e` (`item-survives-reload`, `happy-path-smoke`, `seed`)

#### Weryfikacja ręczna

- Lista Wpisów zgodna z makietą w obu motywach (grzbień, chip, gęstość, stany).
- Zakładki zakresu nawigują pod `/items/{active,done,cancelled,trash}` i podświetlają aktywny.
- Filtr typu, sortowanie, szukajka i paginacja działają jak dotąd.
- Wiersz pokazuje datę utworzenia i modyfikacji (monospace, rozróżnione); brak ID źródła sesji; badge stanu na wpisach accepted ze stanem operacyjnym (po S-04 — nie tylko zadania).
- Item po akceptacji/oznaczeniu „Zrobione" **znika z listy** (reconcile zachowany).

**Uwaga implementacyjna**: To faza najwyższego ryzyka dla testów — po zmianach uruchom pełne E2E. Bramka ręczna przed Fazą 4.

---

## Faza 4: Do akceptacji (triage)

### Przegląd

Powierzchnia akceptacji: pasek zbiorczy, wiersz triage z checkboxem i akcjami. Bez „pewności %". Zachować reconcile (item znika po decyzji) i generyczną etykietę bulk.

### Wymagane zmiany

#### 1. Pasek zbiorczy + wiersz triage

**Plik**: `src/components/items/PendingItemsView.tsx` (+ współdzielony `ItemCard` w wariancie triage)

**Cel**: Przełożyć pasek „Zaznacz wszystkie" + zbiorcze Zatwierdź/Odrzuć i wiersz triage (checkbox + chip + akcje Edytuj/Odrzuć/Zatwierdź) na nowy język.

**Kontrakt**: Bulk zachowuje **generyczną** etykietę „Zrobione" (zamrożona przez `labels.ts`/`AcceptedItemsView`); pojedyncze akcje: „Edytuj", „Odrzuć", „Zatwierdź". Reconcile: item po akceptacji znika z „Do akceptacji". **Nie renderować `conf`/„pewność %".** Kolory statusów zaznaczenia z tokenów.

**Zrealizowano (aneks 2026-08-05).** Rdzeń powierzchni triage powstał już w Fazie 3 przez **współdzielony `ItemCard`** (stan `pending`: checkbox + chip + tytuł + opis + akcje Zatwierdź/Odrzuć/Edytuj, **bez `conf`/„pewność %"**, bez ID sesji) oraz obronny rekolor kontenera paska zbiorczego w `PendingItemsView` (Zaznacz wszystkie + zbiorcze Zatwierdź/Odrzuć — na tokenach). Reconcile (item znika po decyzji) siedzi w `execute()` `PendingItemsView` i jest nietknięty. **Net-new Fazy 4** to jedyny brakujący element makiety `.triage-row.sel`: **podświetlenie zaznaczonego wiersza** (`bg-accent` + `border-muted-foreground/25`, oba motywy) dodane we współdzielonym `ItemCard` — realizacja „Kolory statusów zaznaczenia z tokenów". Ponieważ `ItemCard` jest współdzielony, podświetlenie obejmuje też akcje zbiorcze widoków accepted (Faza 3) — spójne, prezentacyjne, zero zmian zachowania. Uchwyty testów (`<h3>`, `<article data-item-id>`, „Zatwierdź", `aria-label`) nietknięte; E2E (`item-survives-reload`, `happy-path-smoke`, `seed`) zielone na zimnym starcie.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`
- E2E przechodzi: `npm run e2e`

#### Weryfikacja ręczna

- Widok „Do akceptacji" zgodny z makietą (pasek zbiorczy, wiersz triage) w obu motywach.
- Zaznaczanie pojedyncze i „wszystkie", akcje zbiorcze i pojedyncze działają.
- Brak „pewności %" nigdzie w widoku.
- Item po Zatwierdź/Odrzuć znika z listy.

**Uwaga implementacyjna**: Bramka ręczna przed Fazą 5.

---

## Faza 5: Skrzynka + modal klasyfikacji + Profil/BYOK

### Przegląd

Powierzchnia wsadu i konfiguracji: pole tekstowe + upload, overlay/modal klasyfikacji (4 stany), brama BYOK i zarządzanie kluczem. Tu żyje kilka dostępnych nazw pod E2E.

### Wymagane zmiany

#### 1. Skrzynka (ingest)

**Plik**: `src/pages/ingest.astro`, `src/components/ingest/IngestForm.tsx`, `src/components/ingest/FileDropZone.tsx`, `src/components/ingest/ByokOnboarding.astro`

**Cel**: Przełożyć pole wsadu (textarea + licznik znaków), strefę upuszczania `.txt`/`.md`, przycisk klasyfikacji i bramę BYOK na nowy język.

**Kontrakt** (NIENARUSZALNE nazwy): nagłówek „Skrzynka wejściowa"; para `Label htmlFor="ingest-text"` ↔ `Textarea id` daje dostępną nazwę „Tekst do klasyfikacji"; przycisk „Wyślij". `ByokOnboarding.astro` (~18 wystąpień) to najcięższy plik migracji — na tokeny. Straye `IngestForm.tsx` (`text-amber-400`), `FileDropZone.tsx` (`text-purple-400`) → tokeny.

#### 2. Modal klasyfikacji

**Plik**: `src/components/ingest/ClassificationModal.tsx` (+ `hooks/useClassification.ts` bez zmian zachowania)

**Cel**: Przełożyć 4 stany (trwa / z itemami / bez itemów / błąd) na styl overlayu z makiety (spinner → sukces → „Przejdź do akceptacji").

**Kontrakt**: Zachować redirect na `/items` po sukcesie (kontrakt zachowania). Stany z `useClassification.ts` bez zmian; tylko prezentacja.

#### 3. Profil / klucz BYOK

**Plik**: `src/pages/profile.astro`, `src/components/profile/ApiKeyManager.tsx` (+ `hooks/useApiKey.ts` bez zmian)

**Cel**: Widok ustawień/klucza w nowym języku (wywnioskowany z makiety — brak w niej).

**Kontrakt**: Zachować dostępne nazwy i przepływ zapisu klucza. Stray `text-emerald-600` → token stanu „ok".

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`
- E2E przechodzi: `npm run e2e` (ścieżka happy-path dotyka Skrzynki)

#### Weryfikacja ręczna

- Skrzynka, modal klasyfikacji (4 stany) i Profil zgodne z makietą w obu motywach.
- Klasyfikacja kończy się przejściem do „Do akceptacji".
- Brama BYOK i zapis klucza działają.

**Uwaga implementacyjna**: Bramka ręczna przed Fazą 6.

---

## Faza 6: Sesje importu + tryb „Pokaż wpisy"

### Przegląd

Dziennik sesji jako pełnoszerokie karty + kontekstowy tryb „Pokaż wpisy" (baner sesji, deep-link `?session=`). Warstwa danych istnieje (S-10/S-13) — zmiana prezentacyjna.

### Wymagane zmiany

#### 1. Lista sesji

**Plik**: `src/pages/import-sessions.astro`, `src/components/import-sessions/{ImportSessionsView,SessionsList,SessionCard,SessionFilterBar}.tsx`

**Cel**: Przełożyć karty sesji (grzbień statusu + badge, źródło, data, liczba wpisów), filtr i pager na nowy język.

**Kontrakt**: `SessionCard.tsx` (~12 wystąpień, mapa kolorów statusu) → tokeny statusów (done/empty/failed/running wg makiety). Akcje: „Ponów" (dla niepowodzenia) / „Pokaż wpisy". Pager (na stronę + skok do strony) zachowany funkcjonalnie.

#### 2. Tryb kontekstowy sesji

**Plik**: `src/components/items/SessionBanner.astro`, `src/components/items/SessionEntriesView.tsx`, `src/pages/items.astro`

**Cel**: Przełożyć baner „Wpisy dla sesji importu — <źródło>, <data>" i widok wpisów sesji na nowy język.

**Kontrakt**: Zachować deep-link `?session=<id>`, akcję powrotu i ukrycie zwykłych filtrów w trybie sesji. `SessionBanner.astro` (9 hex w scoped `<style>`) → tokeny.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`

#### Weryfikacja ręczna

- Lista sesji (statusy, akcje, pager) zgodna z makietą w obu motywach.
- „Pokaż wpisy" wchodzi w tryb sesji (baner, ukryte filtry, `?session=`); powrót działa.
- „Ponów" pokazuje się tylko dla sesji z niepowodzeniem.

**Uwaga implementacyjna**: `/import-sessions` to strona z historią dup-React — zweryfikuj zimnym startem. Bramka ręczna przed Fazą 7.

---

## Faza 7: Landing + auth (pełny restyle)

### Przegląd

Widoki poza logowaniem i poza makietą — pełny restyle wywnioskowany z języka makiety (decyzja: „wszystkie widoki"). Landing traci „cosmic" i starfield; karty auth przechodzą na wspólny wzorzec.

### Wymagane zmiany

#### 1. Landing

**Plik**: `src/pages/index.astro`, `src/components/Welcome.astro`

**Cel**: Przeprojektować hero na nowy język (usunięcie `bg-cosmic`, kolorowych „orbów" blur, starfield rgba, gradientów), spójnie z powłoką.

**Kontrakt**: Usunąć inline starfield `rgba(255,255,255,…)` (`Welcome.astro:27`) i gradient hero. **Zdjąć `<Topbar/>` z `Welcome.astro`** (`:6,32` — 9. konsument `Topbar`, poza „8 chronionymi") i zastąpić nawigację landingu własnym, minimalnym paskiem w nowym języku (marka + „Zaloguj"/„Zarejestruj"), bez powłoki. Landing pozostaje poza powłoką (bez sidebara) — używa `Layout`, nie `AppLayout`. Wywnioskować układ z tokenów i typografii „tech".

#### 2. Auth

**Plik**: `src/pages/auth/{signin,signup,confirm-email}.astro`, `src/components/auth/{SignInForm,SignUpForm,FormField,SubmitButton,PasswordToggle,ServerError}.tsx`

**Cel**: Przełożyć trio identycznych kart auth i komponenty formularzy na wspólny, tokenowy wzorzec.

**Kontrakt**: Trzy karty auth są niemal identyczne — wspólny wzorzec, jedno przełożenie. Czerwone stany błędu → token `destructive`. Zachować dostępne nazwy pól i przepływ (endpointy `api/auth/*` nietknięte).

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`

#### Weryfikacja ręczna

- Landing i strony auth zgodne z językiem makiety w obu motywach; brak „cosmic"/starfield.
- Logowanie, rejestracja i potwierdzenie e-mail działają; stany błędu czytelne w obu motywach.

**Uwaga implementacyjna**: To widoki poza makietą — spodziewaj się drobnych iteracji wyglądu przy bramce ręcznej. Bramka ręczna przed Fazą 8.

---

## Faza 8: Sprzątanie + weryfikacja końcowa

### Przegląd

Domknięcie: resztkowe zaszyte kolory, usunięcie martwych założeń „tylko ciemny", grep za pozostałościami, pełna weryfikacja i otwarcie jednego PR.

### Wymagane zmiany

#### 1. Straye i martwy kod

**Plik**: `src/components/ui/button.tsx` (`text-white` w destructive), `src/components/ui/sonner.tsx` (potwierdzić świadomość motywu), `src/components/Banner.astro` (9 hex w scoped `<style>`: warianty info/warning/error → tokeny), `src/components/Topbar.astro` (usunąć, jeśli nieużywany), `src/styles/global.css` (`@utility bg-cosmic`)

**Cel**: Wyzerować resztki i usunąć `bg-cosmic`, gdy nic już go nie referuje.

**Kontrakt**: Usunąć `@utility bg-cosmic` dopiero po potwierdzeniu (grep) zera referencji. Usunąć `Topbar.astro` — po Fazach 2 (8 stron → `AppLayout`) i 7 (landing odpięty) nikt go nie woła; **potwierdź grepem `Topbar` zero trafień** przed usunięciem. Pozostałe straye z `research.md` §1 → tokeny. **Martwy kod z Fazy 3 (przegląd F3):** `resolveStateSelection` i `stateSelectLabel` (+ typ `StateSelection`) w `state-filter.ts` są po konwersji `StateFilterSelect` na zakładki osierocone (woła je już wyłącznie `state-filter.test.ts`) — usunąć funkcje, typ oraz odpowiadające im przypadki w `state-filter.test.ts` (tu legalnie, poza zamrożeniem zakresu Fazy 3).

#### 2. Grep i pełna weryfikacja

**Plik**: całe `src/`

**Cel**: Potwierdzić brak pozostałości zaszytych kolorów i pełną zieloność bramek w obu motywach.

**Kontrakt**: Grep za wzorcami `bg-white/`, `text-white`, `text-blue-`, `from-blue-`, `purple-`, `bg-cosmic`, `#0a0e1a` itp. **oraz za surowym hex `#[0-9a-fA-F]{3,6}` w blokach scoped `<style>` w `.astro`** (łapie `Banner.astro`/`SessionBanner.astro` i inne resztki, których grep po klasach Tailwind nie widzi) — zero trafień poza świadomie zostawionymi (jeśli jakiekolwiek — udokumentować). Pełne E2E na zimnym starcie.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`
- E2E przechodzi na zimnym starcie bez `--force`: `npm run e2e`
- Grep za zaszytymi kolorami zwraca zero (lub udokumentowane wyjątki)

#### Weryfikacja ręczna

- Każdy widok przejrzany w **obu** motywach — zgodny z makietą, brak rozjazdów.
- Brak „wyspy starego stylu"; `bg-cosmic` usunięty.
- Przełącznik motywu działa wszędzie bez mignięcia.

**Uwaga implementacyjna**: Po zielonych bramkach — otwarcie jednego PR z gałęzi `feature/ui-redesign` (za jawną zgodą użytkownika, zgodnie z human-in-the-loop). PR czeka na `/10x-impl-review`.

---

## Strategia testowania

### Testy jednostkowe

- Bez nowych testów zachowania (zmiana prezentacyjna). Istniejące `labels.test.ts` i `state-filter.test.ts` **muszą** przechodzić bez modyfikacji — pilnują zamrożonych stringów i tras.
- Jeśli powstanie helper logiki (np. mapowanie aktywnego stanu sidebara), pokryć go czystym testem jednostkowym.

### Testy integracyjne

- Bez zmian — warstwa RLS/DB nietknięta.

### Kroki testowania ręcznego

1. Przełącz motyw jasny↔ciemny na każdym widoku; potwierdź brak mignięcia po odświeżeniu.
2. Przejdź całą powłoką (sidebar → każdy cel); potwierdź aktywny stan, w tym `/items` vs `/items/active`.
3. Ścieżka happy-path: Skrzynka → Klasyfikuj → Do akceptacji → Zatwierdź; potwierdź reconcile i redirect.
4. Tryb sesji: „Pokaż wpisy" → baner + `?session=` → powrót.
5. Auth i landing w obu motywach; stany błędu.
6. Wąski ekran: zachowanie sidebara i topbara.

## Uwagi dotyczące wydajności

- Fonty: subset latin+latin-ext i tylko potrzebne grubości trzymają wagę nisko; `.woff2` + `font-display` rozsądny (swap/optional) by uniknąć FOIT.
- Cookie motywu i zwinięcia sidebara lecą z każdym żądaniem — pomijalne (kilkanaście bajtów).
- Powłoka dokłada **dwa lekkie zapytania na render strony chronionej**: `count` pendingów (licznik „Do akceptacji") + odczyt hintu klucza BYOK (status konta w stopce). Oba per-user (RLS), tanie (`count`/pojedynczy wiersz). Poza tym bez nowych zapytań ani hydracji ponad interaktywny sidebar (jedna wyspa powłoki).

## Uwagi dotyczące migracji

- Brak migracji danych — zmiana czysto wizualna.
- Wycofanie: cała praca na `feature/ui-redesign`, jeden PR; rollback = nie mergować / revert PR.
- `bg-cosmic` usuwany dopiero w Fazie 8 po potwierdzeniu zera referencji — do tego czasu współistnieje z nowymi powierzchniami.

## Referencje

- Powiązane badania: `context/changes/ui-redesign/research.md` (§1 inwentarz migracji, §2 kontrakty testów, §3 powłoka/motyw/routing, §4 census)
- Prawo warstwy wizualnej: `context/foundation/ui-design-system.md`
- Źródło prawdy wizualnej: `context/foundation/ui-mockup/taskerlight-list.html`
- Wycinek roadmapy: `context/foundation/roadmap.md` (S-15)
- Lekcje zespołu: `context/foundation/lessons.md` (dup-React SSR, `.astro` lint, format celowany)

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Fundament motywu + fonty

#### Automatyczne

- [x] 1.1 Lint przechodzi (`npm run lint`) — f133379
- [x] 1.2 Build przechodzi (`npm run build`) — f133379
- [x] 1.3 Testy jednostkowe przechodzą (`npm test`) — f133379

#### Ręczne

- [x] 1.4 Przełącznik zmienia motyw; body i prymitywy shadcn reagują
- [x] 1.5 Odświeżenie w motywie ciemnym nie miga (no-flash z cookie)
- [x] 1.6 Polskie diakrytyki w IBM Plex Sans (nie fallback)
- [x] 1.7 Toaster zgodny z aktywnym motywem

### Faza 2: Powłoka nawigacyjna

#### Automatyczne

- [x] 2.1 Lint przechodzi (`npm run lint`) — 17d2e83
- [x] 2.2 Build przechodzi (`npm run build`) — 17d2e83
- [x] 2.3 Zimny start dev bez `optimized dependencies changed. reloading` — 17d2e83
- [x] 2.4 Testy jednostkowe przechodzą (`npm test`) — 17d2e83

#### Ręczne

- [ ] 2.5 Sidebar + topbar na wszystkich 8 stronach; nawigacja działa
- [ ] 2.6 Aktywny stan: `/items` vs `/items/active` rozróżnione
- [ ] 2.7 „Dziennik" nieaktywny z tagiem „wkrótce"
- [ ] 2.8 Zwijanie na wąskim ekranie; konto + wylogowanie działają
- [ ] 2.9 Przełącznik motywu działa z topbara

### Faza 3: Wpisy — lista, zakładki, karta (+ dialogi)

#### Automatyczne

- [x] 3.1 Lint przechodzi (`npm run lint`) — 7457085
- [x] 3.2 Build przechodzi (`npm run build`) — 7457085
- [x] 3.3 Testy jednostkowe przechodzą (`npm test`, w tym `labels`/`state-filter`) — 7457085
- [x] 3.4 E2E przechodzi na zimnym starcie (`npm run e2e`) — 7457085

#### Ręczne

- [ ] 3.5 Lista Wpisów zgodna z makietą w obu motywach
- [ ] 3.6 Zakładki zakresu nawigują i podświetlają aktywny
- [ ] 3.7 Filtr typu, sortowanie, szukajka, paginacja działają
- [ ] 3.8 Item po akceptacji/„Zrobione" znika z listy (reconcile)
- [ ] 3.9 Wiersz: data utworzenia + modyfikacji (monospace), brak ID sesji, badge stanu na wpisach accepted ze stanem operacyjnym (po S-04 — nie tylko zadania)

### Faza 4: Do akceptacji (triage)

#### Automatyczne

- [x] 4.1 Lint przechodzi (`npm run lint`) — 24e0a85
- [x] 4.2 Build przechodzi (`npm run build`) — 24e0a85
- [x] 4.3 Testy jednostkowe przechodzą (`npm test`) — 24e0a85
- [x] 4.4 E2E przechodzi (`npm run e2e`) — 24e0a85

#### Ręczne

- [ ] 4.5 Widok „Do akceptacji" zgodny z makietą w obu motywach
- [ ] 4.6 Zaznaczanie i akcje (pojedyncze + zbiorcze) działają
- [ ] 4.7 Brak „pewności %" nigdzie w widoku
- [ ] 4.8 Item po Zatwierdź/Odrzuć znika z listy

### Faza 5: Skrzynka + klasyfikacja + Profil/BYOK

#### Automatyczne

- [x] 5.1 Lint przechodzi (`npm run lint`) — 94a2f8f
- [x] 5.2 Build przechodzi (`npm run build`) — 94a2f8f
- [x] 5.3 Testy jednostkowe przechodzą (`npm test`) — 94a2f8f
- [x] 5.4 E2E przechodzi (`npm run e2e`) — 94a2f8f

#### Ręczne

- [ ] 5.5 Skrzynka, modal (4 stany) i Profil zgodne z makietą w obu motywach
- [ ] 5.6 Klasyfikacja kończy się przejściem do „Do akceptacji"
- [ ] 5.7 Brama BYOK i zapis klucza działają

### Faza 6: Sesje importu + tryb „Pokaż wpisy"

#### Automatyczne

- [x] 6.1 Lint przechodzi (`npm run lint`)
- [x] 6.2 Build przechodzi (`npm run build`)
- [x] 6.3 Testy jednostkowe przechodzą (`npm test`)

#### Ręczne

- [ ] 6.4 Lista sesji (statusy, akcje, pager) zgodna z makietą w obu motywach
- [ ] 6.5 „Pokaż wpisy" wchodzi w tryb sesji; powrót działa
- [ ] 6.6 „Ponów" tylko dla sesji z niepowodzeniem

### Faza 7: Landing + auth (pełny restyle)

#### Automatyczne

- [ ] 7.1 Lint przechodzi (`npm run lint`)
- [ ] 7.2 Build przechodzi (`npm run build`)
- [ ] 7.3 Testy jednostkowe przechodzą (`npm test`)

#### Ręczne

- [ ] 7.4 Landing i auth zgodne z językiem makiety w obu motywach; brak „cosmic"/starfield
- [ ] 7.5 Logowanie, rejestracja, potwierdzenie e-mail działają; stany błędu czytelne

### Faza 8: Sprzątanie + weryfikacja końcowa

#### Automatyczne

- [ ] 8.1 Lint przechodzi (`npm run lint`)
- [ ] 8.2 Build przechodzi (`npm run build`)
- [ ] 8.3 Testy jednostkowe przechodzą (`npm test`)
- [ ] 8.4 E2E przechodzi na zimnym starcie bez `--force` (`npm run e2e`)
- [ ] 8.5 Grep za zaszytymi kolorami zwraca zero (lub udokumentowane wyjątki)

#### Ręczne

- [ ] 8.6 Każdy widok przejrzany w obu motywach — zgodny z makietą
- [ ] 8.7 Brak „wyspy starego stylu"; `bg-cosmic` usunięty
- [ ] 8.8 Przełącznik motywu działa wszędzie bez mignięcia
