<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Plan**: context/changes/ui-redesign/plan.md
- **Zakres**: Faza 4 z 8 (Do akceptacji / triage)
- **Data**: 2026-08-05
- **Werdykt**: ZAAKCEPTOWANO
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 0 obserwacji

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Zakres realny (git)

- `24e0a85` (feat, p4): `src/components/items/ItemCard.tsx` — **+3 linie** (komentarz + jeden warunkowy zestaw klas dla zaznaczonego wiersza) + `plan.md` (aneks Fazy 4, odhaczenie 4.1–4.4).
- `8d899e2` (chore, p4): `plan.md` — dopięcie SHA do wierszy 4.1–4.4 w `## Postęp`.
- **Cała powierzchnia kodu Fazy 4 = 3 linie w jednym pliku.** Rdzeń triage (pasek zbiorczy, wiersz triage: checkbox/chip/tytuł/opis/akcje Zatwierdź/Odrzuć/Edytuj) powstał w Fazie 3 przez współdzielony `ItemCard` i został przejrzany w `impl-review-phase-3.md`. Net-new Fazy 4 to jedyny brakujący element makiety `.triage-row.sel` — podświetlenie zaznaczonego wiersza.

Net-new (`ItemCard.tsx:141-143`):

```tsx
// Zaznaczony wiersz (triage „Do akceptacji" + akcje zbiorcze widoków accepted) — subtelne wypełnienie
// i mocniejsze obramowanie z tokenów (makieta `.triage-row.sel`: bg `--hover`, border `--border-2`).
selected && "bg-accent border-muted-foreground/25",
```

## Analiza wymiarów

**Zgodność z planem — PASS.** Wszystkie kontrakty Fazy 4 §1 spełnione: generyczna etykieta bulk „Zrobione" (nietknięta), pojedyncze akcje „Edytuj"/„Odrzuć"/„Zatwierdź" (obecne w `ItemCard`), reconcile (item znika po decyzji — logika w `PendingItemsView.execute`, nietknięta), brak „pewności %" (grep `conf`/`pewność`/`confidence` w `src/components/items/` = zero trafień), „kolory statusów zaznaczenia z tokenów" = net-new podświetlenie. Plan wskazywał plik `PendingItemsView.tsx`, a net-new wylądował we współdzielonym `ItemCard` — odchylenie udokumentowane w aneksie, nieszkodliwe (rdzeń triage już żył w `ItemCard` od Fazy 3).

**Dyscyplina zakresu — PASS.** Zmiana minimalna. Efekt uboczny współdzielonego komponentu (podświetlenie obejmuje też zaznaczenie do akcji zbiorczych w widokach accepted/kosz) jest jawnie ujawniony w aneksie i pożądany UX-owo — nie ukryty scope creep.

**Bezpieczeństwo i jakość — PASS.** Zmiana czysto prezentacyjna (klasa CSS). Zero powierzchni bezpieczeństwa, operacji na danych, autoryzacji, I/O. `cn()` (tailwind-merge) poprawnie rozstrzyga nadpisania `bg-card`→`bg-accent` i `border-border`→`border-muted-foreground/25` przy `selected` — brak konfliktu „martwych" klas.

**Architektura — PASS.** Brak zmian architektonicznych. Warunkowa klasa w istniejącym komponencie, wzorem sąsiedniego `inFlight && "..."`.

**Spójność wzorców — PASS.** `cn()` (hard rule), tokeny, styl komentarza i wzorzec warunkowej klasy zgodne z resztą pliku. `bg-accent` to idiomatyczny w shadcn token stanu zaznaczenia/hover — trafny wybór odwzorowania makietowego `--hover`.

**Kryteria sukcesu — PASS.**
- 4.1 Lint: **PASS** — `npm run lint` exit 0 (ostrzeżenia `astro-eslint-parser` to znany szum środowiska).
- 4.2 Build: **PASS (z zastrzeżeniem)** — pełny `astro build` blokuje środowiskowy `EBUSY` na niezwiązanym chunku `dist/server/chunks/retry_*.mjs` (lock pliku OneDrive/Defender, brak procesów `node.exe`; kompilacja i bundling przechodzą „✓ built" przed błędem zapisu). Kompilację potwierdzono niezależnie: `npx tsc --noEmit` exit 0. Zmiana 3-liniowa CSS nie może wywołać EBUSY.
- 4.3 Testy jednostkowe: **PASS** — `npm test` 574/574.
- 4.4 E2E: deklarowane 3/3 na zimnym starcie w commicie (`item-survives-reload`, `happy-path-smoke`, `seed`); lokalnie nie ponawiane (ciężkie, oparte o dev server, local-only; zmiana CSS nie dotyka kontraktów DOM E2E — `<h3>`, `article[data-item-id]`, „Zatwierdź", `aria-label` nietknięte).
- 4.5–4.8 Ręczne: **świadomie odłożone na koniec całej zmiany** wg ustalenia użytkownika w `change.md` (2026-08-04) — nie „podpisywanie na ślepo". 4.7 (brak „pewności %") dodatkowo potwierdzone statycznie grepem.

## Ustalenia

Brak. Zmiana Fazy 4 jest minimalna, poprawna tokenowo, zgodna z planem i w pełni udokumentowana aneksem. Nie ma czego sortować.

## Uwagi kontekstowe (nie-ustalenia)

- **Kontrast przy zaznaczeniu w widokach accepted:** `bg-accent` pod zaznaczonym wierszem z przygaszonym (`done`) lub przekreślonym (`cancelled`) tytułem — do potwierdzenia w obu motywach podczas zaplanowanej końcowej bramki wizualnej (już objęte planem: „każdy widok w obu motywach"). Nie wymaga akcji teraz.
- **Status change.md:** świadomie **nie** ustawiono `impl_reviewed` — to przegląd fazy w toku implementacji (4/8, status `implementing`), a `impl_reviewed` bramkuje archiwizację całej zmiany i musi mirrorować board. Zmiana pozostaje `implementing` do zakończenia Faz 5–8.
