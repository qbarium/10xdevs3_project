# S-08 — follow-up po weryfikacji ręcznej: BLOKER SSR (dwie kopie Reacta)

## ✅ ROZWIĄZANE — 2026-06-14 (sesja następna)

- **Przyczyna (root cause):** wyścig **wyłącznie w dev** w optymalizatorze zależności Vite. `react` i `react-dom/server` lądowały w różnych generacjach pre-bundla (różne `?v=…`), gdy re-optymalizacja wyzwolona przez zależność odkrytą późno w sesji (`astro/env/runtime`, `zod` z klasyfikacji) przerzucała `react` na nowy hash, a trwający render SSR trzymał stary `react-dom/server` → dwie instancje Reacta. **To nie był bug w kodzie wyspy** (kod hooków poprawny) ani w `node_modules` (`npm ls` → jedna kopia `react@19.2.6`).
- **NIE był to bloker produkcji.** `optimizeDeps`/`?v=` to mechanizm serwera dev Vite; build prod (Rollup, jednorazowy) nie tworzy generacji pre-bundla. **Potwierdzone empirycznie:** `npm run preview` (artefakt prod, workerd) → `GET /import-sessions 200 OK`, wyspa `SessionsList` + chunki (`button`, `alert`) wczytują się czysto. Split jest w buildzie strukturalnie niemożliwy. „Bloker produkcji" z pierwotnej notatki był w istocie **blokerem lokalnego dev**.
- **Faktyczny fix** (`astro.config.mjs`): `vite.resolve.dedupe: ["react","react-dom"]` + `vite.ssr.noExternal: ["react","react-dom"]`. **Architektura ZACHOWANA** (SSR `SessionsList` → `SessionRow` → `useSessionRetry`) — twardy wymóg użytkownika: **brak migotania listy + in-place update wiersza**. Dlatego rekomendacje z dołu tej notatki — **„cofnąć architekturę `081227a`"** oraz **`client:only`** — są **ODRZUCONE**: każda łamałaby jeden z tych warunków (revert → wraca `location.reload()` = skok/migot; `client:only` → lista miga pusto). Bramki: lint ✓, testy 156/156 ✓, build ✓.
- **Resztkowe ryzyko dev (świadomie zaakceptowane):** przejściowy migot dev może wrócić przy pechowej re-optymalizacji; obejście = restart serwera dev lub `Remove-Item -Recurse -Force node_modules\.vite`. Twarde strukturalne kuloodpornienie (`ssr.optimizeDeps.exclude` dla reacta) **nie było ścigane** — bug jest dev-only, a prod jest potwierdzony.
- **Weryfikacja ręczna `## Progress`:** 1.6/2.8/3.3/4.3 odhaczone (2.8/4.3 potwierdzone realnym ponowieniem: invalid_key → ok 2 wpisy, wiersz w miejscu, bez migotania; 3.3 render potwierdzony przez `preview`).

> Poniżej **kontekst historyczny sprzed naprawy** (diagnoza i odrzucone drogi) — zachowany dla audytu, NIE jest już aktualnym stanem.

---

- **Data**: 2026-06-14
- **Status zmiany**: `impl_reviewed` (przegląd `/10x-impl-review` → ZAAKCEPTOWANO), ale **NIE domknięta** — widok dziennika wywala się na SSR.
- **Branch**: `feature/import-session-log-retry` (lokalnie, bez push). HEAD: `5269c60`.
- **Autor notatki**: agent (sesja 2026-06-13/14). Pisana, bo w tej sesji NIE rozwiązałem blokera — ma pozwolić następnej sesji podjąć naprawę z pełnym kontekstem.

---

## TL;DR

Rdzeń S-08 (dane, endpoint retry, logika, 156/156 testów, przegląd) jest **dobry**. Poległ **front**: refaktor listy dziennika na jedną wyspę React `client:load` (commit **`081227a`**) wprowadził błąd SSR „Invalid hook call / `useState` null" — **dwie kopie Reacta w SSR**. `/import-sessions` pada przy renderze, gdy lista ma ≥1 sesję. To NIE jest cache (czyszczenie `.vite` nie pomogło). **Rekomendacja: cofnąć architekturę z `081227a`** do sprawdzonej (lista SSR w Astro + `RetrySessionButton` jako wyspa-liść), albo zdiagnozować dedup Reacta.

