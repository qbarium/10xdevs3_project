# Stan operacyjny itemu (S-04) — Krótki plan

> Pełny plan: `context/changes/task-operational-lifecycle/plan.md`

## Co i dlaczego

Zaakceptowane itemy zyskują **stan operacyjny** (`nowe`/`w realizacji`/`zrealizowane`/`anulowane`, wzajemnie przechodni), zmienialny per item i zbiorczo. `zrealizowane` → widok Zakończone, `anulowane` → Anulowane. Domyka ścieżkę gwiazdy przewodniej (Strumień A: paste→klasyfikacja→walidacja→akceptacja→**cykl operacyjny**) i wprowadza 2 brakujące widoki filtra głównego (FR-008: 5/5).

## Punkt wyjścia

S-03 zbudował całą infrastrukturę mutacji itemów (serwis `setAcceptanceStatus` z guardem, endpoint `bulk`, walidacja zod, island `PendingItemsView` z zaznaczaniem + pessimistic dim + toast, widoki Aktywne/Kosz read-only). Schemat ma enum `operational_status` i kolumnę od S-02. S-04 reużywa te wzorce niemal 1:1.

## Pożądany stan końcowy

Użytkownik na Aktywne klika badge stanu na itemie → menu z sensownymi przejściami; wybór przenosi item między widokami (np. „Zrealizuj" → Zakończone). Zaznacza podzbiór i 4 przyciskami paska zmienia stan zbiorczo. W Zakończone/Anulowane może cofnąć stan („Otwórz ponownie"/„Przywróć"). Wszystkie typy mają stan, z etykietami per-typ (notatka „Obsłużona", decyzja „Podjęta").

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Zakres typów | **Wszystkie typy** mają stan operacyjny (nie tylko `task`) | Wyłom z FR-009 — użytkownik chce „obsłużona/podjęta" dla nie-`task` | Plan (decyzja usera) |
| Etykiety | per-typ przez `operationalStatusLabel(status, type)` + tabela nadpisań | Zaprojektowane pod przyszłe definiowanie; test: `done` per-typ | Plan |
| UX per-item | klikalny badge stanu → `dropdown-menu` z kuracją przejść | Kontrolka przy tym, co pokazuje stan; menu kuruje (graf spójny przez hub `nowe`) | Plan |
| UX bulk | 4 przyciski stanów w pasku | Jednoklikowy bulk; guard `accepted` pomija nie-pasujące (FR-007) | Plan |
| Widoki | 3 trasy w pełni interaktywne, jeden reużyty island | FR-009 „w każdej chwili cofnąć" wymaga interaktywności wszystkich 3 | Plan |
| Przechodniość | model przyjmuje dowolny z 4 stanów; menu kuruje | Inwariant FR-009 na danych, oszczędny UX bez okrajania modelu | Plan |
| Migracja | indeks 3-kolumnowy + backfill `NULL→'new'` + RPC; bez triggera | Rozszerzenie nie-`task` wymusza backfill + zmianę RPC | Plan |

## Zakres

**W zakresie:** stan operacyjny wszystkich typów; serwis+endpoint+zod mutacji; 3 serwisy odczytu; widoki Zakończone/Anulowane + 5-link nav; badge-menu per-item + bulk 4 przyciski; etykiety per-typ; migracja.

**Poza zakresem:** edycja accepted (FR-011, S-05); filtr typu + filtry dodatkowe (S-05/S-09); kosz move/restore (S-06); UI definiowania etykiet; nadpisania verbów menu; `NOT NULL` na kolumnie; trigger updated_at; optimistic concurrency.

## Architektura / Podejście

Backend-first jak S-03: **Faza 1** fundament danych (migracja + derywacja na wszystkie typy + etykiety per-typ) → **Faza 2** mutacja stanu (zod→serwis→endpoint + 3 serwisy odczytu) → **Faza 3** widoki read-only + 5-link nav (obserwowalny cel) → **Faza 4** interaktywny island (badge-menu + bulk). Przepływ danych: SSR pobiera podzbiór per widok → island mutuje przez `POST /api/items/operational` → po sukcesie usuwa itemy poza predykat widoku.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Dane + etykiety | migracja (backfill+RPC+indeks), derywacja, `operationalStatusLabel(status,type)` | rozjazd backfill↔RPC↔derywacja → itemy z NULL wypadają z list |
| 2. Backend mutacji | zod + `setOperationalStatus` (guard `accepted`) + endpoint + 3 serwisy odczytu | guard `accepted` zamiast `pending` — łatwa pomyłka |
| 3. Widoki + nav | strony done/cancelled, zawężenie active, 5-link nav, badge per-typ | rozłączność podzbiorów Aktywne/Zakończone/Anulowane |
| 4. Island interaktywny | badge→menu kuracji + bulk 4 przyciski + usuwanie poza predykat | poprawne usuwanie itemu z widoku po zmianie stanu |

**Wymagania wstępne:** S-03 (done). **Szacowany nakład:** ~4 sesje, jedna na fazę.

## Otwarte ryzyka i założenia

- **Wyłom z FR-009** wymaga aktualizacji `roadmap.md` S-04, FR-009 w PRD i karty #8 na boardzie — do domknięcia za zgodą użytkownika.
- `other`→„Obsłużone" i reopen/restore→`nowe` to decyzje planu, trywialnie odwracalne.

## Kryteria sukcesu (podsumowanie)

- Zmiana stanu per-item i bulk działa na 3 widokach; itemy przemieszczają się między Aktywne/Zakończone/Anulowane zgodnie ze stanem.
- Etykiety per-typ poprawne (notatka `done` → „Obsłużona").
- Pełny przepływ S-02→S-03→S-04 zielony; `npm test` + `npm run test:integration` + lint + build zielone.
