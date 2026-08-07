# Strona „Pomoc" (`/help`) — Plan implementacji

## Przegląd

Dodajemy jedną stronę **„Pomoc"** (`/help`) dostępną ze stopki sidebara, która po polsku tłumaczy jak działa TaskerLight — łącząc krótką orientację „od czego zacząć" z przeszukiwalną referencją per funkcja, z **kotwicami do deep-linku** (`/help#kosz`). Treść priorytetowo pokrywa realne punkty zamieszania (Odrzuć vs Do kosza, cykl życia wpisu, statusy sesji, skąd klucz). Dodatkowo w profilu, przy polu klucza API, pojawia się link **„Jak zdobyć klucz?"** — jedyny fragment pomocy kontekstowej wciągnięty do zakresu, bo mocno powiązany z „Jak zacząć".

Mechanicznie strona to bliźniak zmiany S-16 „Kosz" (`trash-sidebar-relocation`): nowa ikona, pozycja w sidebarze, matcher aktywnej trasy z testem, nowa strona `.astro`. Sedno pracy to **treść po polsku**, nie hydraulika.

## Analiza stanu obecnego

- **Zero punktu wejścia do wiedzy.** Brak `/help`/`/pomoc`/`/faq`, brak pozycji w sidebarze, brak onboardingu/tour, zero tooltipów. Jedyne treści koncepcyjne to landing `Welcome.astro` (tylko niezalogowani) i karta powitalna `ByokOnboarding.astro` (tylko przy braku klucza w Skrzynce). Potwierdzone w `frame.md` (pewność WYSOKA).
- **Wzorzec nawigacji gotowy 1:1.** Zarchiwizowany plan S-16 (`context/archive/2026-08-06-trash-sidebar-relocation/plan.md`, Faza 1) rozpisuje dokładnie ten sam zestaw zmian plik-po-pliku. Pliki powłoki: `src/components/shell/{Icon.astro, AppSidebar.astro, nav-active.ts, nav-active.test.ts}`.
- **Powłoka: `AppLayout.astro`** przyjmuje `title` / `subtitle` / `fill` i renderuje tytuł jako `<h1>` w **sticky** nagłówku (`:79-85`); treść idzie w `<main>` ze slotem, przy `fill=false` (domyślnie) `<main>` sam scrolluje z paddingiem `px-6 py-6`. Dane powłoki (licznik pendingów, niepusty Kosz, status klucza) liczy sam `AppLayout` — strona ich nie dostarcza.
- **Wzorzec statycznej treści = `ByokOnboarding.astro`** (czyste Astro, kontener `mx-auto w-full max-w-2xl`, karta `bg-card rounded-xl border p-6 shadow-sm`, nagłówki/akapity/listy z tokenów Tailwind/shadcn).
- **Brak systemu prose, TOC i kotwic** — grep potwierdza zero `prose`, zero `@tailwindcss/typography`, zero `href="#…"`/`scroll-mt`. Wszystkie `id=` w repo to pola formularzy. Spis treści + kotwice + offset pod sticky-nagłówek to **nowy wzorzec bez precedensu**.
- **Ochrona tras: `src/middleware.ts`** — `PROTECTED_ROUTES = ["/profile", "/ingest", "/items", "/import-sessions"]`, dopasowanie `pathname.startsWith(route)`. Model odwrotny: chronione jest tylko to, co pasuje; reszta publiczna. Kosz był chroniony „za darmo" (prefiks `/items`); `/help` to trasa top-level i wymaga **jawnego** wpisu.
- **Brak gotowej ikony „pomoc".** `Icon.astro` egzekwuje unię `IconName` (dodanie ikony bez rozszerzenia typu = błąd TS) i trzyma ręcznie wpisane `<path>`. Dostępne: `layers, tray, inbox, history, book, settings, log-out, trash, trash-full` — żadna nie pasuje.
- **Klucz API:** stałe w `src/lib/config/byok.ts` — `AI_PROVIDER_NAME` = „OpenAI", `AI_PROVIDER_KEYS_URL` = `https://platform.openai.com/api-keys`. Formularz w `src/components/profile/ApiKeyManager.tsx` (label „Klucz API OpenAI", input `sk-…`) **nie mówi, skąd klucz wziąć**.

