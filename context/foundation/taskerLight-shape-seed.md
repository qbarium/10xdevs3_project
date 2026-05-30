# TaskerLight — seed notes for /10x-shape

> Cel tego pliku: ustrukturyzowany wsad do skilla `/10x-shape`. Nie jest to PRD.
> Skill przejdzie z Tobą sesję sokratejską, może dopytać o luki i wygeneruje
> `shape-notes.md`, z którego `/10x-prd` zrobi finalny PRD.

> **O nazwie:** „TaskerLight" jest świadomie odróżnione od docelowego produktu
> („Tasker"), który autor planuje rozwijać poza zakresem kursu. TaskerLight to
> osobna linia — projekt zaliczeniowy 10xDevs, MVP zamknięty w kryteriach
> kursowych. Ewentualna ewolucja w stronę „Taskera" nastąpi w odrębnym
> projekcie, bazującym na tym samym pomyśle, ale niezwiązanym z zaliczeniem.

---

## Meta

- **context_type:** greenfield
- **project_type:** web app, full-stack z deploymentem (10xBuilder)
- **target_user_scale:** single user (multi-user architecture od dnia pierwszego)
- **timeline_budget:** ~3–4 tygodnie (kurs 10xDevs, certyfikacja 10xBuilder)

---

## 1. Vision & Problem

### Pain (w słowach użytkownika, skondensowane)

W ciągu dnia generuję bardzo wiele myśli — pomysłów, zadań, notatek, decyzji —
w sytuacjach, w których nie ma fizycznej ani mentalnej możliwości ich strukturalnego
zapisu: jadąc samochodem, w pociągu, na spacerze, w windzie. Nie mam skutecznej
metody notowania na bieżąco — takiej, która nie wymagałaby decydowania *w momencie
nagrania*, czym dana myśl jest (zadanie? notatka? pomysł?) ani w jakiej formie
ma być zapisana. W efekcie wiele myśli przepada, a ja wielokrotnie wymyślam te
same pomysły, znów ich nie zapisuję i znów zapominam.

### Vision

TaskerLight = osobisty asystent, do którego użytkownik wrzuca surowy, niesformatowany
wsad (tekst lub plik), a aplikacja automatycznie zamienia go w typowane, edytowalne
itemy. Użytkownik weryfikuje je w jednej liście walidacyjnej, akceptuje (zbiorczo
lub pojedynczo), a następnie zarządza nimi na listach per typ.

Docelowa wersja produktu obsługuje wiele kanałów wejścia (aplikacja mobilna do
dyktowania, synchronizacja z Drive, rozmowa z agentem LLM, mail). MVP zawiera
tylko jeden kanał: webowy upload/paste w aplikacji.

---

## 2. Persona & Access Control

### Persona

Pojedynczy użytkownik (autor). Korzysta z dyktafonu noszonego na szyi w trybie
voice-activated, generuje dziesiątki krótkich i kilka długich wypowiedzi dziennie.
Wypowiedzi mają dwie formy:

- **krótkie dyrektywy:** „przyciąć drzewko", „rozsiać nawóz na trawnik"
- **dłuższe rozważania z kontekstem:** „zaprojektować aplikację X" + akapit szczegółów

### Access control

- **Multi-user od dnia pierwszego.** Każdy użytkownik ma izolowane dane i własny
  profil. Powód: nie chcemy przerabiać schematu bazy ani warstwy auth w V2.
- **Logowanie:** PRD ustala model (passwordless email lub OAuth, single-user-per-account,
  brak ról administracyjnych). Konkretny provider — decyzja downstream w
  `/10x-tech-stack-selector`.
- Brak ról ani uprawnień ponad „user widzi tylko swoje dane".

### BYOK (Bring Your Own Key)

Aplikacja jest projektowana jako publicznie dostępna (projekt zaliczeniowy
10xDevs). W związku z tym **nie zawiera wbudowanego, współdzielonego klucza
API**. Każdy użytkownik wprowadza w profilu **własny klucz OpenAI API**, który
jest używany do wszystkich wywołań AI generowanych z jego konta (klasyfikacja
itemów, transkrypcja audio jeśli będzie wspierana). User płaci za swoje
wywołania we własnym koncie OpenAI.

---

## 3. MVP Discipline

### First working flow (smoke test pierwszego dowiezienia)

1. User loguje się.
2. Wkleja tekst LUB dropuje plik (transkrypcja `.md` / `.txt`) na okno aplikacji.
3. Klika „submit".
4. Aplikacja klasyfikuje wsad LLM-em na 0..N typowanych itemów.
5. User jest automatycznie przeniesiony na listę walidacyjną, filtrowaną do
   ostatniej sesji importu.
6. User akceptuje wszystkie itemy jednym klikiem (bulk) LUB akceptuje/edytuje/odrzuca
   pojedynczo.
7. Zaakceptowane itemy lądują na listach per typ (Zadania / Notatki / Pomysły /
   Decyzje / Inne).
8. User może oznaczyć zadanie jako wykonane.

### Non-goals (jawnie poza MVP)

- Workflowy n8n (jako prywatna infrastruktura użytkownika, nie część projektu)
- Bezpośrednia integracja z Google Drive
- Aplikacja mobilna do dyktowania
- Czat z agentem LLM (pole wsadu NIE jest czatem)
- Integracje mailowe i inne kanały wejścia
- Parsowanie `due_text` na konkretne daty
- Deduplikacja itemów między wsadami
- Grupowanie itemów w projekty
- Fiszki i inne domenowe byty
- Integracje wychodzące (kalendarz, todoist)
- Role administracyjne / RBAC
- Klasyfikacja priorytetów po imporcie
- Background classification (preview itemów przed submit)
- **LLM observability** (Langfuse i podobne narzędzia tracingu wywołań LLM) —
  świadomie odłożone do V2 ze względu na dodatkową infrastrukturę, koszt
  implementacji i implikacje prywatnościowe (logowanie surowych wsadów
  użytkowników do zewnętrznego serwisu).

### „Could" wewnątrz MVP (jeśli budżet pozwoli)

- **Wsad audio.** Aplikacja sama transkrybuje wgrany plik audio przed klasyfikacją.
  MVP startuje z wejściem tekstowym; audio dodajemy, jeśli zostanie czas.

---

## 4. Functional Requirements (wstępna lista)

- **FR-001:** User może utworzyć konto i się zalogować.
- **FR-002:** User może wprowadzić wsad jako: (a) wklejony tekst w polu
  tekstowym, (b) drag-and-drop pliku transkrypcji (`.txt`, `.md`).
  **[could]** drag-and-drop pliku audio (`.mp3`, `.wav`).
- **FR-003:** Aplikacja po submit przekazuje wsad do LLM-a, który dekomponuje go
  na 0..N itemów wg kontraktu JSON (`type`, `title`, `description`). Pełniejszy
  kontrakt z `confidence`, `importance`, `tags` zachowany jako forward-compatible
  schema — UI MVP używa tylko podzbioru.
- **FR-004:** Po submit user jest automatycznie przeniesiony na listę walidacyjną,
  filtrowaną do bieżącej sesji importu.
- **FR-005:** Na liście walidacyjnej user może:
  - zatwierdzić wszystkie itemy jednym klikiem (bulk accept),
  - zatwierdzić, edytować lub odrzucić każdy item indywidualnie.
- **FR-006:** Zaakceptowane itemy są widoczne na osobnych listach per typ
  (Zadania, Notatki, Pomysły, Decyzje, Inne).
- **FR-007:** Zadania mają akcję „oznacz jako wykonane".
- **FR-008:** User może edytować `title` i `description` itemu w stagingu i na
  docelowych listach. Itemy w koszu są tylko do odczytu.
- **FR-009:** Odrzucone itemy ze stagingu trafiają do kosza ze statusem `rejected`.
- **FR-010:** User może przenieść zaakceptowany item do kosza (status `deleted`).
  Item raz zaakceptowany NIE wraca do statusu `pending` — można go tylko wyrzucić.
- **FR-011:** Kosz jest osobnym widokiem; każdy item zachowuje informację o swoim
  poprzednim statusie (rejected vs deleted).
- **FR-012:** Każdy submit tworzy nową sesję importu z unikalnym identyfikatorem;
  filtr „ostatnia sesja" jest domyślny na widoku walidacyjnym.
- **FR-013:** User może opróżnić kosz globalną akcją („wyczyść kosz") — usuwa
  wszystkie itemy w koszu naraz. Brak czyszczenia per item, brak auto-cleanup.
- **FR-014:** Pole wklejania tekstu w UI ma limit **100 000 znaków** (Unicode).
  Po przekroczeniu pole blokuje dalsze wprowadzanie z widocznym licznikiem.
- **FR-015:** Limit rozmiaru pliku tekstowego (`.txt`, `.md`): **300 KB**.
  UI blokuje upload większych plików przed submitem z komunikatem.
- **FR-016:** Limit rozmiaru pliku audio (`.mp3`, `.wav`): **25 MB** (limit
  Whisper API). UI blokuje upload większych plików przed submitem z komunikatem.
- **FR-017:** Limit liczby itemów per sesja importu: **50**. Jeśli LLM zwróci
  więcej, aplikacja przycina wynik do 50 z widoczną informacją dla użytkownika.
- **FR-018:** Profil użytkownika zawiera sekcję ustawień, w której user może
  wprowadzić, podejrzeć (zamaskowany, np. tylko ostatnie 4 znaki widoczne)
  i usunąć swój klucz OpenAI API. Klucz przechowywany w bazie w postaci
  zaszyfrowanej (at-rest encryption).
- **FR-019:** Klucz API jest zapisywany **bez walidacji przy zapisie**.
  Niepoprawny lub wygasły klucz objawia się błędem przy pierwszej próbie
  wywołania AI; błąd jest komunikowany użytkownikowi w UI z sugestią
  weryfikacji klucza w ustawieniach.
- **FR-020:** Aplikacja używa **hardcoded modelu OpenAI** dla klasyfikacji
  itemów. User nie wybiera modelu w UI. Konkretny model — decyzja w spec
  technicznej, nie w PRD. Whisper API używany dla transkrypcji audio
  (jeśli wejdzie audio jako `could`).
- **FR-021:** Akcje wymagające klucza API (submit wsadu, klasyfikacja,
  transkrypcja) są zablokowane dla użytkownika bez skonfigurowanego klucza.
  UI pokazuje wtedy komunikat „skonfiguruj klucz w ustawieniach". Pozostałe
  akcje (przeglądanie list, edycja itemów, oznaczanie zadań jako wykonane,
  zarządzanie koszem) działają bez klucza.
- **FR-022:** Każde wywołanie OpenAI API z aplikacji zawiera w body parametr
  `user` z UUID konta użytkownika, na potrzeby audit trail i abuse detection.
  Pozwala to korelować zachowanie zewnętrznego API z konkretnym kontem
  niezależnie od cyklu życia klucza.
- **FR-023:** **Klucze API użytkowników NIE są nigdy logowane** — ani w logach
  aplikacji, ani w audit trail, ani w raportach błędów, ani w telemetrii.
  Klucz istnieje wyłącznie w zaszyfrowanej formie w bazie oraz w pamięci
  procesu w momencie wywołania OpenAI API. Komunikaty błędów dotyczące klucza
  nie mogą zawierać żadnego jego fragmentu.

### Wstępne user stories (Given / When / Then)

**US-01 — Submit wsadu tekstowego**

- **Given:** User jest zalogowany.
- **When:** Wkleja tekst do pola wsadu i klika „submit".
- **Then:** Po klasyfikacji jest automatycznie przeniesiony na listę walidacyjną
  z itemami z tej sesji.

**US-02 — Bulk accept**

- **Given:** User jest na liście walidacyjnej z N itemami.
- **When:** Klika „zatwierdź wszystkie".
- **Then:** Wszystkie N itemów trafia na właściwe listy per typ; lista walidacyjna
  jest pusta.

**US-03 — Indywidualna walidacja z edycją i odrzuceniem**

- **Given:** User jest na liście walidacyjnej z 3 itemami.
- **When:** Pierwszy zatwierdza, drugiemu edytuje treść i zatwierdza, trzeci odrzuca.
- **Then:** Pierwsze dwa idą na właściwe listy (z edycją w drugim); trzeci ląduje
  w koszu ze statusem `rejected`.

**US-04 — Oznaczenie zadania jako wykonanego**

- **Given:** Zaakceptowane zadanie jest na liście Zadania.
- **When:** User klika „oznacz jako wykonane".
- **Then:** Zadanie ma status wykonane i jest oznaczone wizualnie.

**US-05 — Przeniesienie do kosza**

- **Given:** Zaakceptowana notatka jest na liście Notatki.
- **When:** User klika „przenieś do kosza".
- **Then:** Notatka znika z listy Notatki i pojawia się w koszu ze statusem `deleted`.

---

## 5. Business Logic & Data

### Domain rule (jedno zdanie)

**Aplikacja przyjmuje surowy, niesformatowany wsad użytkownika i automatycznie
dekomponuje go na typowane itemy (zadanie, notatka, pomysł, decyzja, inne),
dzięki czemu użytkownik nie musi w momencie zapisu decydować, czym dana myśl
jest ani jak ją sformatować.**

### Typy itemów (MVP)

- **task** — krótka dyrektywa. LLM: `title` = directive, `description` = opcjonalny
  kontekst, jeśli wypowiedź ma rozszerzenie. Ma akcję „oznacz jako wykonane".
- **note** — notatka; `title` = krótkie streszczenie generowane przez LLM
  (3–7 słów lub z pierwszego zdania), `description` = pełna treść.
- **idea** — pomysł; struktura jak `note`.
- **decision** — decyzja; struktura jak `note`. Linkowanie do task-a — non-goal w MVP.
- **other** — catch-all dla typów bez dedykowanej obsługi (przypomnienia, pytania
  itp.). **Kierunek rozwoju:** w przyszłych iteracjach wydzielamy z „other"
  dedykowane kategorie.

### Item lifecycle

1. **pending** — świeży, w stagingu, oczekuje na decyzję user-a
2. **accepted** — zaakceptowany, widoczny na liście per typ
3. **rejected** — odrzucony w stagingu, w koszu z audit trail
4. **deleted** — zaakceptowany wcześniej, później przeniesiony do kosza

Item raz zaakceptowany NIE wraca do `pending` — możliwe jest tylko przeniesienie
do kosza.

### Model danych (logiczny, nie schemat bazy)

- **`user`** — id, email, [auth provider fields], `openai_api_key_encrypted` (nullable)
- **`import_session`** — id, user_id, raw_input, created_at, base_date
- **`item`** — id, user_id, session_id, type (enum), title, description, status
  (enum), base_date, created_at, updated_at, completed_at (NULL dla typów ≠ task)

### Polityka retencji danych

- **`import_session`:** zachowywane bez TTL jako audit log. Nigdy nie są usuwane
  automatycznie. Pozwala to w każdej chwili zobaczyć dla dowolnego itemu, z jakiego
  raw_input pochodzi.
- **`item` w koszu (`rejected` / `deleted`):** usuwane wyłącznie ręczną akcją
  globalną „wyczyść kosz" (FR-013). Brak auto-cleanup, brak usuwania per item.

### Forward (NIE wchodzi do PRD, dla downstream skilli)

Pełen kontrakt JSON LLM-a (z `confidence`, `importance`, `tags`) zachowany jako
forward-compatible schema. UI MVP używa podzbioru; reszta pól dostępna dla
przyszłych iteracji bez zmiany kontraktu.

---

## 6. Stack openness (priors product-level, NIE wybór konkretnego stacku)

- **Typ projektu:** aplikacja webowa, full-stack z deploymentem (10xBuilder).
- **Auth:** wymagane multi-user, sugerowany starter z auth out-of-the-box.
- **AI/LLM provider:** **OpenAI** (zdecydowane). Whisper dla transkrypcji audio
  (jeśli wejdzie `could`), wybrany model GPT dla klasyfikacji itemów.
  Klucze użytkownika (BYOK) — patrz sekcja 2.
- **Real-time:** niewymagany.
- **Płatności:** niewymagane (BYOK eliminuje potrzebę billingu po stronie aplikacji).
- **Background jobs:** opcjonalne (potrzebne jeśli wejdzie audio).
- **Szyfrowanie sekretów:** wymagane (klucze API w bazie at-rest encryption).
- **Konkretny stack:** decyzja w `/10x-tech-stack-selector` na podstawie PRD.

---

## 7. Success criteria (mierzalne)

- **Acceptance rate:** w pojedynczej sesji review co najmniej **70%** itemów
  zaproponowanych przez aplikację jest akceptowanych (z ewentualną edycją),
  a nie odrzucanych. Mierzy bezpośrednio jakość klasyfikacji.
- **Click count od submit do listy:** maksymalnie **1 kliknięcie** (bulk accept)
  albo **N kliknięć** (indywidualna walidacja N itemów). Żadnych dodatkowych
  kroków nawigacyjnych pomiędzy. Mierzy zdrowie głównej ścieżki.

---

## 8. Open Questions

1. **Wybór providera auth** (Supabase Auth, Auth.js, własna implementacja) —
   czeka na `/10x-tech-stack-selector`.
2. **Czy audio jako wsad wchodzi do dowiezienia (could)** — decyzja produktowa
   na etapie planowania spec po PRD.
