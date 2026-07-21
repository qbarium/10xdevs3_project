# Frame Brief: Konsolidacja filtra stanu na stronie „Wpisy"

> Etap ramowania przed /10x-plan. Ten dokument przedstawia, co *faktycznie*
> jest problemem, oddzielone od tego, co początkowo zakładano.

## Zgłoszona obserwacja

Na zakładce „Wpisy" (`/items/active`) współistnieją dwie kontrolki dotykające stanu:
rozwijana lista „Aktywne ▾" oraz pigułki po prawej „Wszystkie / Nowe / W toku".
(obserwacja użytkownika, 2026-07-20)

## Początkowe ramy (zachowane)

- **Podana przyczyna / podejście użytkownika**: to dublowanie tego samego filtrowania
  stanu w dwóch postaciach.
- **Proponowany kierunek użytkownika**: usunąć jeden z dwóch wariantów.
- **Zawężenie przed wysyłką (i doprecyzowania w trakcie)**:
  - Kierunek zmieniony na **spłaszczenie osi stanu do jednej kontrolki** (nie usunięcie).
  - **Kosz zostaje w filtrze stanu** — odrzucono roboczą tezę frame o wynoszeniu Kosza
    do osobnej nawigacji („szew akceptacji"); „stan" produktowo = kubełek cyklu życia
    razem z koszem (wg szkicu docelowego).
  - Kształt osi po konsolidacji: **worek „Wszystko aktywne" + rozłączne stany**.
  - **Dwa horyzonty**: (a) teraz, stary UI — pozycje wchodzą do istniejącej **rozwijanej
    listy** (`EntriesViewSelect`) + porządek, pigułki znikają; (b) docelowo — te same
    pozycje jako **poziome taby** wg szkicu.

## Mapa wymiarów

Obserwacja („dwie kontrolki stanu obok siebie") mogła pochodzić z:

1. **Literalna duplikacja** — obie kontrolki filtrują ten sam zbiór wartości stanu. ← *ramy początkowe*
2. **Dwa ortogonalne wymiary** — combo = oś akceptacji, pigułki = oś operacyjna. ← *alternatywa użytkownika*
3. **Jeden wymiar w dwóch przybliżeniach** — combo = grube kubełki cyklu operacyjnego + Kosz; pigułki = drobny podział wewnątrz „Aktywne".
4. **Czytelność, nie redundancja** — dwie sąsiadujące kontrolki wyglądają jak ten sam filtr.

## Badanie hipotez

| Hipoteza | Dowody | Werdykt |
| --- | --- | --- |
| 1. Duplikacja | Żadna wartość nie jest osiągalna przez obie kontrolki. Combo daje `{Aktywne-grupa, Zakończone, Anulowane, Kosz}` (`EntriesViewSelect.tsx:13-18`); pigułki dają `{Wszystkie, Nowe, W toku}` **tylko** w Aktywne (`ListFilterBar.tsx:95`, `OperationalSubFilter.tsx:12-14`). Usunięcie którejkolwiek traci funkcję. | **BRAK** |
| 2. Dwa ortogonalne wymiary | Combo to **nie** oś akceptacji: `active/done/cancelled` to oś **operacyjna** pogrupowana w widoki (`items.ts` predykat: active = accepted + {new,in_progress}; done/cancelled = pojedynczy stan), a `trash` = oś akceptacji (`rejected/deleted`). Pigułki też operacyjne. Oba dotykają **głównie tej samej osi**. | **SŁABE / częściowe** |
| 3. Jeden wymiar, dwa przybliżenia | Combo = gruby przełącznik widoku, pełna nawigacja SSR, **zastąpił zakładki** 2 lipca (`EntriesViewSelect.tsx:1-7,31-37`). Pigułki = drobny podfiltr `opstatus`, honorowany tylko dla active (`list-criteria.ts:127`), bo to jedyny widok z >1 stanem. | **SILNE** |
| 4. Czytelność | „Aktywne" (słowo-stan) stoi tuż obok pigułek stanu; oś operacyjna rozjechana na dwa poziomy w sąsiednich kontrolkach → *wygląda* na dublowanie. | **SILNE** (źródło obserwacji) |

## Sygnały zawężające

- Kod sam nazywa dwa wymiary itemu: `AcceptanceStatus` = „Wymiar akceptacji", `OperationalStatus`
  = „Wymiar operacyjny" (`types.ts:72-79`). Intuicja użytkownika (akceptacyjny vs operacyjny)
  jest trafna co do istnienia dwóch osi, ale combo **nie** jest osią akceptacji.
- Pending („Do akceptacji", druga wartość osi akceptacji) siedzi już w osobnym menu górnym,
  poza combo (`Topbar.astro:16-18`) — dowód, że combo nie jest „przełącznikiem akceptacji".
- Akcje zbiorcze już traktują 4 stany operacyjne jako **jeden płaski zbiór**
  (`BULK_TARGETS = new → in_progress → done → cancelled`, `AcceptedItemsView.tsx:48-49`) —
  płaska oś operacyjna jest już naturalną jednostką w kodzie; konsolidacja UI dogania model.
- **Korekta ram (decyzja użytkownika)**: teza „Kosz do osobnej nawigacji" ODRZUCONA — użytkownik
  chce Kosza w tym samym filtrze stanu (szkic docelowy). Kształt osi: worek „Wszystko aktywne"
  + rozłączne stany.

## Konwencja między-systemowa

W tej bazie kodu obowiązuje twarda konwencja: **„który zbiór oglądam" = ścieżka strony
(nawigacja, osobne `.astro` per widok), „jak go zawężam" = parametr URL (podfiltr)**
(`list-criteria.ts:20-24`; `src/pages/items/{active,done,cancelled,trash}.astro`; poprzedni
`context/archive/2026-07-01-session-entries-mode/frame.md`). Combo obsługuje pierwsze, pigułki
drugie — dwie warstwy architektury, nie dwa egzemplarze jednej rzeczy. Konsolidacja do jednej
kontrolki musi pogodzić oba mechanizmy w jednym wyborze.

## Przeformułowane sformułowanie problemu

> **Rzeczywisty problem do zaplanowania to**: oś stanu operacyjnego jest dziś rozłożona na dwa
> poziomy w dwóch sąsiednich kontrolkach (gruby przełącznik widoku + drobny podfiltr), co czyta
> się jak redundancja mimo braku funkcjonalnej redundancji. Cel: skonsolidować oś stanu do
> **jednej kontrolki** o pozycjach *Wszystko aktywne / Nowe / W toku / Zakończone / Anulowane /
> Kosz*, z zachowaniem wszystkich dzisiejszych funkcji.

Ramy początkowe („to duplikat, usuń jeden") **obalone** — nic nie jest duplikatem, usunięcie
traci funkcję. Kierunek działania (**spłaszczyć, nie usuwać**) to decyzja użytkownika po
przedstawieniu dowodów. Krok bieżący celuje w **rozwijaną listę** (stary UI); poziome taby to
horyzont docelowy (szkic).

## Pewność

- **WYSOKA** — diagnoza „nie duplikacja, lecz dwa przybliżenia osi operacyjnej + Kosz" jest
  udowodniona plikami (hipotezy 1–4 rozstrzygnięte odczytami, bez sprzeczności). Kierunek
  (spłaszczenie, worek + stany rozłączne, Kosz zostaje) jest jawną decyzją użytkownika.

## Co zmienia się dla /10x-plan

Plan celuje w **krok teraz**: rozwijana lista `EntriesViewSelect` przejmuje granularne statusy;
pigułki `OperationalSubFilter` znikają. Wykryte kolizje = **wymagania planu**:

1. **Heterogeniczny `onChange` kontrolki.** Wybory mapują na dwa różne mechanizmy:
   *Zakończone/Anulowane/Kosz* → pełna nawigacja na inną stronę `.astro` (jak dziś combo);
   *Wszystko aktywne/Nowe/W toku* → pozostanie na `active.astro` + ustawienie `opstatus`
   (jak dziś pigułki, przez `setCriteria` wyspy, bez zmiany strony). Jedna kontrolka musi
   rozróżnić te dwa tryby na pozycję.
2. **Worek vs rozłączne stany.** „Wszystko aktywne" = `active` + `opstatus=undefined`;
   „Nowe"/„W toku" = `active` + `opstatus=new|in_progress`. Predykat widoku w `items.ts` i
   `matchesView`/`reconcileAfterChange` (`operational-view.ts:15-20`) nie wymagają zmiany dla
   kroku teraz (Aktywne dalej = new+in_progress); zmienia się tylko warstwa kontrolki.
3. **Kolejność.** Kanoniczny porządek cyklu życia istnieje: `BULK_TARGETS`
   (`AcceptedItemsView.tsx:48-49`) — ustawić pozycje w tej kolejności + Kosz na końcu.
4. **`opstatus` w URL.** Dziś honorowany tylko dla active (`list-criteria.ts:127`,
   `criteriaToQuery:152`) — dla kroku teraz to wystarcza (Nowe/W toku dalej żyją na active).
   Nie rozszerzać na inne widoki bez potrzeby.
5. **Oś typu nietknięta** (`TypeFilter`) — szkic trzyma ją w osobnym rzędzie.
6. **Horyzont docelowy (osobny krok/plan):** przebudowa prezentacji z rozwijanej listy na
   poziome taby z licznikami wg szkicu — nie mieszać z krokiem teraz.

## Referencje

- Pliki źródłowe: `EntriesViewSelect.tsx:13-37`, `OperationalSubFilter.tsx:12-19`,
  `ListFilterBar.tsx:95-102`, `list-criteria.ts:20-24,127,152`, `operational-view.ts:15-20`,
  `items.ts` (predykat widoku), `AcceptedItemsView.tsx:48-49,214-221`, `Topbar.astro:16-18`,
  `types.ts:72-79`, `src/pages/items/{active,done,cancelled,trash}.astro`.
- Szkic docelowy: załącznik użytkownika 2026-07-20 (poziomy filtr stanu + pigułki typu).
- Historia: `context/archive/2026-06-20-list-filters-search/` (dodanie podfiltra operacyjnego),
  `context/archive/2026-07-01-session-entries-mode/` (combo zastąpiło zakładki `MainFilterNav`).
- Badanie: odczyty bezpośrednie (bez podagentów-hipotez — dowody rozstrzygające, zgodnie z
  zabezpieczeniem #6 skilla).
