# Ręczne dodawanie itemu (S-07) — Krótki plan

> Pełny plan: `context/changes/manual-item-entry/plan.md`

## Co i dlaczego

Dodajemy ścieżkę ręcznego tworzenia jednego itemu z pominięciem klasyfikacji AI (FR-028, US-08). Dwa powody: testowalność UI list bez wywołań dostawcy AI oraz realny przypadek „user przy komputerze, ma pomysł, chce go szybko dopisać". Akcja działa bez klucza API — świadomy wyjątek od FR-024.

## Punkt wyjścia

Łańcuch klasyfikacji (S-02→S-05) jest gotowy: tabela `items` z RLS INSERT, widoki Aktywne/Zakończone/Anulowane/Pending/Kosz, dialog edycji, hook mutacji. Brakuje jedynie ścieżki tworzenia itemu poza klasyfikacją — nie ma endpointu `POST` tworzącego item ani akcji „Dodaj" w UI.

## Pożądany stan końcowy

User na `/items/active` klika „Dodaj item", w modalu wybiera typ (domyślnie ostatnio użyty) i wpisuje tytuł, zatwierdza — item natychmiast pojawia się w liście Aktywne, przypięty (widoczny mimo filtra typu), przewinięty do widoku i sfokusowany, z toastem. Bez potrzeby klucza API.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Stan początkowy itemu | `accepted` / `new` / `import_session_id=NULL` | FR-028/US-08: omija `pending` i walidację, ląduje w Aktywne | PRD |
| Umiejscowienie akcji | Nagłówek widoku Aktywne (tylko tam) | Akcja przy rezultacie; item powstaje jako `new` → należy do Aktywne | Plan |
| Kształt formularza | Modal (shadcn Dialog), reuse `EditItemDialog` | Maks. reuse, bez nawigacji, spójny z edycją | Plan |
| UX po zapisie | Optimistic insert + pin + focus na nowym itemie | Brak wyrwania z czynności; pin chroni przed ukryciem pod filtrem typu | Plan |
| Multi-add | Nie — jeden item, dialog się zamyka | Wąsko wg celu „szybkość uruchomienia" | Plan |
| Domyślny typ | Ostatnio użyty (`localStorage`) | Dopasowanie do serii podobnych itemów | Plan |
| Endpoint | `POST /api/items` (nowy `index.ts`) | Czysty „create w kolekcji" obok bulk/operational/[id] | Plan |
| Niezmienniki | Ustala serwer; klient nie przysyła statusów/sesji | Fail-closed wg lekcji „nie ufaj wejściu" | Plan |

## Zakres

**W zakresie:** endpoint `POST /api/items`; serwis `createManualItem`; schemat `createItemSchema`; modal `AddItemDialog`; metoda hooka `createItem`; przycisk + insert/pin/focus w Aktywne; domyślny typ z `localStorage`.

**Poza zakresem:** edycja/usuwanie z formularza (S-05/S-06); multi-add; akcja poza Aktywne; tworzenie wprost do `pending`; powiązanie z sesją importu; sortowanie/wyszukiwanie (S-09); optimistic concurrency; limit długości `description`.

## Architektura / Podejście

Backend-first (konwencja S-03/S-05): Faza 1 dostarcza testowalny niezależnie kontrakt (zod → serwis → endpoint), Faza 2 dokłada UI reużywające `EditItemDialog` i istniejącej machinerii `pinnedIds`/`typeFilter` w `AcceptedItemsView`. Brak migracji, brak nowych zależności.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Backend | `createItemSchema` + `createManualItem` + `POST /api/items` + testy | Przeoczenie jawnego `accepted` (default schematu = `pending`); przyjęcie statusów od klienta |
| 2. Frontend | `AddItemDialog` + hook `createItem` + przycisk/insert/pin/focus w Aktywne + domyślny typ | Nowy item ukryty pod niezgodnym filtrem typu, jeśli pominąć `pinnedIds` przed focusem |

**Wymagania wstępne:** S-02 (gotowe — schemat `items`, RLS, widoki). Brak migracji.
**Szacowany nakład pracy:** ~1–2 sesje, 2 fazy.

## Otwarte ryzyka i założenia

- Założenie: `AcceptedItemsView` przyjmie prop `canAdd` i obsłuży insert/pin/focus bez refaktoru filtra — do potwierdzenia w Fazie 2 (mechanizm `pinnedIds` już istnieje).
- Element itemu musi mieć stabilny uchwyt (`data-item-id`/ref + `tabIndex={-1}`) do `focus()`/`scrollIntoView` — drobne dotknięcie renderu listy.
- Świadomie bez bramki klucza BYOK na endpoincie/UI — to wyjątek FR-024, nie przeoczenie.

## Kryteria sukcesu (podsumowanie)

- User dodaje item ręcznie z `/items/active` i widzi go natychmiast (sfokusowany, mimo filtra typu).
- Działa bez klucza API; niepoprawny payload → 400 bez wstawienia; niezalogowany → 401.
- Lint + build + testy jednostkowe i integracyjne zielone.
