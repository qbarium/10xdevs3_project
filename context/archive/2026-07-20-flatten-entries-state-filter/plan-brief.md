# Konsolidacja filtra stanu Wpisów — krótki plan

> Pełny plan: `context/changes/flatten-entries-state-filter/plan.md`
> Krótki opis ramowy: `context/changes/flatten-entries-state-filter/frame.md`

## Co i dlaczego

Oś stanu operacyjnego na stronie „Wpisy" jest dziś rozłożona na dwa poziomy w dwóch sąsiednich
kontrolkach (gruby przełącznik widoku + drobny podfiltr), co czyta się jak redundancja mimo braku
funkcjonalnej redundancji. Cel: skonsolidować oś stanu do **jednej rozwijanej listy** o pozycjach
*Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane / Kosz*, z zachowaniem wszystkich dzisiejszych
funkcji.

## Punkt wyjścia

Współistnieją: rozwijana lista widoku (`EntriesViewSelect` — pełna nawigacja SSR na `/items/{view}`) i
pigułki podfiltra (`OperationalSubFilter` — kliencki `opstatus`, tylko w Aktywne). To dwie warstwy
architektury (ścieżka strony = „który zbiór", parametr URL = „jak zawężam"), nie dwa egzemplarze
jednego filtra. Podfiltr już dziś zapisuje się w URL (`useItemList` robi `pushState`), więc nie ma
niespójności do naprawy — zmienia się tylko warstwa kontrolki.

## Pożądany stan końcowy

Jedna kontrolka stanu (rozwijana lista, 6 pozycji). Na Aktywne pozycje „Wszystko aktywne/Nowe/W toku"
zawężają bez przeładowania (kliencki `opstatus` + `?opstatus=` w adresie); „Zakończone/Anulowane/Kosz"
robią pełną nawigację (z niesionym `?type=`). Wybór pozycji aktywnej z innej strony nawiguje na
`/items/active` z odpowiednim `?opstatus=`. Pigułki nie istnieją.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Kierunek | Spłaszczyć do jednej kontrolki (nie usuwać wariantu) | Nic nie jest duplikatem — usunięcie traci funkcję | Ramka |
| Nośnik teraz | Istniejąca rozwijana lista (taby = później) | Krok „teraz, stary UI"; taby to osobny horyzont | Ramka |
| Kosz | Zostaje w filtrze stanu | „Stan" produktowo = kubełek cyklu życia razem z koszem | Ramka |
| Kolejność | Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane / Kosz | Kolejność cyklu życia (`BULK_TARGETS`) + Kosz na końcu | Ramka |
| Logika wyboru | Czysta funkcja `resolveStateSelection` + testy node | Zgodne z konwencją bazy; matryca 6×strony zamrożona testem | Plan |
| Nazwa komponentu | Rename `EntriesViewSelect` → `StateFilterSelect` | Kontrolka filtruje stan, nie sam widok | Plan |
| Kosz w menu | Płaska lista 6 pozycji (bez separatora) | Spójne z dzisiejszym combo; najprostsze | Plan |
| Budowa URL nawigacji | Reużyć `criteriaToQuery` | Kanoniczny serializator; sam pomija `opstatus` poza active | Plan |

## Zakres

**W zakresie:** jedna rozwijana lista 6 pozycji; heterogeniczny `onChange` (kliencki podfiltr / nawigacja);
podpięcie w 3 wyspach (accepted, trash); usunięcie pigułek.

**Poza zakresem:** poziome taby z licznikami (szkic docelowy); rozszerzanie `opstatus` na inne widoki;
zmiana predykatu widoku; zmiana osi rodzaju; zapamiętywanie `opstatus` między nawigacjami.

## Architektura / Podejście

Cała decyzja „pozycja → akcja (kliencki podfiltr albo nawigacja + jaki href)" oraz „stan → zaznaczona
pozycja" ląduje w czystym module `state-filter.ts` (testowanym w node, wzorzec `operational-view.ts`).
Komponent `StateFilterSelect` tylko woła te funkcje: na Aktywne dla pozycji aktywnej → callback
`onSelectActiveSubfilter` (kliencki `applyCriteria`); w pozostałych → `window.location.assign(href)`.
Href budowany przez kanoniczne `criteriaToQuery`, więc `opstatus` trafia do URL tylko przy nawigacji
na active, a `type` jest niesiony automatycznie.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Czysta logika + testy | `state-filter.ts` + `state-filter.test.ts`; aplikacja niezmieniona | Niepełna matryca przypadków (6 pozycji × strony) |
| 2. Komponent + podpięcie 3 wysp | `StateFilterSelect` działa; pigułki wciąż obok (parytet A/B) | Mylna gałąź kliencki-vs-nawigacja → przeładowanie zamiast re-fetchu |
| 3. Usunięcie pigułek | Jedna kontrolka stanu; martwy plik skasowany | Pozostawiona referencja / regresja układu rzędu |

**Wymagania wstępne:** brak — zmiana samodzielna w warstwie prezentacji listy wpisów.
**Szacowany nakład pracy:** ~1 sesja, 3 fazy (mała, skupiona zmiana UI).

## Otwarte ryzyka i założenia

- Założenie: podfiltr `opstatus` pozostaje wyłącznie dla active (parser/serializator bez zmian) — krok
  „teraz" tego nie rusza.
- Ryzyko: trigger `Select` musi pomieścić dłuższą etykietę „Wszystko aktywne" — do sprawdzenia ręcznie.

## Kryteria sukcesu (podsumowanie)

- Jedna kontrolka stanu zastępuje listę + pigułki; wszystkie dzisiejsze przejścia działają identycznie
  (kliencki podfiltr na active, nawigacje dla pozostałych, niesiony `?type=`).
- Brak pigułek `OperationalSubFilter` w kodzie i UI; testy jednostkowe matrycy przechodzą.