---

## Co DZIAŁA (nie ruszać przy naprawie)

- `src/lib/services/import-session.ts` — `getImportSessions` / `getSessionForRetry` / `reopenSession` (warunkowy `UPDATE … WHERE status='failed'` = guard TOCTOU).
- `src/lib/services/session-input.ts` — `loadSessionInput` (paste / plik ze Storage → `decodeFile` → `sanitizeInput`).
- `src/lib/ai/classify-core.ts` — `runClassification` (HTTP-agnostyczny) + `classifyResultToResponse` (jedyne mapowanie HTTP, 422 dla `too_many_items`). `classify.ts` woła rdzeń — bez regresji S-02.
- `src/pages/api/import-sessions/retry.ts` — endpoint POST z pełnymi guardami (auth → walidacja `{sessionId}` → RLS/404 → status=failed/409 → FR-024 missing_key/KEK → loadSessionInput → reopen TOCTOU → rdzeń).
- `src/lib/ingest-errors.ts`, `src/lib/labels.ts` (`importSessionStatusLabel`, `entryNoun`), `src/types.ts` (`ImportSessionWithFile`).
- **Testy: 156/156 zielone** (jednostkowe serwisu/loadSessionInput/classify-core/label + 11 integracyjnych endpointu). Lint czysty. `npm run build` przechodzi (UWAGA: build NIE renderuje stron przez SSR przy `output: server`, więc NIE wychwytuje tego błędu runtime — patrz niżej).
- Logika ponowienia potwierdzona przez użytkownika end-to-end PRZED awarią („Ponowiono: 5 itemów").

---

## BLOKER — szczegóły

### Objaw (z konsoli dev usera)
```
[vite] Invalid hook call. Hooks can only be called inside of the body of a function component.
  1. mismatching versions of React and the renderer  2. breaking Rules of Hooks  3. more than one copy of React
[vite] TypeError: Cannot read properties of null (reading 'useState')
    at useState (node_modules/.vite/deps_ssr/chunk-EMAOOZFV.js?v=ffad07fb)
    at useSessionRetry (src/components/hooks/useSessionRetry.ts:42)
    at SessionRow (src/components/import-sessions/SessionRow.tsx:38)
    at renderWithHooks (.../react-dom_server.js?v=f9dce3dc)   ← renderer to INNA kopia Reacta
```
Różne hashe (`?v=ffad07fb` dla `useState` vs `?v=f9dce3dc` dla `react-dom_server`) = **dwie instancje Reacta** w SSR. Dyspozytor hooków ustawiony na jednej kopii, `useState` wołany z drugiej → `null`.

### Repro
1. `npm run dev` (folder S-08), wejdź na `/import-sessions` z **≥1 sesją** → SSR pada.
2. Pusta lista (0 sesji) NIE pada — bo `SessionsList` zwraca empty-state bez `SessionRow`, więc żaden hook się nie wykonuje.

### Przyczyna (hipoteza, wysoka pewność)
Commit **`081227a`** zamienił dziennik z **listy SSR w Astro** (`SessionsList.astro`) + **wyspy-liścia** `RetrySessionButton.tsx` (`client:load`) na **jedną wyspę React** `SessionsList.tsx` (`client:load`), która renderuje `SessionRow.tsx`, a ten woła hook `useSessionRetry` (`useState`). Astro SSR-uje tę wyspę → w tym ustawieniu Astro+Vite wciąga dwie kopie Reacta do SSR.

### Co WYKLUCZONE / sprawdzone
- **Nie cache.** User wyczyścił `node_modules/.vite` (+ `.astro`) i zrestartował dev — błąd identyczny, hashe nadal różne. Próbowane też incognito.
- **Nie reguły hooków w naszym kodzie.** `useSessionRetry` ma `useState` na top-level; `SessionRow` woła hook na top-level i jest renderowany jako `<SessionRow/>` (element), nie wywoływany jak funkcja. Kod jest poprawny.
- **Inne wyspy w apce DZIAŁAJĄ na `client:load`**: `SignInForm`, `SignUpForm` (`auth/*.astro`), `IngestForm` (`ingest.astro`), `ApiKeyManager` (`profile.astro`). Różnica: **każda z nich jest komponentem-liściem, w którym hook żyje bezpośrednio**. Nasz łańcuch `SessionsList → SessionRow → useSessionRetry` (trzy pliki, hook „głębiej") to jedyne miejsce, które SSR-uje hook przez komponent-dziecko z osobnego pliku — i tylko ono wyzwala dup-React. **Dlaczego dokładnie — NIE zdiagnozowane do końca.**
- **`astro.config.mjs`**: `integrations: [react(), sitemap()]` — brak `vite.resolve.dedupe` / `ssr.noExternal` dla react. To prawdopodobny punkt zaczepienia dla naprawy „config".

### Dlaczego build tego nie łapał
`output: "server"` → strony renderowane przez SSR **w runtime**, nie pre-renderowane przy `npm run build`. Dlatego wszystkie moje zielone buildy NIE przechodziły przez React SSR tej strony i NIE wykrywały błędu. Mój błąd metodyczny: traktowałem zielony build jako dowód, że front działa — nie był.

---

## FELALNE COMMITY (z fazy testów na żywo) i co z nimi

Wszystkie lokalne, **niepushowane**. Kolejność od najnowszego:

| SHA | Co robi | Werdykt |
|---|---|---|
| `5269c60` | opcje selectów filtra: `bg-slate-900 text-white` na `<option>` | **MARTWY/SUPERSEDED** — Chrome ignoruje tło `<option>`; zastąpione przez `color-scheme` (niezacommitowane) |
| `1fafd14` | terminologia „item" → „wpis" w UI (helper `itemNoun`→`entryNoun`, modal, formularz, błędy) | **DOBRY** — zachować |
| `1e1eadf` | rozdzielenie licznika („N wpisów") od linku („Przejdź do walidacji") | **DOBRY** — zachować |
| **`081227a`** | **lista → jedna wyspa React (`SessionsList.tsx` + `SessionRow.tsx`), `location.reload` usunięty, aktualizacja statusu wiersza w miejscu** | **★ SPRAWCA BLOKERA** — to ten refaktor wprowadził dup-React SSR |
| `e828275` | poprzednia próba: `location.reload()` po retry (skok na górę, znikanie z listy) | **MARTWY/SUPERSEDED** przez `081227a` |
| `77de3e5` | domknięcie `/10x-impl-review` (poprawki F1–F3 + raport) | DOBRY — przegląd |
| `ffe1ada` … `5ce2bc6` | fazy 1–4 + epilog + plan/przegląd | DOBRE — rdzeń S-08 |

### Co chciałem wycofać (i czego NIE zrobiłem)
Zamierzałem **cofnąć `081227a`** — wrócić do architektury sprzed niego:
- Przywrócić `src/components/import-sessions/SessionsList.astro` (lista renderowana SSR w Astro, bez hooków).
- Przywrócić `src/components/import-sessions/RetrySessionButton.tsx` (wyspa-liść `client:load`, hook tylko tutaj — **ta wersja DZIAŁAŁA**, user nią skutecznie ponawiał).
- Usunąć `SessionsList.tsx` + `SessionRow.tsx` (wprowadzone w `081227a`).

**Uwaga / pułapka:** to NIE jest czysty `git revert 081227a` — późniejsze commity `1e1eadf` (link/licznik) i `1fafd14` (item→wpis) **modyfikowały** pliki z `081227a` (`SessionRow.tsx`), a `5269c60` + niezacommitowane zmiany dotykają `import-sessions.astro`. Blind-revert się nie nałoży czysto. Trzeba albo ręcznie odtworzyć `SessionsList.astro`/`RetrySessionButton.tsx` (są w historii w `d689114`/`77de3e5`) i ponownie nanieść na nie dobre kosmetyki (wpisy, rozdzielony link, color-scheme), albo naprawić dup-React bez cofania architektury.

---

## Rekomendowane drogi naprawy (wg pewności)

1. **(Najpewniejsza) Cofnąć architekturę `081227a`** → `SessionsList.astro` (SSR) + `RetrySessionButton.tsx` (`client:load`, liść). Sprawdzone, działało. **Koszt:** tracimy „aktualizację statusu wiersza w miejscu" — wraca `location.reload()` po retry albo trzeba lżejsze odświeżenie pojedynczego wiersza. Pliki do odtworzenia są w historii: `git show d689114:src/components/import-sessions/SessionsList.astro` oraz `…:RetrySessionButton.tsx`. Następnie ponownie nanieść: wpisy (`1fafd14`), rozdzielony licznik/link (`1e1eadf`), `color-scheme: dark` (niżej).
2. **`SessionsList client:only="react"`** — pomija SSR wyspy → błąd znika. **Koszt:** lista renderuje się dopiero po wczytaniu JS (miga pusto/fallback); traci SSR. Najmniejsza zmiana kodu, jeśli chcemy utrzymać architekturę React-listy i in-place update.
3. **Dedup Reacta w `astro.config.mjs`** — `vite: { resolve: { dedupe: ['react','react-dom'] }, ssr: { noExternal: [...] } }`. „Właściwy" fix utrzymujący SSR, ale wymaga researchu (czemu akurat ten łańcuch dubluje Reacta) i może mieć skutki uboczne dla innych wysp. Zacząć od `resolve.dedupe`.

Po naprawie: odhaczyć ręczne `## Progress` (1.6/2.8/3.3/4.3), board #12 z `Blocked` → `Review`/`Done`, rozważyć `/10x-lesson` (reguła o wyspach hookowych w tym Astro+React — dopiero po root-cause, żeby była trafna).

---

## Stan niezacommitowany w drzewie roboczym (do decyzji)

```
 M src/layouts/Layout.astro          # inline style="color-scheme: dark" na <html> — POPRAWNY fix ciemnych dropdownów
 M src/pages/import-sessions.astro    # revert eksperymentu bg-slate-900 na <option> (z 5269c60); selectClass bez koloru opcji
```
- Poprawka `color-scheme` jest **dobra** (zamknięte kontrolki stylowane pod motyw; popup natywny renderuje się ciemno; potwierdzone w buildzie, że reguła wchodzi). NIE dało się jej zobaczyć w przeglądarce, bo strona pada wcześniej na SSR. Zachować przy naprawie.
- Decyzja usera nt. commitowania tych zmian: PENDING.

---

## Stan weryfikacji ręcznej (`## Progress`)
- `1.6` (getImportSessions sort/filtr) — nie potwierdzone formalnie.
- `2.8` (retry realnej sesji) — **działało** przed awarią (user ponowił → 5 itemów), potem znaleziono UX-issues, potem SSR-awaria.
- `3.3` (dziennik + sort/filtr + redirect) — zablokowane SSR-awarią.
- `4.3` (inline retry: spinner/sukces/porażka/podwójny klik/klucz usunięty) — częściowo widziane, niedomknięte.
- Dropdowny filtra: bug „białe opcje" zdiagnozowany (brak `color-scheme` na ciemnym motywie) i naprawiony niezacommitowaną zmianą — niezweryfikowany wizualnie z powodu SSR-awarii.

---

## UX-decyzje z tej sesji (utrwalone, do zachowania)
- „N wpisów" jako informacja + osobny link „Przejdź do walidacji" (rozdzielone obszary) — `1e1eadf`.
- Terminologia „wpis" zamiast „item" w UI — `1fafd14`. **Ujednolicenie „element"→„wpis" w widoku walidacji (`/items`) ODŁOŻONE na osobny slice** (decyzja usera).
- Most „dziennik → itemy danej sesji": świadomy Non-Goal S-08 (FR-027); naturalnie należy do **S-09** (filtr sesji) + zależy od S-05/S-06. NIE dokładać do S-08.
- Dropdown w pełni stylowany pod motyw (custom shadcn Select) → rozważyć w **S-09**; w MVP natywny + `color-scheme: dark` wystarcza.
