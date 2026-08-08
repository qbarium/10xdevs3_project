# Naprawa 17 zgłoszeń „Inne" z produkcji — plan implementacji

## Przegląd

Runda poprawek TaskerLight na podstawie 17 uwag testerów (wpisy typu `other` z produkcji). 11 zgłoszeń naprawiamy pełnym flow (bugi + drobny UX), 6 poddajemy triage (potwierdzenie zasadności + komentarz na prod, bez kodu w tym slice). Każda faza naprawcza: **reprodukcja Playwright → poprawka → weryfikacja Playwright + testy jednostkowe**. Kod wyłącznie lokalnie na gałęzi `feature/prod-feedback-fixes` — **bez merge do `main`**. Status i komentarze ticketów zapisywane na produkcji (Supabase).

Triage źródłowy: `context/changes/prod-feedback-fixes/backlog.md`.

## Analiza stanu obecnego

Mapa kodu ustalona reconem (4 agenci Explore). Kluczowe fakty:

- **Powłoka to statyczny Astro** (`AppSidebar.astro`, bez wyspy). Elementy zależne od stanu (licznik „Do akceptacji" `pendingCount`, wskaźnik klucza `keyConfigured`) liczone serwerowo raz na render (`AppLayout.astro:31-66`) → **nie reagują na mutacje w wyspach React** bez reloadu. Istnieje precedens mostu wyspa↔powłoka: `src/components/items/item-topbar-events.ts` + `src/components/hooks/useItemTopbarBridge.ts`.
- **Motyw ciemny**: klasa `.dark` na `<html>` z cookie `theme` (`src/lib/theme.ts`), tokeny w `src/styles/global.css` (`:root` + `.dark`), wariant Tailwind `@custom-variant dark`. Checkbox (`src/components/ui/checkbox.tsx:13`) w stanie niezaznaczonym w dark ma zbyt słaby kontrast (`border-input` = biel 10%, `dark:bg-input/30`).
- **Terminologia stanu `done`** rozjeżdża się na **trzy** słowa: „Zrealizuj" (`operational-transitions.ts:17,21`), „Zrobione" (`labels.ts:18`), „Zakończone" (`state-filter.ts:50`).
- **Modal edycji** to Radix Dialog (`EditItemDialog.tsx`) — ma backdrop, ale brak `onInteractOutside preventDefault`; przy „brudnym" formularzu `requestClose()` otwiera drugi Dialog potwierdzenia **nie zamykając pierwszego** → dwa modale naraz → pętla na dotyku.
- **Kosz**: brak endpointu trwałego usuwania pojedynczego itemu — jest tylko globalny `POST /api/items/trash/empty`. `src/pages/api/items/[id].ts` eksportuje wyłącznie `PATCH`.
- **Przewijanie**: brak CSS ukrywającego scrollbar; to auto-ukrywanie overlay-scrollbarów na dotyku. Wspólna klasa przewijanego kontenera list w 5 widokach.
- **Wysokość powłoki**: `Layout.astro:36` używa `h-screen` (100vh) i `Layout.astro:31` meta viewport bez `initial-scale=1` — problem tabletowy po zmianie orientacji.

## Pożądany stan końcowy

Wszystkie 11 napraw zweryfikowane E2E (Playwright) na lokalnym Taskerze; testy jednostkowe zielone; lint/tsc/build czyste. 6 featurów udokumentowanych jako świadomy dług (komentarz na prod). Na produkcji: każdy ticket z odpowiednim statusem (`done` / `cancelled` / `new`+komentarz) i dopisanym komentarzem. Gałąź `feature/prod-feedback-fixes` gotowa do ręcznej weryfikacji użytkownika — **niezmergowana**.

### Kluczowe odkrycia

- Wspólny wzorzec dla Fix 5 i Fix 6: most `CustomEvent` powłoka↔wyspa (`item-topbar-events.ts:38,49`).
- Fix 6: lista „Do akceptacji" już usuwa zaakceptowane (`PendingItemsView.tsx:141,150` — `removeByIds` + `refetchAfterRemoval`); pierwszy objaw może być nieaktualny → weryfikacja Playwright rozstrzyga.
- Fix 9: mechanizm pętli to dwa równocześnie otwarte Radix Dialog (`EditItemDialog.tsx:122-125,208-362`).
- Fix 10: pełny łańcuch (endpoint→serwis→hook→UI) wzorowany na `emptyTrash`/`restore`.
- Checkbox to jeden centralny komponent (`checkbox.tsx:13`) — jedna zmiana pokrywa wszystkie listy.

## Czego NIE robimy

- **Nie budujemy 6 featurów z triage**: audio/nagrywanie (poza MVP→V2), edycja wspomagana AI, podział/powielenie/łączenie w torze akceptacji, redesign interakcji listy (klik=szczegóły/ikony), pull-to-refresh, tuning promptu klasyfikatora.
- **Nie zmieniamy modelu stanów** — propozycja z ticketu terminologii („jeden stan »zakończone« niezależnie od typu") to zmiana modelu; robimy wyłącznie ujednolicenie warstwy tekstu.
- **Nie mergujemy do `main`** — kod zostaje lokalnie na gałęzi.
- **Nie ruszamy gałęzi read-only** `EditItemDialog` (Podgląd) — nie jest objęta pętlą.
- Fix 6: nie dodajemy wzrostu licznika po nowym imporcie (poza zakresem ticketu — tylko dekrement po akceptacji/odrzuceniu).

## Krytyczne szczegóły implementacji

- **Fix 8 (`h-screen`→`dvh` w `Layout.astro`)** dotyka **każdej** strony (jedyny `<head>`/viewport aplikacji). Ryzyko regresji layoutu — po zmianie zweryfikować E2E, że listy/powłoka nie pękają na desktopie i tablecie. `h-screen` był już przedmiotem S-15.
- **Fix 9**: naprawa musi (a) dodać `onInteractOutside`/`onPointerDownOutside` z `preventDefault` na edytorze i (b) rozerwać współistnienie dwóch modali (potwierdzenie jako stan wykluczający edytor, nie równoległy Radix Dialog). Weryfikacja wyłącznie w emulacji dotyku (`hasTouch:true`).
- **Fix 5/6**: badge musi znikać przy zejściu do 0 (dziś warunkowy render `pendingCount > 0`).

## Podejście do implementacji

Fazy w kolejności rosnącej złożoności: najpierw drobne (powłoka/CSS/tekst), potem mosty reaktywne, modal, kosz; na końcu triage. Każda faza domykana własnym scenariuszem Playwright w `e2e/`. Delegacja implementacji faz do pod-agentów pod nadzorem orkiestratora; skille i operacje prod/board/git po stronie orkiestratora.

---

## Faza 1: Marka „TaskerLight" jako link do skrzynki (ticket f4dc0119)

### Przegląd
Logo + napis w sidebarze mają prowadzić do `/ingest`.

### Wymagane zmiany
#### 1. Powłoka — marka jako odnośnik
**Plik**: `src/components/shell/AppSidebar.astro`
**Cel**: Zamienić statyczny `<div>` bloku marki (linie 33-38) na odnośnik do skrzynki wejściowej, zachowując badge z logo i napis oraz zwijanie do ikony na wąskim ekranie.
**Kontrakt**: `<a href="/ingest" aria-label="TaskerLight — przejdź do skrzynki wejściowej">` opakowujący dotychczasowe dzieci (badge `:34-36` + span `:37`), z klasą `max-[920px]:justify-center`. Wzorzec: CTA „Skrzynka wejściowa" `:40-51`. Bez `aria-current`/pierścienia (nie mnożyć wskaźników „page").

### Kryteria sukcesu
#### Weryfikacja automatyczna
- E2E: klik w markę nawiguje na `/ingest`: `npm run e2e`
- Lint/format czyste (per-edit hook + `npm run lint`)
#### Weryfikacja ręczna
- Klik w logo i w napis prowadzi do skrzynki; wygląd marki niezmieniony (desktop i ≤920 px).

---

## Faza 2: Widoczne checkboxy w trybie ciemnym (ticket ef87e4f8)

### Przegląd
Checkboxy na listach są w dark nieodróżnialne od tła. Podnieść kontrast stanu niezaznaczonego centralnie.

### Wymagane zmiany
#### 1. Komponent checkboxa
**Plik**: `src/components/ui/checkbox.tsx`
**Cel**: Nadać stanowi niezaznaczonemu w trybie ciemnym widoczne tło i ramkę, zachowując wygląd w jasnym i stan zaznaczony (`bg-primary`).
**Kontrakt**: Rozszerzyć `cn(...)` (linia 13) o warianty `dark:` z tokenów motywu dające wyraźny kontrast ramki/tła względem tła wiersza (`--card`/`--background`). Bez zmian API komponentu; jedna zmiana pokrywa wszystkie listy (`ItemCard`, `Pending/Accepted/Trash` „zaznacz wszystkie") i formularze.

### Kryteria sukcesu
#### Weryfikacja automatyczna
- E2E w dark (wymuszony cookie `theme=dark`): checkbox na liście ma widoczny kontrast (obecność ramki/tła / snapshot atrybutów): `npm run e2e`
- Istniejące testy jednostkowe zielone (zmiana czysto stylowa, bez nowego testu): `npm test`
#### Weryfikacja ręczna
- Na liście w dark checkbox jest wyraźnie widoczny przed i po zaznaczeniu; w jasnym bez zmian.

---

## Faza 3: Własna ikona „Do akceptacji" (ticket 2d65d300)

### Przegląd
„Do akceptacji" ma ikonę wizualnie identyczną ze skrzynką wejściową (`inbox` ≈ `tray`). Nadać jej odrębną, semantyczną ikonę (akceptacja).

### Wymagane zmiany
#### 1. Definicja ikony
**Plik**: `src/components/shell/Icon.astro`
**Cel**: Dodać nowy wariant ikony sugerujący akceptację (np. skrzynka z „ptaszkiem" / clipboard-check), wyraźnie różny od `tray`.
**Kontrakt**: Dopisać literał do unii `IconName` (`:7-17`) i blok `{ icon === "…" && (<Fragment><path d="…"/></Fragment>) }` w stylu lucide (stroke, bez fill) w zakresie `:41-127`.
#### 2. Podmiana w sidebarze
**Plik**: `src/components/shell/AppSidebar.astro`
**Cel**: Ustawić nową ikonę przy „Do akceptacji".
**Kontrakt**: `AppSidebar.astro:65` — `icon="inbox"` → nowa nazwa. `tray` przy „Skrzynce wejściowej" bez zmian.

### Kryteria sukcesu
#### Weryfikacja automatyczna
- E2E: ikony „Skrzynka wejściowa" i „Do akceptacji" mają różne ścieżki SVG (różny `d`/kształt): `npm run e2e`
- Lint/format czyste
#### Weryfikacja ręczna
- W sidebarze obie pozycje mają wyraźnie różne ikony.

---

## Faza 4: Ujednolicenie terminologii stanu „zakończone" (ticket 164608bf)

### Przegląd
Stan `done` ma trzy słowa: „Zrealizuj" / „Zrobione" / „Zakończone". Ujednolicić warstwę tekstu do „Zakończone" (przymiotnik/badge/filtr) i „Zakończ" (czasownik akcji, kanon L5). Bez zmian logiki.

### Wymagane zmiany
#### 1. Etykiety stanu
**Plik**: `src/lib/labels.ts`
**Cel**: `done: "Zrobione"` → „Zakończone" (propaguje na badge, akcję bulk, dialog, toast). **Decyzja plan-review:** ujednolicić WSZYSTKIE warianty `done`, w tym nadpisania per-typ (`:26-29`, note/idea/decision/other), do jednej formy „Zakończone" — spójność akcja↔filtr jest sednem ticketu, a per-typ warianty tylko mnożą słowa (zmiana modelu stanów pozostaje poza zakresem).
**Kontrakt**: Stała `OPERATIONAL_STATUS_LABELS.done` (`:18`) + mapa nadpisań `:26-29` (wszystkie → „Zakończone").
#### 2. Czasownik przejścia
**Plik**: `src/lib/items/operational-transitions.ts`
**Cel**: „Zrealizuj" → „Zakończ" (`:17,21`) dla akcji przejścia do `done`.
#### 3. Copy pomocy
**Plik**: `src/pages/help.astro`
**Cel**: Zaktualizować opisy przejść, by odpowiadały nowej terminologii (`:112,118,133,137-138`).
#### 4. Testy zamrażające stringi
**Pliki**: `src/lib/labels.test.ts` (`:18,28,37`), `src/components/items/state-filter.test.ts` (`:21`)
**Cel**: Zaktualizować oczekiwane stringi do nowej terminologii.

### Kryteria sukcesu
#### Weryfikacja automatyczna
- Testy jednostkowe zielone (zaktualizowane): `npm test`
- E2E: akcja stanu, badge i filtr używają spójnego słowa („Zakończ"/„Zakończone"): `npm run e2e`
#### Weryfikacja ręczna
- Menu akcji, badge, filtr i pomoc mówią spójnie; brak „Zrobione"/„Zrealizuj".

---

## Faza 5: Reaktywny wskaźnik statusu klucza w powłoce (ticket 80c4f735)

### Przegląd
Karta `ApiKeyManager` odświeża się poprawnie; nieaktualny zostaje wskaźnik „klucz aktywny/brak klucza" w sidebarze (SSR, brak połączenia z wyspą). Zsynchronizować wskaźnik bez reloadu.

### Wymagane zmiany
#### 1. Emisja zdarzenia po mutacji klucza
**Plik**: `src/components/hooks/useApiKey.ts`
**Cel**: Po sukcesie `save` (`:49`) i `remove` (`:69`) wyemitować `CustomEvent` niosący nowy stan `configured`.
**Kontrakt**: Zdarzenie na `window` w stylu `item-topbar-events.ts` (nazwa np. `byok-key-changed`, `detail:{configured:boolean}`).
#### 2. Konsument w powłoce
**Pliki**: `src/components/shell/AppSidebar.astro` (`:148-149`) + wspólny moduł zdarzeń powłoki `src/components/shell/sidebar-events.ts` (reużywany przez Fazę 6)
**Cel**: Nasłuchiwać zdarzenia i aktualizować kropkę + tekst („klucz aktywny"/„brak klucza") oraz kolor, bez reloadu.
**Kontrakt**: **Inline `<script>` w `AppSidebar.astro`** (progresywne wzbogacenie — sidebar pozostaje statyczny, bez wyspy React), nasłuch `CustomEvent` z `sidebar-events.ts`. Źródło początkowe pozostaje `keyConfigured` (SSR, `AppLayout.astro:58-65,75`). **Decyzja plan-review:** inline script, nie mikro-wyspa (mniejszy promień rażenia, spójne ze statyczną powłoką).

### Kryteria sukcesu
#### Weryfikacja automatyczna
- E2E: na `/profile` usunięcie i dodanie klucza zmienia wskaźnik w sidebarze bez przeładowania: `npm run e2e`
#### Weryfikacja ręczna
- Dodanie/usunięcie klucza natychmiast zmienia wskaźnik w powłoce.

---

## Faza 6: Reaktywny licznik „Do akceptacji" + weryfikacja odświeżania listy (ticket 6fa2b64b)

### Przegląd
Po częściowej akceptacji badge `pendingCount` w sidebarze nie maleje bez reloadu. Objaw „nieaktualne elementy zostają na liście" prawdopodobnie już naprawiony (kod usuwa zaakceptowane) — rozstrzygnąć Playwrightem; jeśli nieodtwarzalny, odnotować. Uczynić licznik reaktywnym tym samym wzorcem co Fix 5.

### Wymagane zmiany
#### 1. Emisja delty po akceptacji/odrzuceniu
**Plik**: `src/components/items/PendingItemsView.tsx`
**Cel**: Po sukcesie `execute()` (zna `count`, `~:152`) wyemitować `CustomEvent` z liczbą przetworzonych pozycji (dekrement licznika).
**Kontrakt**: Zdarzenie na `window` (np. `pending-count-changed`, `detail:{delta:number}`), wzorzec `item-topbar-events.ts`.
#### 2. Reaktywny badge w powłoce
**Pliki**: `src/components/shell/AppSidebar.astro` (`:67-73`) + wspólny `src/components/shell/sidebar-events.ts` (z Fazy 5)
**Cel**: Nasłuchiwać delty, aktualizować liczbę i chować badge przy zejściu do 0 (dziś warunek `pendingCount > 0`).
**Kontrakt**: **Inline `<script>` w `AppSidebar.astro`** (ten sam mechanizm co Faza 5), nasłuch `CustomEvent` z `sidebar-events.ts`; źródło początkowe `pendingCount` (SSR).

### Kryteria sukcesu
#### Weryfikacja automatyczna
- E2E: częściowa akceptacja usuwa zaakceptowane z listy (potwierdzenie/obalenie objawu #1) i zmniejsza badge bez reloadu; przy 0 badge znika: `npm run e2e`
#### Weryfikacja ręczna
- Po zaakceptowaniu części pozycji lista i licznik są aktualne bez przeładowania.

---

## Faza 7: Widoczny scrollbar na tablecie (ticket be20465a)

### Przegląd
Przy listach dłuższych niż ekran na tablecie znika pasek przewijania (auto-ukrywanie overlay). Wymusić trwały, widoczny scrollbar na kontenerach list.

### Wymagane zmiany
#### 1. Utilitka trwałego scrollbara
**Plik**: `src/styles/global.css`
**Cel**: Dodać regułę/utilitkę wymuszającą widoczny pasek (`scrollbar-width`/`scrollbar-color` + `::-webkit-scrollbar`), zastosowaną do wspólnej klasy przewijanego kontenera list.
**Kontrakt**: Kontenery `min-h-0 flex-1 overflow-y-auto px-6` w `TrashItemsView:247`, `AcceptedItemsView:376`, `PendingItemsView:261`, `SessionEntriesView:143`, `ImportSessionsView:83`. Jedna utilitka/reguła pokrywa wszystkie.

### Kryteria sukcesu
#### Weryfikacja automatyczna
- E2E (emulacja tabletu, długa lista): kontener jest przewijalny; scrollbar wymuszony (styl `overflow`/`scrollbar` obecny): `npm run e2e`
- Lint/format czyste
#### Weryfikacja ręczna
- Na tablecie widać pasek przy długiej liście; desktop bez regresji.

---

## Faza 8: Wysokość i skala powłoki na tablecie (ticket 0a23baea)

### Przegląd
Na tablecie strona (np. profil) przewija się „za ekran", opcje lądują pod krawędzią, szczególnie po zmianie orientacji. Przyczyny w `Layout.astro`: `h-screen` (100vh) i meta viewport bez `initial-scale=1`.

### Wymagane zmiany
#### 1. Meta viewport
**Plik**: `src/layouts/Layout.astro`
**Cel**: Dodać `initial-scale=1` (opcjonalnie `viewport-fit=cover`) do meta viewport (`:31`) — stabilna skala po rotacji.
**Kontrakt**: `<meta name="viewport" content="width=device-width, initial-scale=1" />`.
#### 2. Dynamiczna wysokość powłoki
**Plik**: `src/layouts/Layout.astro`
**Cel**: Zamienić `h-screen` na jednostkę dynamiczną (`h-[100dvh]`/`h-dvh`) w gałęzi `fullHeight` (`:36`) — uwzględnia pasek adresu na tablecie/mobile.
**Kontrakt**: Klasa kontenera `fullHeight`. Łańcuch scrolla poniżej (`AppLayout.astro:70,78,91`) bez zmian.

### Kryteria sukcesu
#### Weryfikacja automatyczna
- E2E (emulacja tabletu, portret i pejzaż): opcje profilu osiągalne w obszarze przewijania; brak nadmiarowego scrolla `body` poza treścią; desktop i listy bez regresji: `npm run e2e`
#### Weryfikacja ręczna
- Na tablecie wszystkie opcje profilu/ustawień dostępne; brak „martwej" przestrzeni pod treścią.

---

## Faza 9: Okno edycji — blokada tła i koniec pętli „wróć do edycji" (tickety 62217cc8 + ac90c2a4)

### Przegląd
Modal edycji nie blokuje tapów poza oknem, a przy „brudnym" formularzu utrzymuje dwa modale Radix naraz → „wróć do edycji" zapętla dialog potwierdzenia na dotyku. Zablokować tło i rozerwać współistnienie modali.

### Wymagane zmiany
#### 1. Blokada interakcji poza edytorem
**Plik**: `src/components/items/EditItemDialog.tsx`
**Cel**: Na `DialogContent` edytora (`:216`) dodać `onInteractOutside`/`onPointerDownOutside` z `preventDefault` — tap poza oknem nie zamyka i nie wyzwala potwierdzenia.
**Kontrakt**: `dialog.tsx` już przekazuje `...props` do Radix `Content` — bez zmian w `dialog.tsx`.
#### 2. Rozerwanie pętli potwierdzenia
**Plik**: `src/components/items/EditItemDialog.tsx`
**Cel**: Potwierdzenie odrzucenia zmian ma wykluczać edytor, nie współistnieć z nim (aby tap w „wróć do edycji" nie był interakcją „poza" wciąż otwartym edytorem). „Wróć do edycji" wraca do edycji raz; „Odrzuć zmiany" zamyka całość.
**Kontrakt**: Logika `requestClose()` (`:122-125`), stan `confirmDiscard` (`:54`), oba Dialogi (`:208-330`, `:332-362`). Zachować zachowanie dla konsumentów (`AcceptedItemsView:492-503`, `PendingItemsView:374`, `SessionEntriesView:216-232`); gałąź read-only (Podgląd, `:131-204`) bez zmian.

### Kryteria sukcesu
#### Weryfikacja automatyczna
- E2E (emulacja dotyku `hasTouch:true`): edycja + zmiana pola + tap poza oknem → tło nieklikalne; dialog „odrzuć/wróć" pojawia się raz; „wróć do edycji" wraca do edytora bez pętli; „odrzuć" zamyka: `npm run e2e`
#### Weryfikacja ręczna
- Na tablecie brak przypadkowego zamykania; „wróć do edycji" działa raz, bez zapętlenia.

---

## Faza 10: Trwałe usunięcie pojedynczego wpisu z kosza (ticket 02790656)

### Przegląd
W koszu można tylko „Wyczyść kosz" (globalnie). Dodać trwałe usunięcie pojedynczego wpisu.

### Wymagane zmiany
#### 1. Endpoint DELETE pojedynczego itemu
**Plik**: `src/pages/api/items/[id].ts`
**Cel**: Dodać eksport `DELETE` (bramka `locals.user`, walidacja UUID jak w `PATCH`, 404 gdy item nie jest w koszu).
**Kontrakt**: `DELETE /api/items/:id` → wywołanie nowego serwisu; `prerender=false`.
#### 2. Serwis trwałego usunięcia
**Plik**: `src/lib/services/items-mutation.ts`
**Cel**: `deleteFromTrash(supabase, id)` — twarde usunięcie wiersza ograniczone do statusów kosza.
**Kontrakt**: `.delete().eq("id", id).in("acceptance_status", ["rejected","deleted"])` (RLS izoluje usera). Wzór: `emptyTrash` (`:200-209`).
#### 3. Hook mutacji
**Plik**: `src/components/hooks/useItemMutation.ts`
**Cel**: `deleteFromTrash(id)` wołający `DELETE /api/items/:id`.
#### 4. Model akcji karty
**Plik**: `src/components/items/item-card.ts`
**Cel**: Dodać `"delete"` do unii `ItemAction` (`:9`) i do `rejected`/`deleted` w `ACTIONS_BY_STATUS` (`:21-22`).
#### 5. Karta — akcja „Usuń trwale"
**Plik**: `src/components/items/ItemCard.tsx`
**Cel**: Prop `onDelete` + bramka `canDelete` + `GhostAction` „Usuń trwale" w bloku akcji (`:166-207`).
#### 6. Widok kosza — podpięcie + potwierdzenie
**Plik**: `src/components/items/TrashItemsView.tsx`
**Cel**: Przekazać `onDelete` do kart (`~:290`), dodać dialog potwierdzenia (wzór „Wyczyść kosz" `:356-388`) i optymistyczne usunięcie (`removeByIds`/`applyOptimistic`/`refetchAfterRemoval`).

### Kryteria sukcesu
#### Weryfikacja automatyczna
- Test jednostkowy/integr. serwisu `deleteFromTrash` (usuwa tylko wiersz w koszu, nie inne): `npm test`
- E2E: w koszu usunięcie pojedynczego wpisu → znika, reszta zostaje; „Wyczyść kosz" nadal działa: `npm run e2e`
- Lint/tsc czyste
#### Weryfikacja ręczna
- Pojedynczy wpis da się trwale usunąć z kosza; potwierdzenie chroni przed przypadkiem.

---

## Faza 11: Triage 6 featurów (bez kodu)

### Przegląd
Sześć zgłoszeń to duże featury/poza zakresem. Potwierdzić zasadność, opisać na prod jako świadomy dług; nie implementować w tym slice.

### Wymagane zmiany
Brak zmian w kodzie. Dla każdego ticketu: komentarz na produkcji (dopisany do opisu) z werdyktem, status zgodnie z regułą.

- `a3beda31` (audio/nagrywanie) — „audio poza MVP, zaplanowane na V2 (OQ2)"; status `new`.
- `9fc5f4a8` (edycja wspomagana AI) — „zasadne, osobna większa zmiana"; `new`.
- `663d01fd` (podział/powielenie/łączenie w torze) — „zasadne, osobna większa zmiana"; `new`.
- `a6a328ce` (redesign interakcji listy) — „zasadne, osobny wycinek UX"; `new`.
- `1c0077b1` (pull-to-refresh) — „gest natywny poza zakresem/weryfikacją Playwright; osobna zmiana"; `new`.
- `3eca2a93` (tuning promptu) — „tuning promptu, poza tą rundą (mock w testach); osobna zmiana z realnym modelem"; `new`.

### Kryteria sukcesu
#### Weryfikacja automatyczna
- Brak (bez kodu).
#### Weryfikacja ręczna
- Na prod: 6 ticketów ma komentarz z werdyktem i poprawny status.

---

## Strategia testowania

### Testy jednostkowe
- Terminologia: zaktualizowane `labels.test.ts`, `state-filter.test.ts`.
- Kosz: nowy test serwisu `deleteFromTrash` (izolacja: usuwa tylko wiersz w koszu).

### Testy E2E (Playwright)
- Jeden scenariusz per faza naprawcza (`e2e/*.spec.ts`): reprodukcja stanu/objawu → weryfikacja poprawki.
- Emulacja tabletu (`viewport` + `hasTouch:true` + `isMobile:true`) dla faz 7, 8, 9.
- Dark mode (cookie `theme=dark`) dla fazy 2.
- **Izolacja danych (decyzja plan-review):** testy mutujące stan konta testowego muszą go przywracać lub tworzyć własne dane. Faza 5 (usunięcie/dodanie klucza BYOK — **przywrócić klucz po teście**, bo `storageState` ma go skonfigurowanego). Faza 6 (akceptacja pending — zależy od danych pending; **utworzyć wsad w setupie**). Faza 10 (trwałe usunięcie z kosza — **wpierw wrzucić wpis do kosza**). Bez izolacji test psuje `storageState` i kolejne scenariusze.

### Kroki testowania ręcznego (dla użytkownika, po weryfikacji przeze mnie)
- Przejść po 10 naprawach na lokalnym Taskerze; sprawdzić 6 komentarzy triage na prod.

### Brama końcowa (przed oddaniem gałęzi)
- `npm run build` zielony (SSR Cloudflare) — uruchamiany raz po wszystkich fazach, **seryjnie** (nie równolegle z `npm run dev` ani `npm run e2e` — psują sobie cache Vite / port 4321).
- `npm run lint` (type-checked) + `npm test` (pełny) zielone na całości gałęzi.

## Uwagi dotyczące migracji
Brak migracji bazy. Fix 10 dodaje endpoint + serwis, bez zmian schematu.

## Referencje
- Triage: `context/changes/prod-feedback-fixes/backlog.md`
- Wzorzec mostu wyspa↔powłoka: `src/components/items/item-topbar-events.ts`, `src/components/hooks/useItemTopbarBridge.ts`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku.

### Faza 1: Marka „TaskerLight" jako link do skrzynki (ticket f4dc0119)
#### Automatyczne
- [x] 1.1 E2E: klik w markę → `/ingest`
- [x] 1.2 Lint/format czyste
#### Ręczne
- [x] 1.3 Logo i napis prowadzą do skrzynki; wygląd niezmieniony (E2E + zachowane klasy)

### Faza 2: Widoczne checkboxy w trybie ciemnym (ticket ef87e4f8)
#### Automatyczne
- [x] 2.1 E2E (dark): checkbox ma widoczny kontrast
- [x] 2.2 Istniejące testy jednostkowe zielone (bez nowego testu)
#### Ręczne
- [x] 2.3 Checkbox widoczny w dark przed/po zaznaczeniu; jasny bez zmian

### Faza 3: Własna ikona „Do akceptacji" (ticket 2d65d300)
#### Automatyczne
- [ ] 3.1 E2E: ikony skrzynki i „Do akceptacji" różne (SVG)
- [ ] 3.2 Lint/format czyste
#### Ręczne
- [ ] 3.3 Obie pozycje mają różne ikony

### Faza 4: Ujednolicenie terminologii stanu „zakończone" (ticket 164608bf)
#### Automatyczne
- [ ] 4.1 Testy jednostkowe (zaktualizowane) zielone
- [ ] 4.2 E2E: akcja/badge/filtr spójne
#### Ręczne
- [ ] 4.3 Brak „Zrobione"/„Zrealizuj"; pomoc spójna

### Faza 5: Reaktywny wskaźnik statusu klucza w powłoce (ticket 80c4f735)
#### Automatyczne
- [ ] 5.1 E2E: usunięcie/dodanie klucza zmienia wskaźnik bez reloadu
#### Ręczne
- [ ] 5.2 Wskaźnik w powłoce zmienia się natychmiast

### Faza 6: Reaktywny licznik „Do akceptacji" + weryfikacja odświeżania listy (ticket 6fa2b64b)
#### Automatyczne
- [ ] 6.1 E2E: częściowa akceptacja — lista i badge aktualne bez reloadu; badge znika przy 0
#### Ręczne
- [ ] 6.2 Licznik i lista aktualne po akceptacji części

### Faza 7: Widoczny scrollbar na tablecie (ticket be20465a)
#### Automatyczne
- [ ] 7.1 E2E (tablet): kontener przewijalny, scrollbar wymuszony
- [ ] 7.2 Lint/format czyste
#### Ręczne
- [ ] 7.3 Widoczny pasek na tablecie; desktop bez regresji

### Faza 8: Wysokość i skala powłoki na tablecie (ticket 0a23baea)
#### Automatyczne
- [ ] 8.1 E2E (tablet portret+pejzaż): opcje profilu osiągalne; brak nadmiarowego scrolla; desktop bez regresji
#### Ręczne
- [ ] 8.2 Wszystkie opcje profilu dostępne na tablecie

### Faza 9: Okno edycji — blokada tła i koniec pętli „wróć do edycji" (tickety 62217cc8 + ac90c2a4)
#### Automatyczne
- [ ] 9.1 E2E (dotyk): tło nieklikalne; dialog raz; „wróć do edycji" bez pętli; „odrzuć" zamyka
#### Ręczne
- [ ] 9.2 Brak przypadkowego zamykania; „wróć do edycji" bez zapętlenia

### Faza 10: Trwałe usunięcie pojedynczego wpisu z kosza (ticket 02790656)
#### Automatyczne
- [ ] 10.1 Test serwisu `deleteFromTrash` (izolacja)
- [ ] 10.2 E2E: usunięcie pojedynczego wpisu; „Wyczyść kosz" nadal działa
- [ ] 10.3 Lint/tsc czyste
#### Ręczne
- [ ] 10.4 Pojedynczy wpis usuwalny; potwierdzenie chroni

### Faza 11: Triage 6 featurów (bez kodu)
#### Ręczne
- [ ] 11.1 6 ticketów na prod z komentarzem i poprawnym statusem
