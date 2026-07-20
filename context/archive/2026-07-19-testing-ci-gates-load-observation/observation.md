# Obserwacja dużego wsadu na Workers (Faza 3)

- **Data**: 2026-07-20
- **Deploy**: `https://tasker-light.qbarium.workers.dev` (Workers Free; `wrangler.jsonc` bez `limits.cpu_ms`)
- **Model AI**: `gpt-4o-mini` (BYOK, klucz w profilu usera)
- **Plan**: `context/changes/testing-ci-gates-load-observation/plan.md` (Faza 3)
- **Przepis**: `research.md` §„Observation recipe"

## Metoda

1. **Sanity deployu (3.1):** `curl /api/health` → `{"ok":true,"hasSupabase":true,"hasKek":true,"runtime":"workerd"}` (HTTP 200, ~0,2–0,3 s).
2. **Stream logów:** `npx wrangler tail tasker-light --format json` (potwierdzony żywy — pinżem `/api/health` widocznym w logu przed wysyłką).
3. **Trzy graniczne wsady** wysłane z przeglądarki (zalogowany user, realny klucz BYOK). Uwaga: wszystkie wrzucone **przez przeciągnięcie pliku** → ścieżka plikowa (`multipart/form-data`, upload do Storage + `import_files`), nie ścieżka paste. Limit pliku (300 KB) > limit paste (100 000 znaków), więc 104 KB przeszło.

## Wyniki

| Wsad | Kształt | Ścieżka | HTTP | `itemCount` | `cpuTime` | `wallTime` (czas AI) | Stan sesji |
|---|---|---|---|---|---|---|---|
| **A** | 99 000 znaków (plik 104 719 B) | plik | **200** | 7 | **42 ms** | 7 039 ms | `completed_with_items` |
| **B** | 120 linii | plik | **200** | 90 | **13 ms** (szczyt 77 ms w renderze listy) | 15 241 ms | `completed_with_items` |
| **C** | 150 linii | plik | **422** | 150 | **19 ms** | 55 691 ms | `failed` (`too_many_items`) |

### Sygnatury logów (`wrangler tail`)

- **A:** `classify: resolver {kind:chat, model:gpt-4o-mini}` → `classify: ok {durationMs:6207, itemCount:7, promptTokens:31538, completionTokens:265}`. `outcome: "ok"`.
- **B:** `classify: ok {durationMs:14824, itemCount:90, promptTokens:1415, completionTokens:1460}`. `outcome: "ok"`.
- **C:** `classify: ok {durationMs:55134, itemCount:150, promptTokens:4572, completionTokens:5641}` → request `outcome: "ok"`, **HTTP 422**. UI: dialog „Klasyfikacja nie powiodła się — Wsad wygenerował zbyt wiele wpisów. Skróć tekst i spróbuj ponownie." + przycisk „Spróbuj ponownie".

Zero `Exceeded CPU`, zero `Worker exceeded resource limits`, zero `exception`, zero 5xx w żadnym przebiegu.

## Werdykt: luka zawieszonej sesji NIE reprodukuje na prod

Wszystkie trzy graniczne wsady zeszły w **czysty stan** (`200 completed_with_items` albo `422 too_many_items`), nigdy 5xx. Żadna sesja nie została w `processing`.

**Dlaczego — potwierdzone empirycznie:** `cpuTime` trzymało **13–77 ms** mimo `wallTime` do **55 s**. To potwierdza kluczowe rozróżnienie z research: czas przebiegu to **fetch-wait na AI, nie CPU** — Workers nie ubija za czekanie na subrequest, a parsowanie odpowiedzi (nawet 150 itemów, `JSON.parse` + zod) kosztuje ~19 ms. Warunek wstępny luki (ubicie limitem CPU w trakcie parsowania) **nie zachodzi w granicach limitów aplikacji** (100 000 znaków wejścia + naturalnie ograniczona odpowiedź AI + tani parse).

## Ustalenia poboczne

- **Safety-net 100 itemów (FR-020) działa czysto.** C: AI zwróciło 150 itemów → `failSession("too_many_items")` → **422**, sesja `failed` (ponawialna), UI z jasnym komunikatem i „Spróbuj ponownie". Bez crashu.
- **C ledwo zmieścił się w timeoucie.** Generacja 150 itemów trwała ~55 s przy `AI_REQUEST_TIMEOUT_MS = 60 000`. Gdyby AI było ciut wolniejsze → zadziałałby `AbortController` → czysty `failed(timeout)` (nadal 200, nie crash). To poznana górna krawędź czasu.
- **Koszt CPU skaluje się z odpowiedzią, nie z wejściem.** A: 99 000 znaków wejścia, ale AI zwinęło je do 7 itomów → mała odpowiedź → 42 ms. B/C: więcej itemów, ale parse i tak tani (13–19 ms).

## Wpływ na decyzje

- **Free→Paid (deploy-plan Faza 8):** brak dowodu na pilny upgrade z powodu CPU — obserwowane maksimum to 77 ms, `outcome: ok`. To przeczy założeniu research „Free ~10 ms cap"; realny plan/limit CPU warto potwierdzić w panelu Cloudflare, ale CPU **nie jest wąskim gardłem** dla tych wsadów.
- **Reaper (Faza 4):** uzasadniony jako obrona przed stanem **latentnym** — utknięcie `processing` nie zdarza się przy realnym granicznym wsadzie, ale reaper zamyka lukę na wypadek patologicznego ubicia / zmiany limitów. Jego poprawność pokrywa test integracyjny (`import-session-reap.integration.test.ts`).

## Zastrzeżenia / czego nie zaobserwowano

- **Stan wiersza `import_sessions` odczytany z UI + kodu HTTP**, nie zapytaniem wprost do prod-bazy. Ponieważ nigdy nie wystąpił 5xx, pytanie „czy zostaje `processing` przy 5xx" jest bezprzedmiotowe — nie było 5xx.
- **Ścieżka paste (limit 100 000 znaków) nie testowana** — wszystkie wsady poszły przez upload pliku. Guard 413 na `Content-Length` (research §C) też nie dotknięty (104 KB < 300 KB limit pliku).
- **4.6 (ponowienie w UI po reaperze) nie zademonstrowane na żywo** — brak naturalnie utkniętej sesji do odzyskania (wszystko schodzi czysto). Inwariant pokryty testem integracyjnym reapera.
