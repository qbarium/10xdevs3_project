# Lessons Learned

> Rejestr tylko do dodawania powtarzających się reguł i wzorców. Odczytywany ponownie na początku przez /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Formatuj celowanymi ścieżkami, nigdy całe repo w trakcie fazy

- **Context**: Faza `/10x-implement` dotykająca plików, w repo z husky + lint-staged (auto-format plików staged przy commitcie).
- **Problem**: `npm run format` (= `prettier --write .`) w trakcie Fazy 2 F-01 przeformatował 5 plików niezwiązanych z fazą (CLAUDE.md, .claude/.10x-cli-manifest.json, plan-brief.md, plan-review.md, roadmap.md), tworząc brudne ścieżki spoza zestawu dotkniętych plików; trzeba było je cofać `git restore` (co trafiło na blokadę uprawnień). Psuje czystość zestawu w rytuale commitu fazy.
- **Rule**: W trakcie fazy formatuj wyłącznie celowanym `prettier --write <konkretne-pliki>` (lub `eslint --fix` na plikach dotkniętych fazą). Nigdy `npm run format` / `prettier --write .` na całym repo — husky + lint-staged i tak sformatuje pliki staged przy commitcie.
- **Applies to**: implement, impl-review

## Hard rule „validate with zod" ustępuje przy trywialnym wejściu, gdy zod nie jest zależnością

- **Context**: Endpoint API z pojedynczym, trywialnym polem wejścia (np. jeden `string` z `trim` + odrzuceniem pustego), gdzie plan świadomie wybrał walidację ręczną, a zod NIE jest zależnością projektu. Konkretnie: `POST /api/profile/byok-key` w S-01 (byok-key-config, Faza 2).
- **Problem**: CLAUDE.md hard rule mówi „API routes: validate input with zod", ale plan opisuje ręczną ekstrakcję (`request.json()` → `trim` → 400 na pustym). Dosłowne trzymanie się hard rule w trakcie fazy oznaczałoby dodanie nowej zależności (zod) ad hoc — co wymaga `npm audit` + zgody (safe-ops) i jest scope creepem poza zatwierdzonym planem.
- **Rule**: Gdy wejście endpointu to pojedyncze trywialne pole ORAZ zod nie jest jeszcze zależnością ORAZ plan świadomie wybrał walidację ręczną — ręczna walidacja (`trim` + non-empty) jest akceptowalnym, świadomym odchyleniem; NIE dodawaj zod ad hoc w trakcie fazy. Wprowadzenie zod (projektowo, z audytem) to osobna zmiana. Dla wejść nietrywialnych (obiekty, wiele pól, zagnieżdżenia, enumy) hard rule zod obowiązuje bez wyjątku. Odchylenie zawsze zgłoś przy bramce, by człowiek je zaakceptował.
- **Applies to**: implement, impl-review, plan, plan-review
