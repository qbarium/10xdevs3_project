# Kosz jako osobne miejsce w panelu bocznym — Krótki plan

> Pełny plan: `context/changes/trash-sidebar-relocation/plan.md`
> Badania: `context/changes/trash-sidebar-relocation/research.md`

## Co i dlaczego

Przenosimy „Kosz" z osi stanu strony „Wpisy" do panelu bocznego jako osobne miejsce w grupie „Biblioteka", a jego ikona w sidebarze pokazuje, czy kosz jest pusty czy coś w nim jest. Oś „Wpisów" zostaje wtedy czystym cyklem życia. To reorganizacja architektury informacji — bez zmian zachowania.

## Punkt wyjścia

Dziś „Kosz" jest szóstą zakładką na osi stanu (`state-filter.ts`), renderowaną w wyspach React na wszystkich stronach `/items/*`. Sidebar (statyczny Astro) ma już grupę „Biblioteka" z „Wpisami" i „Sesjami importu"; „Do akceptacji" jest gotowym precedensem pozycji z własną stroną, która nigdy nie była na osi. Trasa `/items/trash`, zapytania listy i zachowanie kosza (restore, „Wyczyść kosz") są stabilne od S-06.

## Pożądany stan końcowy

„Kosz" ma własną pozycję w sidebarze (podświetla się tylko na `/items/trash`), a jego ikona odzwierciedla stan: pusty kontur, gdy kosz pusty, kosz z zawartością, gdy coś w nim jest (odświeżane przy nawigacji). Oś „Wpisów" to 5 zakładek cyklu życia bez „Kosza". Strona kosza działa dokładnie jak dziś, tylko bez rzędu zakładek nad listą.

## Kluczowe podjęte decyzje

| Decyzja                         | Wybór                                        | Dlaczego                                                                 | Źródło   |
| ------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- | -------- |
| Wskaźnik kosza                  | Ikona pusty/pełny, **bez** licznika          | Sygnał „czy coś jest" bez szumu rosnącej liczby (kosz to archiwum)      | Plan     |
| Forma wskaźnika                 | Dwie ikony (zmiana ikony)                    | Dokładnie „ikona się zmienia"; czytelne na zwężonym sidebarze           | Plan     |
| Świeżość wskaźnika              | Serwerowo, przy nawigacji (`Promise.all`)    | Spójne z licznikiem „Do akceptacji"; tanie, zero nowej architektury     | Plan     |
| Filtr pochodzenia               | Poza zakresem — badge karty zostaje          | Rozróżnienie `rejected`/`deleted` na badge wystarcza                     | Badania  |
| `ui-design-system.md`           | Aktualizowany w tym slice                    | Dokument IA spójny z produktem; brak długu mylącego następną osobę      | Plan     |
| Asercje `stateSelectValue`      | Usunięte dla „trash"                         | Test odzwierciedla nowy kontrakt osi (trash już nie jest zakładką)      | Plan     |
| Kolejność faz                   | Sidebar (ze wskaźnikiem) przed osią          | Kosz najpierw zyskuje nowy punkt wejścia, potem traci stary             | Plan     |

## Zakres

**W zakresie:**
- Ikona kosza (dwa warianty) w `Icon.astro`
- Pozycja „Kosz" w sidebarze + matcher aktywności + odczyt stanu kosza w `AppLayout.astro`
- Wyjęcie „Kosza" z osi stanu (`state-filter.ts`, `TrashItemsView.tsx`) + dwa zamrożone testy
- Aktualizacja opisu IA w `ui-design-system.md`

**Poza zakresem:**
- Licznik liczbowy kosza; filtr pochodzenia; reaktywny sidebar na żywo
- Jakiekolwiek zmiany trasy, zapytań, RLS, schematu i zachowania kosza (restore / „Wyczyść kosz")
- Zmiana kodu osi na stronach Wpisów poza usunięciem pozycji „Kosz"

## Architektura / Podejście

Kosz powtarza gotowy wzorzec `pending`: wartość widoku z własną stroną i pozycją w sidebarze, bez zakładki na osi. Wskaźnik stanu kopiuje wzorzec licznika „Do akceptacji" — lekki odczyt count-only w `AppLayout.astro`, tym razem zredukowany do wartości logicznej i podany propsem do sidebara, który wybiera jeden z dwóch wariantów ikony. Oś stanu żyje w wyspach React, więc usunięcie „trash" z jej modelu i wyjęcie komponentu osi z widoku Kosza to jedna nierozdzielna zmiana.

## Fazy w skrócie

| Faza                                          | Co dostarcza                                                            | Kluczowe ryzyko                                                    |
| --------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Pozycja Kosza w sidebarze ze wskaźnikiem   | Ikona (2 warianty), link + podświetlanie, odczyt stanu kosza           | Matcher `trash` musi być przed prefixem `entries` w `nav-active`  |
| 2. Wyjęcie Kosza z osi stanu                  | Oś Wpisów → 5 zakładek; strona Kosza bez osi                           | Model osi i widok Kosza muszą się zmienić razem, inaczej brak podświetlenia |
| 3. Aktualizacja dokumentu IA                  | `ui-design-system.md` spójny z nową nawigacją                          | Minimalne — czysta edycja tekstu                                  |

**Wymagania wstępne:** S-06 (`trash-lifecycle`) i S-15 (`ui-redesign`) — oba zmergowane.
**Szacowany nakład pracy:** ~1 sesja, 3 fazy (Faza 1 najgrubsza — 5 plików; Fazy 2–3 drobne).

## Otwarte ryzyka i założenia

- Wskaźnik nie odświeża się natychmiast po akcji na samej stronie Kosza (optimistic w wyspie) — dopiero przy nawigacji. Świadome, spójne z licznikiem pending.
- Dwa zamrożone testy (`state-filter.test.ts`, `nav-active.test.ts`) zmieniane legalnie i świadomie.
- Dokładny kształt ikony `trash-full` (jak pokazać „zawartość") to decyzja wizualna implementatora — zweryfikowana ręcznie.

## Kryteria sukcesu (podsumowanie)

- Kosz osiągalny z sidebara, podświetla się tylko na `/items/trash`, ikona odzwierciedla stan pusty/niepusty
- Oś „Wpisów" to 5 zakładek cyklu życia bez „Kosza"; strona kosza działa jak dawniej, bez zmian zachowania
- Zamrożone testy zielone; `npm run lint` / `npm run build` czyste
