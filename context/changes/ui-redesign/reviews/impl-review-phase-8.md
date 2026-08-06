<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Plan**: context/changes/ui-redesign/plan.md
- **Zakres**: Faza 8 z 9 (Sprzątanie + weryfikacja końcowa)
- **Commit**: 5702c09
- **Data**: 2026-08-06
- **Werdykt**: ZAAKCEPTOWANO
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 1 obserwacja

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Dowody weryfikacji

Zmiany Fazy 8 (commit `5702c09`, 9 plików) zweryfikowane niezależnie:

- **`bg-cosmic` usunięty** (`@utility` z `global.css`) — grep `bg-cosmic` w `src/` = **0 trafień**.
- **`Topbar.astro` usunięty** — grep precyzyjny (`import Topbar from` / `<Topbar`) = **0 trafień**. Pozostałe trafienia „Topbar" to wyspy Fazy 3 (`TopbarItemSearch`/`TopbarItemAction`/`useItemTopbarBridge`), nie stary komponent.
- **Martwy kod `state-filter`** (`resolveStateSelection`/`stateSelectLabel`/`StateSelection` + przypadki testowe) usunięty — grep = tylko komentarz wyjaśniający. **Eksporty potrzebne Fazie 9 przeżyły**: `navigateHref`, `STATE_FILTER_OPTIONS`, `stateSelectValue`.
- **`state-filter.test.ts` spójny** po wycięciu 119 linii — nadal pilnuje zamrożonych wartości tras (`active`/`active:new`/`done`/`cancelled`/`trash`) i etykiet („Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane / Kosz").
- **`Banner.astro`** na semantycznych tokenach (info→`task`, warning→`warning-fg`, error→`destructive`); scoped `<style>` z hex usunięty. Wszystkie tokeny istnieją w obu motywach (`--task-fg/bg/line`, `--warning-fg`, zmapowane w `@theme inline`).
- **`button.tsx`** destructive: `text-white` → `text-destructive-foreground`; token `--destructive-foreground` dodany w `:root` i `.dark` + mapowanie `--color-destructive-foreground`.
- **`sonner.tsx`** realnie świadomy motywu (MutationObserver na klasie `.dark`) — słusznie nietknięty (plan mówił „potwierdzić", nie „zmienić").
- **Grep zaszytych kolorów = 0**: `bg-white/`, `text-white`, `text-blue-`, `from-blue-`, `purple-`, `bg-cosmic`, `#0a0e1a` oraz surowy hex `#[0-9a-fA-F]{3,6}` w scoped `<style>` w `.astro`.

### Kryteria sukcesu (automatyczne, odtworzone)

- `npm run lint` — **PASS** (exit 0; ostrzeżenia `astro-eslint-parser projectService` i brak `site` dla sitemap to znane szumy).
- `npm test` — **PASS** (55 plików, **556 testów**, w tym `labels.test`/`state-filter.test`).
- `npm run build` — **PASS** (exit 0).
- Grep zaszytych kolorów — **PASS** (0 trafień).
- `npm run e2e` — **NIE reruchamiane** w tym przeglądzie (ciężkie: lokalny Supabase + Playwright). Odhaczone przy `5702c09`, weryfikacja wizualna przy `a60f095`.

## Ustalenia

### F1 — LibBadge.astro usunięty poza jawną listą Fazy 8

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; nic do naprawy
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/ui/LibBadge.astro (usunięty)
- **Szczegóły**: Plan Fazy 8 wymieniał do usunięcia tylko `Topbar.astro`. Commit `5702c09` usunął dodatkowo `LibBadge.astro`. To resztka scaffoldu startera (`fb5b6b0`), nigdy nieużywana w projekcie (grep = 0 referencji), udokumentowana w commit message. Mieści się w mandacie fazy („Sprzątanie + martwy kod"), tylko nie była wypisana z nazwy.
- **Poprawka**: Zaakceptować jak jest — usunięcie poprawne, martwe, udokumentowane. Zero działania.
- **Decyzja**: OCZEKUJĄCA
