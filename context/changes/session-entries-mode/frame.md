# Frame Brief: Tryb „Pokaż wpisy" zamiast master-detail (S-13)

> Etap ramowania przed /10x-plan. Ten dokument przedstawia, co *faktycznie*
> jest problemem, oddzielone od tego, co początkowo zakładano.

## Zgłoszona obserwacja

„Nieergonomiczny interfejs i częściowe dublowanie funkcjonalności listy wpisów.
Master detail był próbą która potwierdziła że nie ma sensu aż tak rozwijać listy
sesji." (użytkownik, 2026-07-01; obserwacja NIE była wcześniej udokumentowana —
archiwum S-10 nie zawiera żadnego follow-upu o ergonomii ani dublowaniu).

## Początkowe ramy (zachowane)

- **Podana przyczyna lub podejście użytkownika**: master-detail (S-10) to niewłaściwy
  wzorzec prezentacji wpisów sesji; właściwy to tryb kontekstowy sesji na
  pełnostronicowej liście wpisów (`?session=<id>` + baner), lista sesji jako karty.
- **Proponowany kierunek działania użytkownika**: redesign wg roadmapy S-13 — usunąć
  `SessionItemsPanel`/`useSessionItems`/dwukolumnowy layout, dodać „Pokaż wpisy" →
  tryb kontekstowy, karty sesji, paginację wpisów; reużyć endpoint S-10 i akcje list.
- **Zawężenie przed wysyłką**: rdzeniem problemu jest **lista sesji jako karty**
  (uproszczenie dziennika), nie sam widok wpisów; wpisy per sesja użytkownik
  przegląda **przez panel S-10** (funkcja realnie używana — nie można jej wyciąć
  bez zastępstwa).

## Mapa wymiarów

Obserwacja może pochodzić z któregokolwiek z tych wymiarów:

1. **Układ dziennika (prezentacja)** — dwukolumnowy sticky panel ściska obie listy;
   aparat wyboru (listbox, roving tabindex) istnieje tylko po to, by zasilać panel.
   ← początkowe ramy
2. **Granica własności operacji na wpisach** — dwie powierzchnie *posiadają* operacje
   na wpisach; granica „panel to przegląd, nie druga lista" pękła aneksem 2026-06-27.
3. **Model danych widoku (view ⊥ sesja)** — widoki `/items` to twarde podzbiory jednego
   stanu akceptacji (view ze ścieżki strony); sesja to przekrój przez wszystkie 4 stany.
4. **Adresowalność (URL)** — wybór sesji w panelu jest ulotnym stanem klienta;
   deep-link `?session=` odłożony w S-10 i wycięty ze scope w S-11.
5. **Sprzężenie zakresu S-13** — karty ↔ tryb kontekstowy ↔ paginacja wpisów: co jest
   rdzeniem, co konsekwencją, co doklejką.

## Badanie hipotez

| Hipoteza | Dowody | Werdykt |
| --- | --- | --- |
| W1: nieergonomia z układu dziennika | `ImportSessionsView.tsx:95-135` (dwukolumnowy grid, sticky panel); `SessionsList.tsx:60-97`, `SessionRow.tsx:56-95` (listbox/klawiatura wyłącznie pod panel) | SILNE |
| W2: dublowanie z pękniętej granicy własności operacji | równoległa ścieżka mutacji panel-only `acceptItems`/`rejectItems`/`restoreFromTrashItems` (`useItemMutation.ts:60-65,107-134`); 4 ręczne karty wpisu (`SessionItemsPanel.tsx:148-254`, `PendingItemsView.tsx:250-306`, `AcceptedItemsView.tsx:349-400`, `TrashItemsView.tsx:249-290`); rozjazd semantyki accept (panel zostawia wpis `SessionItemsPanel.tsx:88-106`, lista usuwa `PendingItemsView.tsx:122-124`); udokumentowane naruszenie granicy: aneks 2026-06-27 (archiwum S-10 `change.md:14`, `plan.md:34`) | SILNE |
| W3: tryb sesji = drugi model widoku, nie filtr | „view wynika ze ŚCIEŻKI — NIE jest parametrem URL" (`list-criteria.ts:20-24`); twarde podzbiory stanów per widok (`items.ts:61-77`); sesja jako scope ponad stanami (`getSessionItems`, `items.ts:139-150`); `GET /api/items` wymaga `view` (`api/items/index.ts:35-37`) | SILNE |
| W4: nieergonomia z braku adresowalności | wybór = `useState` (`ImportSessionsView.tsx:45`), kasowany przy zmianie kryteriów (`:47-55`); `?session=` odłożony (S-10 `plan-brief.md:23`) i wycięty (S-11 `plan-brief.md:26`) | SŁABE (fakt potwierdzony, ale użytkownik nie wskazał go jako bolączki) |
| W5: paginacja wpisów to doklejony, niedoszacowany koszt | wzorzec S-11 nieuwspólniony (`session-list-criteria.ts:4` „wzorowane na", osobny hook/parser/endpoint); `listItems` bez `range`/`count` (`items.ts:57-100`); `ListCriteria` bez `page` (`list-criteria.ts:36-43`); kolizja z inwariantem optimistic „mutacje NIE re-fetchują" (`useItemList.ts:7-9`) | SILNE (co do kosztu) |

## Sygnały zawężające

- Rdzeń = uproszczenie listy sesji (karty); tryb wpisów jest koniecznym zastępstwem
  (FR-027 + panel realnie używany), nie celem samym w sobie. (Krok 1.5)
- Master-detail **nigdy nie był argumentowanym wyborem** — premisa odziedziczona
  z PRD (adnotacja 2026-06-20, `prd.md:204,218`); w decyzjach S-10 brak pozycji
  „master-detail vs alternatywy" (`plan-brief.md:20-29`). Nie ma zapisanego argumentu
  do obalenia.
- Test pod presją (adwersarz): cel ramy przetrwał; pękły dwa filary — nośnik
  `?session=` na `/items` ma strukturalny opór (zakładki `MainFilterNav.astro:18`
  kłamią nad listą 4 stanów; `criteriaToQuery`/`popstate` wymazują nieznane parametry
  `useItemList.ts:128-133,183-189`; dwie rodziny semantyk akcji; „Dodaj item" tworzy
  wpis NULL-session `api/items/index.ts:9-13`; brak wspólnej karty do reużycia)
  oraz kwalifikacja „zmiana głównie prezentacyjna" (paginacja przebudowuje 3 kontrakty
  danych i zderza się z optimistic).
