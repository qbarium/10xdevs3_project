---
project: TaskerLight
doc_type: guidelines
scope: warstwa LLM (klasyfikacja, wycinek S-02)
status: draft
created: 2026-06-08
sources:
  - research nad dobrymi praktykami integracji z OpenAI API
  - prd.md, shape-notes.md (TaskerLight)
related_prd: [FR-002, FR-003, FR-005, FR-021, FR-023, FR-025, FR-026]
---

# Wytyczne: warstwa LLM w TaskerLight (klasyfikacja)

## 1. Cel i kontekst

Dokument opisuje, jak zorganizować komunikację z modelem AI w wycinku **S-02** (wklej tekst → klasyfikacja → typowane itemy). Powstał z dwóch źródeł: researchu nad dobrymi praktykami integracji z OpenAI API oraz decyzji i guardraili z `prd.md` / `shape-notes.md` TaskerLighta.

Referencyjny wzorzec integracji z LLM bywa rozbudowany — obsługuje wielu dostawców, wiele zadań i czat. Tutaj redukujemy go do jednego dostawcy (OpenAI), jednego zadania (klasyfikacja) i strzału jednorazowego. Zachowujemy z niego dwie rzeczy: cienką warstwę abstrakcji nad wywołaniem oraz mechanizm sterowania dokładnością przez wybór modelu i parametry.

## 2. Decyzje bazowe (ustalone)

| Decyzja | Wartość | Źródło |
|---|---|---|
| Dostawca | **OpenAI** (Anthropic poza zakresem) | shape-notes (Forward: tech-stack) |
| Sposób wywołania | **Surowy `fetch` + `AbortController`**, bez SDK | sesja `/10x-plan` S-02 |
| Timeout | ~60 s, egzekwowany przez `AbortController` | PRD (US-01, NFR) |
| Walidacja odpowiedzi | **Structured Outputs (`json_schema`, `strict`) + `zod`** na granicy przed zapisem | sesja `/10x-plan` S-02; FR-005 |
| Wybór modelu | przez konfigurację aplikacji; **bez wyboru przez użytkownika** | FR-023 (Non-Goal) |
| Zapis na koncie OpenAI | **`store: false`** | decyzja właściciela; PRD prywatność |
| Klucz API | **BYOK — osobny klucz każdego użytkownika** — z zaszyfrowanego profilu, NIE z globalnego env | F-01, S-01, PRD BYOK |
| Prompt klasyfikacji | osobny moduł importowany, nie czytany z dysku w runtime | sesja `/10x-plan` S-02 |

> **Różnica, którą łatwo przeoczyć:** typowa integracja zakłada jeden klucz aplikacji w zmiennej środowiskowej. TaskerLight świadomie od tego odchodzi — klucz jest **osobny dla każdego użytkownika** (BYOK), odczytywany z zaszyfrowanego profilu raz na początku przetwarzania i trzymany w pamięci procesu do końca operacji (PRD: polityka cascade). Globalnego `OPENAI_API_KEY` w env **nie ma**. W env trafiają tylko: nazwa modelu, parametry oraz sól do hashowania identyfikatora (FR-025) i KEK do szyfrowania (F-01).

## 3. Architektura warstwy

Jedna umowa wejścia, za którą reszta aplikacji nie wie, który endpoint obsłużył żądanie:

```
classify(rawText, opts) → Item[]        // umowa, od której zależy reszta aplikacji
```

Za tą umową stoją cztery elementy:

1. **Resolver endpointu** — funkcja (na przykład `resolveEndpoint(model)`), która z nazwy modelu wybiera ścieżkę: Chat Completions (modele klasyczne) albo Responses (modele rozumujące). Pełne reguły w §4.
2. **Konstruktor żądania (osobny dla każdego endpointu)** — dwa kształty treści żądania, bo Chat Completions i Responses mają różne parametry i inny zapis Structured Outputs. Patrz §5 i §8.
3. **Walidator odpowiedzi** — Structured Outputs wymusza kształt po stronie modelu, `zod` waliduje na granicy tuż przed zapisem (siatka bezpieczeństwa, gdyby API zwróciło coś spoza schematu). Surowa odpowiedź modelu **nie trafia do bazy** — zapisujemy tylko zwalidowane itemy.
4. **Haczyk na mock** — resolver rozpoznaje wartość `model: mock` i kieruje do atrapy zwracającej stały zestaw itemów, bez wywołania OpenAI. Uzasadnienie: testy **E2E** (end-to-end, przez całą aplikację jak użytkownik) muszą dostać deterministyczną odpowiedź — patrz §7. **Nie służy unitom** (omija walidator, a to jego najczęściej chcesz sprawdzać). Na etapie S-02 wystarczy sam punkt rozgałęzienia w resolverze; ciało atrapy może powstać dopiero przy wejściu testów E2E (moduł testów).

