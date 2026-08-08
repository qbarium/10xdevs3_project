<!-- IMPL-REVIEW (narastający, per faza) -->
# Impl-review — prod-feedback-fixes (per faza)

> Przegląd implementacji po każdej fazie (orkiestrator, autonomicznie). Weryfikacja zachowania: Playwright. Skalowanie: fazy trywialne → lekki przegląd; fazy złożone (5, 6, 8, 9, 10) → pełniejszy (agent-recenzent / adwersarialna weryfikacja). Werdykt per faza.

## Faza 1: Marka „TaskerLight" jako link (f4dc0119) — 2026-08-08
- **Commit:** b3475c8
- **Zgodność z planem:** ✅ marka `<div>` → `<a href="/ingest">` z `aria-label`, zwijanie `max-[920px]:justify-center`, bez `aria-current`/pierścienia — dokładnie kontrakt Fazy 1.
- **Test:** `e2e/prod-fixes-phase1-brand-link.spec.ts` — red→green; klik `getByRole('link',{name:/TaskerLight/i})` → `toHaveURL(/\/ingest$/)`. Weryfikuje zachowanie (nawigację), nie tylko obecność elementu.
- **Regresja:** dzieci (badge+span) i klasy układu zachowane; lint czysto.
- **Dostępność:** link ma opisowy `aria-label`. ✅
- **Werdykt:** ZAAKCEPTOWANO, 0 poprawek.

## Faza 2: Widoczne checkboxy w dark (ef87e4f8) — 2026-08-08
- **Zgodność z planem:** ✅ centralna zmiana `checkbox.tsx` — dodane `dark:border-white/40 dark:bg-white/10` (usunięte słabe `dark:bg-input/30`); tryb jasny i stan zaznaczony (`bg-primary`) bez zmian. Jedna zmiana pokrywa wszystkie listy.
- **Test:** `prod-fixes-phase2-dark-checkbox.spec.ts` — red→green oparty na REALNYM kontraście: kolory (oklch) renderowane w canvasie 2D, dystans RGB ramki do tła karty. Przed: 59.9 (próg 100) → RED; po: 160.7 → GREEN. Weryfikacja widoczności, nie snapshot implementacji.
- **Regresja:** `npm test` 558/558; screenshoty 4 stanów (dark/light × checked/unchecked) potwierdziły brak regresji jasny/checked.
- **Uwaga:** agent samodzielnie wykrył i poprawił błąd własnej metody pomiaru (start blendu od checkboxa zamiast tła) przed wyciągnięciem wniosku o RED — pomiar rzetelny.
- **Werdykt:** ZAAKCEPTOWANO, 0 poprawek.

