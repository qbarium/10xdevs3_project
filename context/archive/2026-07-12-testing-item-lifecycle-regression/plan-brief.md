# Regresja cyklu życia itemu (plan testów — Faza 4) — Krótki plan

> Pełny plan: `context/changes/testing-item-lifecycle-regression/plan.md`
> Badania: `context/changes/testing-item-lifecycle-regression/research.md`

## Co i dlaczego

Faza 4 planu testów pokrywa **ryzyko #5**: refaktor list/mutacji cicho łamie model
dwóch wymiarów stanu (kosz gubi stan operacyjny; `rejected→pending` nie wraca do
bramy walidacji). Dokładamy trzy testy integracyjne round-trip, które zapalą się na
czerwono, zanim taki refaktor trafi na produkcję. **Zero zmian w kodzie produkcyjnym.**

## Punkt wyjścia

Cykl kosza (`moveToTrash`/`restoreFromTrash`) ma dziś testy **tylko od strony
bezpieczeństwa** (izolacja per-user, IDOR z Fazy 2). Wymiar cyklu życia — czy stan
przeżywa podróż do kosza i z powrotem — jest całkowicie otwarty dla inwariantu (a),
a dla (b) przypięty jest tylko kształt zapytania (atrapą), nie realne przejście.
Inwariant (c) „zrealizowane znika z Aktywnych" jest już w pełni pokryty.

## Pożądany stan końcowy

`npm run test:integration` (na lokalnym Supabase) uruchamia trzy nowe testy: item
`in_progress`/`done` przechodzi cykl kosz→przywróć bez utraty postępu; item
`rejected` po przywróceniu realnie pojawia się w widoku „Do akceptacji"; mieszana
selekcja `[rejected, deleted]` rozdziela się poprawnie. Każdy test dowiedziony jako
mający zęby (regresja zapala go na czerwono).

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Warstwa testu | Integracja na prawdziwej bazie | Guard żyje w SQL `WHERE`; realne przejście stanu dowodzi tylko baza, nie atrapa | Badania |
| Inwariant (c) | Pominięty | Już przypięty (serwer + klient); nowy test powtarzałby implementację | Plan |
| Głębokość (b) | Kolumna + widok | „Wraca do bramki" to zdanie o widoku „Do akceptacji", nie o samej kolumnie | Plan |
| Przypadki brzegowe | Tylko mieszana selekcja | Dowodzi niekolidujących guardów; NULL i awaria nietransakcyjna świadomie poza zakresem | Plan |
| Nowy test jednostkowy | Brak | Typ „unit + integration" spełnia istniejący unit kształtu (b) + nowa integracja | Badania |

## Zakres

**W zakresie:** trzy testy integracyjne round-trip w
`items-mutation.integration.test.ts` (inwariant a, inwariant b kolumna+widok,
mieszana selekcja); notatka Fazy 4 w §6.6 planu testów.

**Poza zakresem:** test inwariantu (c); nowy test jednostkowy; pułapka NULL
operacyjny; tryb awarii nietransakcyjny restore; jakakolwiek zmiana kodu
produkcyjnego i strategii §1–§5 planu testów.

## Architektura / Podejście

Trzy nowe przypadki `it` w istniejącym bloku `describe`, reużywające gotowe helpery
(`signUpClient`, `insertItem`, `rowOf`) i użytkownika `A` z `beforeAll`. Asercja
zawsze przez odczyt z bazy (`rowOf`), a dla (b) dodatkowo przez `listItems(...
defaultCriteria('pending'))` — co wymaga dwóch nowych importów w pliku testu.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Testy round-trip cyklu życia | 3 testy integracyjne + notatka §6.6 | Test bez „zębów" (fałszywie zielony) — kryją go regresje sprawdzające w weryfikacji ręcznej |

**Wymagania wstępne:** działający lokalny Supabase (kontenery Docker `Up`);
zmienne `SUPABASE_TEST_URL`/`SUPABASE_TEST_ANON_KEY` (inaczej testy się pomijają).
**Szacowany nakład pracy:** ~1 sesja, jedna faza.

## Otwarte ryzyka i założenia

- **Determinizm restore, nie pamięć.** Inwariant (a) dotyczy wyłącznie
  `operational_status`; `rejected` po przywróceniu staje się `pending` — nie wolno
  asertować „odrzucone wraca jako odrzucone".
- **Rozbieżność §5 planu testów ↔ badanie** rozstrzygnięta na korzyść badania
  (zasada §1.3): kodujemy wg zachowania z kodu, nie wg sformułowania „wraca do
  poprzedniego stanu".
- **Okno paginacji `listItems`**: asercja widoku (b) używa `toContain`, nie
  równości; przy dużej liczbie pendingów w przebiegu zawęź kryterium wyszukiwaniem.

## Kryteria sukcesu (podsumowanie)

- Trzy nowe testy przechodzą na lokalnym Supabase i faktycznie się wykonują.
- Każdy dowiedziony jako mający zęby: regresja w `moveToTrash`/`restoreFromTrash`
  zapala właściwy test na czerwono.
- §6.6 planu testów zyskuje notatkę Fazy 4.
