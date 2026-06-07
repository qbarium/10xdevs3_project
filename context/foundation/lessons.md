# Lessons Learned

> Rejestr tylko do dodawania powtarzających się reguł i wzorców. Odczytywany ponownie na początku przez /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Formatuj celowanymi ścieżkami, nigdy całe repo w trakcie fazy

- **Context**: Faza `/10x-implement` dotykająca plików, w repo z husky + lint-staged (auto-format plików staged przy commitcie).
- **Problem**: `npm run format` (= `prettier --write .`) w trakcie Fazy 2 F-01 przeformatował 5 plików niezwiązanych z fazą (CLAUDE.md, .claude/.10x-cli-manifest.json, plan-brief.md, plan-review.md, roadmap.md), tworząc brudne ścieżki spoza zestawu dotkniętych plików; trzeba było je cofać `git restore` (co trafiło na blokadę uprawnień). Psuje czystość zestawu w rytuale commitu fazy.
- **Rule**: W trakcie fazy formatuj wyłącznie celowanym `prettier --write <konkretne-pliki>` (lub `eslint --fix` na plikach dotkniętych fazą). Nigdy `npm run format` / `prettier --write .` na całym repo — husky + lint-staged i tak sformatuje pliki staged przy commitcie.
- **Applies to**: implement, impl-review
