# Testy kontraktu klasyfikatora i stanu sesji (Faza 3 planu testów) — Krótki plan

> Pełny plan: `context/changes/testing-classifier-contract-session-state/plan.md`
> Badania: `context/changes/testing-classifier-contract-session-state/research.md`

## Co i dlaczego

Faza 3 wdrożenia planu testów: przypiąć **regresją** istniejący kontrakt odpowiedzi klasyfikatora i model stanu sesji (ryzyko #6 + deterministyczna część #3). Naruszenie kontraktu i degradacja mają być obsłużone czysto, a odpowiedź z 0 itemami to poprawny wynik („zakończona bez elementów"), nie błąd. Badanie potwierdziło: wszystkie zachowania już istnieją w kodzie i są zgodne z intencją planów S-02/S-08 — nie naprawiamy, tylko domykamy pokrycie testami.

## Punkt wyjścia

Kontrakt jest już w większości przypięty: happy path, 0-itemów, limit 101, obcięcie i zły `type`, mapowanie 4 stanów na HTTP, bramki retry, higiena logów. Brakuje wąskiej, ale najważniejszej rodziny: pełnego wachlarza „bez pól obowiązkowych" (dziś tylko zły `type`), jawnego rozróżnienia „0 itemów ≠ pusty `content`", cichego stripu nadmiarowego pola, granicy dokładnie 100 i spłaszczenia przyczyn na endpoincie.

## Pożądany stan końcowy

`npm test` zawiera regresję, która zapala się na czerwono, gdy: dowolne pole obowiązkowe itemu przestanie być egzekwowane, pusta odpowiedź zacznie być mylona z błędem (lub odwrotnie), granica limitu przesunie się o jeden, albo naruszenie kontraktu przestanie spłaszczać się na endpoincie do `failed/contract`. Plan testów nazywa sesję `storage` jako świadomy tryb awarii.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Głębokość rodziny kontraktu | Rodzina pól itemu (brak title / title pusty / brak type / brak description / brak `items`) | Sedno ryzyka #6 to kształt itemu; warstwa koperty (refusal, nie-JSON) to inny koszt × sygnał | Plan |
| Poziom asercji | `classify()` (typ wyjątku) + jeden pin endpointu | Przyczyny rozróżnialne tylko w `classify()`; na HTTP kolapsują do `"contract"` — spłaszczenie przypięte raz | Badania + Plan |
| Sesja `storage` nie-do-ponowienia | Krótki pin + notka §7 | Przypina realne zachowanie i dokumentuje intencję jako znany tryb awarii | Badania (OQ1) |
| Pinowanie „nie-błędów" | Oba: strip nadmiarowego pola + para 0-itemów / pusty content | Dwa najczęściej mylone „nie-błędy" ryzyka #6, każdy tanim testem | Plan |
| Powierzchnia testów | Dopisy do istniejących plików, bez nowych | Konwencja repo: test obok modułu; unikamy dublowania pokrycia | Badania |

## Zakres

**W zakresie:** rodzina pól itemu, strip nadmiarowego pola, para 0-itemów/pusty content, poprawne N, granica 100, spłaszczenie kontraktu na endpoincie, pin sesji `storage`, notki §7 i §6.6 w planie testów.

**Poza zakresem:** warstwa koperty poza „pustym content" (refusal, nie-JSON), dublowanie 101/storage/mapowania stanów, runtime część ryzyka #3 (Faza 5), warstwa integracyjna (Faza 4), utwardzanie kodu produkcyjnego, zmiana strategii §1–§5 planu testów.

## Architektura / Podejście

Dwie powierzchnie testu, dwa wzorce mockowania. **Warstwa kontraktu** (`classifier.test.ts`): atrapa globalnego `fetch` + mock `astro:env/server`, karmiona spreparowaną kopertą OpenAI — ćwiczy realną walidację (koperta → JSON → zod). **Rdzeń/endpoint** (`classify-core.test.ts`, `classify.test.ts`, `retry.test.ts`): mock całego `classify()`, sterowanie wynikiem, ćwiczenie dyspozytora i mapowania HTTP. Oba wzorce są już w repo — dopisujemy kolejne przypadki `it()`.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Rodzina kontraktu itemu + nie-błędy | 5 wariantów braku pola + strip + para 0/pusty + poprawne N w `classifier.test.ts` | Subtelność „pusty content ≠ 0 itemów"; oracle mockowania koperty |
| 2. Strażniki brzegowe i spłaszczenie | Granica 100 (rdzeń), contract→endpoint, storage-pin (retry) | Nie dublować istniejącego 101/storage; celować w nowy kąt |
| 3. Dokumentacja planu testów | §7 (tryb awarii storage) + §6.6 (notka per faza) | Minimalna; nie ruszać strategii §1–§5 |

**Wymagania wstępne:** research.md (jest); lokalny Node + `npm test` działają. Bez lokalnego Supabase (faza czysto jednostkowa).
**Szacowany nakład pracy:** ~1 sesja, 3 fazy; ~10-12 nowych asercji + ~10 linii dokumentacji.

## Otwarte ryzyka i założenia

- Zakłada, że wzorzec atrapy `fetch` z `classifier.test.ts` obejmuje wszystkie nowe scenariusze koperty — potwierdzone lekturą pliku, niskie ryzyko.
- Sesja `storage`: pin asertuje nieodwracalność (brak reopenu/klasyfikacji) — kąt bliski istniejącemu „download storage → storage", ale nie identyczny; do potwierdzenia, że nie jest zbędny.

## Kryteria sukcesu (podsumowanie)

- Cały zestaw jednostkowy zielony (`npm test`); nowe testy padają po tymczasowym osłabieniu pola schematu lub zmianie granicy limitu.
- Naruszenie kontraktu na endpoincie daje `200 failed/contract`; poprawne `{"items":[]}` daje sukces, pusty `content` daje `ClassifierContractError`.
- Plan testów dokumentuje sesję `storage` jako świadomy tryb awarii (§7) i ma notkę per faza 3 (§6.6).
