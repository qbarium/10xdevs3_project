---
change_id: testing-per-user-isolation
title: Testing per-user isolation (IDOR)
status: implemented
created: 2026-07-12
updated: 2026-07-12
archived_at: null
---

## Notes

Faza 2 wdrożenia test-planu (`context/foundation/test-plan.md §3`): testy integracyjne
izolacji per-user (IDOR) dla **ryzyka #2** — użytkownik A nie odczytuje ani nie mutuje
zasobów użytkownika B, i przy odczycie, i przy zmianie. Warstwa: integration (prawdziwy
lokalny Supabase, dwóch użytkowników przez `signUp` + anon key, RLS aktywny).

Folder otwarty i zaplanowany autonomicznie w jednej sesji (łańcuch `/10x-new` → `/10x-research`
→ `/10x-plan`) na jawne polecenie użytkownika „pociśnij aż do odpalenia planu". Decyzje, które
normalnie padłyby w wywiadach `/10x-plan`, podjęte samodzielnie i udokumentowane w
`plan-brief.md` (tabela „Kluczowe decyzje") — do weryfikacji przez użytkownika przed
`/10x-implement`.