**Zakres warstwy — czego świadomie nie budujemy.** Warstwa robi jedno zadanie (klasyfikację) w pojedynczym wywołaniu, bez rozmowy w tę i z powrotem. Świadomie pomijamy **tool-calling** (inaczej *function calling*) — mechanizm, w którym model wywołuje zdefiniowaną przez nas funkcję, często po to, by zwrócić uporządkowaną strukturę. Nam jest zbędny, bo strukturę daje już Structured Outputs, a tool-calling to częsty domyślny odruch, w który łatwo wpaść. Pomijamy też rozmowę wieloturową i jej historię; dostawca pozostaje jeden (OpenAI). To zawężenie trzyma warstwę cienką i nie rozdmuchuje najcięższego wycinka.

## 4. Wybór endpointu wg modelu (resolver)

Resolver wybiera endpoint na podstawie nazwy modelu — **dwie gałęzie**, porównanie bez rozróżniania wielkości liter:

1. **Nazwa w wyliczonym zbiorze modeli klasycznych** → **Chat Completions** (`/v1/chat/completions`); pokrętło dokładności: `temperature`.
   Zbiór klasyczny (zamknięty): `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4-turbo`, `gpt-3.5-turbo` (i warianty z datą), a także `mock` (środowisko testowe).
2. **Wszystko inne** (GPT-5.x, seria `o`, modele przyszłe) → **Responses** (`/v1/responses`); pokrętło dokładności: `reasoning.effort` (+ `verbosity`).

Resolver zalicza `mock` do grupy modeli klasycznych — atrapa znajduje się więc po stronie Chat Completions. Sama nie wykonuje wywołania OpenAI: zwraca gotowe itemy w pamięci, z pominięciem walidatora (§3). Wybór resolvera (model → endpoint) warto zalogować dla diagnostyki.

**Dlaczego tak — i dlaczego bez override'u.** Zbiór klasyczny jest zamknięty i wyliczony (linia „czwórek" i 3.5 się nie rozrasta), a wszystko poza nim domyślnie idzie na Responses. To nie jest zgadywanie z wzorca nazwy: nowe modele OpenAI idą w stronę rozumujących, a Responses je obsługuje — więc default „reszta → Responses" jest świadomą, trafną gałęzią, nie obejściem. Gdyby OpenAI wydało nowy model klasyczny, **dopisujesz go do wyliczonego zbioru** (zmiana w kodzie) — bez mechanizmu override'u w konfiguracji. Niuans: GPT-5.x są dwuendpointowe (działają też na Chat Completions), ale dla nich Responses jest zalecany i daje pełną kontrolę `reasoning_effort` — dlatego kierujemy je tam.

## 5. Sterowanie dokładnością

Pokrętło dokładności jest **inne dla każdej klasy modelu** — używasz tego, które pasuje do wybranej ścieżki (ograniczenia niżej):

- **Modele klasyczne** (Chat Completions): `temperature` (0.0–2.0). Niżej = bardziej deterministycznie. Dla klasyfikacji niższa wartość zwykle daje stabilniejsze typowanie (patrz §6, `OPENAI_TEMPERATURE`).
- **Modele rozumujące** (Responses): `reasoning.effort` (`minimal`…`high`) — ile model myśli przed odpowiedzią; wyżej = lepsza jakość, dłuższa latencja, wyższy koszt (reasoning tokens płacone osobno). Plus `verbosity` — długość odpowiedzi.

### Ograniczenia i zalecenia API (jeśli sięgniesz po modele rozumujące)

