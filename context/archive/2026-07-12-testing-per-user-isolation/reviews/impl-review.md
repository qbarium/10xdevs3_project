<!-- IMPL-REVIEW-REPORT -->
# Przegląd implementacji: Testy izolacji per-user (IDOR)

- **Plan**: context/changes/testing-per-user-isolation/plan.md
- **Zakres**: Pełny plan — Fazy 1-3 z 3
- **Data**: 2026-07-12
- **Werdykt**: ZAAKCEPTOWANY
- **Ustalenia**: 0 krytycznych, 0 ostrzeżeń, 1 obserwacja

## Werdykty

| Wymiar | Werdykt |
|-----------|---------|
| Zgodność z planem | PASS |
| Dyscyplina zakresu | PASS |
| Bezpieczeństwo i jakość | PASS |
| Architektura | PASS |
| Spójność wzorców | PASS |
| Kryteria sukcesu | PASS |

## Weryfikacja kryteriów sukcesu

- **Lint** (`npm run lint`) — PASS (exit 0; ostrzeżenia `projectService` to znany szum parsera Astro).
- **Grep §6.2/§6.4 test-plan.md** — PASS: brak placeholderów „TBD — patrz §3 Faza 2/Faza 3". Pozostałe TBD (:149 opis konwencji, :167 §6.3 e2e poza zakresem) są legalne.
- **`.env.test.local`** — obecny.
- **Testy integracyjne** (`npm run test:integration`) — NIE uruchomione ponownie podczas przeglądu: lokalny Supabase zdjęty (`docker ps` bez kontenerów), a stack nie był stawiany autonomicznie. Gate zaliczony w czasie implementacji — `## Progress` odhacza 1.1/1.2, 2.1-2.3 z SHA commitów faz (20dff59, f72a48d).
- **Kryteria ręczne** — wszystkie odhaczone w `## Progress` z SHA; potwierdzone dowodowo przez pod-agentów (klient user-scoped B, obie strony inwariantu).

## Ustalenia

### F1 — Asercja bez ładunku dowodowego w teście listItems

- **Ważność**: 🔭 OBSERWACJA
- **Wpływ**: 🏃 NISKI — szybka decyzja; poprawka jest oczywista i wąsko zakrojona
- **Wymiar**: Bezpieczeństwo i jakość
- **Lokalizacja**: tests/integration/items-operational.integration.test.ts:147
- **Szczegóły**: `expect(bActive).not.toContain(itemA)` było praktycznie tautologią — B nie miał własnych itemów `active`, więc `bActive` = `[]`, a `listItems` i tak nakłada `.eq("user_id", B.id)`. Linia przechodziłaby niezależnie od stanu izolacji. Prawdziwy dowód niosą wyżej `getSessionItems(B)` → pusto + kontrola pozytywna A. To była redundancja, nie defekt.
- **Poprawka**: Zasianie B własnym itemem `active` (`insertItem(B.supabase, B.id)`) i asercja `expect(bActive).toContain(itemB)` przed `not.toContain(itemA)` — wykluczenie itemu A stało się znaczące (nie-vacuous). Wzorzec spójny z kontrolą pozytywną już użytą dla `getSessionItems` (linie 142-143 tego samego pliku).
- **Decyzja**: FIXED (Napraw teraz) — zastosowano 2026-07-12; ESLint na pliku czysty (exit 0). Test nie został ponownie uruchomiony wobec żywej bazy (Supabase zdjęty), ale edycja jest minimalna, typuje się czysto i naśladuje istniejący wzorzec w tym samym pliku.

## Dowody czystości (z równoległego przeglądu pod-agentów)

- **Sedno IDOR trzyma się**: każda operacja B idzie przez `B.supabase` (`signUpClient("b")`, anon key + sesja, RLS aktywny) — nigdy service-role. Zasoby tworzy klient A; przeżycie itemu A weryfikowane z perspektywy A (`items-mutation` :280-305, `import-session` :135-149, `items-operational` :137-143).
- **`emptyTrash` przez przeżycie wiersza A** (funkcja nie przyjmuje `ids`), z kontrolą pozytywną, że kosz B faktycznie się opróżnił.
- **Granice „NIE robimy" uszanowane**: zero zmian w `src/**`, brak testów HTTP/e2e, brak service-role, brak ekstrakcji wspólnego helpera. Dodatkowe asercje (symetria/widoczność A) to wzmocnienia w duchu planu, nie scope creep.
- **Książka kucharska**: §6.2/§6.4 bez placeholderów; §6.6/§7/§8 wypełnione zgodnie z tym, co faza zrobiła.
