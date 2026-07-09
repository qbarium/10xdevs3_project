# Testy inwariantów bezpieczeństwa/prywatności — Krótki plan

> Pełny plan: `context/changes/testing-security-privacy-invariants/plan.md`
> Badania: `context/changes/testing-security-privacy-invariants/research.md`

## Co i dlaczego

Faza 1 wdrożenia test-planu: testy jednostkowe inwariantów bezpieczeństwa/prywatności dla ryzyka #1
(klucz API użytkownika wycieka do logów/błędów) i ryzyka #4 (surowy wsad wychodzi poza allowlistę
hostów / retencja u dostawcy). Rdzeń obu jest już otestowany, więc cel to **audyt + domknięcie realnej
luki + przypięcie regresji**, nie pisanie od zera — i uniknięcie tautologii z §2 (oracle wzięty z
kształtu filtra, który rzekomo testuje).

## Punkt wyjścia

Repo ma 52 współlokowane testy jednostkowe (Vitest). #4 jest praktycznie w pełni pokryte
(`ai.test.ts` — 4 wrogie wartości egress; `request.test.ts` — `store:false`; `classifier.test.ts` —
klucz tylko w nagłówku). #1: obrona pierwszej linii pokryta (jedyny komin logów, maskowanie `cause`),
ale każdy test maskera używa klucza w kształcie pasującym do jego regexu — a walidacja wejścia klucza
dopuszcza dowolny niepusty string, więc krótki/nie-`sk-` klucz omija backstop niezauważony.

## Pożądany stan końcowy

Zestaw testów **jawnie dokumentuje granicę** ochrony: co masker łapie, czego nie i dlaczego to
akceptowalne; przypina, że surowy `cause` błędu sieci nie trafia do sinka (#1) i że wychodzące żądanie
niesie `store:false` (#4); a `test-plan.md §6` przestaje mówić „TBD" o wzorcu testu bezpieczeństwa.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Luka maskera #1 | Przypnij granicę + wzmocnij pierwszą linię | Czysto QA, zero zmian w produkcie; czyni backstop uczciwym | Plan |
| Utwardzanie produktu | Nie (odrzucone) | Walidacja formatu klucza to FR-022, świadomie poza zakresem (S-01); osobna zmiana | Plan |
| Near-miss `cause` | Pin „cause nie trafia do sinka" | Tani pin chroniący realny near-miss `classifier.ts:75-78` | Badania → Plan |
| Zakres #4 | Audyt + jeden pin „store:false na drucie" | Rdzeń pokryty; jedna asercja end-to-end domyka „no-store" | Plan |
| Eksport strażników egress | Nie — wzorzec re-importu modułu | `ai.test.ts` już to pokrywa; brak zmian powierzchni modułu | Badania → Plan |
| Warstwa testów | Wyłącznie unit | Żaden scenariusz nie wymaga e2e/integracji/realnego dostawcy | Badania |

## Zakres

**W zakresie:** testy granicy maskera (krótki/nie-`sk-` klucz); pin `cause` nie w sinku; pin
`store:false` na drucie; wypełnienie `test-plan.md §6.5/§6.1/§6.6`.

**Poza zakresem:** utwardzanie produktu (walidacja klucza, rozszerzanie maskera); eksport strażników
egress; duplikacja pokrytego rdzenia #4; testy integracyjne/e2e; izolacja per-user/RLS (Faza 2
test-planu); CSRF (zamknięte S-14); crypto; podłączenie bramki CI (Faza 5 test-planu).

## Architektura / Podejście

Wyłącznie nowe/rozszerzone testy jednostkowe naśladujące istniejące wzorce referencyjne: `mask.test.ts`
(czysta funkcja), `classifier.test.ts` (`vi.stubGlobal("fetch")` + inspekcja `mock.calls`),
`classify-core.test.ts` (spy na console). Zero kodu produkcyjnego. Zamykająca podfaza aktualizuje
markdown książki kucharskiej w `test-plan.md`.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Luka maskera #1 | Testy granicy backstopu + pin „cause nie w sinku" | Test negatywny zielony przypadkiem, jeśli sentinel maskowalny |
| 2. Egress #4 + książka kucharska | Pin „store:false na drucie" + wypełnienie §6 | Duplikacja pokrytego rdzenia (mitygacja: audyt najpierw) |

**Wymagania wstępne:** `research.md` (jest); lokalny `npm test` działa.
**Szacowany nakład pracy:** ~1 sesja, 2 fazy (mała zmiana testowa).

## Otwarte ryzyka i założenia

- Pin `cause` to test negatywny (dowodzi braku) — oracle musi używać NIEmaskowalnego sentinela, inaczej masker zredaguje dowód i test nie wykryje regresji. Weryfikacja ręczna: czerwony po dodaniu `reportError(err)`.
- Luka backstopu maskera pozostaje świadomie otwarta (klucze OpenAI są zawsze `sk-`+długie; krótki i tak padnie na auth). Charakteryzujemy ją, nie naprawiamy.

## Kryteria sukcesu (podsumowanie)

- `npm test` zielony; nowe testy granicy/pinów przechodzą, brak regresji.
- Pin `cause` udowodniony jako czerwony po tymczasowym `reportError(err)`.
- `test-plan.md §6.5` wypełnione — koniec „TBD" dla wzorca testu inwariantu bezpieczeństwa.
