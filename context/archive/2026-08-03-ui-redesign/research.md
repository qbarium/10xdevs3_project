---
date: 2026-08-03T01:14:38+02:00
researcher: Jakub
git_commit: 94f8d1fff216674cbae3a222d1bd801974d49884
branch: feature/ui-redesign
repository: 10xdevs3_project
topic: "UI redesign (S-15): powierzchnia migracji kolorów, nienaruszalne uchwyty testów, wpięcie powłoki i motywu, census widoków"
tags: [research, codebase, ui-redesign, design-tokens, theming, navigation-shell, test-contracts, dup-react-ssr]
status: complete
last_updated: 2026-08-03
last_updated_by: Jakub
---

# Research: UI redesign (S-15) — mechanika wdrożenia w kodzie

**Date**: 2026-08-03T01:14:38+02:00
**Researcher**: Jakub
**Git Commit**: 94f8d1f (`94f8d1fff216674cbae3a222d1bd801974d49884`)
**Branch**: feature/ui-redesign (niewypchnięta — odniesienia lokalne, bez permalinków GitHub)
**Repository**: 10xdevs3_project

## Research Question

Zakres uzgodniony z użytkownikiem, wyprowadzony z roadmapy **S-15** (`context/foundation/roadmap.md:265-277`) — z linii „Ryzyko" (właściwy brief) i „Decyzji". Research **nie** dotyka estetyki (ta jest zamrożona w `ui-design-system.md` i makiecie); celuje w **mechanikę wdrożenia**:

