# S-12 dup-react-ssr-dev-fix — Plan implementacji

## Przegląd

Wyeliminować u źródła wyścig „Invalid hook call / more than one copy of React", który wywala render SSR wysp React (`/import-sessions`, `/items*`) w `npm run dev`. Root-cause (z `research.md`): środowisko optymalizatora dev renderujące wyspy (`deps_ssr`) pozostawia **całą populację ~14 zależności jako późno-odkrywane**; przypięty jest tylko `astro/env/runtime`. Dowolna z nich, odkryta w trakcie sesji, wyzwala re-optymalizację (`optimized dependencies changed. reloading`), która bumpuje `browserHash` środowiska SSR i rozjeżdża generacje `?v=` Reacta (`react` core vs `react-dom/server`) w jednym renderze → dwie instancje Reacta.

Naprawa: **kompleksowo przypiąć całą tę populację** w `ssr.optimizeDeps.include`, tak by cold-scan złapał ją od razu i żadna mid-session re-opt nie odpaliła. To ten sam wzorzec co fix S-10 (`astro/env/runtime`), zastosowany do wszystkich pozostałych triggerów zamiast jednego. Dług techniczny **wyłącznie dev** — build prod (Rollup) nie ma `optimizeDeps`/`?v=`.

## Analiza stanu obecnego

Obecny `astro.config.mjs` (Code References z `research.md`):

- `astro.config.mjs:16-18` — `resolve.dedupe:["react","react-dom"]` (rozdzielczość jednej fizycznej kopii; **NIE** kontroluje generacji `?v=`).
- `astro.config.mjs:25-27` — `optimizeDeps.include:["astro/env/runtime"]` (środowisko klienta `deps/`).
- `astro.config.mjs:28-38` — `ssr.noExternal:["react","react-dom"]` z komentarzem twierdzącym, że wyjmuje Reacta z mechanizmu `?v=` w SSR. **Dysk to obala:** `deps_ssr/_metadata.json` pokazuje React w pełni zoptymalizowany jako chunk `?v=`. `noExternal` zadziałał tylko w `deps_astro` (tam brak Reacta w grafie).
- `astro.config.mjs:41-43` — `ssr.optimizeDeps.include:["astro/env/runtime"]` (dosięgło `deps_ssr`, ale tylko tę jedną pozycję).

Dowód rozstrzygający (`deps_ssr/_metadata.json`, ogon linii 4801–4890 = późno odkryte): `react` (4801), `react-dom/server.edge.js` (4825), `@radix-ui/react-slot` (4831), `@supabase/ssr` (4837), `class-variance-authority` (4843), `clsx` (4849), `lucide-react` (4855), `radix-ui` (4861), `sonner` (4867), `tailwind-merge` (4873), `zod` (4879). Przypięty tylko `astro/env/runtime` (linia 7).

Potwierdzone nazwy pakietów (`package.json`): `radix-ui` (^1.5.0, zunifikowany — `select.tsx`/`dialog.tsx`) i `@radix-ui/react-slot` (^1.1.2, scoped — `button.tsx`) to **dwie odrębne pozycje**.

## Pożądany stan końcowy

Na zimnym starcie `npm run dev` (cache `.vite`/`.astro` odstawiony BEZ `--force`), sesja realnie dotykająca wszystkich klas późnych depów (middleware → render wyspy `/import-sessions` + `/items*` → otwarcie dialogu edycji/dodawania itemu → trasa API z `zod`) daje w logu dev **zero wystąpień `optimized dependencies changed. reloading`** i **zero `Invalid hook call`**. Strukturalnie: cała rodzina React + przypięta populacja znajdują się na **początku** `optimized` w `deps_ssr/_metadata.json`, nie w ogonie.

### Kluczowe odkrycia:

