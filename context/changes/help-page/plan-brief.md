# Strona „Pomoc" (`/help`) — Krótki plan

> Pełny plan: `context/changes/help-page/plan.md`
> Brief ramowy: `context/changes/help-page/frame.md`

## Co i dlaczego

Budujemy jedną stronę **„Pomoc"** (`/help`) w powłoce aplikacji. Problem (z ramki, pewność WYSOKA): **brak jednego, odkrywalnego z powłoki miejsca wyjaśniającego jak działa TaskerLight** — łączącego krótką orientację „od czego zacząć" z przeszukiwalną referencją per funkcja, w tym rzeczy, których dziś nikt nie tłumaczy (Odrzuć vs Do kosza, cykl życia, statusy sesji, skąd klucz).

## Punkt wyjścia

Dziś zero punktu wejścia do wiedzy: brak `/help`/`/faq`, brak pozycji w sidebarze, zero tooltipów. Jedyne treści koncepcyjne to landing (tylko niezalogowani) i karta powitalna klucza (tylko przy braku klucza w Skrzynce). Mechanicznie zmiana jest bliźniakiem niedawnego „Kosza" (S-16) — ten sam zestaw drobnych zmian w powłoce.

## Pożądany stan końcowy

Zalogowany użytkownik widzi w stopce sidebara (obok „Ustawień") pozycję „Pomoc". Klik otwiera chronioną stronę ze spisem treści i sekcjami per funkcja; klik pozycji spisu lub wejście na `/help#kosz` przewija do właściwej sekcji. Treść po polsku pokrywa cały przepływ i wprost rozstrzyga realne pułapki. W profilu, przy polu klucza, jest link „Jak zdobyć klucz?".

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Punkt wejścia | Jedna strona `/help` w powłoce | Zero punktu wejścia dziś; zgodny z konwencją SaaS pierwszy krok | Ramka |
| Odbiorca i zakres | Oba cele (start + referencja), pełny przegląd | Nowy na starcie + istniejący przy konkretnej funkcji | Ramka |
| Struktura | Jedna strona + spis treści z kotwicami | Obsługuje oba cele naraz; deep-link służy „utknąłem na X" | Plan |
| Dostęp | Chroniona (tylko zalogowani) | Spójne z powłoką; pomoc opisuje ekrany widoczne po zalogowaniu | Plan |
| Głębokość treści | Zwięzła referencja, priorytet realne luki | Pełny przegląd bez ściany tekstu, najwyższa wartość na zamieszanie | Plan |
| Klucz w profilu | Link „Jak zdobyć klucz?" przy polu | Rozwiązuje lukę (formularz milczy) bez duplikowania instrukcji | Plan |
| Mechanika nav | Klon S-16 „Kosz" | Sprawdzony wzorzec 1:1 (ikona, sidebar, matcher+test, strona) | Plan |

## Zakres

**W zakresie:** ikona „help"; pozycja „Pomoc" w stopce sidebara; matcher aktywnej trasy + test; ochrona `/help` w middleware; strona `/help` (spis treści + 8 sekcji z kotwicami); treść PL; link „Jak zdobyć klucz?" w profilu.

**Poza zakresem:** pomoc kontekstowa (tooltipy, lepsze puste stany, czasowniki przejść na listach — H2); podstrony pomocy; system „prose"/typografii; wyszukiwarka; tłumaczenia; duplikat pełnej instrukcji BYOK w profilu; dokumentacja dla deweloperów.

## Architektura / Podejście

Strona statyczna (czyste Astro, bez wysp React, bez zapytań) renderowana w `AppLayout`, wzorowana na `ByokOnboarding.astro`. Spis treści to lista `<a href="#…">`; sekcje to `<section id="…" class="scroll-mt-24">` z nagłówkami `<h2>`. Ochrona przez wpis `/help` w `PROTECTED_ROUTES` (strona musi zostać SSR — `prerender = false` — inaczej middleware jej nie chroni). Nawigacja: ikona w `Icon.astro`, pozycja w `AppSidebar.astro`, matcher w `nav-active.ts`.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Rusztowanie nawigacji i strony | „Pomoc" klikalna, chroniona, kotwice skaczą (sekcje jeszcze puste) | Kotwice + offset pod sticky-nagłówkiem to nowy wzorzec bez precedensu |
| 2. Treść pomocy (PL) | 8 sekcji wypełnionych treścią, priorytet realne luki | Rozjazd treści z realnym UI; poprawność merytoryczna |
| 3. Wskazówka klucza w profilu | Link „Jak zdobyć klucz?" przy polu klucza | Duplikacja treści — mitygowane: link, nie powtórzony opis |

**Wymagania wstępne:** parent Issue S-17 (`help-page`) istnieje na boardzie; brak zależności od innych zmian; dev server zatrzymany na czas `npm run build`.
**Szacowany nakład pracy:** ~1-2 sesje w 3 fazach (mechanika mała, treść PL to główny czas).

## Otwarte ryzyka i założenia

- Offset kotwic (`scroll-mt-24`) to wartość startowa — do dostrojenia manualnie pod realną wysokość sticky-nagłówka.
- Treść pomocy będzie się starzeć wraz z UI — świadomie zwięzła, by ograniczyć koszt utrzymania (pełne wyliczanie każdego filtra/skrótu poza zakresem).
- Zakłada się stały zestaw `id` sekcji między Fazą 1 a 2 (zmiana rozspójniłaby linki spisu).

## Kryteria sukcesu (podsumowanie)

- Zalogowany dociera do „Pomocy" z sidebara; niezalogowany jest przekierowany na logowanie.
- Deep-link (`/help#klucz`) przewija do sekcji z poprawnym offsetem.
- Treść wprost rozróżnia Odrzuć vs Do kosza i wyjaśnia cykl życia, statusy sesji oraz skąd klucz; profil nie milczy o pochodzeniu klucza.