- Modele GPT-5.x są **dwuendpointowe** — działają na Chat Completions i na Responses. Responses jest dla nich **zalecany** (lepsza jakość i pełna kontrola rozumowania), ale **nie obowiązkowy**.
- Twarde **400**, które bywa cytowane jako „model rozumujący nie działa na Chat Completions", dotyczy konkretnie kombinacji **`tools` + `reasoning_effort`** na Chat Completions. **Nas nie dotyczy** — zamiast narzędzi używamy Structured Outputs.
- Do modeli rozumujących **nie wysyłamy `temperature`** (ich pokrętłem jest `reasoning.effort`). Tę zasadę potwierdź w aktualnej dokumentacji dla wybranego modelu.

Praktyczny wniosek dla konstruktora żądania: dla ścieżki Chat Completions wysyłamy `temperature`, **nie** wysyłamy `reasoning_effort`/`verbosity`; dla ścieżki Responses odwrotnie.

## 6. Parametry konfiguracyjne (ENV) — propozycja dla TaskerLighta

**Propozycja** organizacji parametrów i wartości startowych — punkt wyjścia, nie wartości ostateczne. Każda wymaga potwierdzenia lub kalibracji w spec technicznej. Kolumna „Działa dla" pokazuje, której ścieżki dotyczy parametr (przy `gpt-4o-mini` parametry rozumujące są martwe).

| Zmienna (propozycja) | Wartość startowa | Działa dla | Uwaga |
|---|---|---|---|
| `CLASSIFIER_MODEL` | `gpt-4o-mini` | obie | Nazwa modelu = wybór endpointu (§4). Wartość `mock` (środowisko testowe) wybiera atrapę zamiast wywołania OpenAI (§3). |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | obie | Konfigurowalne (pozwala wskazać proxy/mock). |
| `OPENAI_TEMPERATURE` | `0.5` (start) | klasyczne | Środek: trochę luzu, ale `0.7` bywa za rozstrzelone dla klasyfikacji (typowe dla zadań generatywno-edycyjnych). Kalibruj przez acceptance rate ≥70%; w stronę `0.2` jeśli typowanie niestabilne. |
| `OPENAI_MAX_TOKENS` | `8000` (do kalibracji) | obie (różna nazwa pola) | W treści żądania: `max_completion_tokens` (Chat Completions) / `max_output_tokens` (Responses). Limit kosztu i ochrona przed obcięciem. **Musi być dość wysoki, by nie obciąć poprawnej odpowiedzi** — obcięty JSON = błąd walidacji. To NIE limit liczby itemów (ten to techniczny safety net 100/sesja z PRD). |
| `OPENAI_STORE` | `false` | obie | OpenAI nie retencjonuje żądania/odpowiedzi (~30 dni). Spójne z guardrailem prywatności: surowy wsad to prywatne myśli. Ustawić **jawnie** w treści żądania, nie polegać na domyślnej wartości API. |
| `OPENAI_REASONING_EFFORT` | `low` | **tylko rozumujące** | Ignorowane/niewysyłane dla `gpt-4o-mini`. Aktywne dopiero po przełączeniu na model rozumujący. |
| `OPENAI_VERBOSITY` | `low` | **tylko rozumujące** | Jw. Dla klasyfikacji `low` jest właściwe (zwięzła struktura). |
| `OPENAI_REASONING_SUMMARY` | `none` | **tylko rozumujące** | Zwraca streszczenie toku rozumowania modelu. Kosztowo darmowe, ale to dodatkowa treść o prywatnym wsadzie — przy posturze prywatności trzymać `none`. |
| `LLM_LOG_LEVEL` | `INFO` / `DEBUG` wg potrzeb | — | Poziom logowania — **dowolny w każdym środowisku**. Ograniczenie nie dotyczy poziomu, tylko *treści zapytania do modelu* — patrz §7. |

> **Magic value `none`** (konwencja na wyłączanie parametrów opcjonalnych): wartość `none` znaczy „nie dodawaj tego pola do żądania" — opt-out, zamiast polegać na pustej wartości. W researchu konwencja była stosowana konkretnie do `OPENAI_REASONING_SUMMARY` (rezygnacja ze streszczenia rozumowania). Typowe uzasadnienie wiąże się z pułapką powłok/runtime'ów, gdzie pusta zmienna potrafi się wyczyścić. Na Cloudflare Workers ta pułapka nie występuje — zmienna nieustawiona jest po prostu niezdefiniowana. Konwencję możesz zachować dla czytelności, ale nie z tego powodu.

