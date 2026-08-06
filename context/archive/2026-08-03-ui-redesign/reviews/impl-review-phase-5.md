<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Nowa szata graficzna (wariant techniczny) + powłoka nawigacyjna

- **Plan**: context/changes/ui-redesign/plan.md
- **Zakres**: Faza 5 z 8 (Skrzynka + modal klasyfikacji + Profil/BYOK)
- **Data**: 2026-08-05
- **Werdykt**: ZAAKCEPTOWANO
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS (3 obserwacje) |
| Kryteria sukcesu | PASS |

## Podsumowanie

Faza 5 to wzorcowo czysta migracja prezentacyjna. Commit `94a2f8f` dotknął dokładnie 5 plików kodu (+ `plan.md` z zapisem SHA); wszystkie zmiany to wyłącznie atrybuty `class`/`className` (plus jeden komentarz nagłówkowy). Trzy grupy planu — Skrzynka, Modal klasyfikacji, Profil/BYOK — wszystkie **MATCH**. Zero zaszytych kolorów w plikach fazy po migracji. Zachowanie nietknięte: oba hooki (`useClassification.ts`, `useApiKey.ts`) poza commitem, handlery/walidacje/wywołania API bez zmian, `rel="noopener noreferrer"` na linku zewnętrznym zachowany, brak `set:html`/`dangerouslySetInnerHTML`.

Nietknięcie `src/pages/ingest.astro` i `src/pages/profile.astro` (obecnych w planie, nieobecnych w diffie) rozstrzygnięto dowodami jako **poprawne, nie luka**: to cienkie wrappery na `AppLayout` (wpięte w Fazie 2, commit `17d2e83`) bez własnych kolorów i bloków `<style>`; cała treść wizualna żyje w wyspach/komponentach, które zmigrowano (`IngestForm`, `ByokOnboarding`, `ApiKeyManager`).

Cztery stany modalu klasyfikacji powstały już w Fazie 4 (`1f639d9`); Faza 5 poprawiła tam wyłącznie 1 klasę koloru spinnera — redirect na `/items` po sukcesie zachowany (`ClassificationModal.tsx:31,35-37`).

Kontrakty nienaruszalne potwierdzone: nagłówek „Skrzynka wejściowa" (`ingest.astro:30` → `AppLayout.astro:62`), para `Label htmlFor="ingest-text"` ↔ `Textarea id="ingest-text"` dająca nazwę „Tekst do klasyfikacji" (`IngestForm.tsx:84,88`), przycisk „Wyślij" (`IngestForm.tsx:118-120`).

Trzy obserwacje dotyczą wyłącznie **semantyki nazw tokenów stanu** — zero różnicy wizualnej dziś, warte odnotowania jako dług do świadomej decyzji.

## Ustalenia

### F1 — `note-fg` użyty jako token „sukces/OK" zamiast tokenu stanu

- **Ważność**: 🟦 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/ingest/ByokOnboarding.astro:61,85; src/components/profile/ApiKeyManager.tsx:60
- **Szczegóły**: Ikony „gwarancji bezpieczeństwa" (tarcze) w onboardingu BYOK oraz `ShieldCheck` (klucz skonfigurowany) używają `text-note-fg` do wyrażenia „OK/sukces". Tymczasem `note-fg` to kolor **typu „note"** (`badge.tsx:19`), a ustalony w kodzie zielony **stanu** to `done-fg` (`OperationalStatusBadge.tsx:30`). W `global.css` oba mają identyczną wartość (`#157a45` / `#6fc58e`), więc **zero różnicy wizualnej** — ale semantycznie Faza 5 pożycza token typu do wyrażenia sukcesu. Ryzyko: przyszła zmiana koloru typu „note" nieświadomie przemaluje te tarcze. Faza 5 jest przy tym wewnętrznie spójna (oba miejsca używają tego samego tokenu).
- **Poprawka**: Zamienić `text-note-fg` na `text-done-fg` (token stanu) w tych 3 miejscach — albo dodać alias `--success-fg` w `global.css`, jeśli „sukces" ma być odrębnym pojęciem od „zakończone".
- **Decyzja**: NAPRAWIONO — `text-note-fg` → `text-done-fg` w ByokOnboarding.astro:61,85 i ApiKeyManager.tsx:60.

### F2 — „Ostrzeżenie" (amber) skolapsowane do `destructive` w liczniku znaków

