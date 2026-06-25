---
change_id: session-items-detail
title: Widok elementów sesji — master-detail w dzienniku importu
status: implementing
created: 2026-06-24
updated: 2026-06-25
archived_at: null
---

## Notes

Realizuje wycinek roadmapy **S-10** (`session-items-detail`, Strumień D). Wynik: w dzienniku sesji importu użytkownik wybiera sesję i widzi po prawej wszystkie jej elementy naraz (wszystkie stany akceptacji — `pending`/`accepted`/`rejected`/`deleted` — rozróżniane etykietą, bez filtrów), z możliwością podglądu, edycji lub usunięcia elementu w tym widoku przez reużycie operacji z list głównych (EditItemDialog z S-05, move-to-trash z S-06). Wybrana sesja zapisana w adresie strony.

- **Odnośniki PRD:** FR-027 (rozszerzony — podgląd/edycja elementów sesji wchodzi do zakresu); nadpisuje FR-008/FR-015 (sesja poza filtrami listy).
- **Wymagania wstępne:** S-08, S-05, S-06 — wszystkie `done`.
- **Kierunek techniczny (z roadmapy, do potwierdzenia w `/10x-research` + `/10x-plan`):** prawa lista pobiera elementy po `import_session_id` dedykowanym endpointem `GET /api/import-sessions/[id]/items`, zwracając wszystkie stany akceptacji; `rejected`/`deleted` pozostają tylko do odczytu wg FR-011; lista jednej sesji ograniczona do ≤ 100 elementów (FR-020), więc nie powiela problemu skalowania filtra sesji.
- **Źródło zakresu:** `context/foundation/roadmap.md` → sekcja „S-10".