- Decyzje użytkownika po przedstawieniu dowodów (2026-07-01, ta sesja):
  (a) **nośnik dosłownie na stronie listy wpisów — twardy wymóg** (podtrzymany
  świadomie mimo oporu); (b) **paginacja wpisów zostaje w S-13**; (c) strata
  przeglądu side-by-side wielu sesji — **akceptowana**.

## Konwencja między systemami

Konwencja bazy kodu dla „którego zbioru wpisów patrzę": osobna strona `.astro`
per widok, tożsamość w ścieżce, kryteria w query (`list-criteria.ts:20-24,99`).
Tryb sesji na `/items` odwraca tę konwencję (tożsamość strony w query) — użytkownik
świadomie akceptuje ten wyjątek. Twarde ograniczenie PRD pozostaje: **sesja nie może
być zwykłym filtrem listy** (FR-008, `prd.md:238`) — tryb kontekstowy (baner, ukryte
filtry, wszystkie stany) to respektuje.

## Przeformułowane (lub potwierdzone) sformułowanie problemu

> **Rzeczywisty problem do zaplanowania to**: podwójna własność prezentacji i operacji
> na wpisach — dziennik sesji przerósł rolę przeglądu (aneks 2026-06-27) i utrzymuje
> równoległą, rozjeżdżającą się implementację listy wpisów; należy skonsolidować
> wpisy sesji jako tryb kontekstowy strony listy wpisów (`/items?session=<id>`,
> wszystkie stany, akcje zachowane), a dziennik zredukować do nawigacyjnych kart.

Kierunek początkowych ram **potwierdzony** (likwidacja master-detail zasadna), ale
z dwiema korektami: (1) miarą sukcesu jest zniknięcie *drugiej implementacji* (panelowa
ścieżka mutacji, osobny hook listy, osobna karta), nie samo przeniesienie widoku —
inaczej dublowanie przeżyje w nowym miejscu; (2) roadmapowa kwalifikacja „zmiana
głównie prezentacyjna" jest fałszywa — tryb sesji to drugi model widoku na stronie
o ścieżkowej tożsamości, a paginacja wpisów przebudowuje kontrakty danych.

## Pewność

- **WYSOKA** — silne dowody we wszystkich rozstrzygających wymiarach (W1–W3, W5),
  spójna historia decyzji (brak obrony master-detail), twarde ograniczenie PRD
  zidentyfikowane, a otwarte kompromisy rozstrzygnięte jawnymi decyzjami użytkownika
  po przedstawieniu dowodów.

## Co zmienia się dla /10x-plan

Plan ma dotyczyć konsolidacji własności wpisów + redukcji dziennika do kart — w ramach
twardego wymogu nośnika (`/items?session=<id>`). Wykryte kolizje przestają być
argumentami przeciw i stają się **obowiązkowymi wymaganiami planu**:

1. Tożsamość strony: zachowanie `MainFilterNav` w trybie sesji (nie może kłamać).
2. Trwałość trybu: `?session=` musi przetrwać `pushState`/`popstate`/zmiany filtrów
   (dziś parser i serializer go wymazują).
3. Podwójna semantyka akcji: accept/reject w trybie sesji zostawia wpis (keep-in-place
   + świeży wiersz), poza trybem usuwa — bez rozdwojenia logiki nie do pogodzenia.
4. Funkcje bez sensu w trybie: „Dodaj item" (NULL-session), select-all/bulk na liście
   4 stanów — do świadomego ukrycia/rozstrzygnięcia.
5. Porty z panelu (kod do usunięcia, zachowania do przeniesienia): podgląd readOnly
   dla rejected/deleted (`EditItemDialog.tsx:33-38`), stabilny sort `created_at ASC
   + id ASC` (`items.ts:135-137`).
6. Paginacja wpisów (w zakresie na mocy decyzji): rozszerzenie 3 kontraktów
   (`list-criteria.ts`, `GET /api/items` o `total`, `listItems` o `range`/`count`)
   + rozwiązanie kolizji z optimistic-updates; endpoint sesyjny
   (`/api/import-sessions/[id]/items`) też jest dziś bez paginacji.

## Referencje

- Pliki źródłowe: wskazane per hipoteza w tabeli wyżej; nadto `items.astro:17`,
  `MainFilterNav.astro:10-18`, `useSessionItems.ts:20-27`, `api/import-sessions/index.ts:40`.
- Powiązane badania: brak `research.md` (frame poprzedza research); historia:
  `context/archive/2026-06-24-session-items-detail/` (plan-brief, change.md, follow-ups),
  `context/archive/2026-06-28-session-log-filter-ux/` (plan-brief), `prd.md` FR-008/FR-015/FR-027,
  `roadmap.md` §S-13.
- Zadania badawcze: #1–#5 (wymiary mapy), #6 (test pod presją) — sesja 2026-07-01.