1. **Powierzchnia migracji kolorów** — które komponenty/strony mają zaszyte kolory (`white/NN`, `purple-*`, glassmorphism „cosmic") do przełożenia na semantyczne tokeny.
2. **Nienaruszalne uchwyty testów** — inwentarz kontraktów DOM (role, dostępne nazwy, `data-item-id`, `<h3>`, etykiety), których restyle nie może zerwać.
3. **Wpięcie powłoki nawigacyjnej + mechanizm motywu + routing** — gdzie w Astro siedzą layouty, jak włączyć jasny/ciemny, jak wpiąć sidebar+topbar, czy trasy istnieją.
4. **Census widoków i komponentów** — pełne pokrycie powierzchni UI (co istnieje, czego brakuje).

## Summary

**Najważniejsze odkrycie architektoniczne: infrastruktura tokenów już w pełni istnieje, ale jest martwa.** `global.css` ma komplet semantycznych tokenów shadcn dla jasnego (`:root`) i ciemnego (`.dark`) — łącznie z **gotową rodziną `--sidebar-*`** — ale **klasa `.dark` nigdy nie ląduje w DOM i nie ma żadnego przełącznika**. Dzisiejszy „ciemny" wygląd nie pochodzi z tokenów, tylko z utility `bg-cosmic` (zaszyty gradient) + ręcznie malowanych `text-white`, `bg-white/5`, `text-blue-100/70`, gradientów `from-blue-200…`. Warianty `dark:` wbudowane w komponenty shadcn są **martwym kodem** (nigdy się nie odpalają, bo brak przodka `.dark`).

Z tego wynika kształt całej zmiany:

- **Największa robota = migracja kolorów.** ~**171 wystąpień w 47 plikach** trzeba przełożyć z zaszytych klas na tokeny (`bg-background`, `text-foreground`, `bg-sidebar`, `text-muted-foreground`, `border-border`…). To potwierdza „rozproszoną, najżmudniejszą część" z `ui-design-system.md:123`. Dopóki powierzchnie nie przejdą na tokeny, przełącznik motywu **nic wizualnie nie zmieni** na tych stronach.
- **Powłoka do zbudowania od zera.** Jest **jeden** layout (`Layout.astro`) = `<head>` + baner + `<slot/>`. Nawigacja to ręcznie wstawiany `Topbar.astro` bez stanu aktywnego. Ten sam wrapper (`bg-cosmic` + `max-w-6xl` + `<Topbar/>`) jest **skopiowany w 8 chronionych stronach**.
- **Zero nowych tras.** Wszystkie 8 celów sidebara już istnieje jako trasy. **Każdy** docelowy widok (4 ekrany makiety + wszystkie wnioskowane: profil/BYOK, tryb sesji, dialogi, modal klasyfikacji, auth, landing) jest już zaimplementowany — nic nie jest „do utworzenia" po stronie tras/widoków.
- **Testy dają szeroki margines.** **Żaden** test nie asertuje klasy CSS, stylu inline, koloru, zagnieżdżenia ani kolejności. Wszystkie asercje DOM żyją w **3 spec-ach Playwright**; testy Vitest są czysto logiczne (nie renderują DOM). Do zachowania jest **5 twardych kontraktów** (patrz §2).
- **Ograniczenie dup-React SSR nadal obowiązuje.** Nowe wyspy (sidebar interaktywny, przełącznik motywu) mogą dociągnąć nowe zależności — muszą trafić do `ssr.optimizeDeps.include` w `astro.config.mjs`. `lucide-react` i zunifikowany `radix-ui` są już przypięte, więc nowe ikony i prymitywy radix (o ile importowane z `radix-ui`, nie z podpakietów) **nie wymagają** wpisu; `next-themes` albo blok `shadcn add sidebar` (Sheet/Tooltip/Separator/Skeleton z podpakietów) — **wymagają**.

## Detailed Findings

### 1. Powierzchnia migracji kolorów (zaszyte kolory → tokeny)

**Fundament stylowania — `src/styles/global.css` (130 linii, Tailwind 4 CSS-first):**

- `@import "tailwindcss"` (`:1`) + `@import "tw-animate-css"` (`:2`). **Nie ma pliku `tailwind.config.*`** — cała konfiguracja jest w CSS.
- `@custom-variant dark (&:is(.dark *))` (`:4`) — `dark:` odpala się tylko pod przodkiem `.dark`.
- `:root` (`:6-39`) — pełna jasna paleta shadcn w `oklch`; `.dark` (`:41-73`) — komplet nadpisań ciemnych. Oba bloki zawierają rodzinę **`--sidebar-*`** (`:31-38` i `:65-72`).
- `@theme inline` (`:75-111`) — mapuje `--color-*` na `var(--…)`, więc `bg-background`, `text-muted-foreground`, `border-sidebar-border` itd. są gotowe od ręki, w obu motywach.
- `@utility bg-cosmic` (`:113-115`) — `linear-gradient(#0a0e1a, #0f1529, #0a0e1a)`, **zaszyte ciemne tło** używane przez ~12 powłok stron. Główny cel migracji.
- `@layer base` (`:117-129`) — `body { @apply bg-background text-foreground }` (body już na tokenach).

**Skala: ~171 wystąpień w 47 plikach.** Tiery wg nakładu (pełne `file:line` w raportach agentów; tu skrót):

| Tier | Pliki | Charakter |
| --- | --- | --- |
| **S (bardzo ciężkie)** | `ingest/ByokOnboarding.astro` (~18), `import-sessions/SessionCard.tsx` (~12, mapa kolorów statusu), `items/ItemCard.tsx` (8, bardzo gęsty — warianty checkboxa + karta), `Welcome.astro` (hero: `bg-cosmic`, kolorowe „orby" `blur`, starfield rgba, gradient) | gęsta mieszanka white/purple/blue/emerald + gradient + blur |
| **A (ciężkie)** | `Topbar.astro` (11, powtarzalne linki), `items/AcceptedItemsView.tsx`, `PendingItemsView.tsx`, `TrashItemsView.tsx` (po 6, **niemal identyczne**), `items/SessionBanner.astro`, `Banner.astro` (9 hex w scoped `<style>`), `auth/FormField.tsx` | white/NN + stany błędu + banery |
| **B (średnie)** | 3 karty auth (`signin/signup/confirm-email.astro`, **identyczne**), 8 powłok stron (`bg-cosmic` + gradientowy `<h1>`, **identyczne**), `lists/Pagination.tsx`, `items/ListFilterBar.tsx`, `import-sessions/SessionsList.tsx`, `ImportSessionsView.tsx` | karty + gradienty nagłówków + czerwone stany błędu |
| **C (lekkie, 1-2 linie)** | `SearchBox`, `SortControl`, `StateFilterSelect`, `SessionFilterBar`, `PageSizeSelect`, `TypeFilter`, `OperationalStatusBadge`, auth (`SubmitButton`, `PasswordToggle`, `ServerError`, `SignUpForm`), `LibBadge.astro`, `SessionEntriesView`, `ClassificationModal` | głównie wspólny wzorzec „pigułki" |

**4 powtarzalne wzorce — kandydaci na wspólny codemod/helper (czyszczą większość z 171):**
1. Kontrolka-pigułka `border-white/10 bg-white/5 text-white/80 hover:bg-white/10` (~12 plików).
2. Powłoka strony `bg-cosmic` + nagłówek `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent` (~12 plików).
3. Trio widoków accepted/pending/trash (identyczne).
4. Trio kart auth (identyczne).

**Założenia „tylko ciemny" do usunięcia:**
- `src/layouts/Layout.astro:17` — `style="color-scheme: dark"` (podpowiedź natywnych kontrolek, nie wariant Tailwinda).
- `src/styles/global.css:113-115` — `@utility bg-cosmic`.
- `src/components/ui/sonner.tsx:8` — `theme="dark"` na Toasterze (komentarz: „BEZ next-themes"). Musi stać się świadomy motywu.
- `src/components/Welcome.astro:27` — inline starfield `rgba(255,255,255,…)` (czytelny tylko na ciemnym tle).

**Pliki już na tokenach — NIE ruszać** (poza pojedynczymi strayami): `ui/{card,input,textarea,select,checkbox,label,alert,dropdown-menu}.tsx`, `items/AddItemDialog.tsx`, `items/EditItemDialog.tsx`. Strays do drobnej poprawki: `ui/button.tsx:14` (`text-white` w destructive), `ui/dialog.tsx:29` (`bg-black/50`), `ingest/IngestForm.tsx:97,101` (`text-amber-400`), `profile/ApiKeyManager.tsx:60` (`text-emerald-600`), `ingest/FileDropZone.tsx:92,123` (`text-purple-400`).

### 2. Nienaruszalne uchwyty testów (kontrakty DOM)

**Ustalenie kluczowe: żaden test Vitest nie renderuje DOM.** Repo-wide brak `@testing-library`, `render(`, `screen.`, `getByRole/getByText`. Testy `*.test.ts(x)` w `src/` są czysto logiczne (mapy etykiet, algebra zaznaczenia, predykaty widoków, walidacja). Integracyjne (`tests/integration/*.integration.test.ts`) to RLS/DB — bez DOM. **Wszystkie asercje uchwytów DOM są w 3 spec-ach Playwright** pod `e2e/`, zgodnie z `context/foundation/test-plan.md` §6.3 i §7 („E2E asertuje funkcję przez DOM, nie wygląd").

**5 twardych kontraktów (do jawnego zachowania w planie):**

| # | Uchwyt | Asercja (test) | Producent (src) | Uwaga |
| --- | --- | --- | --- | --- |
| 1 | tytuł itemu jako **`<h3>`** — `getByRole("heading",{level:3,name})` | `e2e/item-survives-reload.spec.ts:55,63`; `happy-path-smoke.spec.ts:44,59` | `items/ItemCard.tsx:163` | **NAJWYŻSZE.** Zmiana na h2/h4/`<p>` wywala 4 asercje. Tytuł MUSI zostać `<h3>`. |
| 2 | karta jako **`<article data-item-id>`** | `item-survives-reload.spec.ts:46,57`; `happy-path-smoke.spec.ts:34,45` | `items/ItemCard.tsx:73-74` | **WYSOKIE.** I tag `article`, i atrybut są nośne. Tytuł musi zostać w poddrzewie karty. |
| 3 | dokładne dostępne nazwy | wiele | — | `"Skrzynka wejściowa"` (`ingest.astro:36-38`), `"Tekst do klasyfikacji"` (para `Label htmlFor="ingest-text"` ↔ `Textarea id`, `IngestForm.tsx:84,87-88`), `"Wyślij"` (`IngestForm.tsx:118-120`), `"Zatwierdź"` (**nie** „Akceptuj"; `ItemCard.tsx:170-179`), `"Zrobione"` (bulk **generyczny**; `AcceptedItemsView.tsx:378-390` + `lib/labels.ts:18`), checkbox `"Zaznacz: {title}"` (`ItemCard.tsx:82-86`). |
| 4 | role ARIA z prymitywów shadcn | `happy-path-smoke.spec.ts:52` (checkbox), `:21` (textbox) | `Textarea`+`Label`, Radix `Checkbox` | Podmiana prymitywu na custom bez roli/nazwy zrywa uchwyty. |
| 5 | dwa zachowania (nie wygląd) | `toBeHidden/Visible` waity | `ClassificationModal.tsx:31,36` (redirect `/items`); `PendingItemsView`/`AcceptedItemsView.tsx:156` (reconcile) | Item **znika z DOM** po zmianie stanu (accept → z „Do akceptacji"; done → z „Wpisy"). Reconciliation musi przeżyć. |

**Kontrakty tekstowe zamrożone przez testy jednostkowe `src/lib/labels.test.ts`** (definiują dokładne stringi renderowane jako badge/przyciski): typy `Zadanie/Notatka/Pomysł/Decyzja/Inne` (`:7-13`), operacyjne `Nowe/W toku/Zrobione/Anulowane` (`:15-20`), akceptacja `Do akceptacji/Zaakceptowane/Odrzucone/Usunięte` (`:40-45`), sesje `Przetwarzanie…/Gotowe/Brak wpisów/Błąd` (`:47-55`). Filtr stanu + trasy: `src/components/items/state-filter.test.ts:22-30,47-145`.

**Zapewnienie dla planu:** brak asercji na klasy, style, kolory, zagnieżdżenie i kolejność → restyle, re-theme, re-layout i re-nesting są bezpieczne, dopóki 5 kontraktów wyżej zostaje.

### 3. Wpięcie powłoki, motyw i routing

**Layout — jest jeden, nie ma powłoki.** `src/layouts/Layout.astro` = `<html>`/`<head>` + pętla `<Banner>` (błędy configu) + `<slot/>` (`:41`) + zaszyte `color-scheme: dark` (`:17`). Nawigacja = `src/components/Topbar.astro` (płaski rząd `<a>`, **bez stanu aktywnego**). Identyczny wrapper powtórzony ręcznie w 8 stronach: `ingest.astro:31-35`, `profile.astro:27-31`, `import-sessions.astro:57-61`, `items.astro:91-95`, `items/{active,done,cancelled,trash}.astro` (~:42-47). Landing `Welcome.astro:32` też osadza własny `<Topbar/>`.

- **Rekomendacja wpięcia:** nowy `src/layouts/AppLayout.astro` (albo `Shell.astro`) = stały sidebar + topbar + `<slot/>`, importowany tylko przez 8 stron chronionych; `Layout` zostaje dla `/auth/*` i `/`. Powłoka konsumuje gotowe `bg-sidebar`/`text-sidebar-foreground` i liczy stan aktywny z `Astro.url.pathname`.
- **„Trwała" ≠ zachowany DOM.** Repo robi pełne przeładowania SSR (brak `<ClientRouter/>`/`astro:transitions`). Powłoka re-renderuje się serwerowo przy każdej nawigacji (wizualnie trwała). Stan zwinięcia sidebara warto trzymać w **cookie**, by SSR renderował poprawny stan od pierwszego bajtu.

**Motyw — infra jest, ale martwa** (patrz Summary). Włączenie jasny/ciemny wymaga:
1. Wyspy-przełącznika (React, ikona Sun/Moon) flipującej `document.documentElement.classList.toggle("dark")` + trwałość.
2. **No-flash na SSR — cookie (rekomendacja).** Czytelne serwerowo → `Layout.astro` renderuje `<html class={theme==="dark"?"dark":""} style={color-scheme}>` od pierwszego bajtu, zero mignięcia. Wzorzec już w repo: cookie dla stabilności SSR (`lists/page-size-pref.ts`, czytane w stronach przez `Astro.cookies.get(...)`). `localStorage` byłby gorszy (wymaga blokującego skryptu w `<head>`, ryzyko flash).
3. Zamiana statycznego `color-scheme: dark` (`Layout.astro:17`) na wartość dynamiczną.
4. `sonner.tsx:8` czyta aktywny motyw zamiast `"dark"`.

**Routing — wszystkie trasy istnieją (zero do utworzenia):** Skrzynka→`/ingest` ✅, Do akceptacji→`/items` ✅, Wpisy→`/items/active` ✅ (+ `/items/{done,cancelled,trash}` ✅), Sesje→`/import-sessions` ✅, Ustawienia→`/profile` ✅. Brak tras dynamicznych stron; **`/dashboard` nie istnieje** (wpis w `CLAUDE.md` jest nieaktualny — po logowaniu ląduje się na `/ingest` via `middleware.ts:38-40`).
- **Pułapka stanu aktywnego:** naiwny `startsWith` się myli, bo `/items/active` zaczyna się od `/items` — element „Do akceptacji" (`/items`) potrzebuje **dopasowania dokładnego**, a grupa „Wpisy" — prefiksu `/items/`.
- **Zakładki zakresu (Wpisy):** dziś to **dropdown** (`StateFilterSelect.tsx`), nie zakładki, sterowany logiką `items/state-filter.ts` (`navigateHref` buduje `/items/${view}`, `:66-69`; opcje `:37-49`; `stateSelectValue` `:92-99`). Konwersja na zakładki jest **czysto prezentacyjna i może reużyć tę logikę**.

**Middleware:** `PROTECTED_ROUTES = ["/profile","/ingest","/items","/import-sessions"]` (`src/middleware.ts:6`, `startsWith` → `/items` łapie `/items/*`). `context.locals.user` rozwiązywany `:17-26`; anon na trasie chronionej → `/auth/signin`. **Wewnątrz powłoki `Astro.locals.user` jest gwarantowany** (middleware odsiewa anonimów), więc sidebar bezpiecznie renderuje konto + signout.

**dup-React SSR — stan przypięcia (`astro.config.mjs`):** `resolve.dedupe` = `["react","react-dom"]` (`:22-24`); `ssr.noExternal` = `["react","react-dom"]` (`:47`); load-bearing `ssr.optimizeDeps.include` (`:56-73`): `astro/env/runtime, react, react-dom, react-dom/server, react/jsx-runtime, react/jsx-dev-runtime, @supabase/ssr, zod, sonner, lucide-react, radix-ui, @radix-ui/react-slot, class-variance-authority, clsx, tailwind-merge`. Prymitywy shadcn importują radix z **zunifikowanego `radix-ui`** (`checkbox/dialog/dropdown-menu/label/select.tsx:2-3`), tylko `button.tsx:2` z `@radix-ui/react-slot` — oba przypięte.
- **Nowe wyspy:** ikony `lucide-react` → już przypięte (bez wpisu); prymitywy radix przez `radix-ui` → pokryte. **Wpis wymagany** dla: nowego top-level depa (np. `next-themes` — nie wprowadzać), lub bloku `shadcn add sidebar` (ciągnie Sheet/Tooltip/Separator/Skeleton z podpakietów — przekierować importy na `radix-ui` albo dopisać każdy podpakiet), lub innej biblioteki ikon.

### 4. Census widoków i komponentów — pokrycie 100%

**Każdy docelowy widok jest już zaimplementowany. Nic nie jest „BRAK — do utworzenia".**

| Widok docelowy | Plik(i) |
| --- | --- |
| Wpisy (active/done/cancelled) | `items/{active,done,cancelled}.astro` → `AcceptedItemsView.tsx`; trash → `TrashItemsView.tsx`; przełącznik = `StateFilterSelect.tsx`; wiersz = `ItemCard.tsx` |
| Skrzynka / ingest | `ingest.astro:41` → `IngestForm.tsx` (+`FileDropZone.tsx`); brama `ByokOnboarding.astro` |
| Do akceptacji | `items.astro:106` → `PendingItemsView.tsx` |
| Sesje importu | `import-sessions.astro:66` → `ImportSessionsView.tsx` → `SessionsList.tsx` → `SessionCard.tsx` (+`SessionFilterBar.tsx`) |
| Tryb „Pokaż wpisy" + baner sesji | `items.astro:103` → `SessionEntriesView.tsx`; baner `SessionBanner.astro` |
| Dialog Dodaj / Edytuj | `AddItemDialog.tsx` / `EditItemDialog.tsx` (+ tryb `readOnly` podglądu) |
| Modal klasyfikacji (4 stany) | `ClassificationModal.tsx` — `processing:87`, `completed_with_items:101`, `completed_no_items:117`, `failed:133`; stany z `hooks/useClassification.ts:7` |
| Profil / BYOK | `profile.astro:35` → `ApiKeyManager.tsx` (+`hooks/useApiKey.ts`) |
| Auth (signin/signup/confirm-email) | `auth/*.astro` → `SignInForm.tsx`/`SignUpForm.tsx` (confirm-email statyczny) |
| Landing | `index.astro:12` → `Welcome.astro` |

**Wyspy (`client:load`, jedyny używany dyrektyw):** `PendingItemsView`, `AcceptedItemsView`, `TrashItemsView`, `SessionEntriesView`, `IngestForm`, `ImportSessionsView`, `ApiKeyManager`, `SignInForm`, `SignUpForm`. Reszta komponentów hydruje jako dzieci w drzewie wyspy.

**Prymitywy shadcn OBECNE (11 React + 1 Astro):** `alert, button, card, checkbox, dialog, dropdown-menu, input, label, select, sonner, textarea` (+ `LibBadge.astro` — starterowy, nieużywany).

**Prawdopodobnie BRAKUJĄCE dla redesignu:** `badge` (dziś ręczne `<span>`-y — a chipy typu WERSALIKI są centralne dla makiety), `tabs` (przełącznik zakresu to `Select`), `sidebar`/`sheet`/`navigation-menu` (nawigacja to ręczny `Topbar.astro`, brak szuflady mobilnej), `tooltip`, `avatar`, `switch`, `separator`, `skeleton`.

## Code References

- `src/styles/global.css:4` — `@custom-variant dark`; `:6-73` tokeny jasny/ciemny; `:31-38,65-72,103-110` rodzina `--sidebar-*`; `:75-111` `@theme inline`; `:113-115` `@utility bg-cosmic`; `:117-129` `@layer base`.
- `src/layouts/Layout.astro:17` — `color-scheme: dark`; `:41` — `<slot/>`.
- `src/components/Topbar.astro` — nawigacja bez stanu aktywnego; wzorzec wrappera powtórzony w 8 stronach.
- `src/components/items/ItemCard.tsx:73-74` — `<article data-item-id>`; `:163` — `<h3>` tytuł; `:82-86` — checkbox `aria-label="Zaznacz: {title}"`; `:170-179` — przycisk „Zatwierdź”.
- `src/components/items/state-filter.ts:37-49,66-69,92-99` — logika przełącznika zakresu (reużywalna pod zakładki).
- `src/middleware.ts:6` — `PROTECTED_ROUTES`; `:38-40` — redirect `/` → `/ingest`.
- `astro.config.mjs:56-73` — `ssr.optimizeDeps.include` (pin dup-React); `:54-55` — reguła utrzymania.
- `src/lib/labels.ts:7-54` + `src/lib/labels.test.ts` — zamrożone kontrakty tekstowe.
- `src/components/lists/page-size-pref.ts` — wzorzec cookie-dla-SSR (analogon dla trwałości motywu/sidebara).
- `e2e/item-survives-reload.spec.ts`, `e2e/happy-path-smoke.spec.ts`, `e2e/seed.spec.ts` — jedyne miejsca asercji DOM.

## Architecture Insights

- **Architektura „tokeny-martwe".** To sedno: redesign nie polega na dodaniu ciemnego motywu (on już jest w tokenach), tylko na (a) **ożywieniu** tokenów przez `.dark` + przełącznik + no-flash cookie, i (b) **przełączeniu powierzchni** z `bg-cosmic`/zaszytych bieli na tokeny. Przełącznik bez migracji = brak efektu wizualnego.
- **Multi-page SSR bez klienta-routera** → powłoka jest re-renderowana serwerowo, nie zachowywana w DOM; stan (zwinięcie sidebara, motyw) trzymaj w cookie dla spójności SSR.
- **`--sidebar-*` gotowe** → sidebar jest tani tokenowo; koszt to komponent, nie paleta.
- **Logika widoku oddzielona od prezentacji** — pliki `.ts` obok komponentów (`selection.ts`, `state-filter.ts`, `operational-view.ts`, `create-form.ts`, `edit-form.ts`, `item-card.ts`, `list-pagination.ts`) niosą view-model. Redesign dotyka JSX/klas, **nie** tych modułów.
- **Drobny rozjazd konfiguracji:** `components.json` mapuje `"hooks": "@/hooks"`, a konwencja repo (CLAUDE.md) to `src/components/hooks/`. `npx shadcn add sidebar` wrzuci `useIsMobile` do `src/hooks/` — pogodzić.

## Historical Context (z lessons.md i wcześniejszych zmian)

Znane wzorce zespołu (`context/foundation/lessons.md`) — nie do relitygowania, do przestrzegania w planie/implementacji:

- **Rodzina dup-React SSR (S-08/S-10/S-12, `lessons.md:54-80`):** nowy dep osiągalny z grafu wyspy → dopisz do `ssr.optimizeDeps.include`. „Naprawione" = brak `optimized dependencies changed. reloading` na zimnym starcie (bez `--force`), sesja pokrywa render wysp + dialog (`zod`) + trasę API. Bezpośrednio dotyczy nowych wysp powłoki/motywu.
- **Zakaz top-level `return` w `.astro` (S-13, `lessons.md:82-87`):** redirecty w `middleware.ts`; korekty stanu strony bez `return`. Dotyczy każdej edycji `.astro` (a redesign dotyka wielu). Po edycji `.astro` uruchom `npm run lint` (build tego crashu nie łapie).
- **Formatuj celowanymi ścieżkami (F-01, `lessons.md:5-10`):** nigdy `npm run format`/`prettier --write .` w trakcie fazy — tylko konkretne pliki; husky+lint-staged i tak sformatuje staged. Istotne przy zmianie dotykającej ~50 plików.

Brak wcześniejszych zmian dotykających warstwy wizualnej — to pierwszy redesign; `context/archive/**` nie zawiera precedensu dla tokenów/powłoki.

## Related Research

- To pierwszy artefakt badawczy dla `ui-redesign`. Powiązane dokumenty kanoniczne:
  - `context/foundation/ui-design-system.md` — spec wizualny (prawo warstwy wizualnej).
  - `context/foundation/ui-mockup/taskerlight-list.html` — źródło prawdy wizualnej (makieta).
  - `context/foundation/roadmap.md:265-277` — S-15 (decyzje + ryzyko = brief tego researchu).
  - `context/foundation/test-plan.md` §6.3, §7 — kontrakt „E2E asertuje funkcję przez DOM".

## Open Questions (do rozstrzygnięcia w `/10x-plan`)

1. **Zakładki vs Select dla zakresu Wpisów** — makieta pokazuje zakładki; dziś jest `Select`. Konwersja jest prezentacyjna i może reużyć `state-filter.ts`. Zakładki czy stylizowany Select?
2. **Sidebar: blok `shadcn add sidebar` vs ręczny** — oficjalny blok daje szufladę mobilną + a11y, ale ciągnie Sheet/Tooltip/Separator/Skeleton (nowe podpakiety → pin dup-React + rozjazd aliasu hooków). Ręczny na gotowych `--sidebar-*` = mniej depów, więcej pracy. Rekomendacja do podjęcia w planie.
3. **`badge` jako prymityw** — chipy typu (WERSALIKI) są centralne w makiecie; dodać `shadcn badge` czy zostać przy ręcznych `<span>`?
4. **Fonty self-hosted** — `ui-design-system.md:35,121` wymaga IBM Plex Sans + monospace lokalnie (CSP Cloudflare, bez CDN); makieta używała Google Fonts CDN (nie przenosić). Gdzie umieścić pliki i `@font-face`.
5. **Trwałość motywu** — potwierdzenie cookie (rekomendacja, wzorzec `page-size-pref.ts`) jako mechanizmu no-flash.
6. **Landing + auth** — poza powłoką; jak mocno restylować teraz (makieta ich nie pokrywa; `ui-design-system.md:103` każe wywnioskować z języka makiety).
7. **„Dziennik" (wkrótce)** — pozycja sidebara oznaczona „wkrótce" (nieaktywna), nie trasa — potwierdzić jako disabled placeholder.
