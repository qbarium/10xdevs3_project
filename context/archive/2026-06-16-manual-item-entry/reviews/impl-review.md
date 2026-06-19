<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Ręczne dodawanie itemu (S-07)

- **Plan**: context/changes/manual-item-entry/plan.md
- **Zakres**: Faza 2 z 2 (pełny plan)
- **Data**: 2026-06-19
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych, 1 ostrzeżenie, 0 obserwacji

## Werdykty

| Wymiar | Werdykt |
|--------|---------|
| Zgodność z planem | WARNING |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Ustalenia

### F1 — Plan opisuje nieaktualne podejście „pin" zamiast filter-switch

- **Ważność**: ⚠️ OSTRZEŻENIE
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Zgodność z planem
- **Lokalizacja**: context/changes/manual-item-entry/plan.md:44, :159 (+ plan-brief.md)
- **Szczegóły**: Treść planu (l.44 „Krytyczne szczegóły", l.159 kontrakt Fazy 2) opisuje przypinanie nowego itemu do bieżącego filtra (`insertCreatedItem` + pinnedIds). Implementacja (commit 54821a4, decyzja użytkownika 2026-06-19) robi zamiast tego filter-switch (`nextFilterAfterCreate`) + domyślny typ z filtra (`defaultCreateType`); edycja zachowuje pin (asymetria create vs edit). Kod poprawny i spójny we wszystkich 3 plikach, bez martwego kodu; rozjazd dotyczy wyłącznie dokumentacji planu (źródło prawdy mówi „pin", kod robi „switch").
- **Poprawka**: Dopisz aneks do plan.md odnotowujący zmianę zachowania create (filter-switch zastępuje pin; domyślny typ = aktywny filtr, „all" → ostatnio użyty; edycja zachowuje pin), by plan zgadzał się z kodem przed `/10x-archive`.
- **Decyzja**: FIXED (aneks dopisany do plan.md, 2026-06-19)

## Kontekst (dowody)

- **Zgodność z planem**: wszystkie zaplanowane zmiany MATCH (createItemSchema, createManualItem, POST /api/items, useItemMutation.createItem, AddItemDialog, AcceptedItemsView, strony astro). Jedyny DRIFT (create-flow) świadomy, udokumentowany w commicie 54821a4, wdrożony spójnie (grep potwierdza brak `insertCreatedItem` w `src/`).
- **Bezpieczeństwo i jakość**: niezmienniki domenowe (`accepted`/`new`/`import_session_id=NULL`/`user_id`) hard-kodowane serwerowo (items-mutation.ts) ORAZ niezależnie egzekwowane przez RLS `items_insert_own` (klient na anon-key z cookies usera, nie service_role). `createItemSchema` fail-closed (zod stripuje nadmiarowe pola; test items.test.ts). Brak bramki klucza BYOK — świadomy wyjątek FR-024, akcja nie dotyka LLM (brak egress sekretu). Zero powierzchni injection (query builder + stała allowlista `ITEM_COLUMNS`; selektor `data-item-id` z serwerowego UUID). Komunikaty błędów generyczne (raw DB error tylko w `cause`/`reportError`).
- **React**: focus przez `pendingFocusRef` + `useEffect` na `[items]` (brak setState-in-effect); sekwencja create→filter-switch→render→focus batchowana, bez stale-closure; brak naruszeń kolejności hooków.
- **Kryteria sukcesu (2026-06-19)**: `npm run lint` PASS, `npm run build` PASS (Complete), `npm test` PASS (280), `npm run test:integration` PASS (43); ręczne 1.5/2.4–2.7 `[x]` zweryfikowane (curl + niezależny SELECT w bazie; klik-through w przeglądarce).
