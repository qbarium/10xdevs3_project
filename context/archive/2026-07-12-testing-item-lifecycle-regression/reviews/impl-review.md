<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Regresja cyklu życia itemu (plan testów — Faza 4)

- **Plan**: context/changes/testing-item-lifecycle-regression/plan.md
- **Zakres**: Faza 1 z 1
- **Data**: 2026-07-12
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

Metoda: dwaj niezależni pod-agenci (odchylenia od planu; jakość/wzorce), zbieżni. Kryteria automatyczne zweryfikowane w czasie przeglądu (`npm run test:integration` → 52/52; `npm run lint` → exit 0 w tej sesji, plik testu bez zmian od tego czasu). Kryteria ręczne (dowód zębów 1.6, notatka §6.6 1.7) potwierdzone przez użytkownika.

## Podsumowanie

Wszystkie cztery zaplanowane rzeczy MATCH: test inwariantu (a) round-trip `operational_status` (`items-mutation.integration.test.ts:318`), test (b) `rejected→pending` kolumna+widok (`:343`, importy `listItems`/`defaultCriteria` dodane), test mieszanej selekcji (`:360`), notatka §6.6 (`test-plan.md:201`). Granice „Czego NIE robimy" zachowane w całości: brak testu (c), brak nowego unitu, brak pułapki NULL, brak trybu nietransakcyjnego, **zero zmian produkcyjnych** (`git diff` na `src/` pusty), §1–§5 planu testów nietknięte. Krytyczne szczegóły honorowane: restore deterministyczny (żadnej asercji „odrzucone wraca jako odrzucone"), asercja widoku przez `toContain` a nie równość. Testy realnie asertują zachowanie przez odczyt z bazy (`rowOf`), mają zęby, są deterministyczne, zgodne z sąsiadami, czyste higienicznie.

## Ustalenia

### F1 — Zabezpieczenie testu (b) przed migotaniem opiera się na tym, że `listItems` ignoruje `criteria.size`

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców / Determinizm
- **Lokalizacja**: tests/integration/items-mutation.integration.test.ts:347,357 (mechanizm: src/lib/services/items.ts:118)
- **Szczegóły**: Asercja widoku testu (b) używa `toContain` na pełnej liście pendingów użytkownika `A` i jest bezpieczna DZIŚ, bo `listItems` bierze okno z osobnego 4. parametru `window`, a nie z `criteria.page`/`criteria.size` (które `defaultCriteria('pending')` niesie jako `page:1,size:10`, martwe dla `listItems`). Item testu (b) ma domyślny tytuł „T", nie unikalny. Plan sugerował unikalny tytuł warunkowo (hedge na migotanie). Gdyby ktoś w przyszłości zmienił `listItems`, by respektował `criteria.size` jako domyślne okno, test mógłby zacząć migotać przy wielu pendingach.
- **Poprawka (opcjonalna)**: Nadaj itemowi rejected w teście (b) unikalny tytuł (np. `rt-b-${Date.now()}` — w tym repo `Math.floor(Math.random()*1e9)`, bo `Date.now()` bywa blokowany w niektórych środowiskach) i zawęź asercję widoku wyszukiwaniem po tytule, albo pozostaw jako jest z notatką o sprzężeniu. Zgodne z sugestią planu; usuwa jedyne wykryte utajone sprzężenie.
- **Decyzja**: ACCEPTED — do PR bez zmian (decyzja użytkownika 2026-07-12). Oba niezależne przeglądy uznały test za solidny dziś; F1 to zabezpieczenie przed hipotetyczną przyszłą zmianą sygnatury `listItems`, nie obecny defekt — poprawka byłaby złoceniem zielonego testu.

### F2 — Notatka §6.6 dłuższa niż „2–3 zdania"

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: context/foundation/test-plan.md:201
- **Szczegóły**: Notatka jest ~4 zdania zamiast „2–3", ale kompletna treściowo i na temat (round-trip, determinizm restore, mieszana selekcja, dane do reużycia). Spójna z długością notatek Faz 2/3.
- **Poprawka**: Brak akcji — długość zgodna z sąsiednimi notatkami §6.6.
- **Decyzja**: ACCEPTED — brak akcji.

### F3 — Lekki overlap asercji testu (a) i mieszanego

- **Ważność**: 🔵 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: tests/integration/items-mutation.integration.test.ts:318,360
- **Szczegóły**: Oba testy potwierdzają, że `deleted→accepted` zachowuje `operational_status='in_progress'`, ale w różnych kształtach wywołania (czysty round-trip zaakceptowanego vs restore selekcji mieszanej). Uzasadnione — różne ścieżki, nie duplikat.
- **Poprawka**: Brak akcji — świadomy, uzasadniony overlap.
- **Decyzja**: ACCEPTED — brak akcji.
