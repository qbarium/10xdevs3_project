---
title: "TaskerLight — system wizualny (UI design system)"
status: active
created: 2026-08-03
change: ui-redesign (S-15)
governs: "warstwa wizualna aplikacji — wygląd, powłoka nawigacyjna, tokeny motywu, wzorce komponentów"
relation_to_prd: "PRD opisuje ZACHOWANIE (nienaruszone). Ten dokument opisuje WYGLĄD. Redesign jest prezentacyjny."
source_of_truth: context/foundation/ui-mockup/taskerlight-list.html
---

# System wizualny TaskerLight

## Po co ten dokument

Reguluje **warstwę wizualną** aplikacji: wygląd, powłokę nawigacyjną, tokeny motywu i wzorce komponentów. Jest trwałym prawem dla wszystkich przyszłych zmian UI — analogicznie jak `tech-stack.md` reguluje wybory technologiczne.

Podział odpowiedzialności:

- **`prd.md`** — co aplikacja robi (zachowanie, przepływy, stany). Redesign go **nie zmienia**.
- **ten dokument** — jak aplikacja wygląda.
- **`context/changes/ui-redesign/`** — jak przeprowadzamy tę jedną zmianę (plan fazowy, postęp).

Źródło prawdy wizualnej: **`context/foundation/ui-mockup/taskerlight-list.html`** (makieta przygotowana poza projektem; ten dokument przenosi jej ustalenia do kanonu i wiąże je z kodem).

## Zakres decyzji (uzgodnione 2026-08-03)

1. **Multi-page** — powłokę odtwarzamy w Astro; aktywny widok wynika z adresu strony. Bez SPA.
2. **Jeden wariant: „techniczny", w dwóch motywach — jasnym i ciemnym**, z przełącznikiem. Pozostałych 5 presetów makiety (miękki / brutal / terminal / neon) ani przełącznika stylu **nie** robimy.
3. **Bez metadanych przyszłości** (priorytet, termin, tagi) — bez przełącznika i banera. **Bez „pewności %"** w widoku „Do akceptacji".
4. **Wszystkie widoki.** Widoki nieobecne w makiecie **wnioskujemy z jej języka** (spójność tokenów, powłoki, wzorców).
5. **Wygląd reguluje ten dokument, nie PRD** — bo zachowanie się nie zmienia.

## Wariant „techniczny" — charakter

- **Font UI:** IBM Plex Sans (self-hosted, bez zewnętrznego CDN — CSP Cloudflare).
- **Font metadanych:** monospace (daty, identyfikatory sesji, liczniki, paginacja).
- **Kształt:** ostre, małe zaokrąglenia (3–5 px), nie „miękkie".
- **Gęstość:** zwarte wiersze (mniejszy padding, mniejszy odstęp).
- **Chipy typu:** WERSALIKI, drobne (~10 px), z odstępem liter, ostre rogi (~3 px).
- Wariant „techniczny" **nie zmienia palety** — używa bazowych tokenów jasny/ciemny (poniżej). To warstwa typografii i kształtu nałożona na paletę.

## Tokeny motywu

Realizacja: Tailwind 4 (`@theme`) + zmienne CSS w `src/styles/global.css`; motyw ciemny przez klasę `.dark` na `<html>` + przełącznik. Semantyka zgodna z shadcn/ui (`--background`, `--card`, `--muted-foreground`, …). Wartości poniżej są kanoniczną transkrypcją z makiety.

### Paleta bazowa

| rola                     | jasny     | ciemny                 |
| ------------------------ | --------- | ---------------------- |
| tło (`bg`)               | `#FFFFFF` | `#0E1014`              |
| powierzchnia (`surface`) | `#FFFFFF` | `#16191F`              |
| powierzchnia-2           | `#FAFBFC` | `#121419`              |
| tekst                    | `#14161B` | `#ECEEF2`              |
| tekst-2                  | `#565E6E` | `#9AA2B0`              |
| tekst-3                  | `#8A93A2` | `#69707E`              |
| obramowanie              | `#E8EBEF` | `rgba(255,255,255,.09)`|
| obramowanie-2            | `#D6DBE2` | `rgba(255,255,255,.16)`|
| hover                    | `#F4F6F8` | `rgba(255,255,255,.05)`|
| active                   | `#ECEFF3` | `rgba(255,255,255,.09)`|
| akcent                   | `#14161B` | `#ECEEF2`              |
| akcent-tekst             | `#FFFFFF` | `#16191F`              |

### Kolory per typ (grzbień + chip)

| typ      | jasny (tekst / tło / linia)          | ciemny (tekst / tło / linia)                    |
| -------- | ------------------------------------ | ----------------------------------------------- |
| task     | `#1F5FD0` / `#EAF1FD` / `#3B7CE0`     | `#7FB0EE` / `rgba(59,124,224,.18)` / `#5C97E0`   |
| note     | `#157A45` / `#E6F6EC` / `#1F9B58`     | `#6FC58E` / `rgba(31,155,88,.18)` / `#46B06F`    |
| idea     | `#966A0C` / `#FBF1D9` / `#C99211`     | `#E0B45E` / `rgba(201,146,17,.20)` / `#CFA24A`   |
| decision | `#5B37B5` / `#F1EBFB` / `#7B53D6`     | `#B49AEC` / `rgba(123,83,214,.22)` / `#9C82DC`   |
| other    | `#515B6B` / `#EEF1F5` / `#8A93A2`     | `#9AA2B0` / `rgba(138,147,162,.16)` / `#69707E`  |

