// Czysty masker: usuwa ciągi w kształcie klucza API z dowolnego tekstu przed zapisem do logu.
// Bez zależności od środowiska — konfiguracja wstrzykiwana (domyślnie DEFAULT_MASK_CONFIG),
// by masker był deterministyczny i testowalny. Egzekwuje FR-026 (klucze nigdy w logach).

import { DEFAULT_MASK_CONFIG } from "@/lib/config/byok";
import type { ByokMaskConfig } from "@/lib/config/byok";

const REDACTED = "[REDACTED]";
const UNSERIALIZABLE = "[unserializable]";

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Entropia Shannona w bitach na znak — wysoka dla losowych tokenów, niska dla naturalnego tekstu. */
function shannonBitsPerChar(token: string): number {
  const counts = new Map<string, number>();
  for (const char of token) {
    counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / token.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * Maskuje sekrety w tekście placeholderem [REDACTED]:
 * (a) prefiks providera (np. `sk-`) wraz z następującym ciągiem znaków klucza;
 * (b) fallback: długie ciągi alfanumeryczne o wysokiej entropii (klucze bez znanego prefiksu).
 * UUID i zdania przechodzą — myślniki/spacje rozbijają je na segmenty poniżej progu długości.
 */
export function maskSecrets(input: string, config: ByokMaskConfig = DEFAULT_MASK_CONFIG): string {
  let result = input;
  for (const prefix of config.keyPrefixes) {
    const prefixedKey = new RegExp(escapeRegExp(prefix) + config.keyChars, "g");
    result = result.replace(prefixedKey, REDACTED);
  }
  const longToken = new RegExp(`[A-Za-z0-9_+/=-]{${config.entropyMinLength},}`, "g");
  result = result.replace(longToken, (token) =>
    shannonBitsPerChar(token) >= config.entropyMinBitsPerChar ? REDACTED : token,
  );
  return result;
}

/**
 * Serializuje dowolną wartość i maskuje sekrety. Używane przez logger dla pól strukturalnych.
 * Serializacja owinięta tak, by NIGDY nie rzucić: struktury cykliczne i `BigInt` (typowe w
 * obiektach błędów bibliotek) dają [unserializable] zamiast wyjątku — logowanie błędu nie
 * może wywołać kolejnego błędu.
 */
// JSON.stringify zwraca undefined dla undefined/funkcji/symbolu; typ lib (`string`) to ukrywa,
// a narrowing-on-assignment kasuje gałąź `??`. Wrapper przywraca poprawny typ string | undefined.
function tryStringify(value: unknown): string | undefined {
  return JSON.stringify(value);
}

export function maskUnknown(value: unknown): string {
  if (typeof value === "string") {
    return maskSecrets(value);
  }
  let json: string | undefined;
  try {
    json = tryStringify(value);
  } catch {
    return UNSERIALIZABLE;
  }
  return maskSecrets(json ?? UNSERIALIZABLE);
}