- Kryterium „naprawione" (z `lessons.md` §68 i `change.md`) to **BRAK mid-session re-optymalizacji na zimnym starcie**, a nie pojedynczy udany render. Ustabilizowany snapshot na dysku nigdy nie pokaże przejściowego rozjazdu (`react` i `react-dom/server` dzielą wtedy jeden hash) — jedyny wiarygodny sygnał to brak samego zdarzenia reopt.
- Sam split zachodzi przy **dowolnej** re-opt, niezależnie która zależność ją odpali. Dlatego przypięcie samej rodziny React jest konieczne, ale **niewystarczające** — trzeba przypiąć całą populację, by zdarzenie reopt w ogóle nie wystąpiło (decyzja użytkownika: cała populacja).
- Astro 6 ma trzy środowiska optymalizatora (`deps/` klient, `deps_ssr/` render wysp, `deps_astro/` drugie SSR). Legacy-klucze `ssr.*` mapują się na nie **nierówno** — `ssr.optimizeDeps.include` dosięgło `deps_ssr`, ale nie `deps_astro` (`deps_astro/_metadata.json:1213` — `astro/env/runtime` znów późny).
- `lessons.md` §68 wprost przewidział ten stan (residual S-10: „gdyby pojawił się INNY późno odkrywany dep → dorzucić do include") — to nie regresja S-11, tylko residual S-10.

## Czego NIE robimy

- **Nie** downgrade'ujemy Reacta ani nie ruszamy wersji zależności (zakaz z `lessons.md`).
- **Nie** uruchamiamy `npm audit fix --force` ani żadnego bulk-fixa (zakaz z `lessons.md`).
- **Nie** usuwamy `ssr.noExternal` (decyzja użytkownika: zostaw + popraw komentarz — ma udowodniony efekt w `deps_astro`).
- **Nie** dodajemy od razu parytetu top-level `optimizeDeps.include` — najpierw ssr-only, top-level dobierany empirycznie po inspekcji `deps_astro` (decyzja użytkownika).
- **Nie** traktujemy zielonego `npm run build` jako dowodu naprawy dev SSR (przy `output:"server"` build nie SSR-uje stron).
- **Nie** ruszamy `resolve.dedupe` (rozdzielczość jest poprawna; problem leży w generacji `?v=`, nie w liczbie fizycznych kopii).

## Podejście do implementacji

Trzy fazy z twardym STOP na weryfikacji. Faza 1 to jedyna edycja kodu (config). Faza 2 to deterministyczna weryfikacja ręczna (gate człowieka) połączona z empirycznym rozstrzygnięciem, czy `deps_astro` wymaga parytetu top-level. Faza 3 zostawia trwały guard, by czwarta deklaracja „naprawione" nie mogła być fałszywa.

## Krytyczne szczegóły implementacji

**Rozdzielczość `react-dom/server` pod adapterem edge/workerd.** Pod Cloudflare `react-dom/server` rozwiązuje się przez warunki eksportu do `react-dom/server.edge.js` (dysk: `deps_ssr/_metadata.json:4825` pokazuje dokładnie `react-dom/server.edge.js`). Wpis `include: "react-dom/server"` musi się rozwiązać przez te warunki — to standardowy specyfikator i Vite honoruje warunki środowiska, więc oczekiwany rezultat to pre-bundling wariantu edge. **Jeśli** cold-start rzuci błąd resolve na `react-dom/server`, to sygnał, że pod tym adapterem specyfikator wymaga innego wariantu — wtedy zweryfikować rozwiązany warunek zanim się go obejdzie (nie usuwać pinu na ślepo). To jedyny wpis listy, którego rozwiązanie nie jest oczywiste z `package.json`.

---

## Faza 1: Pin populacji triggerów + rewizja `ssr.noExternal`

### Przegląd

Rozszerzyć `ssr.optimizeDeps.include` z jednej pozycji (`astro/env/runtime`) do całej populacji ~14 późno-odkrywanych zależności, tak by cold-scan `deps_ssr` złapał je od razu. Zachować `ssr.noExternal`, ale przepisać wprowadzający w błąd komentarz na zgodny z dowodem z dysku.

### Wymagane zmiany:

#### 1. Rozszerzenie `ssr.optimizeDeps.include` o pełną populację

**Plik**: `astro.config.mjs`

**Cel**: Przypiąć całą populację późno-odkrywanych zależności `deps_ssr`, by żadna nie wyzwoliła mid-session re-optymalizacji podczas renderu wysp. To eliminuje trigger wyścigu u źródła.

**Kontrakt**: `ssr.optimizeDeps.include` staje się tablicą 15 specyfikatorów (zachowany `astro/env/runtime` + 14 nowych). Dokładna lista, w kolejności rodzina-React → deps-aplikacji:

```
"astro/env/runtime",
"react", "react-dom", "react-dom/server", "react/jsx-runtime", "react/jsx-dev-runtime",
"@supabase/ssr", "zod", "sonner", "lucide-react",
"radix-ui", "@radix-ui/react-slot", "class-variance-authority", "clsx", "tailwind-merge"
```

Każdy specyfikator musi odpowiadać zainstalowanemu pakietowi (zweryfikowane wobec `package.json`). `radix-ui` i `@radix-ui/react-slot` to dwie osobne pozycje. Top-level `optimizeDeps.include` **pozostaje** `["astro/env/runtime"]` (rozstrzygane empirycznie w Fazie 2).

#### 2. Rewizja komentarza `ssr.noExternal`

**Plik**: `astro.config.mjs`

**Cel**: Dyrektywa `ssr.noExternal:["react","react-dom"]` zostaje (udowodniony efekt w `deps_astro`), ale jej komentarz (`:28-38`) obecnie twierdzi, że wyjmuje Reacta z mechanizmu `?v=` w SSR — co dysk obala. Przepisać komentarz, by odzwierciedlał rzeczywistość i wskazywał realną dźwignię.

**Kontrakt**: Nowy komentarz stwierdza: (a) `noExternal` zadziałał w `deps_astro` (tam brak Reacta w grafie), ale **NIE** chroni ścieżki crashu — `deps_ssr` ma Reacta jako chunk `?v=`; (b) realną dźwignią eliminującą trigger jest pin rodziny React + populacji w `ssr.optimizeDeps.include` (zmiana #1); (c) dyrektywę trzymamy dla `deps_astro`, jej konieczność na workerd jest niepotwierdzona (patrz Faza 2). Odwołanie do `context/changes/dup-react-ssr-dev-fix/` zamiast martwej ścieżki S-08.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Lint przechodzi: `npm run lint`
- Build prod pozostaje zielony (config parsuje się, prod nietknięty): `npm run build`

#### Weryfikacja ręczna:

- Diff `astro.config.mjs` zawiera dokładnie 15 specyfikatorów w `ssr.optimizeDeps.include`, zgodnych z `package.json`.
- Komentarz `ssr.noExternal` przepisany — nie twierdzi już, że wyjmuje Reacta z `?v=` w SSR; wskazuje pin jako realną dźwignię.
- Top-level `optimizeDeps.include` nietknięty (`["astro/env/runtime"]`).

**Uwaga implementacyjna**: Po tej fazie i przejściu weryfikacji automatycznych, zatrzymaj się. Faza 2 (weryfikacja deterministyczna) wymaga ręcznej sesji dev człowieka — to gate, nie krok automatyczny.

---

## Faza 2: Deterministyczna weryfikacja + empiryczne rozstrzygnięcie parytetu

### Przegląd

Odtworzyć DOKŁADNY tryb awarii na zimnym starcie i potwierdzić brak zdarzenia reopt na pełnej sesji. Przy okazji zinspektować `deps_astro/_metadata.json` i rozstrzygnąć empirycznie, czy wymaga parytetu top-level `optimizeDeps.include` — jeśli tak, dołożyć go i re-weryfikować.

### Wymagane zmiany:

#### 1. Wykonanie protokołu weryfikacji (człowiek)

**Plik**: — (procedura, nie edycja kodu)

**Cel**: Udowodnić strukturalnie i behawioralnie, że trigger zniknął, pokrywając ścieżki, których hammer S-10 nie pokrył (dialog=`zod`, API=`zod`).

**Kontrakt**: Procedura deterministyczna:
1. Odstaw cache **BEZ `--force`**: usuń `node_modules/.vite` i `.astro`. `--force` tłumi re-optymalizację → fałszywy zielony wynik. Nie usuwaj `node_modules`.
2. Zimny start `npm run dev`.
3. Pokryj wszystkie klasy późnego odkrycia w jednej sesji:
   - pierwsze żądanie przez middleware (`@supabase/ssr`),
   - render wyspy `/import-sessions` **oraz** `/items*` (`react-dom/server`, `lucide-react`, `sonner`, `radix-ui`, `button→cva/clsx/tailwind-merge`),
   - **otwarcie dialogu edycji/dodawania** itemu (ścieżka `zod` — kluczowa luka pokrycia S-10),
   - trafienie trasy API z `zod` (`/api/items/[id]`, `/api/import-sessions/[id]/items`, classify).
4. Sukces = **zero** `optimized dependencies changed. reloading` **i** zero `Invalid hook call` w logu na całej sesji.

#### 2. Inspekcja `deps_ssr` i `deps_astro` + empiryczne rozstrzygnięcie parytetu

**Plik**: `astro.config.mjs` (warunkowa edycja)

**Cel**: Potwierdzić strukturalnie, że pin zadziałał w `deps_ssr`, i ustalić, czy `deps_astro` aktywuje się na workerd z późną populacją (Open Question 3 badania). Jeśli tak — dołożyć lustrzany top-level `optimizeDeps.include`.

**Kontrakt**: Po sesji z kroku #1 (bez `--force`):
- `node_modules/.vite/deps_ssr/_metadata.json` — cała rodzina React + przypięta populacja na **początku** `optimized` (nie w ogonie 4800+). To dowód strukturalny.
- `node_modules/.vite/deps_astro/_metadata.json` — sprawdź, czy istnieje i czy zawiera populację jako **późno odkrytą**. Rozstrzygnięcie:
  - Jeśli `deps_astro` **nie** aktywuje się przy renderze wysp na tym adapterze (lub nie pokazuje późnej populacji) → top-level parytet zbędny; zostaw `optimizeDeps.include:["astro/env/runtime"]`. Udokumentuj obserwację.
  - Jeśli `deps_astro` **pokazuje** populację jako późną i firuje reopt → dołóż tę samą listę 15 specyfikatorów do top-level `optimizeDeps.include`, po czym powtórz kroki #1 (zimny start, pełne pokrycie) dla potwierdzenia zera reopt.

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- `deps_ssr/_metadata.json` po zimnym starcie: rodzina React + populacja na początku `optimized`, nie w ogonie (inspekcja pliku).
- (Jeśli dołożono top-level parytet) build pozostaje zielony: `npm run build`.

#### Weryfikacja ręczna:

- Log dev z pełnej sesji (middleware + `/import-sessions` + `/items*` + otwarty dialog + trasa API z `zod`): **zero** `optimized dependencies changed. reloading` i zero `Invalid hook call`.
- `deps_astro/_metadata.json` zinspektowany; decyzja o parytecie top-level podjęta i udokumentowana (dołożony lub uzasadnienie pominięcia).
- NIE użyto `--force` w tej sesji.

**Uwaga implementacyjna**: To gate człowieka. Zatrzymaj się po potwierdzeniu zera reopt na pełnej sesji, zanim przejdziesz do Fazy 3.

---

## Faza 3: Zabezpieczenie przed regresją

### Przegląd

Zostawić trwały artefakt, by czwarta deklaracja „naprawione" nie mogła być fałszywa i by dodanie nowego depu wyspy nie przywróciło problemu po cichu.

### Wymagane zmiany:

#### 1. Wpis do `lessons.md`

**Plik**: `context/foundation/lessons.md`

**Cel**: Skodyfikować regułę wyniesioną z tej zmiany — pin całej populacji (nie jednego depu), weryfikacja z pokryciem dialog+API, reguła utrzymania.

**Kontrakt**: Nowy wpis (format `## Tytuł` + Context / Problem / Rule / Applies to, jak istniejące). Reguła obejmuje: (a) dla tej klasy buga przypinaj **całą populację** późno-odkrywanych depów w `ssr.optimizeDeps.include`, nie pojedynczy dep — sam split zachodzi przy dowolnej reopt; (b) weryfikuj zero-reopt na sesji pokrywającej **dialog (`zod`) i trasę API**, nie tylko render strony — to była luka S-10; (c) reguła utrzymania: nowy dep osiągalny z grafu wyspy → dopisz do `include`. `Applies to: implement, impl-review, research, plan, plan-review`.

#### 2. Skodyfikowanie procedury repro

**Plik**: `context/changes/dup-react-ssr-dev-fix/follow-ups/repro.md` (lub sekcja w follow-up)

**Cel**: Zostawić kopiowalną procedurę deterministycznego repro, by przyszła weryfikacja tej klasy nie musiała jej odtwarzać z pamięci.

**Kontrakt**: Krótki dokument z procedurą z Fazy 2 (odstaw cache bez `--force` → zimny start → pełne pokrycie ścieżek → kryterium zero-reopt) + lista „co NIE jest dowodem" (zielony build, pojedynczy render, sesja z `--force`, `reopt_fired=0` bez dialogu/API).

### Kryteria sukcesu:

#### Weryfikacja automatyczna:

- Prettier na dotkniętych plikach md przechodzi (celowany, nie `npm run format` na całym repo — `lessons.md` §„Formatuj celowanymi ścieżkami").

#### Weryfikacja ręczna:

- Wpis `lessons.md` oddaje regułę: cała populacja + pokrycie dialog/API + reguła utrzymania.
- `follow-ups/repro.md` zawiera procedurę i listę „co NIE jest dowodem".

**Uwaga implementacyjna**: Po tej fazie zmiana jest gotowa do `/10x-impl-review`. Parent Issue S-12 pozostaje w `Review` do domknięcia przeglądu.

---

## Strategia testowania

### Testy jednostkowe:

- Brak — to zmiana konfiguracji dev-only, bez logiki do testu jednostkowego. Vitest istnieje w projekcie, ale ta klasa błędu (wyścig optymalizatora dev) nie jest testowalna jednostkowo.

### Testy integracyjne:

- Brak automatyzowalnego testu integracyjnego dla tej klasy — błąd jest przejściowym wyścigiem widocznym tylko w oknie re-optymalizacji dev. Jedyny wiarygodny sygnał to brak zdarzenia reopt (Faza 2).

### Kroki testowania ręcznego:

1. Odstaw `node_modules/.vite` + `.astro` **bez `--force`**; zimny start `npm run dev`.
2. Wejdź na `/import-sessions`, potem `/items`, `/items/active`, `/items/trash`.
3. Otwórz dialog edycji itemu i dialog dodawania itemu (ścieżka `zod`).
4. Wykonaj żądanie do trasy API z `zod` (np. edycja itemu → `PATCH /api/items/[id]`).
5. Sprawdź log dev: zero `optimized dependencies changed. reloading`, zero `Invalid hook call`.
6. Zinspektuj `deps_ssr/_metadata.json` (populacja na początku) i `deps_astro/_metadata.json` (parytet potrzebny?).

## Uwagi dotyczące wydajności

- Cold-scan pre-bundluje o ~14 pozycji więcej od razu → nieznacznie dłuższy pierwszy start dev. Akceptowalne: eliminuje mid-session reload (który jest kosztowniejszy w DX niż jednorazowy dłuższy cold-scan).
- Build prod nietknięty — `optimizeDeps` nie istnieje w Rollupie.

## Uwagi dotyczące migracji

- Brak migracji danych/schematu. Zmiana wyłącznie w `astro.config.mjs` + artefakty dokumentacyjne (Faza 3).
- Wycofanie: rewert edycji `astro.config.mjs` przywraca stan sprzed zmiany (config jest jedynym kodem).

## Referencje

- Powiązane badania: `context/changes/dup-react-ssr-dev-fix/research.md`
- Tożsamość zmiany: `context/changes/dup-react-ssr-dev-fix/change.md`
- Lekcje tej klasy: `context/foundation/lessons.md` §54 („Bug widoczny tylko w dev…"), §68 („«Naprawione» = brak reopt na zimnym starcie…")
- Historia: `context/archive/2026-06-13-import-session-log-retry/follow-ups/review-fixes.md` (S-08), `context/archive/2026-06-24-session-items-detail/follow-ups/review-fixes.md` (S-10)
- Obecny config: `astro.config.mjs:16-44`

## Postęp

> Konwencja: `- [ ]` oczekujące, `- [x]` wykonane. Dołącz ` — <commit sha>` po zakończeniu kroku. Nie zmieniaj nazw tytułów kroków. Zobacz `references/progress-format.md`.

### Faza 1: Pin populacji triggerów + rewizja `ssr.noExternal`

#### Automatyczne

- [x] 1.1 Lint przechodzi: `npm run lint`
- [x] 1.2 Build prod pozostaje zielony: `npm run build`

#### Ręczne

- [x] 1.3 `ssr.optimizeDeps.include` zawiera dokładnie 15 specyfikatorów zgodnych z `package.json`
- [x] 1.4 Komentarz `ssr.noExternal` przepisany zgodnie z dowodem z dysku; top-level `optimizeDeps.include` nietknięty

### Faza 2: Deterministyczna weryfikacja + empiryczne rozstrzygnięcie parytetu

#### Automatyczne

- [ ] 2.1 `deps_ssr/_metadata.json`: rodzina React + populacja na początku `optimized`, nie w ogonie
- [ ] 2.2 (Warunkowo, jeśli dołożono top-level parytet) build zielony: `npm run build`

#### Ręczne

- [ ] 2.3 Pełna sesja (middleware + `/import-sessions` + `/items*` + dialog + trasa API z `zod`): zero `optimized dependencies changed. reloading` i zero `Invalid hook call`
- [ ] 2.4 `deps_astro/_metadata.json` zinspektowany; decyzja o parytecie top-level podjęta i udokumentowana
- [ ] 2.5 Sesja weryfikacyjna wykonana BEZ `--force`

### Faza 3: Zabezpieczenie przed regresją

#### Automatyczne

- [ ] 3.1 Prettier na dotkniętych plikach md (celowany, nie całe repo)

#### Ręczne

- [ ] 3.2 Wpis `lessons.md`: cała populacja + pokrycie dialog/API + reguła utrzymania
- [ ] 3.3 `follow-ups/repro.md`: procedura + lista „co NIE jest dowodem"
