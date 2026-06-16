<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Jednolita lista (filtr typu) + edycja zaakceptowanych itemów

- **Plan**: context/changes/unified-list-and-edit/plan.md
- **Zakres**: Pełny plan — Fazy 1–3 z 3
- **Data**: 2026-06-16
- **Werdykt**: ZAAKCEPTOWANY (PASS z 2 drobnymi ostrzeżeniami)
- **Ustalenia**: 0 krytycznych  0 ostrzeżeń  5 obserwacji
- **Bramki automatyczne**: lint ✅ · test 254/254 ✅ · build ✅

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | WARNING |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Inwarianty kluczowe (zweryfikowane PASS)

- **Brak cichego resetu `operational_status`**: `editItem` zapisuje `operational_status: input.operationalStatus` (wartość podana z dialogu), `deriveOperationalStatus` nie jest wołane w ścieżce edycji (grep całego repo). Potwierdzone testem integracyjnym (zachowanie `in_progress` przy edycji treści).
- **Optimistic concurrency poprawny**: guard `.in('acceptance_status',['pending','accepted'])` + `.eq('updated_at', expectedUpdatedAt)`; dwukrokowa dyskryminacja 0-wierszy (follow-up SELECT) → 409 vs 404. Brak triggera DB na `updated_at` (aktualizacja aplikacyjna jest jedyna). RLS `items_update_own` (`using` + `with check`) izoluje per-user.

## Ustalenia

### F1 — Przełącznik rozszerzania dialogu edycji poza planem

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/items/EditItemDialog.tsx:48-67,129-142 (commity 5f7ee19, 81c6a84, 79d16c5)
- **Szczegóły**: Funkcja Maximize/Minimize dialogu na obszar listy nie wynika z żadnego punktu planu ani z 7 decyzji w change.md. Samodzielny feature UX dorzucony w trakcie; działa i jest izolowany, ale to zakres poza zatwierdzonym planem, nieujęty w warstwie decyzji.
- **Poprawka A ⭐ Zalecana**: Udokumentuj jako decyzję #8 w change.md.
  - Siła: Zachowuje działającą pracę; aktualizuje źródło prawdy zgodnie z wzorcem aneksów tego repo.
  - Kompromis: change.md staje się nieco ruchomym celem.
  - Pewność: WYSOKA — repo regularnie domyka odkryty zakres aneksem.
  - Martwy punkt: Brak znaczących — feature izolowany.
- **Poprawka B**: Wytnij do osobnej zmiany (follow-up).
  - Siła: Ścisła dyscyplina zakresu S-05.
  - Kompromis: Traci zaimplementowaną i działającą pracę; kolejny PR.
  - Pewność: ŚREDNIA — zależy, czy chcesz ten UX w MVP teraz.
  - Martwy punkt: Nie sprawdzono, czy toggle ma testy interakcji.
- **Decyzja**: FIXED via Poprawka A — toggle udokumentowany jako decyzja #8 w change.md.

### F2 — Treść plan.md nie odzwierciedla rewizji #3/#7 (rozjazd dok↔kod)

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: context/changes/unified-list-and-edit/plan.md (Faza 1 §2) vs src/lib/services/items-mutation.ts:123
- **Szczegóły**: Litera planu Fazy 1 mówi „payload BEZ operational_status"; kod robi odwrotnie (`operational_status: input.operationalStatus`). To świadoma rewizja #3/#7 udokumentowana w change.md, inwariant „brak cichego resetu" utrzymany i przetestowany. Podobnie: `onConflict` z Fazy 2 nie powstał (konflikt w dialogu, 0c5e0a2), a `edit-form.ts` zmieniono mimo „reużywalna bez zmian". Czytający SAM plan.md zostanie wprowadzony w błąd.
- **Poprawka**: Dopisz do plan.md blok „Stan as-built" wskazujący, że rewizje #3/#6/#7 (change.md) zastąpiły pierwotne kontrakty Faz 1–2 (payload zawiera operational_status; konflikt w dialogu).
- **Decyzja**: FIXED — dodano sekcję „Stan as-built" w plan.md (po Przeglądzie, przed kontraktami faz).

### F3 — Brak negatywnego testu izolacji per-user dla editItem

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Kryteria sukcesu
- **Lokalizacja**: tests/integration/items-mutation.integration.test.ts
- **Szczegóły**: RLS gwarantuje, że user B nie zedytuje itemu user A, ale jawna asercja negatywna istnieje tylko dla `setAcceptanceStatus` (bulk), nie dla `editItem`. Ryzyko niskie (ten sam mechanizm RLS); brak symetrii pokrycia.
- **Poprawka**: Dodaj test integracyjny: user B woła editItem na itemie user A → 0 wierszy ⇒ ItemNotEditableError (404), bez mutacji.
- **Decyzja**: FIXED — dodano test „B nie edytuje itemu A" w items-mutation.integration.test.ts.

### F4 — Cookie filtra bez flagi Secure

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/components/items/AcceptedItemsView.tsx:160
- **Szczegóły**: `document.cookie = tl_typefilter=...; path=/; SameSite=Lax` bez `Secure`. Wartość z zamkniętego unionu (brak wstrzyknięcia), odczyt SSR walidowany whitelistą (brak XSS). Dane niewrażliwe (preferencja filtra) — drobiazg, ale dla spójności w produkcji HTTPS warto dodać `Secure`.
- **Poprawka**: Dodaj `; Secure` do zapisu cookie (uwaga: na http-dev Secure-cookie nie jest wysyłane — rozważ warunkowo prod-only albo świadomie zaakceptuj brak jako nieistotny dla preferencji).
- **Decyzja**: FIXED — `; Secure` dokładane warunkowo gdy `window.location.protocol === "https:"` (zachowuje http-dev).

### F5 — `expectedUpdatedAt` jako porównanie stringów — kruchość kontraktu

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: src/lib/services/items-mutation.ts:128 (+ src/components/items/EditItemDialog.tsx:83)
- **Szczegóły**: Compare-and-swap robi `.eq('updated_at', expectedUpdatedAt)` — porównanie tekstowe. Działa, dopóki klient odsyła nienaruszoną wartość z serwera (obecnie tak). Re-formatowanie znacznika po stronie klienta (`new Date(...).toISOString()`) dałoby fałszywy 409.
- **Poprawka**: Dodaj komentarz przy l.83 dialogu i l.128 serwisu dokumentujący inwariant „klient odsyła updated_at dosłownie, bez re-formatowania".
- **Decyzja**: FIXED — komentarze dodane w items-mutation.ts (przy .eq updated_at) i EditItemDialog.tsx (przy handleSave).
