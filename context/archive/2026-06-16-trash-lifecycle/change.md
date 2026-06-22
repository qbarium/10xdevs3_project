---
change_id: trash-lifecycle
title: Cykl życia kosza
status: archived
created: 2026-06-16
updated: 2026-06-20
archived_at: 2026-06-20T18:28:38Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- **2026-06-19 — scope-down po przeglądzie właściciela:** usunięto pod-filtr pochodzenia (Wszystkie/Odrzucone/Usunięte) z widoku Kosz. Rozróżnienie `rejected`/`deleted` niesie badge na karcie; zawężanie w Koszu odbywa się wyłącznie filtrem typu (jak inne widoki). FR-012 zaktualizowane. Usunięto martwy `trash-view.ts` + test (`applyTrashSubFilter` bez konsumentów).
