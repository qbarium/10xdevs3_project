<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Plan**: context/changes/ui-redesign/plan.md
- **Zakres**: Faza 2 z 8 (Powłoka nawigacyjna — sidebar + topbar), commit `17d2e83`
- **Data**: 2026-08-04
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych / 3 ostrzeżenia / 2 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | WARNING |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | WARNING |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

**► Ogólnie: WYMAGA UWAGI** — nic nie jest zepsute; do świadomej decyzji są dwa odchylenia od planu (F1, F2). Kryteria automatyczne zielone (lint 0 błędów, build OK, 573 testy), zapytania powłoki bezpieczne, zero problemów krytycznych.

## Kontekst architektoniczny (najważniejsza obserwacja fazy)

Cały **Blok 1 planu** (`npx shadcn add sidebar`, prymitywy sheet/tooltip/separator/skeleton, przypięcie podpakietów radix w `astro.config.mjs`, przeniesienie `useIsMobile`) **nie został zrealizowany**. Zamiast React-owego bloku shadcn powstała **czysto Astro-owa powłoka** (`shell/AppSidebar.astro` + `shell/Icon.astro` inline-SVG, `nav-active.ts`), **bez ani jednej nowej zależności**. Oba pod-agenty oceniają to jako **bezpieczne, w rdzeniu lepsze odchylenie**: likwiduje u źródła ryzyko dup-React, któremu plan poświęcił cały Blok 1, i pasuje do modelu wysp Astro w wielostronicowej apce SSR. Decyzja jest udokumentowana w commicie, ale **nie w `plan.md`** (F1).