## Pożądany stan końcowy

Zalogowany użytkownik widzi w stopce sidebara (obok „Ustawień") pozycję **„Pomoc"** z ikoną. Klik prowadzi do `/help` — chronionej strony w powłoce, z tytułem „Pomoc" w nagłówku, spisem treści na górze i sekcjami per funkcja. Klik pozycji spisu (lub wejście na `/help#kosz`) przewija do właściwej sekcji, której nagłówek **nie chowa się** pod sticky-nagłówkiem. Treść po polsku pokrywa cały przepływ i wprost rozstrzyga realne pułapki. W profilu, przy polu klucza, widnieje link „Jak zdobyć klucz?" prowadzący do OpenAI.

Weryfikacja: nowy test `nav-active` przechodzi; niezalogowany na `/help` trafia na `/auth/signin`; kotwice skaczą z poprawnym offsetem; `npm run lint`, `tsc --noEmit`, `npm run build` zielone.

### Kluczowe odkrycia

- Wzorzec pozycji nav w stopce — `AppSidebar.astro:113-121` („Ustawienia"): `<a href>` + `aria-label` + `class:list={[navLayout, active === "…" ? navOn : navIdle]}` + `aria-current` + `<Icon icon="…" size={17} class="shrink-0" />` + `<span class:list={[label]}>…</span>`.
- Matcher — `nav-active.ts` `NAV_MATCHERS` (`:22-29`); `settings` używa `prefix` na `/profile` (`:28`). `/help` nie koliduje z żadnym prefiksem → kolejność w tablicy dowolna.
- Test — `nav-active.test.ts` blok mapowań (`:20-24`) + osobna asercja jak dla Kosza (`:16-18`).
- Ikona — `Icon.astro` unia typów (`:7`) + bloki `{ icon === "…" && (<Fragment>…</Fragment>) }` (`:31-108`), `viewBox="0 0 24 24"`, `stroke="currentColor"`.
- Ochrona — `middleware.ts:6` (lista) + `:28` (startsWith).
- **`/help` musi zostać SSR (`export const prerender = false`)** — inaczej przy `output:"server"` staje się artefaktem build-time i middleware jej nie chroni (żadna strona w repo nie ma `prerender = true`).

## Czego NIE robimy

- **Pozostała pomoc kontekstowa** — tooltipy, lepsze puste stany, wyciągnięcie czasowników przejść cyklu życia na listy (hipoteza H2 z ramki). Osobny, większy follow-up UX.
- **Podstrony pomocy** (`/help/kosz` itd.) — świadomie jedna strona.
- **System „prose" / `@tailwindcss/typography`** — typografia składana ręcznie z istniejących tokenów, jak w `ByokOnboarding.astro`.
- **Wyszukiwarka w pomocy**, wersjonowanie treści, tłumaczenia (tylko PL).
- **Duplikat pełnej instrukcji BYOK w profilu** — w profilu tylko zwięzły link; pełny opis żyje w `ByokOnboarding.astro` i w sekcji `#klucz` na `/help`.
- **Dokumentacja dla deweloperów/agentów** (`README`, `AGENTS.md`) — inny odbiorca.

## Podejście do implementacji

Trzy fazy o rosnącej „miękkości" weryfikacji:

1. **Rusztowanie nawigacji i strony** — czysta mechanika (klon S-16) + szkielet strony ze spisem treści i pustymi sekcjami z kotwicami. Weryfikacja w większości automatyczna (test, typy, ochrona). Po tej fazie „Pomoc" jest klikalna, chroniona, kotwice skaczą — sekcje jeszcze bez treści.
2. **Treść pomocy (PL)** — wypełnienie sekcji realną treścią z inwentaryzacji domenowej. Weryfikacja głównie merytoryczna (człowiek czyta).
3. **Wskazówka klucza w profilu** — jeden link w `ApiKeyManager.tsx`. Mała, izolowana zmiana w innym obszarze (React, nie Astro).

## Krytyczne szczegóły implementacji

- **Specyfikacja UX — offset kotwic pod sticky-nagłówkiem.** Nagłówek `AppLayout` jest `sticky` (`:79`). Bez korekty kotwica przewinie sekcję tak, że jej nagłówek schowa się pod nim. Każda sekcja-cel musi mieć `scroll-mt-*` równe wysokości sticky-nagłówka (start: `scroll-mt-24`, **dostroić manualnie** do realnej wysokości). To jedyny nieoczywisty element — reszta to istniejące wzorce.
- **Sekwencjonowanie kotwic vs treść.** Kotwice (Faza 1) wymagają, by `id` sekcji istniały już w szkielecie — spis treści linkuje do nich, zanim Faza 2 doda treść. Trzymaj stały zestaw `id` między fazami: zmiana `id` w Fazie 2 rozspójni linki spisu.

---

## Faza 1: Rusztowanie nawigacji i strony

### Przegląd

Nowa ikona „help", pozycja „Pomoc" w stopce sidebara, matcher aktywnej trasy z testem, ochrona `/help` w middleware oraz nowa strona `help.astro` ze spisem treści i szkieletem sekcji (nagłówki + `id` + `scroll-mt`, treść jako placeholder).

### Wymagane zmiany

#### 1. Wariant ikony „help"

**Plik**: `src/components/shell/Icon.astro`

**Cel**: Dodać jeden wariant ikony reprezentujący pomoc (znak zapytania w kole), spójny stylistycznie z resztą (stroke, `viewBox 0 0 24 24`).

**Kontrakt**: Rozszerzyć unię `IconName` (`:7`) o `"help"`. Dopisać blok warunkowy w stylu istniejących. Ścieżki transkrybowane z lucide `circle-help` (nie importować z `lucide-react`):

```astro
{
  icon === "help" && (
    <Fragment>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </Fragment>
  )
}
```

#### 2. Pozycja „Pomoc" w stopce sidebara

**Plik**: `src/components/shell/AppSidebar.astro`

**Cel**: Dodać odnośnik „Pomoc" → `/help` w bloku stopki/utility nav (`:112-144`), tuż przy „Ustawieniach" — nie w grupie „Biblioteka". Bez zmian w `Props` (pozycja statyczna, brak stanu/licznika).

**Kontrakt**: Nowy `<a>` wg wzorca „Ustawienia" (`:113-121`): `href="/help"`, `aria-label="Pomoc"`, `class:list={[navLayout, active === "help" ? navOn : navIdle]}`, `aria-current={active === "help" ? "page" : undefined}`, `<Icon icon="help" size={17} class="shrink-0" />`, `<span class:list={[label]}>Pomoc</span>`. Etykieta PL + trasa EN — jak `/profile`→„Ustawienia".

#### 3. Matcher aktywnej trasy

**Plik**: `src/components/shell/nav-active.ts`

**Cel**: Sprawić, by `activeNavId("/help")` (i `/help#…`) zwracało `"help"`, żeby pozycja się podświetlała.

**Kontrakt**: Dodać do `NAV_MATCHERS` (`:22-29`) wpis `{ id: "help", match: { type: "prefix", path: "/help" } }`. `prefix` (nie `exact`) — na wypadek przyszłych podścieżek; brak kolizji z `/items*`, więc pozycja w tablicy obojętna.

#### 4. Test matchera

**Plik**: `src/components/shell/nav-active.test.ts`

**Cel**: Zabezpieczyć mapowanie `/help` → `"help"` (i brak regresji dla tras „poza powłoką → null").

**Kontrakt**: Dodać asercję `expect(activeNavId("/help")).toBe("help")` do bloku mapowań (`:20-24`) — analogicznie do wpisu Kosza (`:16-18`).

#### 5. Ochrona trasy `/help`

**Plik**: `src/middleware.ts`

**Cel**: Uczynić `/help` dostępną tylko dla zalogowanych (redirect na `/auth/signin` dla gościa) — spójnie z resztą powłoki.

**Kontrakt**: Dopisać `"/help"` do `PROTECTED_ROUTES` (`:6`). Dopasowanie `startsWith` już obejmie `/help` i ewentualne podścieżki. Jeśli istnieje `src/middleware.test.ts` z asercjami na chronione trasy — dopisać `/help`.

#### 6. Nowa strona `help.astro` (szkielet)

**Plik**: `src/pages/help.astro` (NOWY)

**Cel**: Strona w powłoce ze spisem treści i szkieletem sekcji. W tej fazie sekcje mają nagłówki + `id` + `scroll-mt`, ale treść to placeholder (np. „— wkrótce —") — wypełnia ją Faza 2.

**Kontrakt**:
- `export const prerender = false` (SSR — warunek ochrony). Brak zapytań do bazy, brak wysp React. **Żadnego top-level `return`** we frontmatterze (redirecty należą do middleware).
- `<AppLayout title="Pomoc" subtitle="Jak działa TaskerLight — krok po kroku i funkcja po funkcji">`.
- Kontener treści wg wzorca `ByokOnboarding.astro` (`mx-auto w-full max-w-2xl`, ewentualnie szerszy dla dłuższej treści).
- **Spis treści** na górze: lista `<a href="#…">` do sekcji.
- **Sekcje** jako `<section id="…" class="scroll-mt-24">` z nagłówkiem `<h2>` (treść zaczyna od `<h2>`, bo `<h1>` zajmuje nagłówek powłoki). Kanoniczny zestaw `id` (stały między fazami): `start`, `przeplyw`, `cykl-zycia`, `stany`, `kosz`, `sesje`, `klucz`, `typy`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Sprawdzanie typów przechodzi: `tsc --noEmit` (rozszerzona unia `IconName`, brak błędów w `.astro`)
- Test nav-active przechodzi (z nową asercją `/help`): `npm test`
- Produkcyjny build przechodzi: `npm run build`

#### Weryfikacja ręczna

- „Pomoc" widoczna w stopce sidebara obok „Ustawień", z ikoną znaku zapytania
- Klik „Pomoc" prowadzi do `/help`, a pozycja jest podświetlona (`aria-current="page"`)
- Wejście na `/help` jako niezalogowany przekierowuje na `/auth/signin`
- Spis treści widoczny; klik pozycji przewija do sekcji, a jej nagłówek **nie chowa się** pod sticky-nagłówkiem (dostroić `scroll-mt`, jeśli trzeba)
- Wejście bezpośrednio na `/help#klucz` przewija do sekcji klucza

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie (szczególnie offset kotwic) przed Fazą 2.

---

## Faza 2: Treść pomocy (PL)

### Przegląd

Wypełnienie sekcji szkieletu realną treścią po polsku. Zwięzła referencja z priorytetem na realne luki. Źródło treści: inwentaryzacja domenowa (poniżej) — treść musi być zgodna z faktycznymi etykietami UI.

### Wymagane zmiany

#### 1. Treść sekcji strony pomocy

**Plik**: `src/pages/help.astro`

**Cel**: Zamienić placeholdery na treść. Każda sekcja zwięzła; mocniej tam, gdzie ludzie się gubią. Zachować `id` i `scroll-mt` z Fazy 1.

**Kontrakt**: Treść per sekcja (fakty do oddania, dokładne etykiety w cudzysłowie — implementator redaguje prozę PL):

- **`#start` — Zanim zaczniesz.** TaskerLight działa w modelu BYOK (własny klucz OpenAI). Dwa kroki: „1. Wygeneruj klucz w OpenAI ↗" (→ `AI_PROVIDER_KEYS_URL`) → „2. Zapisz klucz w profilu" (→ `/profile`). Odnośnik do sekcji `#klucz` po szczegóły bezpieczeństwa.
- **`#przeplyw` — Skrzynka → klasyfikacja → akceptacja.** W „Skrzynce wejściowej" (`/ingest`) wklejasz tekst **albo** wrzucasz plik `.txt`/`.md` (wzajemnie wykluczające). AI rozbija wsad na typowane wpisy (modal: „Analizujemy wsad…" → „Sesja zawiera N wpisów"). Wpisy trafiają jako **„Do akceptacji"** (`pending`) do `/items`. Dla każdego: **„Zatwierdź"** (→ wchodzi do cyklu życia jako „Nowe"), **„Odrzuć"** (→ Kosz jako „Odrzucone") albo **„Edytuj"**. „Decyzja zawsze należy do Ciebie."
- **`#cykl-zycia` — Cykl życia wpisu.** Po akceptacji wpis ma stan operacyjny: **„Nowe" → „W toku" → „Zrobione"**, albo **„Anulowane"**. Przejścia z klikalnego badge stanu: „Rozpocznij", „Zrealizuj", „Anuluj", „Cofnij do «nowe»", „Otwórz ponownie", „Przywróć". (Wspomnieć nadpisania per typ: dla notatki „Zrobione" = „Obsłużona", dla decyzji „Podjęta".)
- **`#stany` — Widok „Wpisy" i filtry.** Oś stanu: „Wszystko aktywne" / „Nowe" / „W toku" / „Zakończone" / „Anulowane". **Wprost rozwiać pułapkę:** zakładka „Zakończone" i badge „Zrobione" to ten sam stan. „Dodaj wpis" tworzy wpis ręcznie (od razu „Nowe").
- **`#kosz` — Kosz + różnica Odrzuć vs Do kosza (KLUCZOWA LUKA).** Wyraźnie rozdzielić dwie akcje wiodące do Kosza: **„Odrzuć"** dotyczy wpisu oczekującego (`pending`) → w Koszu jako **„Odrzucone"**; **„Do kosza"** dotyczy wpisu zaakceptowanego → jako **„Usunięte"**. Pochodzenie widać na badge. **„Przywróć"** wyjmuje z Kosza (odrzucone → z powrotem do akceptacji, usunięte → z powrotem do zaakceptowanych). **„Wyczyść kosz"** kasuje trwale i nieodwracalnie.
- **`#sesje` — Sesje importu i ponawianie.** Każdy wsad tworzy sesję (dziennik, `/import-sessions`) ze statusem: „Przetwarzanie…", „Gotowe", „Brak wpisów", „Błąd". „Pokaż wpisy" otwiera wpisy sesji (aktywne tylko dla „Gotowe" z wpisami). Dla sesji „Błąd" — **„Ponów"** ponawia klasyfikację bez ponownego wklejania (wymaga skonfigurowanego klucza).
- **`#klucz` — Klucz API (BYOK).** Dostawca: OpenAI. Skąd: „Wygeneruj klucz w OpenAI ↗" (`AI_PROVIDER_KEYS_URL`). Gdzie: profil, pole „Klucz API OpenAI". Bezpieczeństwo: szyfrowany (AES-256-GCM), przechowywana tylko zaszyfrowana koperta, nie trafia do logów, nie da się go wyświetlić ponownie. Zarządzanie: „Usuń klucz" z potwierdzeniem. (To cel deep-linku z profilu — `#klucz`.)
- **`#typy` — Typy wpisów (ściągawka).** „Zadanie", „Notatka", „Pomysł", „Decyzja", „Inne" — krótka definicja każdego (zgodna z `CLASSIFICATION_PROMPT`).

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Sprawdzanie typów przechodzi: `tsc --noEmit`
- Produkcyjny build przechodzi: `npm run build`

#### Weryfikacja ręczna

- Każda z 8 sekcji ma treść pokrywającą swój temat (brak placeholderów)
- Sekcja `#kosz` jednoznacznie rozróżnia „Odrzuć" (pending → „Odrzucone") od „Do kosza" (zaakceptowane → „Usunięte")
- Cykl życia opisuje 4 stany i realne przejścia; filtry stanów wyjaśniają „Zakończone" vs „Zrobione"
- Sekcja `#sesje` opisuje statusy sesji i „Ponów"; `#klucz` — skąd/gdzie/bezpieczeństwo
- Etykiety w treści zgadzają się z UI (spot-check kilku: „Zatwierdź", „Do kosza", „Wyczyść kosz", „Ponów")
- Poprawna polszczyzna z pełnymi znakami diakrytycznymi; brak literówek

