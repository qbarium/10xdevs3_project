# Frame Brief: Pomoc dla użytkownika w aplikacji

> Etap ramowania przed /10x-plan. Oddziela to, co _faktycznie_ jest problemem, od tego, co początkowo zakładano.

## Zgłoszona obserwacja

TaskerLight nie ma w aplikacji żadnego punktu wejścia do „jak to działa" — użytkownik (nowy i istniejący) nie ma gdzie sprawdzić działania programu: skrzynka → klasyfikacja → akceptacja, cykl życia, Kosz, sesje importu, klucz BYOK.

## Początkowe ramy (zachowane)

- **Podana przyczyna / podejście**: brakuje osobnej **strony „Pomoc"** (statyczny opis funkcji) — dodać ją i podlinkować w sidebarze.
- **Proponowany kierunek**: zbudować stronę `/help` przez łańcuch 10x.
- **Zawężenie przed wysyłką (Step 1.5)**: odbiorca = **oba równorzędnie** (nowy na starcie + istniejący przy konkretnej funkcji); luka = **zero jakiejkolwiek pomocy**; zakres = **pełny przegląd funkcji**.

## Mapa wymiarów

1. **Punkt wejścia do wiedzy** — brak miejsca „Pomoc". ← ramy użytkownika
2. **Samoobjaśnialność w kontekście** — pomoc przy akcjach (puste stany, klasyfikacja, pending).
3. **Orientacja pierwszego uruchomienia** — pierwsza sesja (co to jest, od czego zacząć).
4. **Pokrycie / rozproszenie** — czy pomoc już częściowo istnieje i chodzi o konsolidację.

## Badanie hipotez

| Hipoteza                                        | Dowody                                                                                                                                                                                                                                          | Werdykt                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| H1: Brak punktu wejścia do wiedzy (ramy usera)  | Brak `/help`,`/pomoc`,`/about`,`/faq`; brak pozycji w sidebarze (`AppSidebar.astro:40-127`); brak onboardingu/tour/modalu. Jedyne treści koncepcyjne: `Welcome.astro:71-74` (tylko niezalogowani) + `ByokOnboarding.astro` (tylko BYOK, do zapisu klucza) | **SILNE**                                |
| H2: Samoobjaśnialność w kontekście              | Realne luki: „Odrzuć" vs „Usuń" nigdzie nie wyjaśnione (`labels.ts:44-47`); czasowniki przejść cyklu życia w kodzie, ale na listach read-only (`operational-transitions.ts:14-27`, `ItemCard.tsx:213`); statusy sesji bez legendy (`labels.ts:49-54`); skąd klucz — brak na `/profile`; **zero tooltipów** | SILNE — ale to **inny problem** niż „brak pomocy" |
| H3: Orientacja pierwszego uruchomienia          | Puste stany „Brak…" bez kierunku (wyjątek `SessionsList.tsx:43`); brak welcome/onboardingu po zalogowaniu                                                                                                                                       | CZĘŚCIOWE (podzbiór H1)                  |
| H4: Pokrycie już istnieje / konsolidacja        | Pomoc rozproszona w podtytułach + mikrokopii przycisków; to fragmenty UI, nie „pomoc", której brakuje całości — nie ma czego konsolidować                                                                                                        | SŁABE                                    |

## Sygnały zawężające

- Użytkownik: luka = „zero jakiejkolwiek pomocy" → włącza H1, spycha H2 do osobnego tematu.
- Użytkownik: odbiorca „oba", zakres „pełny przegląd" → strona musi łączyć **orientację** (start) z **referencją** (per funkcja).
- Dowód twardy: 0 osobnej strony pomocy + 0 tooltipów → H1 potwierdzone bez wątpliwości.

## Konwencja między systemami

Standard aplikacji SaaS: osobna, dostępna z powłoki strona/sekcja pomocy („jak to działa") jako referencja, uzupełniana pomocą kontekstową. TaskerLight nie ma ani jednego, ani drugiego. Dodanie strony-referencji to **zgodny z konwencją pierwszy krok**; pomoc kontekstowa to osobne, późniejsze wzmocnienie.

## Przeformułowane (potwierdzone) sformułowanie problemu

> **Rzeczywisty problem do zaplanowania**: brak jednego, **odkrywalnego z powłoki miejsca wyjaśniającego jak działa TaskerLight** — łączącego krótką orientację „od czego zacząć" z przeszukiwalną referencją per funkcja, w tym punktów, których dziś nikt nie tłumaczy (Odrzuć vs Usuń, cykl życia, statusy sesji, skąd klucz).

Początkowe ramy **się utrzymały** — strona „Pomoc" to właściwa rzecz do zaplanowania; dowody ją potwierdzają (zero punktu wejścia). Dwa wyostrzenia dla planu: (1) strona obsługuje **oba cele naraz** → struktura „Jak zacząć" + sekcje per funkcja z **kotwicami** (deep-link, by służyła też „utknąłem na X"); (2) najwyższa wartość treści to **realne luki z inwentaryzacji**, nie generyczny spis funkcji.

## Pewność

**WYSOKA** — silne dowody (zero punktu wejścia, zero tooltipów), zgodność z konwencją, decydujące zawężenie od użytkownika (luka = „zero pomocy").

## Co zmienia się dla /10x-plan

Plan buduje **jedną stronę pomocy** (trasa `/help` + pozycja „Pomoc" w powłoce + treść) obsługującą **orientację i referencję**, z kotwicami per sekcja, plus **małą instrukcję „skąd wziąć klucz" na `/profile`** (decyzja użytkownika — jedyny fragment pomocy kontekstowej wciągnięty do zakresu, bo mocno powiązany z „Jak zacząć"). Treść priorytetowo pokrywa realne punkty zamieszania z inwentaryzacji (Odrzuć vs Usuń, cykl życia, statusy sesji, skąd klucz).

**Poza zakresem tej zmiany** (jawnie): pozostała pomoc kontekstowa — tooltipy, lepsze puste stany, wyciągnięcie czasowników przejść cyklu życia na listy (H2). Osobny, większy follow-up UX; wart wzmianki, by nie udawać, że strona rozwiązuje zamieszanie „w locie".

**Śledzenie (decyzja użytkownika)**: jako slice **S-17** (`help-page`) na roadmapie — parent Issue + karta na boardzie; sub-issue faz powstaną z `/10x-plan`. (Numer S-17 do potwierdzenia jako pierwszy wolny.)

## Referencje

- Pliki źródłowe: `AppSidebar.astro:40-127` (brak pozycji „Pomoc"), `Welcome.astro:71-74`, `ByokOnboarding.astro`, `labels.ts:44-54`, `operational-transitions.ts:14-27`, `ItemCard.tsx:213`, `SessionsList.tsx:43`, `state-filter.ts:41-52`
- Zadanie badawcze: TaskCreate #7 (inwentaryzacja pomocy w aplikacji)
