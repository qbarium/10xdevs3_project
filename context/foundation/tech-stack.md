---
starter_id: 10x-astro-starter
package_manager: npm
project_name: tasker-light
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: true
  has_background_jobs: false
---

## Why this stack

Solo autor szlifuje MVP web-app w 3 tygodnie po godzinach z twardym deadline'm 2026-07-05; produkt potrzebuje auth (Supabase Auth pokrywa passwordless / OAuth bez własnego backendu), bazy danych (Postgres przez Supabase), file storage serwerowego dla wsadu plikowego (Supabase Storage — domknięcie FR-015/NFR Retencja po doprecyzowaniu) oraz wywołań do zewnętrznego dostawcy AI dla klasyfikacji w trybie BYOK. 10x Astro Starter to recommended-default dla komórki `(web, js)` — zalicza wszystkie cztery bramki agent-friendly (typed via TypeScript, convention-based, popular w training data, well-documented), a pewność bootstrapper'a `first-class` oznacza że scaffolding powinien przejść gładko, choć nie jest jeszcze battle-tested end-to-end. Cloudflare Workers to natywny target adaptera `@astrojs/cloudflare` v13 (target Pages został usunięty z adaptera — Workers Static Assets od 2026 zapewnia pełną parytetowość: static + SSR + custom domains; Pages w trybie maintenance-only po stronie adaptera). Edge runtime mieści synchroniczną klasyfikację z timeoutem 60 s (NFR) — wymaga Workers Paid (5 USD/mc) przed pierwszym realnym deployem, na Free CPU limit 10 ms/wywołanie jest za ciasny dla parsowania odpowiedzi AI. Workers obsłużą wywołanie zewnętrznego dostawcy AI bez wydzielonego backendu. CI na GitHub Actions z auto-deploy-on-merge to standardowy shape startera, w sam raz dla solo bez staging gate'u. Audio (FR-004 nice-to-have) zostawione poza must-have MVP, więc `has_background_jobs` = false; w razie eskalacji scope'u — Cloudflare Queues pokryją. Szczegółowe ryzyka, kroki startowe i historia operacyjna w `@context/foundation/infrastructure.md` (decyzja z `/10x-infra-research`, 2026-06-02).
