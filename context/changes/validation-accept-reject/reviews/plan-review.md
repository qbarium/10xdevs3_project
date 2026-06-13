<!-- PLAN-REVIEW-REPORT -->
# Przegląd planu: Walidacja — akceptacja, odrzucenie i edycja pendingów (S-03)

- **Plan**: `context/changes/validation-accept-reject/plan.md`
- **Tryb**: Głęboki
- **Data**: 2026-06-13
- **Werdykt**: SOLIDNY
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 2 obserwacje (obie naprawione w planie)

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność ze stanem końcowym | ZALICZONY |
| Oszczędna realizacja | ZALICZONY |
| Dopasowanie architektoniczne | ZALICZONY |
| Martwe punkty | OSTRZEŻENIE |
| Kompletność planu | ZALICZONY |

## Ugruntowanie

10/10 ścieżek ✓, symbole (ItemType, helper `json`, RLS USING na `items_update_own`, RPC `persist_classification`, harness `vitest` + `vitest.integration.config.ts`) ✓, brief↔plan ✓.

Zweryfikowane twierdzenia ryzykowne (wszystkie potwierdzone w kodzie):
- **Test harness istnieje** — `vitest.config.ts` + `vitest.integration.config.ts`; ~10 testów jednostkowych co-located + 7 testów integracyjnych w `tests/integration/`, w tym wzorce RLS dwukontekstowe (`classification-rls`, `import-files-rls`, `profiles-rls`, `storage-rls`).
- **`checkbox`/`select` bez nowej zależności npm** — `dialog.tsx`/`label.tsx` importują z unified `radix-ui` (`^1.5.0`); nowy rejestr shadcn (`components.json`, styl new-york) → `npx shadcn add checkbox select` użyje istniejącego pakietu. Tylko `sonner` to nowa zależność (poprawnie oznaczona, `npm audit` + zgoda).
- **Derywacja `operational_status` + spójność bulk-accept** — RPC `persist_classification` (`security invoker`) już wstawia taski z `operational_status='new'` (`case when type='task' then 'new' else null`); bulk-accept nie dotyka `operational_status`, więc zaakceptowany task pozostaje spójny. Brak CHECK constraintu type↔operational_status w schemacie (tylko nullable kolumna z komentarzem) → derywacja jest konwencją aplikacyjną, brak ryzyka naruszenia constraintu.
- **Bezpośredni `.update()` vs RPC** — `persist_classification` jest `security invoker` (RPC istnieje wyłącznie dla atomowości multi-statement: insert N itemów + finalizacja sesji). Bulk-accept to pojedynczy atomowy statement → bezpośredni `.update()` na RLS jest spójny z wzorcem, nie rozjazdem.
- **RLS scope bulk UPDATE** — polityka `items_update_own` ma `using ((select auth.uid()) = user_id)` ORAZ `with check (...)`; `.in('id', ids)` jest bezpiecznie zawężony do właściciela. Twierdzenie planu „RLS dokłada user_id" potwierdzone.
- **Kontrakt Postęp↔Faza** — 4 fazy, checkboxy 1.1–1.7 / 2.1–2.5 / 3.1–3.9 / 4.1–4.8 mapują się 1:1 na kryteria sukcesu; żaden checkbox nie wycieka do treści faz; nazwy faz identyczne między treścią a Progress.

## Ustalenia

### F1 — Brak specyfikacji stanu pustego dla React islandu

- **Waga**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 3 → #3 (kontrakt `PendingItemsView.tsx`)
- **Szczegóły**: Po zatwierdzeniu/odrzuceniu wszystkich pendingów (lub gdy jest ich zero) island nie ma czego renderować. Read-only `ItemList.astro` (Faza 2 #1) dostaje `emptyLabel`, ale kontrakt islandu (Faza 3 #3) nie wspominał o stanie pustym — użytkownik kończący rdzeniową akcję („zatwierdź wszystkie") lądował na pustej liście z nieaktywnym paskiem akcji.
- **Poprawka**: Dopisać do kontraktu `PendingItemsView` stan pusty („Brak elementów do akceptacji") + linia manual-verify, że po zatwierdzeniu wszystkich widoczny komunikat pustej listy.
- **Decyzja**: NAPRAWIONE — kontrakt Faza 3 #3 (blok „Stan pusty"), nowy bullet manual-verify Faza 3, checkbox Progress `3.9`.

### F2 — Nieokreślona obsługa 404 (not_found) w modalu edycji

- **Waga**: 🔍 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Martwe punkty
- **Lokalizacja**: Faza 4 → #2 (`EditItemDialog.tsx`)
- **Szczegóły**: Endpoint PATCH z Fazy 1 zwraca 404 `not_found`, gdy item nie jest już `pending` (np. zaakceptowany w innej karcie podczas edycji — ten sam scenariusz „stale tab", który plan obsługuje dla bulk w 3.8). Kontrakt Fazy 4 opisywał tylko happy path i walidację pustego title; nie mówił, co modal robi na serwerowe 404. `useItemMutation` ustawia kod błędu, ale zachowanie modala było niedoprecyzowane.
- **Poprawka**: Doprecyzować ścieżkę 404 modala — na `not_found` toast „Element nie jest już dostępny do edycji" + zamknięcie, item usunięty ze stanu islandu (symetrycznie do guardu „stale tab" w akcjach zbiorczych).
- **Decyzja**: NAPRAWIONE — kontrakt Faza 4 #2 (ścieżka 404 `not_found`), nowy bullet manual-verify Faza 4, checkbox Progress `4.8`.
