# Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna — Krótki plan

> Pełny plan: `context/changes/ui-redesign/plan.md`
> Badania: `context/changes/ui-redesign/research.md`
> Prawo wizualne: `context/foundation/ui-design-system.md` · Źródło prawdy: `context/foundation/ui-mockup/taskerlight-list.html`

## Co i dlaczego

Przeprojektowujemy warstwę wizualną TaskerLight do wariantu „technicznego" (IBM Plex Sans, ostre małe zaokrąglenia, gęste wiersze, kolorowy grzbień + chip per typ) w dwóch motywach — jasnym i ciemnym z przełącznikiem — i wprowadzamy trwałą powłokę (sidebar + topbar). Zmiana jest **czysto prezentacyjna**: zachowanie aplikacji zostaje nietknięte. Motywacja: dzisiejszy interfejs to zaszyty na sztywno „cosmic" bez spójnego systemu i bez powłoki.

## Punkt wyjścia

Ciemny wygląd dziś nie pochodzi z motywu, tylko z zaszytego gradientu (`bg-cosmic`) i ręcznie malowanych bieli/fioletów — ~171 wystąpień w 47 plikach. Pełna paleta jasny/ciemny (łącznie z tokenami sidebara) **już istnieje** w `global.css`, ale klasa `.dark` nigdy nie trafia do DOM i nie ma przełącznika. Powłoki nie ma: jeden layout (baner + treść) i ręczny pasek linków skopiowany w 8 stronach. Wszystkie trasy i widoki już istnieją.

## Pożądany stan końcowy

