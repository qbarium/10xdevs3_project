// Wspólne typy i błędy domeny BYOK (F-01).
// Komunikaty błędów NIGDY nie zawierają materiału klucza (FR-026).

/** Zaszyfrowana koperta klucza: `v1.<base64(iv)>.<base64(ciphertext+tag)>`. */
export type EncryptedEnvelope = string & { readonly __brand: "EncryptedEnvelope" };

export type LogLevel = "info" | "warn" | "error";

/** Pola strukturalne dołączane do wpisu logu; muszą być serializowalne. */
export type LogFields = Record<string, unknown>;

/** Bazowy błąd warstwy sekretu BYOK. */
export class ByokCryptoError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ByokCryptoError";
  }
}

/** KEK nieskonfigurowany lub o nieprawidłowej długości (fail-closed). */
export class KekNotConfiguredError extends ByokCryptoError {
  constructor(
    message = "KEK (BYOK_KEK) nie jest skonfigurowany lub ma nieprawidłową długość.",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "KekNotConfiguredError";
  }
}

/** Koperta ma nieprawidłowy format (zła wersja lub liczba segmentów). */
export class EnvelopeFormatError extends ByokCryptoError {
  constructor(message = "Nieprawidłowy format koperty zaszyfrowanego klucza.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EnvelopeFormatError";
  }
}

/** Odszyfrowanie nie powiodło się (zły klucz lub naruszony tag GCM). */
export class DecryptionError extends ByokCryptoError {
  constructor(
    message = "Odszyfrowanie nie powiodło się (zły klucz lub naruszony tag).",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "DecryptionError";
  }
}

/** Wiersz tabeli `profiles` (1:1 z auth.users). Kolumny klucza null = klucz nieskonfigurowany. */
export interface Profile {
  id: string;
  api_key_encrypted: EncryptedEnvelope | null;
  api_key_hint: string | null;
  api_key_updated_at: string | null;
}

/** Status klucza BYOK w profilu — bezpieczny do zwrócenia do klienta (bez koperty). */
export interface ByokKeyStatus {
  configured: boolean;
  hint: string | null;
  updatedAt: string | null;
}

// --- S-02: klasyfikacja (sesje importu + typowane itemy) ---------------------
// Unie literałowe odwzorowują enumy z migracji `classification_schema`.
// Ręczne typy (bez `supabase gen types`) — spójne z resztą `types.ts`.

/** Pięć typów itemu z klasyfikacji (enum `item_type`). */
export type ItemType = "task" | "note" | "idea" | "decision" | "other";

/** Wymiar akceptacji (enum `acceptance_status`). S-02 tworzy tylko `pending`. */
export type AcceptanceStatus = "pending" | "accepted" | "rejected" | "deleted";

/** Wymiar operacyjny (enum `operational_status`). Tylko dla `task`; inaczej null. */
export type OperationalStatus = "new" | "in_progress" | "done" | "cancelled";

/** Cykl życia sesji importu (enum `import_session_status`). */
export type ImportSessionStatus = "processing" | "completed_with_items" | "completed_no_items" | "failed";

/** Wiersz `import_sessions` — osobny byt audit trail na każdy przebieg klasyfikacji. */
export interface ImportSession {
  id: string;
  user_id: string;
  status: ImportSessionStatus;
  raw_input: string | null;
  item_count: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Wiersz `import_files` — plik wsadu powiązany z sesją (PR2, Faza 6). Relacja sesja → wiele plików
 * (model docelowy); w MVP UI tworzy najwyżej jeden plik na submit. Brak wierszy dla wsadu paste.
 * Nazwą obiektu w Storage jest `id` (UUID); `file_name` trzyma oryginalną nazwę od usera.
 */
export interface ImportFile {
  id: string;
  user_id: string;
  session_id: string;
  file_path: string; // pełny klucz obiektu: <user_id>/<session_id>/<id>.<ext>
  file_name: string; // oryginalna nazwa pliku od usera (prezentacja)
  file_mime: string | null;
  created_at: string;
}

/** Wiersz `items` — typowany item; `import_session_id` null dla itemów ręcznych (S-07). */
export interface Item {
  id: string;
  user_id: string;
  import_session_id: string | null;
  type: ItemType;
  title: string;
  description: string | null;
  acceptance_status: AcceptanceStatus;
  operational_status: OperationalStatus | null;
  created_at: string;
  updated_at: string;
}

/** Kontrakt zwracany przez klasyfikator — bez pól DB (MVP utrwala tylko te trzy, FR-005). */
export interface ClassifiedItem {
  type: ItemType;
  title: string;
  description: string;
}

// --- S-02: błędy warstwy klasyfikacji LLM -----------------------------------
// Komunikaty NIGDY nie zawierają treści wsadu ani materiału klucza (FR-026).

/** Bazowy błąd warstwy klasyfikacji. */
export class ClassifierError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClassifierError";
  }
}

/** 401 od dostawcy — klucz BYOK niepoprawny lub wygasł (kod UI: invalid_key). */
export class ClassifierAuthError extends ClassifierError {
  constructor(message = "Klucz API dostawcy AI jest niepoprawny lub wygasł.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClassifierAuthError";
  }
}

/** 5xx / 429 / błąd sieci — przejściowy problem po stronie dostawcy. */
export class ClassifierProviderError extends ClassifierError {
  constructor(message = "Dostawca AI jest chwilowo niedostępny.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClassifierProviderError";
  }
}

/** Naruszenie kontraktu odpowiedzi: zły JSON, niezgodność schematu, obcięcie, odmowa. */
export class ClassifierContractError extends ClassifierError {
  constructor(message = "Odpowiedź klasyfikatora narusza kontrakt.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClassifierContractError";
  }
}

/** Wybrany model trafia na nieobsługiwaną w MVP gałąź (Responses / mock bez ciała atrapy). */
export class UnsupportedModelError extends ClassifierError {
  constructor(message = "Model rozumujący nie jest obsługiwany w MVP.", options?: { cause?: unknown }) {
    super(message, options);
    this.name = "UnsupportedModelError";
  }
}