**Uwaga implementacyjna**: Po przejściu automatycznych weryfikacji zatrzymaj się na ręczne potwierdzenie poprawności merytorycznej przed Fazą 3.

---

## Faza 3: Wskazówka klucza w profilu

### Przegląd

W formularzu klucza API (profil) dodać zwięzły link „Jak zdobyć klucz?" prowadzący do OpenAI — bez duplikowania pełnej instrukcji.

### Wymagane zmiany

#### 1. Link przy polu klucza

**Plik**: `src/components/profile/ApiKeyManager.tsx`

**Cel**: Przy polu wpisania klucza (stan „brak klucza", label „Klucz API OpenAI", input `sk-…`) pokazać krótki link „Jak zdobyć klucz?" do OpenAI. Zwięźle — bez powtarzania opisu bezpieczeństwa z karty powitalnej.

**Kontrakt**: Odnośnik do `AI_PROVIDER_KEYS_URL` z `@/lib/config/byok` (nie hardcode URL), `target="_blank"` + `rel="noopener noreferrer"`, styl linku tekstowego z repo (`text-foreground text-sm font-medium hover:underline`). Umieścić w sąsiedztwie pola/labela klucza. Opcjonalnie drugi, dyskretny odnośnik „Więcej w Pomocy" → `/help#klucz`.