Spójny, przeprojektowany interfejs w dwóch motywach z przełącznikiem (bez mignięcia przy wejściu), owinięty stałą powłoką z podświetleniem aktywnej strony. Wszystkie widoki — także spoza makiety (profil/BYOK, tryb „Pokaż wpisy", dialogi, modal, auth, landing) — mówią jednym językiem. Testy przechodzą bez zmian.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Kolejność pracy | Najpierw fundament (motyw + powłoka), potem migracja widok po widoku | Fundament raz; każdą kolejną fazę widać od razu na żywym motywie | Plan |
| Sidebar | Gotowy blok shadcn (`sidebar`) | Solidna baza (a11y, zwijanie, szuflada); nie blokuje przyszłych motywów — te żyją w tokenach | Plan |
| Landing + auth | Pełny restyle, wywnioskowany z makiety | Zgodne z decyzją „wszystkie widoki"; brak „wyspy starego stylu" po jednym PR | Plan |
| Chipy + zakładki | `badge` z shadcn; zakładki jako stylowane linki | Zakres = trasa (multi-page), więc linki, nie interaktywny `tabs`; reużycie `state-filter.ts` | Plan |
| Fonty | IBM Plex Sans + Mono przez Fontsource (self-host, pre-subset latin-ext) | Zero CDN (CSP Cloudflare); latin-ext = pewne polskie znaki; brak ręcznego subsettingu | Plan |
| Trwałość motywu | Cookie czytane serwerowo | No-flash od pierwszego bajtu; wzorzec repo (`page-size-pref`) i zgodny z cookie sidebara shadcn | Plan / Badania |

## Zakres

**W zakresie:** motyw jasny/ciemny + przełącznik; powłoka (sidebar + topbar) na 8 stronach; migracja ~171 zaszytych kolorów na tokeny; wariant „tech" (typografia + kształt); wszystkie widoki, w tym landing i auth; self-host fontów.

**Poza zakresem:** przełącznik stylu i 5 dodatkowych presetów; metadane przyszłości (priorytet/termin/tagi + przełącznik + baner); „pewność %"; ID źródła sesji na wierszu wpisu; nowe trasy/widoki; jakiekolwiek zmiany zachowania; fonty z CDN.

## Architektura / Podejście

Motyw = tokeny CSS na `<html>`: klasa `.dark` sterowana wyspą-przełącznikiem, wybór w cookie czytanym serwerowo (no-flash). Powłoka = blok shadcn `sidebar` + topbar w nowym `AppLayout.astro`, owijającym 8 stron chronionych; aktywny stan liczony z adresu. Migracja korzysta z 4 powtarzalnych wzorców (kontrolka-pigułka, powłoka strony, trio widoków, trio kart auth) — wspólny helper/wariant, potem hurtem. Nienaruszalne: 5 twardych kontraktów DOM (m.in. tytuł jako `<h3>`, karta `<article data-item-id>`, dokładne nazwy przycisków) + zamrożone stringi (`labels.test`, `state-filter.test`). **Zasada odwzorowania:** układ i pozycje kontrolek idą za makietą (nie tylko kolory), ale o tym, które elementy/dane są na ekranie, decyduje realna aplikacja — nie próbki z makiety. Konkret dla wiersza wpisu: dodajemy datę utworzenia i ostatniej modyfikacji (pola już na kliencie), **bez** ID źródła sesji; badge stanu zostaje tam, gdzie wpis ma stan operacyjny (zadania).

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Fundament: motyw + fonty | Działający przełącznik (no-flash), tokeny per typ, self-host fontów | Kolejność no-flash; pozyskanie plików fontów (binarne, OFL) |
| 2. Powłoka nawigacyjna | Sidebar + topbar na 8 stronach, `badge` | Podwójny React (przypięcie podpakietów), alias hooków |
| 3. Wpisy: lista, zakładki, karta | Największa migracja + zakładki jako linki | Regresja 5 kontraktów testów |
| 4. Do akceptacji (triage) | Pasek zbiorczy + wiersz; bez „pewności %" | Zachowanie reconcile (item znika) |
| 5. Skrzynka + klasyfikacja + Profil | Wsad, modal (4 stany), BYOK, klucz | Dostępne nazwy pod E2E |
| 6. Sesje + tryb „Pokaż wpisy" | Karty sesji + baner kontekstu, pager | Deep-link `?session=`; dup-React na `/import-sessions` |
| 7. Landing + auth (pełny restyle) | Hero bez „cosmic", karty auth | Widoki poza makietą (projektowanie z głowy) |
| 8. Sprzątanie + weryfikacja | Usunięcie `bg-cosmic`, grep, pełne bramki, jeden PR | Resztkowe zaszyte kolory |

**Wymagania wstępne:** gałąź `feature/ui-redesign` (jest); pliki fontów IBM Plex (do potwierdzenia w Fazie 1); wszystkie poprzednie slice'y done.
**Szacowany nakład pracy:** duża, przekrojowa zmiana — ~8 faz, orientacyjnie kilka–kilkanaście sesji (najcięższe: Faza 3 migracja + testy, Faza 2 powłoka + depy).

## Otwarte ryzyka i założenia

- **Pliki fontów** — zakładamy self-host z oficjalnego wydania IBM Plex (OFL); pozyskanie binarek wymaga zgody użytkownika (Faza 1).
- **Blok shadcn sidebar** dociąga podpakiety radix — jednorazowy narzut przypięcia pod dup-React; ryzyko cichej regresji, jeśli pominięte (weryfikacja zimnym startem).
- **Widoki poza makietą** (profil, landing, auth, tryb sesji) — wywnioskowane z języka makiety; możliwe drobne iteracje wyglądu przy bramkach ręcznych.
- **Jeden PR na końcu** — brak merge per faza; regresję łapiemy bramkami ręcznymi i E2E po fazach dotykających kontraktów.

## Kryteria sukcesu (podsumowanie)

- Każdy widok wygląda zgodnie z makietą w **obu** motywach; przełącznik działa wszędzie bez mignięcia.
- Wszystkie testy (unit + E2E) przechodzą bez modyfikacji uchwytów; zachowanie nietknięte.
- Zero zaszytych kolorów i zero `bg-cosmic` po Fazie 8 (grep czysty).
