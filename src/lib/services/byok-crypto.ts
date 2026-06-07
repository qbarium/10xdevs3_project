// Otoczka związana z konfiguracją: udostępnia aplikacji encryptApiKey/decryptApiKey
// używające KEK z astro:env/server. Fail-closed przy braku lub nieprawidłowym KEK.
// Czysty rdzeń (aes-gcm) pozostaje wolny od zależności środowiskowych.

import { BYOK_KEK } from "astro:env/server";

import { decryptFromEnvelope, encryptToEnvelope, importAesKey } from "@/lib/crypto/aes-gcm";
import { KekNotConfiguredError } from "@/types";
import type { EncryptedEnvelope } from "@/types";

/** KEK = surowe 32 bajty zakodowane base64 w konfiguracji aplikacji. */
const KEK_LENGTH = 32;

/** Memoizacja zaimportowanego CryptoKey w obrębie isolate (KEK jest stały). */
let keyPromise: Promise<CryptoKey> | null = null;

function decodeKek(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function loadKey(): Promise<CryptoKey> {
  if (BYOK_KEK === undefined || BYOK_KEK === "") {
    throw new KekNotConfiguredError();
  }
  let raw: Uint8Array;
  try {
    raw = decodeKek(BYOK_KEK);
  } catch (cause) {
    throw new KekNotConfiguredError(undefined, { cause });
  }
  if (raw.byteLength !== KEK_LENGTH) {
    throw new KekNotConfiguredError();
  }
  return importAesKey(raw);
}

function getKey(): Promise<CryptoKey> {
  keyPromise ??= loadKey();
  return keyPromise;
}

/** Szyfruje klucz API użytkownika do koperty. Fail-closed przy braku/nieprawidłowym KEK. */
export async function encryptApiKey(plain: string): Promise<EncryptedEnvelope> {
  return encryptToEnvelope(plain, await getKey());
}

/** Odszyfrowuje kopertę klucza API. Fail-closed przy braku/nieprawidłowym KEK. */
export async function decryptApiKey(envelope: string): Promise<string> {
  return decryptFromEnvelope(envelope, await getKey());
}