Stan operacyjny: „zrealizowane" — zielony (`#157A45` / ciemny `#6FC58E`); „w realizacji" — niebieski (`#1F5FD0` / `#7FB0EE`).

## Powłoka nawigacyjna (architektura informacji)

Trwała powłoka owija wszystkie chronione strony. Dziś **nie istnieje**: `Layout.astro` to baner + treść, a nawigacja to ręcznie wstawiany `Topbar.astro`. To największa strukturalna zmiana redesignu.

- **Sidebar** (stały, zwężany do ikon na wąskich ekranach): marka; przycisk główny „Skrzynka wejściowa"; grupa **Przepływ** → „Do akceptacji" (z licznikiem); grupa **Biblioteka** → „Wpisy", „Sesje importu", „Dziennik" (nieaktywny, „wkrótce"); stopka → „Ustawienia" + konto ze statusem klucza.
- **Topbar:** tytuł + podtytuł strony, szukajka, akcja główna (np. „Dodaj wpis"), **przełącznik motywu (jasny/ciemny)**.
- **Zakładki zakresu:** Aktywne / Zakończone / Anulowane / Kosz — z licznikami.
- **Toolbar:** segmentowy filtr typu (Wszystkie / Zadania / Notatki / Pomysły / Decyzje / Inne) + „Sortuj".
- **Multi-page:** aktywny stan liczony z `Astro.url.pathname`; przełączanie widoków = nawigacja pod adresami, nie stan React.

Mapowanie sidebara na trasy: Skrzynka → `/ingest`; Do akceptacji → `/items`; Wpisy → `/items/active` (+ zakładki zakresu do `/items/done|cancelled|trash`); Sesje → `/import-sessions`; Ustawienia/konto → `/profile`.

## Wzorce komponentów

- **Wiersz wpisu:** kolorowy grzbień per typ + chip typu (WERSALIKI) + tytuł + opis + meta (badge stanu operacyjnego, źródło sesji, data) + akcje. „Zrealizowane" — przygaszony tytuł; „anulowane" — przekreślony.
- **Wiersz „Do akceptacji":** checkbox + chip + tytuł + opis + źródło; akcje Edytuj / Odrzuć / Zatwierdź; pasek „Zaznacz wszystkie" + zbiorcze Zatwierdź / Odrzuć. **Bez „pewności %".**
- **Karta sesji importu:** status (grzbień + badge) + źródło + data + liczba wpisów; akcje „Ponów" (dla niepowodzenia) / „Pokaż wpisy"; paginacja (na stronę + skok do strony).
- **Skrzynka:** pole tekstowe + licznik znaków + strefa upuszczania `.txt`/`.md` + „Klasyfikuj"; overlay klasyfikacji (spinner → sukces → „Przejdź do akceptacji").
- **Stany puste** i **paginacja** w jednolitym stylu.

## Widoki do wywnioskowania (brak w makiecie)

Makieta pokrywa: Wpisy (4 zakresy), Skrzynka, Do akceptacji, Sesje importu. W tym samym języku dorabiamy:

- **Profil / klucz BYOK** (cel „Ustawienia" z sidebara).
- **Tryb „Pokaż wpisy" sesji** (baner kontekstu sesji — S-13).
- **Dialogi** Dodaj wpis / Edytuj wpis.
- **Modal klasyfikacji** — 4 stany wg FR-006 (trwa / z itemami / bez itemów / błąd).
- **Strony auth** (logowanie, rejestracja, potwierdzenie e-mail) i **landing**.

Reguła: brakujący widok = **wywnioskuj z istniejących** (te same tokeny, ta sama powłoka, te same wzorce).

## Nienaruszalne kontrakty (żeby testy przeszły)

Redesign jest **prezentacyjny**. Zachowujemy uchwyty, o które kotwiczą się testy:

- role ARIA i dostępne nazwy kontrolek,
- teksty akcji („Zatwierdź", „Odrzuć", „Edytuj", „Do kosza", „Przywróć", …),
- `data-item-id` na karcie wpisu, tytuł wpisu jako `<h3>`,
- etykiety widoków („Aktywne", „Zakończone", „Anulowane", „Kosz", „Do akceptacji").

Podstawa: `test-plan.md` — E2E asertuje **funkcję przez DOM** (obecność wpisu), nie wygląd. Dopóki uchwyty zostają, testy przechodzą; zmiana uchwytu = już nie „tylko wygląd".

## Realizacja techniczna (kierunek)

- **Tailwind 4** (`@theme`) + **shadcn/ui** (new-york). Sidebar: shadcn ma gotowy wzorzec, a `global.css` ma już rodzinę tokenów `--sidebar-*`.
- **Fonty lokalnie** (IBM Plex Sans + monospace) — bez zewnętrznego CDN.
- **Motyw:** usunąć twardy `color-scheme: dark` z `Layout.astro`; klasa `.dark` na `<html>` + przełącznik; kolory z tokenów.
- **Migracja kolorów:** dzisiejsze komponenty mają zaszyte `bg-white/5`, `text-white/70`, `purple-*` (glassmorphism „cosmic") — przełożyć na semantyczne tokeny. To rozproszona, najżmudniejsza część.
- **Nośnik pracy:** gałąź `feature/ui-redesign`, fazy sekwencyjnie, jeden PR na końcu.
