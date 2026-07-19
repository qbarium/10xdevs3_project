// Czysty rdzeń szyfrowania AES-256-GCM (Web Crypto). Bez zależności od środowiska
// (nie importuje astro:env) — w pełni testowalny w Vitest na globalnym `crypto`.
// Koperta samoopisująca się: v1.<base64(iv)>.<base64(ciphertext+tag)>.
// NIGDY nie loguje jawnego tekstu ani materiału klucza (FR-026).

import { DecryptionError, EnvelopeFormatError } from "@/types";
import type { EncryptedEnvelope } from "@/types";

/** Wersja formatu koperty; pozwala na przyszłą rotację bez migracji danych. */
const ENVELOPE_VERSION = "v1";

/** AES-GCM: świeży losowy 12-bajtowy IV per szyfrowanie. */
const IV_LENGTH = 12;

/** AES-256: klucz musi mieć dokładnie 32 bajty. */
const KEY_LENGTH = 32;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Importuje surowy 32-bajtowy klucz jako CryptoKey AES-GCM (encrypt + decrypt).
 * Zła długość → RangeError (defensywa rdzenia; otoczka KEK waliduje wcześniej
 * i mapuje błąd na KekNotConfiguredError, więc ścieżka użytkowa jest typowana).
 */
export async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.byteLength !== KEY_LENGTH) {
    throw new RangeError(`Klucz AES musi mieć ${KEY_LENGTH} bajtów.`);
  }
  // `as BufferSource`: Uint8Array jest BufferSource w runtime — rzutowanie tłumi zawężenie
  // Uint8Array<ArrayBufferLike>→ArrayBuffer z lib.dom TS 5.7+ (dług typów, bez zmiany runtime).
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/**
 * Szyfruje jawny tekst do samoopisującej się koperty. Świeży losowy IV per wywołanie —
 * ponowne użycie IV pod tym samym kluczem łamie bezpieczeństwo GCM.
 */
export async function encryptToEnvelope(plaintext: string, key: CryptoKey): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  const envelope = `${ENVELOPE_VERSION}.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
  return envelope as EncryptedEnvelope;
}

/**
 * Odszyfrowuje kopertę. Malformed (zła wersja / liczba segmentów / base64 / długość IV)
 * → EnvelopeFormatError; nieudane odszyfrowanie (zły klucz lub naruszony tag GCM)
 * → DecryptionError. Fail-closed: brak cichego przejścia z błędnym kluczem.
 */
export async function decryptFromEnvelope(envelope: string, key: CryptoKey): Promise<string> {
  const parts = envelope.split(".");
  if (parts.length !== 3 || parts[0] !== ENVELOPE_VERSION) {
    throw new EnvelopeFormatError();
  }
  let iv: Uint8Array;
  let ciphertext: Uint8Array;
  try {
    iv = base64ToBytes(parts[1]);
    ciphertext = base64ToBytes(parts[2]);
  } catch (cause) {
    throw new EnvelopeFormatError(undefined, { cause });
  }
  if (iv.byteLength !== IV_LENGTH) {
    throw new EnvelopeFormatError();
  }
  let plaintext: ArrayBuffer;
  try {
    // `as BufferSource`: jw. — iv oraz ciphertext (Uint8Array) do Web Crypto.
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
  } catch (cause) {
    throw new DecryptionError(undefined, { cause });
  }
  return new TextDecoder().decode(plaintext);
}
