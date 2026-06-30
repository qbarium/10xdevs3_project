<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Reaktywne filtry dziennika sesji importu (S-11)

- **Plan**: context/changes/session-log-filter-ux/plan.md
- **Zakres**: Pełny plan (Faza 1–3 z 3) + poprawki UX poza planem (commit 9ee41d2)
- **Data**: 2026-07-01
- **Werdykt**: WYMAGA UWAGI
- **Ustalenia**: 0 krytycznych, 2 ostrzeżenia, 1 obserwacja

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | WARNING |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | WARNING |
| Kryteria sukcesu | PASS |

Kryteria sukcesu (świeża weryfikacja 2026-07-01): `npm run lint` ✓ · `npm test` 443 passed (48 plików) ✓ · `npm run build` ✓ · migracja nałożona lokalnie ✓ · ręczne 1.5–3.7 potwierdzone przez użytkownika.

Bezpieczeństwo (wstrzyknięcie SQL, auth/RLS na granicy endpointu, localStorage SSR-safe), niezawodność (AbortController/token „najnowsze wygrywa", popstate, degradacja do pustej listy) i migracja (addytywny indeks, bez zmian danych/RLS, odwracalna) — czyste. Kształt błędu `{ok:false,code,error}` zgodny z lekcją; brak osobnego zod to świadome, udokumentowane odchylenie zgodne z regułą „pole skalarne → walidacja ręczna".

## Ustalenia

### F1 — SSR strony nie przekazuje `pageSize` (rozjazd hydratacji przy niedomyślnym rozmiarze strony)

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🔎 ŚREDNI — prawdziwy kompromis; zatrzymaj się, aby to przemyśleć
- **Wymiar**: Spójność wzorców (interakcja warstw tej samej zmiany)
- **Lokalizacja**: src/pages/import-sessions.astro:27-31
- **Szczegóły**: SSR woła `getImportSessions(..., { sort, status, page })` BEZ `pageSize`, więc serwer renderuje zawsze `SESSION_PAGE_SIZE = 10` wierszy. Endpoint (`api/import-sessions/index.ts:37`) przekazuje `pageSize: criteria.size` poprawnie — rozjazd jest między dwiema warstwami tej samej zmiany. Przy wejściu z `?size=25` w URL SSR wyrenderuje 10 wierszy, a pierwszy kliencki re-fetch dociągnie 25 → krótki „przeskok po nawodnieniu", któremu współdzielony parser ma zapobiegać. Dotyczy WYŁĄCZNIE dodatku post-plan `size`; rdzeń planu (status/sort/page) jest hydration-stable.
- **Poprawka**: Dodać `pageSize: criteria.size` do wywołania `getImportSessions` w `import-sessions.astro:27-31` (lustro endpointu). Adopcja localStorage i tak pozostaje klienckim re-fetchem (URL bez `size` nie niesie preferencji), ale wejście z `?size=` w URL będzie wtedy SSR↔klient spójne.
  - Siła: Jednolinijkowa, zeruje rozjazd dla ścieżki `?size=` w URL; wzorzec już istnieje w endpoincie.
  - Kompromis: Nie usuwa migotania dla adopcji z localStorage na gołym URL (to oddzielna, świadoma decyzja — `size` nie trafia do adresu).
  - Pewność: WYSOKA — identyczny wzorzec w `api/import-sessions/index.ts:37`.
  - Martwy punkt: Brak znaczących.
- **Decyzja**: PENDING

### F2 — Dodatki UX poza planem (rozmiar strony, pierwsza/ostatnia, skok strony)

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; rzecz jest już udokumentowana
- **Wymiar**: Dyscyplina zakresu
- **Lokalizacja**: src/components/import-sessions/{PageSizeSelect.tsx, page-size-pref.ts, SessionPagination.tsx}, src/lib/services/session-list-criteria.ts (pole `size`)
- **Szczegóły**: Plan Fazy 3 wymagał tylko poprzednia/następna + wskaźnik strony. Implementacja dodaje: kontrolkę rozmiaru strony z zapamiętywaniem (localStorage), przyciski pierwsza/ostatnia, pole skoku do strony (`clampPage`), pole `size` w kryteriach. To nadzbiór planu — spójny, przetestowany i nieszkodliwy (oba pod-agenty potwierdzają). Zmiany zostały zgłaszane interaktywnie podczas weryfikacji ręcznej i są udokumentowane: osobny commit `9ee41d2` „post-plan" + adnotacja w `roadmap.md` (S-11 status). Bariery „Czego NIE robimy" (deep-link `?session=`, wyszukiwanie, panel S-10 nietknięty, paginacja offsetowa) — utrzymane.
- **Poprawka**: Zaakceptować jako udokumentowany zakres post-plan (już odnotowane w commit `9ee41d2` + `roadmap.md`). Bez zmiany kodu. Opcjonalnie: dopisać krótki aneks do `plan.md` (sekcja „Dodatki poza planem"), jeśli plan ma pozostać pełnym źródłem prawdy zakresu.
- **Decyzja**: PENDING

### F3 — `count: "exact"` + paginacja offsetowa bez górnego clampu strony (znany limit skali)

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość (Wydajność)
- **Lokalizacja**: src/lib/services/import-session.ts:106-121
- **Szczegóły**: Każde zapytanie listy używa `{ count: "exact" }` (pełne policzenie, nie estymacja) + `range(from,to)` offsetowy z `from=(page-1)*pageSize`; `parsePage` clampuje tylko do ≥1 (brak górnej granicy). Dla solo-MVP z dziennikiem rzędu dziesiątek/setek sesji nieistotne; indeks `(user_id, created_at, id)` pokrywa sort idealnie. Pusta strona poza zakresem zwraca 0 wierszy (nieszkodliwe).
- **Poprawka**: Zostawić jak jest dla MVP; opcjonalnie dopisać komentarz w `getImportSessions`, że `count:"exact"` + offset to znane ograniczenie skali (przy dziesiątkach tysięcy wierszy → keyset/cursor lub `count:"estimated"`).
- **Decyzja**: PENDING