### Kryteria sukcesu

#### Weryfikacja automatyczna

- Lint przechodzi: `npm run lint`
- Sprawdzanie typów przechodzi: `tsc --noEmit`
- Testy przechodzą: `npm test`
- Produkcyjny build przechodzi: `npm run build`

#### Weryfikacja ręczna

- W profilu, przy pustym polu klucza, widoczny link „Jak zdobyć klucz?" otwierający `https://platform.openai.com/api-keys` w nowej karcie
- Link jest zwięzły (nie duplikuje pełnej instrukcji z karty powitalnej)
- Jeśli dodano „Więcej w Pomocy" — prowadzi do `/help#klucz` i przewija do sekcji klucza

**Uwaga implementacyjna**: Po tej fazie cała zmiana jest gotowa do `/10x-impl-review`.

---

## Strategia testowania

### Testy jednostkowe

- `nav-active.test.ts`: `/help` → `"help"`; brak regresji dla istniejących tras i „poza powłoką → null".
- (Jeśli istnieje) `middleware.test.ts`: `/help` bez sesji → redirect na `/auth/signin`.

### Testy integracyjne

- Brak nowych — strona jest statyczna, bez endpointów i zapytań.

### Kroki testowania ręcznego

1. Zalogowany: sidebar → „Pomoc" podświetla się i otwiera `/help`.
2. Wylogowany: `/help` → redirect na `/auth/signin`.
3. Spis treści: klik każdej pozycji przewija do sekcji z poprawnym offsetem (nagłówek nie pod sticky-headerem).
4. Deep-link: `/help#kosz`, `/help#klucz` przewijają do właściwych sekcji.
5. Treść: spot-check zgodności etykiet z realnym UI (Skrzynka, Wpisy, Kosz, Sesje, Profil).
6. Profil: link „Jak zdobyć klucz?" otwiera OpenAI w nowej karcie.

