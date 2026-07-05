# Utwardzenie anty-CSRF mutujących endpointów — Krótki plan

> Pełny plan: `context/changes/csrf-hardening/plan.md`

## Co i dlaczego

Utwardzamy powierzchnię mutującą aplikacji (endpointy `src/pages/api/**` z sesją ciasteczkową
Supabase) przed CSRF metodą obrony w głąb. Motywacja: ciasteczkowa autoryzacja to model
klasycznie podatny na CSRF, a ochrona — choć dziś obecna — jest **niejawna** i mogłaby po cichu
zniknąć.

## Punkt wyjścia

Badanie wykazało, że powierzchnia jest już chroniona zbiegiem trzech mechanizmów: domyślnego
`security.checkOrigin: true` w Astro 6.3.1 (wbudowany middleware 403 na cross-site formularze),
`SameSite=Lax` z domyślnych `@supabase/ssr` oraz preflightu CORS dla `application/json`. Nie ma
jednak **żadnej jawnej, aplikacyjnej** kontroli CSRF ani pinu tych domyślnych wartości.

## Pożądany stan końcowy

Każde żądanie mutujące niepochodzące z tego samego originu dostaje 403 — w dwóch niezależnych
warstwach: wbudowanej Astro (jawnie przypiętej) i aplikacyjnej w `middleware.ts` (pokrywającej
też klasę JSON, którą Astro przepuszcza). Ciasteczko sesji ma jawny `SameSite=Lax`. Test
jednostkowy pinuje predykat przeciw regresji. Przepływy aplikacji (dodawanie itemów, akcje
zbiorcze, logowanie) działają bez zmian.

## Kluczowe podjęte decyzje

| Decyzja | Wybór | Dlaczego (1 zdanie) |
| --- | --- | --- |
| Podejście | Origin-check, bez tokenu | Token redundantny wobec origin-check; brak wspólnego wrappera `fetch` czyniłby go drogim. |
| Zakres warstwy app | Pełna — wszystkie metody + JSON | Jedna audytowalna, fail-closed brama; domyka klasę JSON, której Astro nie sprawdza. |
| Źródło dozwolonego originu | Self-referential (`Origin === url.origin`) | Działa w każdym środowisku bez konfiguracji; nie ufa env (zgodnie z lekcją zespołu). |
| Brak nagłówka `Origin` | Fail-closed + `Sec-Fetch-Site` jako zapas | Bezpieczne domyślnie, a `Sec-Fetch-Site` łapie legalne przypadki bez `Origin`. |
| SameSite | Jawny `Lax` | Pinuje bezpieczną wartość niezależnie od domyślnych Supabase; nie zrywa logowania z linku. |
| Weryfikacja | Test integracyjny warstwy app (vitest) | Deterministyczny pin regresji dokładnie tam, gdzie żyje nasz kod. |

## Zakres

**W zakresie:** aplikacyjny origin-check w `middleware.ts`; czysty helper `src/lib/security/csrf.ts`
+ test; jawny `security.checkOrigin: true` w `astro.config.mjs`; jawny `SameSite=Lax` w
`src/lib/supabase.ts`.

**Poza zakresem:** token CSRF; wspólny wrapper `fetch`; allowlista Content-Type; zmiana `httpOnly`;
`SameSite=Strict`; dotykanie 10 wywołań `fetch` i 3 formularzy; wpis roadmapy i zgłoszenia GitHub.

## Architektura / Podejście

Bramka w `src/middleware.ts` biegnie **przed** autoryzacją: dla metody mutującej sprawdza czysty
predykat `isTrustedRequest(request, url)` (`Origin === url.origin`, a przy braku `Origin` —
`Sec-Fetch-Site: same-origin`); nietrusted → `json({ok:false,code:'forbidden',error},403)` przez
istniejący `@/lib/http`. Predykat wyodrębniony do `src/lib/security/csrf.ts` (testowalny w
izolacji, wzorzec `bulk.test.ts`). Warstwa aplikacyjna współistnieje z wbudowanym origin-checkiem
Astro (ten odrzuca cross-site formularze wcześniej); razem dają dwie niezależne kontrole. `SameSite`
wymuszany w `setAll` klienta SSR.

## Fazy w skrócie

| Faza | Co dostarcza | Kluczowe ryzyko |
| --- | --- | --- |
| 1. Origin-check + pin Astro | Helper + bramka w middleware + jawny `checkOrigin` + test | Fałszywe 403 na legalnych żądaniach (dev/preview) — łagodzone self-referential `url.origin` + `Sec-Fetch-Site` |
| 2. Jawny SameSite=Lax | Wymuszenie `sameSite:'lax'` w `setAll` | Regresja sesji przy złej opcji — łagodzone weryfikacją logowania |

**Wymagania wstępne:** brak — zmiana samodzielna, na istniejącej powierzchni.
**Szacowany nakład pracy:** ~1 sesja, 2 fazy (mały kod: helper + 3 edycje + test).

## Otwarte ryzyka i założenia

- Założenie: na Cloudflare Workers `url.origin` odzwierciedla realny Host żądania (platforma
  waliduje Host) — prawdziwe dla adaptera Workers.
- Ryzyko: `Sec-Fetch-Site` nie jest wysyłany przez bardzo stare przeglądarki — żądanie bez `Origin`
  i bez `Sec-Fetch-Site` dostanie 403 (fail-closed); dla tej aplikacji nieistotne.
- Zmiana jest spoza roadmapy — jej umiejscowienie jako wycinka + sync boardu to osobna decyzja.

## Kryteria sukcesu (podsumowanie)

- Cross-origin POST na endpoint mutujący → 403; przepływy aplikacji działają bez zmian.
- Ciasteczko sesji ma jawny `SameSite=Lax`; ochrona Astro jawnie przypięta w konfiguracji.
- Test jednostkowy predykatu przechodzi i pinuje zachowanie przeciw regresji.
