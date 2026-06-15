---
change_id: task-operational-lifecycle
title: Stan operacyjny itemu — Aktywne/Zakończone/Anulowane (wszystkie typy)
status: implementing
created: 2026-06-15
updated: 2026-06-15
archived_at: null
---

## Notes

S-04 z roadmapy (Strumień A, domyka gwiazdę przewodnią). Wynik: zmiana stanu operacyjnego (`nowe`/`w realizacji`/`zrealizowane`/`anulowane`, wzajemnie przechodni) per item i zbiorczo; `zrealizowane` → widok Zakończone, `anulowane` → Anulowane.

**Świadomy wyłom z FR-009 (decyzja użytkownika 2026-06-15):** stan operacyjny obejmuje WSZYSTKIE typy itemów, nie tylko `task`. Roadmapa S-04 i FR-009 w PRD jawnie wykluczały „obsłużona/podjęta" dla nie-`task` — to ograniczenie zostało odwrócone. Etykiety stanu są per-typ (architektura `operationalStatusLabel(status, type)` z tabelą nadpisań, zaprojektowana pod przyszłe definiowanie). Testowe nadpisania stanu `done`: `note`→„Obsłużona", `idea`→„Obsłużony", `decision`→„Podjęta", `other`→„Obsłużone".

Decyzje UX: per-item = klikalny badge stanu → kontekstowe `dropdown-menu` z kuracją przejść (graf silnie spójny przez hub `nowe`; „Otwórz ponownie"/„Przywróć" → `nowe`). Bulk = 4 przyciski stanów w pasku. Pełna interaktywność na 3 trasach (Aktywne/Zakończone/Anulowane), jeden reużyty React island. Migracja: indeks 3-kolumnowy + backfill `NULL→'new'` + zmiana RPC `persist_classification` na wszystkie typy; bez triggera updated_at.

**Domknięte 2026-06-15:** opis S-04 w `roadmap.md`, FR-009 + bullet US-04 w PRD oraz karta #8 + opis na boardzie zaktualizowane do modelu „wszystkie typy". Karta #8 zsynchronizowana na GitHubie; zmiany w `roadmap.md`/`prd.md` zacommitowane lokalnie (`docs(roadmap,prd)`), bez push.