## Uwagi dotyczące wydajności

Bez implikacji — strona statyczna, bez wysp React, bez zapytań. Koszt renderu powłoki (`AppLayout` liczy dane sidebara) jest taki sam jak dla każdej istniejącej strony.

## Uwagi dotyczące migracji

Brak — żadnych zmian w danych ani schemacie.

## Referencje

- Brief ramowy: `context/changes/help-page/frame.md`
- Wzorzec mechaniczny (S-16): `context/archive/2026-08-06-trash-sidebar-relocation/plan.md` (Faza 1)
- Wzorzec statycznej treści: `src/components/ingest/ByokOnboarding.astro`
- Pozycja nav (stopka): `src/components/shell/AppSidebar.astro:113-121`
- Matcher + test: `src/components/shell/nav-active.ts:22-29`, `nav-active.test.ts:16-24`
- Ochrona: `src/middleware.ts:6,28`
- Klucz: `src/lib/config/byok.ts:15-18`, `src/components/profile/ApiKeyManager.tsx`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Rusztowanie nawigacji i strony

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint` — ef1bab9
- [x] 1.2 Sprawdzanie typów przechodzi: `tsc --noEmit` — ef1bab9
- [x] 1.3 Test nav-active przechodzi (z nową asercją `/help`): `npm test` — ef1bab9
- [x] 1.4 Produkcyjny build przechodzi: `npm run build` — ef1bab9

#### Ręczne

- [x] 1.5 „Pomoc" widoczna w stopce sidebara obok „Ustawień", z ikoną — ef1bab9
- [x] 1.6 Klik „Pomoc" → `/help`, pozycja podświetlona (`aria-current="page"`) — ef1bab9
- [x] 1.7 Niezalogowany na `/help` → redirect na `/auth/signin` — ef1bab9
- [x] 1.8 Spis treści: klik pozycji przewija do sekcji, nagłówek nie pod sticky-headerem — ef1bab9
- [x] 1.9 Deep-link `/help#klucz` przewija do sekcji klucza — ef1bab9

