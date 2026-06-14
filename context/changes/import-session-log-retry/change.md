---
change_id: import-session-log-retry
title: Dziennik sesji importu + ponowienie sesji failed
status: impl_reviewed
created: 2026-06-13
updated: 2026-06-14
archived_at: null
---

## Notes

S-08 (strumień D — wejścia poboczne i diagnostyka). Wymaganie wstępne: S-02 (done). Równolegle z S-03 (validation-accept-reject), realizowane w osobnym worktree na branchu `feature/import-session-log-retry`.

- Plan: `plan.md` · Brief: `plan-brief.md`
- Parent Issue na GitHub: #12.

## Blockers

⚠️ **NIE domknięte — bloker SSR z weryfikacji ręcznej (2026-06-14).** Rdzeń (dane/endpoint/testy/przegląd) OK, ale widok `/import-sessions` wywala się na SSR („Invalid hook call / `useState` null") — dwie kopie Reacta po refaktorze listy na wyspę React (commit `081227a`). Pełny kontekst, feralne commity, co cofnąć i rekomendowane drogi naprawy → **`follow-ups/review-fixes.md`**. Board: #12 = `Blocked`. NIE archiwizować do czasu naprawy.