## Faza 3: Własna ikona „Do akceptacji" (2d65d300) — 2026-08-08
- **Zgodność z planem:** ✅ nowy wariant `clipboard-check` w `Icon.astro` (schowek + „ptaszek", styl lucide); w `AppSidebar` „Do akceptacji" `inbox`→`clipboard-check`; `tray` (skrzynka) nietknięty.
- **Test:** `prod-fixes-phase3-inbox-icon.spec.ts` — pixel-diff dwóch ikon sidebara (screenshot → canvas `getImageData` → odsetek różnych pikseli, znormalizowany rozmiar/kolor). Przed (tray vs inbox): 0.259; po (tray vs clipboard-check): 0.376; próg 0.32. RED→GREEN, dodatkowo zweryfikowane revert→RED, restore→GREEN.
- **Rzetelność:** agent porównał 4 kandydatów ikon (clipboard-check najlepsza separacja 0.383); wykrył, że „list-checks" wygląda różnie, a scoring ma bliski baseline — pixel-diff się obronił.
- **Uwaga:** próg 0.32 skalibrowany między realnym „przed" a „po" (nie intuicyjny); test lekko wrażliwy na render, ale podwójnie zweryfikowany. Stary wariant `inbox` pozostał zdefiniowany, nieużywany (nieszkodliwe, poza zakresem).
- **Werdykt:** ZAAKCEPTOWANO, 0 poprawek.

## Faza 4: Ujednolicenie terminologii „Zakończone" (164608bf) — 2026-08-08
- **Zgodność z planem:** ✅ done→„Zakończone" (`labels.ts:18` + per-typ `:26-29` wszystkie „Zakończone"); akcja „Zrealizuj"→„Zakończ" (`operational-transitions.ts`); `help.astro` przepisany (usunięty akapit o „dwóch słowach", już nieprawdziwy); filtr (`state-filter.ts`) bez zmian. Grep domknięty: 8 miejsc w `src/` + 2 istniejące specy (`happy-path-smoke`, `help.spec` — inaczej pękłyby).
- **Test:** `prod-fixes-phase4-terminology.spec.ts` — red→green (cofnięcie `labels`+`help` do HEAD → RED 2/2; przywrócenie → GREEN 2/2). Sprawdza filtr, menu bulk „Zmień stan", badge na `/items/done`, sekcję pomocy: wymaga „Zakończone"/„Zakończ", brak „Zrobione"/„Zrealizuj".
- **Weryfikacja:** `npm test` 558/558; Playwright 8/8 (nowy + 2 zmodyfikowane); `tsc` + `eslint` czyste.
- **Obserwacja (dług, nie blokuje):** czasownik „Zakończ" z `operational-transitions.ts` jest dziś nieosiągalny w UI — interaktywny tryb `OperationalStatusBadge` (menu z czasownikami) nie ma konsumenta (`ItemCard` renderuje read-only; edycję przejął `EditItemDialog` z rzeczownikowym `Select`). Zmiana ujednolica string defensywnie; stan pre-istniejący, nie wprowadzony tą fazą. Widoczna terminologia (badge/filtr/pomoc) jest spójna.
- **Werdykt:** ZAAKCEPTOWANO, 0 poprawek.

## Faza 5: Reaktywny wskaźnik klucza (80c4f735) — 2026-08-08
- **Zgodność z planem:** ✅ nowy `sidebar-events.ts` (`BYOK_KEY_CHANGED_EVENT`, `dispatchKeyChanged`/`onKeyChanged`, wzór `item-topbar-events`, rozszerzalny o pending dla F6); `useApiKey` emituje po save/remove; `AppSidebar` inline `<script>` (progresywne wzbogacenie — decyzja plan-review) + selektory `data-key-dot`/`data-key-label`. Import w Astro inline script potwierdzony precedensem `SessionBanner.astro`.
- **Test:** `prod-fixes-phase5-key-indicator.spec.ts` — red→green (wyłączenie emisji → RED: sidebar „klucz aktywny" zamiast „brak klucza", karta już przełączona — dokładnie ticket; przywrócenie → GREEN).
- **Izolacja:** podwójna — `finally` przywraca klucz + `afterEach` re-save przez API; `seed.spec` przeszedł po teście (konto kończy z kluczem). Obsłużony wyścig hydratacji (`toPass` retry).
- **Weryfikacja:** `npm test` 558/558, `tsc` czysto, lint (po `lint:fix`).
- **Werdykt:** ZAAKCEPTOWANO, 0 poprawek.

## Faza 6: Reaktywny licznik „Do akceptacji" (6fa2b64b) — 2026-08-08
- **Objaw (a) „elementy zostają na liście":** potwierdzony jako JUŻ naprawiony (nieodtwarzalny) — test akceptuje 2/3 pending, zaakceptowane znikają bez reloadu (przed i po fixie). `PendingItemsView` już miał `removeByIds`+`refetchAfterRemoval`.
- **Objaw (b) licznik:** ✅ `sidebar-events.ts` +`pending-count-changed`; `PendingItemsView` emituje `dispatchPendingDelta(-count)` po sukcesie; badge w `AppSidebar` reaktywny (inline script), znika przy 0.
- **Test:** `prod-fixes-phase6-pending-counter.spec.ts` — red→green (`data-pending-badge` nie istniał → RED; po fixie GREEN); seed 3 pending przez `/ingest` (mock classifier), akceptacja częściowa, dekrement + gałąź „zero".
- **Dbałość:** agent wykrył ryzyko kaskady (natywny atrybut `hidden` vs warstwy Tailwind) i użył wykluczających się klas (`inline-flex`/`hidden`) zamiast atrybutu — bezpieczniejsze, spójne z toggle kropki klucza.
- **Weryfikacja:** pełny E2E 16/16 (F1/F5 współdzielą pliki — przeszły); `npm test` 558/558; lint czysto.
- **Werdykt:** ZAAKCEPTOWANO, 0 poprawek.

## Faza 7: Widoczny scrollbar na tablecie (be20465a) — 2026-08-08
- **Zgodność z planem:** ✅ nowa utilitka `.scrollbar-stable` w `global.css` (`scrollbar-width: thin` + `scrollbar-color` + `::-webkit-scrollbar` 10px, tokeny motywu); dodana do wspólnej klasy 5 kontenerów list (Trash/Accepted/Pending/SessionEntries/ImportSessions). Wybór klasy nad globalnym selektorem — świadomy (nie objąć sidebara/dropdownów).
- **Uczciwość weryfikacji (wzorowa):** agent zmierzył przed/po na tablecie i desktopie; `offsetWidth-clientWidth=0` zawsze (rezerwacja miejsca na pasek NIEobserwowalna w tym headless Chromium — nie touch-specific, limit środowiska). Sam obalił początkowy fałszywy red→green i przepisał test. Realny red→green: STRUKTURALNY (computed `scrollbar-width` auto→thin); drugi test — brak regresji desktop.
- **Ograniczenie:** wizualna widoczność/rezerwacja paska na realnym tablecie (Android Chrome/iPadOS Safari; iOS `scrollbar-width` od 18.2) — poza zasięgiem headless, do ręcznej weryfikacji użytkownika.
- **Weryfikacja:** spec 2/2, `npm test` 558/558, `tsc`/`eslint`/`prettier` czyste.
- **Werdykt:** ZAAKCEPTOWANO — fix dostarczony i zweryfikowany strukturalnie; pełne potwierdzenie wizualne w gestii ręcznej weryfikacji na tablecie.

## Faza 8: Wysokość i skala powłoki na tablecie (0a23baea) — 2026-08-08
- **Zgodność z planem:** ✅ `Layout.astro` — meta viewport `initial-scale=1`; `h-screen` → `h-[100dvh]` (arbitrary value, bo `h-dvh` keyword niepewny w Tailwind 4.2.4); komentarz zaktualizowany. Pominięto `viewport-fit=cover` (brak obsługi safe-area — słusznie, nie dodawać bez kompensacji).
- **Reprodukcja (uczciwa):** initial-scale red→green MIERZALNY; klasa dvh red→green strukturalny; `height==innerHeight` NIE red→green (headless 100vh==100dvh — no-regression only); objaw „opcje pod krawędzią" NIE odtwarza się headless (wymaga realnego paska adresu) — udokumentowane.
- **Regresja (kluczowa, globalny promień rażenia):** 4 strony × 3 viewporty = 12 kombinacji zielone (przed i po); dodatkowo invariant S-15 `config-banner-shell-layout.spec` (powłoka nie używa sztywnego 100vh) + phase7 — 3/3. dvh nie złamał S-15.
- **Dbałość:** `document.body.scrollHeight` (nie `scrollingElement` — `astro-dev-toolbar` zawyża w dev), wzór z `config-banner-shell-layout`.
- **Weryfikacja:** spec 16 testów green, `npm test` 558/558, lint czysto.
- **Ograniczenie:** realna korzyść dvh (recalc przy pasku adresu/rotacji) + zniknięcie „dead space" na fizycznym tablecie — do ręcznej weryfikacji użytkownika.
- **Werdykt:** ZAAKCEPTOWANO — fix zasadny, regresja wykluczona; pełne potwierdzenie tabletowe w ręcznej weryfikacji.

## Faza 9: Okno edycji — blokada tła i koniec pętli (62217cc8 + ac90c2a4) — 2026-08-08
- **Zgodność z planem:** ✅ (a) `onInteractOutside preventDefault` na edit `DialogContent` (blokada tła, brak przypadkowego zamknięcia); (b) `open={open && !confirmDiscard}` — edytor i potwierdzenie NIGDY naraz; edytor zamyka się przez prop (nie `onOpenChange` → bez rekurencji), co rozrywa mechanizm pętli u źródła (przy zamkniętym edytorze outside-detekcja nieaktywna).
- **Odkrycie (poza reconem, z testu):** dodatkowy `onInteractOutside preventDefault` na `DialogContent` POTWIERDZENIA — bez niego focus-restoration zamykanego edytora (cross-fade) był widziany przez Radix confirm jako focus-outside i confirm sam się odrzucał („mruganie", niedeterministyczny „Anuluj"). Bardzo dobra diagnoza.
- **Test:** `prod-fixes-phase9-edit-modal.spec.ts` (hasTouch, 820×1180) — RED DETERMINISTYCZNY headless (cofnięcie fixu → blokada i „wróć do edycji nie wraca" padają; przywrócenie → GREEN). 2 testy + 3× repeat-each (determinizm). Uczciwie: nie udaje wizualnego „mrugania", asercje celują w deterministyczną przyczynę.
- **Zachowane:** konsumenci (Accepted/Pending/SessionEntries — bramka nie wycieka, rodzic widzi `open=true`), tryb Podglądu read-only nietknięty.
- **Weryfikacja:** `npm test` 558/558, eslint czysto. Model: opus (subtelna interakcja Radix).
- **Werdykt:** ZAAKCEPTOWANO, 0 poprawek — wyróżnienie za wykrycie focus-restoration confirm.

## Faza 10: Trwałe usunięcie pojedynczego wpisu z kosza (02790656) — 2026-08-08
- **Zgodność z planem:** ✅ pełny łańcuch 6 plików — serwis `deleteFromTrash` (guarded `.in(["rejected","deleted"])`, `deletedCount`), endpoint `DELETE /api/items/[id]` (401 guard, walidacja UUID, 404 spoza kosza), hook, `item-card` („delete" + `ACTIONS_BY_STATUS`), `ItemCard` (`onDelete`+`canDelete`+GhostAction destructive), `TrashItemsView` (dialog potwierdzenia + optymistyczne usunięcie jak restore).
- **Bezpieczeństwo (potrójna obrona):** guard statusu w serwisie (pending/accepted nieusuwalne tym kanałem), 404 dla nieistniejący/aktywny/cudzy (nie zdradza powodu), RLS `items_delete_own` (B nie usuwa A), CSRF przez middleware (DELETE same-origin jak PATCH).
- **Testy:** unit 3 nowe (kształt guarded DELETE, `deletedCount` 1/0, rzut) → `npm test` 562; integracyjny 2 nowe (kasuje tylko kosz; RLS izolacja) → 19; E2E red→green (wypięcie `onDelete` → RED brak dialogu; przywrócenie → GREEN), seed własnymi danymi (runId, bo DELETE nieodwracalny), ponowny DELETE → 404, „Wyczyść kosz" nadal działa.
- **Uwaga:** zaktualizowano `item-card.test.ts` (zamrażał listę akcji rejected/deleted — konieczne po dodaniu „delete"). Wymuszona konsekwencja, nie scope creep.
- **Weryfikacja:** `npm test` 562, `test:integration` 19, lint/tsc czyste. Model: opus (endpoint mutujący + bezpieczeństwo).
- **Werdykt:** ZAAKCEPTOWANO, 0 poprawek.

## Faza 11: Triage 6 featurów (bez kodu) — 2026-08-08
- **Wykonanie:** 6 ticketów-featurów potwierdzonych jako zasadne, opisanych na prod komentarzem z werdyktem; status pozostaje `new` (świadomy dług, nie `cancelled`).
- **Werdykty:** audio (a3beda31) → V2/OQ2; edycja AI (9fc5f4a8), split/merge (663d01fd), redesign interakcji (a6a328ce) → osobne większe wycinki; pull-to-refresh (1c0077b1) → gest natywny, weryfikacja na realnym urządzeniu; tuning promptu (3eca2a93) → osobna zmiana z realnym modelem (mock w testach).
- **Werdykt:** ZAAKCEPTOWANO — zakres świadomie ograniczony, dług udokumentowany na prod i w backlogu.
