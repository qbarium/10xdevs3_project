---
change_id: testing-classifier-contract-session-state
title: Testy kontraktu klasyfikatora i stanu sesji (Faza 3 planu testów)
status: implemented
created: 2026-07-12
updated: 2026-07-12
archived_at: null
---

## Notes

Faza 3 wdrożenia planu testów (`context/foundation/test-plan.md` §3, wiersz „Kontrakt klasyfikatora + stan sesji").

**Cel:** naruszenie kontraktu klasyfikatora i degradacja obsłużone czysto; odpowiedź z 0 itemami to poprawny wynik („zakończona bez elementów"), a NIE błąd.

**Ryzyka pokrywane:**
- #6 — naruszenie kontraktu klasyfikatora zapisane albo źle obsłużone (brak pól obowiązkowych / >100 itemów / pusta odpowiedź mylona z błędem). Źródło: FR-005, FR-020.
- #3 — tylko część deterministyczna (limit 100 itemów, safety-net FR-020). Runtime'owa część #3 (realne zachowanie Cloudflare Workers pod granicznym wsadem) należy do Fazy 5 — nie tutaj.

**Typ testów:** unit. Gotowe przykłady odpowiedzi (0 / poprawne N / bez wymaganych pól / 101), bez prawdziwego dostawcy AI. Wzorzec mockowania do potwierdzenia w badaniu: mock na granicy HTTP fetcha klasyfikatora (§4 — brak MSW, mock ręczny).

**Wejście dla `/10x-research`:** ustalić w kodzie, gdzie sprawdzany jest kształt odpowiedzi klasyfikatora, jak odróżnia się „0 itemów" od błędu, gdzie działa limit 100 i gdzie zapisywany jest stan sesji („nie udało się" + możliwość ponowienia). Kotwice plik:linia pochodzą z badania, nie z planu (§1 zasada 3).