## 7. Prywatność i logowanie

TaskerLight przetwarza **prywatne myśli użytkownika**, więc logowanie musi być ostrożniejsze niż w typowej aplikacji wewnętrznej. Kluczowe rozróżnienie, które pełni rolę guardrailu: **poziom logowania** i **to, co wolno w nim pokazać**, to dwie niezależne osie.

1. **Maskowanie klucza — zawsze, wszystkie środowiska, każdy poziom** (FR-026, bezwarunkowo). Filtr w warstwie loggera maskuje ciągi w kształcie klucza (`sk-...`). To obowiązuje także lokalnie.
2. **Treść zapytania do modelu (surowy wsad) w logach — wyłącznie lokalny dev, za jawną flagą.** Nigdy w środowiskach wdrożonych (prod, preview), **niezależnie od poziomu logowania** — nawet DEBUG na produkcji nie ma prawa wypisać surowego wsadu, bo blokada wisi na treści wsadu, nie na poziomie logu. W devie karmisz to własnymi danymi testowymi, nie cudzymi.
3. **W środowiskach wdrożonych logujemy tylko metadane** — timing wywołania, zużycie tokenów (prompt/completion/total/reasoning), `finishReason`/status. **Nigdy** treści wsadu ani surowej odpowiedzi.
4. **`store: false`** — OpenAI nie przechowuje żądania/odpowiedzi (§6).
5. **Identyfikator użytkownika do OpenAI** — stabilny **hash z solą** (FR-025), nie surowy identyfikator. Sól w env. W treści żądania jako parametr `user`.
6. **Brak narzędzi observability/tracingu** wywołań klasyfikacji w MVP (PRD Non-Goal) — surowy wsad nie wychodzi do żadnego trzeciego serwisu poza OpenAI.

## 8. Szkic kształtu żądania (do potwierdzenia w dokumentacji)

Ponieważ budujemy treść żądania ręcznie (`fetch`, bez SDK), poniżej szkielet dla każdego endpointu. **Dokładne nazwy pól dla Structured Outputs potwierdź w aktualnej dokumentacji** (masz ją w plikach `openai_resonses_api.txt` / dokumentacji Chat Completions) — poniżej intencja, nie gwarancja składni.

**Ścieżka klasyczna (gpt-4o-mini, `/v1/chat/completions`):**
```
{
  model,
  messages: [{ role: "system", content: <prompt> }, { role: "user", content: <wsad> }],
  temperature,                       // pokrętło dokładności (klasyczne)
  max_completion_tokens,
  store: false,
  user: <hash z solą>,
  response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }
}
```

**Ścieżka rozumująca (gpt-5.x / o-, `/v1/responses`):**
```
{
  model,
  instructions: <prompt>,            // top-level, zamiast roli system
  input: [{ role: "user", content: <wsad> }],
  reasoning: { effort },             // pokrętło dokładności (rozumujące); temperature NIE
  text: { verbosity, format: { type: "json_schema", name, strict: true, schema } },
  max_output_tokens,
  store: false,
  user: <hash z solą>
}
```

W obu przypadkach po stronie aplikacji: walidacja `zod` na sparsowanej odpowiedzi → przy naruszeniu kontraktu błąd wewnętrzny (generyczny komunikat + sugestia ponowienia), brak zapisu surowej odpowiedzi. Atrapa (mock, §3) zwraca gotowe itemy z pominięciem tego kroku — dlatego nadaje się do E2E, nie do testowania samego walidatora.

## 9. Ustalenia

1. **Model na start: `gpt-4o-mini`** (okno 128k spełnia wymóg ≥128k z PRD OQ3). W razie potrzeby można później przełączyć na model rozumujący, gdyby acceptance rate spadł poniżej 70% — warstwa to umożliwia bez przepisywania (zmiana nazwy modelu + dobór pokrętła).
2. **Temperature na start: `0.5`** — kalibracja przez acceptance rate ≥70% (§6).
3. **Polityka retry przy błędach dostawcy (5xx / timeout) — wciąż otwarta.** Strategia odczekiwania + maksymalna liczba prób; retry sprawdza stan klucza przed ponowieniem (klucz usunięty między błędem a retry → komunikat z PRD). Właściciel: spec techniczna.
