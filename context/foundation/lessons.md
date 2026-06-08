# Lessons Learned

> Rejestr tylko do dodawania powtarzających się reguł i wzorców. Odczytywany ponownie na początku przez /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Formatuj celowanymi ścieżkami, nigdy całe repo w trakcie fazy

- **Context**: Faza `/10x-implement` dotykająca plików, w repo z husky + lint-staged (auto-format plików staged przy commitcie).
- **Problem**: `npm run format` (= `prettier --write .`) w trakcie Fazy 2 F-01 przeformatował 5 plików niezwiązanych z fazą (CLAUDE.md, .claude/.10x-cli-manifest.json, plan-brief.md, plan-review.md, roadmap.md), tworząc brudne ścieżki spoza zestawu dotkniętych plików; trzeba było je cofać `git restore` (co trafiło na blokadę uprawnień). Psuje czystość zestawu w rytuale commitu fazy.
- **Rule**: W trakcie fazy formatuj wyłącznie celowanym `prettier --write <konkretne-pliki>` (lub `eslint --fix` na plikach dotkniętych fazą). Nigdy `npm run format` / `prettier --write .` na całym repo — husky + lint-staged i tak sformatuje pliki staged przy commitcie.
- **Applies to**: implement, impl-review

## Walidacja wejścia API: zod dla złożonego/wielopolowego, ręczna dla pojedynczego pola skalarnego

- **Context**: Endpoint API, gdzie wejście to pojedyncze pole skalarne (np. jeden `string` z `trim` + odrzuceniem pustego). Konkretnie: `POST /api/profile/byok-key` w S-01 (byok-key-config, Faza 2) — body `{ apiKey }`.
- **Problem**: Pierwotna hard rule mówiła płasko „API routes: validate input with zod", ale plan opisał ręczną ekstrakcję (`request.json()` → `trim` → 400 na pustym), a zod nie był zależnością projektu. Dosłowne trzymanie się płaskiej reguły oznaczałoby dodanie zod ad hoc w trakcie fazy — nowa zależność wymaga `npm audit` + zgody (safe-ops) i jest scope creepem poza zatwierdzonym planem.
- **Rule**: Skodyfikowane w hard rule (`CLAUDE.md` / `AGENTS.md`): **wejście złożone/wielopolowe** (obiekty, wiele pól, zagnieżdżenia, enumy) → **walidacja zod przed jakimkolwiek efektem ubocznym, bez wyjątku**; **pojedyncze pole skalarne** → dozwolona walidacja ręczna (`trim` + odrzucenie pustego), bez konieczności dodawania zod. Wprowadzenie zod projektowo (gdy pojawi się wejście złożone) to osobna zmiana z `npm audit`. Każde odchylenie od reguły zgłoś przy bramce, by człowiek je zaakceptował.
- **Applies to**: implement, impl-review, plan, plan-review