- **Ważność**: 🟦 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców
- **Lokalizacja**: src/components/ingest/IngestForm.tsx:97,101
- **Szczegóły**: Dawny `text-amber-400` przełożono na `text-destructive` dla obu stanów licznika: `tooShort` (za krótko — realny błąd blokujący submit) i `atLimit` (osiągnięto limit — z natury ostrzeżenie). W systemie tokenów **nie ma tonu ostrzegawczego** (amber/caution), więc mapowanie na `destructive` jest pragmatyczne, ale zlewa „ostrzeżenie" z „błędem". Pole i tak jest twardo cięte do limitu w `handleChange`, więc skutek praktyczny znikomy.
- **Poprawka**: Zaakceptować jako-jest (brak tokenu „caution" w systemie); jeśli kiedyś potrzebny odrębny ton ostrzegawczy — wprowadzić token `--warning-*` osobną zmianą, nie doraźnie.
- **Decyzja**: NAPRAWIONO (napraw inaczej) — wprowadzono token stanu `--warning-fg` (light `#966a0c` / dark `#e0b45e`, rodzina done/prog) + `@theme inline`; `IngestForm.tsx:97` `atLimit → text-warning-fg`, `tooShort` zostaje `text-destructive`. Lint + build zielone.

### F3 — CTA modalu mówi „…do walidacji", reszta produktu „Do akceptacji"

- **Ważność**: 🟦 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Spójność wzorców (nazewnictwo)
- **Lokalizacja**: src/components/ingest/ClassificationModal.tsx:61,111
- **Szczegóły**: Przycisk sukcesu klasyfikacji brzmi „Przejdź do walidacji teraz" / „…do walidacji za N s", podczas gdy nawigacja i widok docelowy używają terminu „Do akceptacji". Plan Fazy 5 parafrazował to jako „Przejdź do akceptacji". Copy jest **pre-istniejące z Fazy 4** (`1f639d9`) i nietknięte w Fazie 5 — słusznie, bo zmiana dostępnej nazwy leży poza barierą zakresu tej fazy. To realna, drobna niespójność terminologiczna w produkcie, nie defekt migracji.
- **Poprawka**: Ujednolicić terminologię („akceptacja" vs „walidacja") osobną, drobną zmianą poza Fazą 5 — przed edycją sprawdzić, czy fraza nie jest uchwytem w spec-ach E2E (`e2e/`).
- **Decyzja**: NAPRAWIONO — `ClassificationModal.tsx:61,111` „walidacji" → „akceptacji"; potwierdzono, że fraza nie jest uchwytem E2E (test czeka na URL) ani unit (grep). Lint + 574 testy zielone.

## Kryteria sukcesu

| Kryterium | Status | Dowód |
|---|---|---|
| 5.1 Lint (`npm run lint`) | ✅ PASS | Zweryfikowane na żywo, exit 0 |
| 5.2 Build (`npm run build`) | ✅ PASS | Zweryfikowane na żywo, „Complete!" w 1m 6s, exit 0 |
| 5.3 Testy jednostkowe (`npm test`) | ✅ PASS | Zweryfikowane na żywo: 55 plików, 574 testy zielone (w tym `labels.test`, `state-filter.test`) |
| 5.4 E2E (`npm run e2e`) | ✅ (odhaczone w `94a2f8f`) | Nie powtórzono na żywo w przeglądzie fazy — pełny E2E to lokalna operacja (dev z `CLASSIFIER_MODEL=mock` + Playwright + Supabase Docker). Uzasadnienie pominięcia: testy nie asertują klas/stylów/kolorów (plan §„Testy dają szeroki margines"), kontrakty dostępnych nazw i redirect potwierdzone statycznie, a `npm test` (574) + lint + build są zielone. |

Ręczne kryteria 5.5–5.7 pozostają nieodhaczone zgodnie z ustaleniem użytkownika (2026-08-04): wizualny przegląd w obu motywach robimy jednym przejściem na końcu całej zmiany, nie per faza.

## Uwagi

- **Poza zakresem F5 (oczekiwane):** powierzchnie sąsiednie wciąż w motywie „cosmic" (`Topbar.astro`, `Welcome.astro`, `auth/*`, `import-sessions/*`, `SessionBanner.astro`) — migrowane w Fazach 6–8. Po Fazie 5 karta BYOK renderuje się jako jasna karta-token wewnątrz wciąż-cosmicowej powłoki; kontrast zniknie z migracją tych powierzchni.
- `button.tsx:14` (`bg-destructive text-white`) to standard prymitywu shadcn — nie ruszać (Faza 8 adresuje osobno).
- **Nieścisłość w planie (nie w kodzie):** plan wskazuje hooki jako `src/components/ingest/hooks/…` i `src/components/profile/hooks/…`, a faktyczna lokalizacja to `src/components/hooks/` (zgodna z regułą CLAUDE.md „Extract hooks to src/components/hooks/").

## Sortowanie (triage) — 2026-08-05

Wszystkie 3 obserwacje rozstrzygnięte (naprawione):

| Ustalenie | Decyzja | Zmiana |
|---|---|---|
| F1 | NAPRAWIONO | `text-note-fg` → `text-done-fg` (ByokOnboarding.astro:61,85; ApiKeyManager.tsx:60) |
| F2 | NAPRAWIONO (napraw inaczej) | nowy token stanu `--warning-fg` (global.css: `:root`/`.dark`/`@theme inline`); IngestForm.tsx:97 `atLimit → text-warning-fg` |
| F3 | NAPRAWIONO | ClassificationModal.tsx:61,111 „walidacji" → „akceptacji" |

Pliki dotknięte w sortowaniu: `src/styles/global.css`, `src/components/ingest/ByokOnboarding.astro`, `src/components/ingest/IngestForm.tsx`, `src/components/ingest/ClassificationModal.tsx`, `src/components/profile/ApiKeyManager.tsx`. Bramki po sortowaniu: **lint zielony, build zielony, 574/574 testów zielonych**. Zmiany w drzewie roboczym — niezacommitowane (commit/PR/push wymaga jawnej komendy użytkownika).