### Faza 2: Treść pomocy (PL)

#### Automatyczne

- [x] 2.1 Lint przechodzi: `npm run lint`
- [x] 2.2 Sprawdzanie typów przechodzi: `tsc --noEmit`
- [x] 2.3 Produkcyjny build przechodzi: `npm run build`

#### Ręczne

- [x] 2.4 Wszystkie 8 sekcji ma treść (brak placeholderów)
- [x] 2.5 `#kosz` rozróżnia „Odrzuć" (→ „Odrzucone") od „Do kosza" (→ „Usunięte")
- [x] 2.6 Cykl życia (4 stany + przejścia) i filtry („Zakończone" vs „Zrobione") wyjaśnione
- [x] 2.7 `#sesje` (statusy + „Ponów") i `#klucz` (skąd/gdzie/bezpieczeństwo) opisane
- [x] 2.8 Etykiety zgodne z UI (spot-check); poprawna polszczyzna z diakrytykami

### Faza 3: Wskazówka klucza w profilu

#### Automatyczne

- [ ] 3.1 Lint przechodzi: `npm run lint`
- [ ] 3.2 Sprawdzanie typów przechodzi: `tsc --noEmit`
- [ ] 3.3 Testy przechodzą: `npm test`
- [ ] 3.4 Produkcyjny build przechodzi: `npm run build`

#### Ręczne

- [ ] 3.5 Link „Jak zdobyć klucz?" przy polu klucza otwiera OpenAI w nowej karcie
- [ ] 3.6 Link zwięzły (bez duplikatu pełnej instrukcji)
- [ ] 3.7 Jeśli dodano „Więcej w Pomocy" — prowadzi do `/help#klucz`
