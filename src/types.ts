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
