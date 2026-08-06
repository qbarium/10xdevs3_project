<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Kosz jako osobne miejsce w panelu bocznym

- **Plan**: context/changes/trash-sidebar-relocation/plan.md
- **Zakres**: Faza 3 z 3 (pełny przegląd planu)
- **Data**: 2026-08-06
- **Werdykt**: ZAAKCEPTOWANO
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 1 obserwacja

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Kontekst weryfikacji

- **Zakres git**: `c938d40..HEAD` (7c68041 research → 285d73d). 17 plików (10 źródłowych, reszta docs/plan).
- **Bramki automatyczne** (uruchomione ponownie, sekwencyjnie): `npm test` PASS (55 plików / 557 testów), `npm run build` PASS, `npm run lint` PASS, `npx prettier --check ui-design-system.md` PASS.
- **Kryteria ręczne**: wszystkie pozycje `## Progress` (1.4–1.8, 2.4–2.7, 3.2) `[x]`, zweryfikowane E2E Playwright (dev mock + storageState), zrzuty kosz-pełny / kosz-pusty (commit fd7a0bc). Dowód widoczny — nie „podpisywanie na ślepo".
- **Zgodność z planem**: wszystkie zaplanowane zmiany (Faza 1: 5 punktów, Faza 2: 5 punktów, Faza 3: 1 punkt) = MATCH. Zero MISSING, zero DRIFT. Potwierdzone również „nie-zmiany": `AcceptedItemsView.tsx` nietknięty, `navigateHref`/`stateSelectValue` bez zmian, `StateFilterSelect.tsx` tylko komentarz.
- **Bezpieczeństwo/niezawodność**: nowe odczyty w `AppLayout.astro` mają `.eq("user_id", user.id)` (izolacja per-user) + `head:true` count-only (zero treści); kluczowy wymóg planu — fallback PER odczyt w `Promise.all` (dwuargumentowy `.then(onOk, onErr)`) — spełniony: błąd odczytu kosza degraduje tylko jego wartość do `false`, nie kasuje `pendingCount` ani banera klucza. Predykat kosza `.in("acceptance_status", ["rejected","deleted"])` identyczny ze źródłem prawdy `listItems` (`items.ts`).

## Ustalenia

### F1 — Nagłówek strony Kosza zmieniony poza planem

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/pages/items/trash.astro:43
- **Szczegóły**: Commit 285d73d (wprowadzony PO epilogu planu f6c79a4) zmienił nagłówek z `title="Wpisy" subtitle="Kosz — wpisy do przywrócenia lub skasowania"` na `title="Kosz" subtitle="Wpisy do przywrócenia lub skasowania"`. Plik `trash.astro` nie był w żadnej fazie planu, a sekcja „Czego NIE robimy" wymieniała go jako „nietknięte". Zmiana jest czysto prezentacyjna (propsy H1/podtytuł topbara) — bez wpływu na trasę, dane, zachowanie ani `prerender` — i faktycznie domyka intencję IA (Kosz jako osobne miejsce → własny H1 „Kosz" zamiast dziedziczonego „Wpisy"). Narusza literę „nietknięte", ale nie ducha („bez zmian zachowania"). Zweryfikowane E2E (H1 == „Kosz" na /items/trash w obu stanach). Odizolowane w osobnym commicie.
- **Poprawka**: Dopisz do planu krótki aneks (nota w Fazie 1 lub sekcja „Odkryty zakres"): H1/podtytuł `/items/trash` → „Kosz" jako prezentacyjne dopełnienie IA. Usuwanie jest niewskazane — przywróciłoby niespójny nagłówek „Wpisy" na stronie Kosza.
- **Decyzja**: FIXED — aneks „Odkryty zakres (post-implementacja)" dopisany do plan.md

### F2 — Incydentalna normalizacja prettier w tabelach `ui-design-system.md`

- **Ważność**: 🔎 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: context/foundation/ui-design-system.md:48-71
- **Szczegóły**: Przy tekstowej edycji Fazy 3 prettier przy okazji wyrównał trailing-pipe/whitespace w tabelach palety bazowej i kolorów per-typ. Wszystkie wartości hex identyczne — zero zmian semantycznych (potwierdzone). Nieszkodliwa normalizacja formatu incydentalna do zaplanowanej edycji; `prettier --check` przechodzi.
- **Poprawka**: Brak — zaakceptować (czysto formatująca, spójna z prettier).
- **Decyzja**: SKIPPED — zaakceptowane jako kosmetyka (kolory i treść bez zmian)

## Uwagi (bez rangi ustalenia)

- **Wskaźnik kosza używa `count:"exact"`** gdy potrzebny jest tylko boolean „niepusty" — tańszy byłby `head:true` + `.limit(1)`. Świadomie zostawione: matchuje istniejący precedens `pendingCount` i mieści się w udokumentowanym w planie „koszt marginalny". Ewentualna mikrooptymalizacja na przyszłość, nie regresja.
- **Nieświeżość wskaźnika przy nawigacji** (SSR raz na render) — jawnie zaakceptowana w planie („Specyfikacja UX — świeżość wskaźnika"), wspólna klasa z `pendingCount`. Nie jest ustaleniem.