Cała architektura informacji z planu jest dostarczona: marka, CTA Skrzynka→/ingest, grupa Przepływ→Do akceptacji→/items z licznikiem, grupa Biblioteka (Wpisy→/items/active, Sesje→/import-sessions, Dziennik disabled „wkrótce"), stopka z kontem/statusem klucza/wylogowaniem, topbar z tytułem/podtytułem/slotami/przełącznikiem motywu, aktywny stan exact-vs-prefix pokryty testem jednostkowym.

## Zweryfikowane pozytywnie (nie-ustalenia)

- **Zapytania powłoki bezpieczne**: `if (user && supabase)`, każde w `try/catch` z neutralną degradacją, klient z cookies usera → RLS per-user + jawny `.eq("user_id")`, count `head:true`, `getKeyStatus` selektuje tylko `api_key_hint`/`updated_at` (zero materiału klucza w renderze). Powłoka renderuje się niezależnie od awarii zapytań — brak single-point-of-failure mimo osadzenia na 8 stronach.
- **Indeks pod licznik istnieje**: `items_user_acceptance_idx (user_id, acceptance_status)` — udokumentowany koszt „+2 zapytania/render" jest realnie tani.
- **8 stron przełączonych jednolicie** (`Layout`+`Topbar`+`bg-cosmic` → `AppLayout`), logika frontmatter nietknięta, żadnego top-level `return` (reguła `.astro` uszanowana).
- **Brak wycieku pracy z Faz 3–7**: `badge.tsx` dodany zgodnie z planem, ale jeszcze niekonsumowany; wnętrza wysp nietknięte.
- **Sloty szukajki/akcji puste — oczekiwane**: „szukajka przeniesiona do topbara" to kontrakt **Fazy 3**, nie 2. Wpięcie zdolności teraz, użycie później — poprawne fazowanie.

## Ustalenia

### F1 — Powłoka zbudowana w Astro (bez bloku shadcn) — `plan.md` tego nie odnotowuje

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: context/changes/ui-redesign/plan.md (Faza 2 §1, ~122-128) vs src/components/shell/AppSidebar.astro
- **Szczegóły**: Blok 1 planu opisuje instalację React-owego bloku shadcn i przypięcie depów; implementacja poszła w powłokę Astro-only (zero deps). Odejście jest świadome i udokumentowane w commicie 17d2e83 („bez bloku shadcn — nie pasuje do modelu wysp Astro"), lecz plan.md — źródło prawdy dla Faz 3–8 i przyszłych przeglądów — nadal opisuje nieistniejący wariant. Rozjazd plan↔rzeczywistość zmyli kolejne przeglądy.
- **Poprawka**: Zaktualizuj `plan.md` (Faza 2, Blok 1) aneksem: Astro-only powłoka jako zrealizowany wariant + jednozdaniowe uzasadnienie (zero zależności, unik dup-React u źródła). Analogicznie skoryguj kryterium 2.3 (nie „bez re-opt", tylko „brak nowej wyspy/depa do optymalizacji").
  - Siła: blesses trafną decyzję inżynierską i naprawia źródło prawdy, zanim Fazy 3–8 oprą się o plan.
  - Kompromis: plan staje się nieco ruchomym celem (norma w tym repo — aneksy).
  - Pewność: HIGH — obaj recenzenci niezależnie oceniają odejście jako lepsze.
  - Martwy punkt: brak znaczących.
- **Decyzja**: FIXED — Naprawiono teraz (aneks dopisany do plan.md, Faza 2 §1).

### F2 — Dwa nazwane w planie zachowania powłoki nie powstały: zwijanie w cookie + mobilny drawer

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: src/components/shell/AppSidebar.astro:30
- **Szczegóły**: Plan (Blok 2) wymieniał „stan zwinięcia sidebara w cookie" oraz mobilne zachowanie off-canvas (Sheet/drawer z bloku). Astro-only powłoka daje zamiast tego automatyczną szynę ikon 64 px przy ≤920 px (CSS), bez przełącznika sterowanego przez użytkownika, bez persistencji w cookie i bez chowanego panelu/hamburgera (na zwiniętych ikonach tylko `aria-label`, brak tooltipów). Nawigacja, konto i wylogowanie działają w szynie — funkcja jest, ale dwie konkretne pozycje kontraktu wypadły jako skutek pominięcia bloku shadcn.
- **Poprawka A ⭐ Zalecana**: Zaakceptuj auto-szynę jako wystarczającą dla MVP i odnotuj redukcję zakresu (drop cookie-collapse + mobile drawer) w `plan.md`/`change.md`.
  - Siła: zachowuje zielony, zero-dep stan; to UX-nicety, nie rdzeń; spójne z zasadą „o elementach decyduje realna aplikacja".
  - Kompromis: brak sterowanego zwijania i chowanego menu na wąskim ekranie.
  - Pewność: MED — zależy, czy uznajesz te zachowania za istotne dla MVP.
  - Martwy punkt: realny UX wąskiego ekranu oceni dopiero końcowa bramka ręczna.
- **Poprawka B**: Dodaj minimalny przełącznik zwijania zapisujący cookie (mały inline-script, bez wyspy) + opcjonalnie mobilny drawer.
  - Siła: domyka literę kontraktu Bloku 2.
  - Kompromis: dokłada JS/stan do dotąd statycznej powłoki; mobilny drawer bez bloku shadcn to realnie więcej pracy.
  - Pewność: MED.
  - Martwy punkt: interakcja z no-flash motywu i offsetem sticky przy banerze konfiguracji.
- **Decyzja**: FIXED — Poprawka A (redukcja zakresu odnotowana w plan.md, Faza 2 §2).

### F3 — `nav-active` myli trailing slash `/items/`; brak pokrycia testem

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość (poprawność)
- **Lokalizacja**: src/components/shell/nav-active.ts:10
- **Szczegóły**: `"/items/".startsWith("/items/")` = true łapie regułę „entries", a exact „/items" nie pasuje → `/items/` podświetla „Wpisy" zamiast „Do akceptacji"; `/ingest/` → `null` (CTA traci ring). Osiągalność niska: linki sidebara są kanoniczne (bez końcowego `/`), Astro `trailingSlash:"ignore"`, skutek czysto kosmetyczny (złe podświetlenie, treść strony poprawna). Test nie pokrywa wariantu z ukośnikiem — dokładnie przypadek brzegowy, przed którym ostrzegał plan.
- **Poprawka**: Znormalizuj `pathname` w `activeNavId` (obetnij końcowy `/` poza korzeniem) przed dopasowaniem + dodaj przypadek testowy `activeNavId("/items/")` → „pending". Jedno miejsce, kilka linii.
- **Decyzja**: FIXED — Naprawiono teraz (normalizacja w nav-active.ts:30-33 + nowy przypadek w nav-active.test.ts).

### F4 — `getKeyStatus` liczony dwukrotnie na /ingest i /profile

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Wydajność
- **Lokalizacja**: src/layouts/AppLayout.astro:40-45 (+ src/pages/ingest.astro, src/pages/profile.astro)
- **Szczegóły**: AppLayout czyta status klucza (kropka w stopce), a strony /ingest i /profile czytają go ponownie do własnej bramki (US-06 / `ApiKeyManager`) → 2× `createClient` + 2× odczyt DB na render tych dwóch stron. Pozostałe 6 stron: pojedynczy odczyt powłoki. Koszt znikomy (odczyt hintu, nie materiału klucza), ale duplikat istnieje.
- **Poprawka**: Zaakceptuj (2 strony, koszt pomijalny) albo — jeśli kiedyś zabolą — przekaż `keyConfigured` z powłoki w dół do strony.
- **Decyzja**: ACCEPTED — Zaakceptowano świadomie (koszt znikomy, 2 strony).

### F5 — Relatywny import jednostki w `nav-active.test.ts` (konwencja repo to `@/...`)

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/shell/nav-active.test.ts:3
- **Szczegóły**: `from "./nav-active"` — ustalona konwencja repo to alias `@/...` nawet dla współlokowanego modułu pod testem (`type-filter.test.ts`, `operational-view.test.ts`, `list-criteria.test.ts` wszystkie `from "@/..."`).
- **Poprawka**: Zmień na `from "@/components/shell/nav-active"`.
- **Decyzja**: FIXED — Naprawiono teraz (import przez alias `@/...`).
