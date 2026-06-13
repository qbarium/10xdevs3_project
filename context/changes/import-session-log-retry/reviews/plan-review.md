<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Dziennik sesji importu + ponowienie (S-08)

- **Plan**: `context/changes/import-session-log-retry/plan.md`
- **Tryb**: Głęboki
- **Data**: 2026-06-13
- **Werdykt**: DO POPRAWY → SOLIDNY (po naniesieniu wszystkich poprawek)
- **Ustalenia**: 0 krytycznych, 3 ostrzeżenia, 3 obserwacje

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność ze stanem końcowym | ZALICZONY |
| Oszczędna realizacja | OSTRZEŻENIE |
| Dopasowanie architektoniczne | OSTRZEŻENIE |
| Martwe punkty | OSTRZEŻENIE |
| Kompletność planu | OSTRZEŻENIE |

## Ugruntowanie

12/12 istniejących ścieżek ✓, 4/4 nowe ścieżki nieobecne ✓, 5/5 symboli ✓, brief↔plan ✓
(wyjątek wychwycony: `decodeText` nazwany w planie nie istnieje — realny eksport `decodeFile` → F3).

## Ustalenia

### F1 — Kontrakt zwrotu `runClassification` gubi `ok` i kod HTTP 422

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Oszczędna realizacja
- **Lokalizacja**: Faza 1 · krok 3 (ekstrakcja rdzenia)
- **Szczegóły**: `classifyAndRespond` (classify.ts:71-108) zwraca `Response` z 422/`ok:false` dla `too_many_items` (classify.ts:88), 200 dla reszty; `classify.test.ts:130-135` asercjonuje 422. Kontrakt `{status,itemCount?,code?}` tego nie niesie — oba endpointy musiałyby odtworzyć mapowanie HTTP (rozjazd, którego ekstrakcja miała uniknąć).
- **Poprawka A ⭐ Zalecana**: Wspólny `classifyResultToResponse(sessionId, result): Response` obok rdzenia; rdzeń HTTP-agnostyczny, jeden mapper buduje Response (422/ok:false tylko dla `too_many_items`). Oba endpointy go wołają.
  - Siła: Zero duplikacji mapowania HTTP; rdzeń `lib/ai` bez transportu; test 422 zielony.
  - Kompromis: Jeden dodatkowy mały helper.
  - Pewność: WYSOKA — mapowanie 4 stanów już istnieje w jednym miejscu (classify.ts:85-104).
- **Poprawka B**: Rdzeń niesie `ok`+`httpStatus`, endpointy robią tylko `json(body, httpStatus)`.
  - Siła: Najmniej kodu po stronie wołających.
  - Kompromis: Przeciek HTTP do warstwy `lib/ai` (wbrew separacji w repo).
  - Pewność: ŚREDNIA.
- **Decyzja**: FIXED — Poprawka A (rdzeń zwraca wartość; współdzielony `classifyResultToResponse`; Faza 1 kr. 3 + Faza 2 kr. 7).

### F2 — „Reuse mapowania kodów z modalu" wskazuje prywatną funkcję

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Dopasowanie architektoniczne
- **Lokalizacja**: Faza 3 · krok 2 (SessionsList); pośrednio Faza 4
- **Szczegóły**: `errorMessage(code)` jest prywatną, nieeksportowaną funkcją w `ClassificationModal.tsx:32-49`. Plan każe SessionsList ją „reużyć" bez zadania ekstrakcji → ryzyko duplikacji `switch` (proliferacja wbrew `labels.ts`) lub nieplanowanego refaktoru. Mapa nie zna kodów retry pliku (`storage`/`encoding`/`empty_file`).
- **Poprawka**: Dodać do Fazy 1 zadanie ekstrakcji `ingestErrorMessage` do `src/lib/ingest-errors.ts`; import w modalu + SessionsList; rozszerzyć o brakujące kody i retry-specyficzny `missing_key`.
- **Decyzja**: FIXED — nowy krok 1.5; Faza 3 kr. 2 wskazuje `ingestErrorMessage`.

### F3 — `decodeText` nie istnieje (jest `decodeFile`) + brak mostka Storage→bajty

- **Waga**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: Faza 1 · krok 2 (`loadSessionInput`)
- **Szczegóły**: Eksport to `decodeFile(bytes: Uint8Array)` (decode.ts:40), nie `decodeText`; dekoder NIE sanityzuje. Brak mostka: download ze Storage → Blob → `arrayBuffer` → `Uint8Array`.
- **Poprawka**: `decodeFile`; mostek `storage.download(file_path) → Uint8Array → decodeFile → sanitizeInput`; `file_path` wymagany w `getSessionForRetry`.
- **Decyzja**: FIXED — Faza 1 kr. 2 + kr. 1.

### F4 — Wyścig podwójnego retry po stronie serwera (TOCTOU)

- **Waga**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 2 · kroki (2)→(3)→(6)
- **Szczegóły**: Guard podwójnego kliku tylko po stronie klienta; sprawdzenie `status===failed` i `reopenSession` to osobne instrukcje → dwa równoległe POST-y mogą zdublować klasyfikację/itemy.
- **Poprawka**: `reopenSession` warunkowy `UPDATE … WHERE id=? AND status='failed'`; 0 wierszy → 409.
- **Decyzja**: FIXED — Faza 1 kr. 1 (`reopenSession` zwraca `boolean`) + Faza 2 kr. 6 (409).

### F5 — Inline UI nie obsługuje stanu `completed_no_items` po retry

- **Waga**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 4 · krok 2 (RetrySessionButton)
- **Szczegóły**: Kontrakt opisuje tylko `completed_with_items` i porażkę; retry może dać 0 itemów → `completed_no_items` (trzeci stan, modal go obsługuje: ClassificationModal.tsx:142-156).
- **Poprawka**: Gałąź `completed_no_items` w hooku/przycisku (komunikat „Brak itemów", bez linku).
- **Decyzja**: FIXED — Faza 4 kr. 2 (trzy wyniki końcowe).

### F6 — Niespójność backticków: nagłówek Fazy 2 vs `## Progress`

- **Waga**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kompletność planu
- **Lokalizacja**: plan treść (Faza 2) vs `## Progress`
- **Szczegóły**: Nagłówek treści miał backticki wokół ścieżki, Progress nie — ryzyko rozłączenia mapowania mechanicznego w `/10x-implement`.
- **Poprawka**: Usunąć backticki w nagłówku treści.
- **Decyzja**: FIXED — nagłówek znakowo identyczny z Progress.
