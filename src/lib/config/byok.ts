// Niesekretna konfiguracja maskera i nazewnictwa dostawcy BYOK (F-01).
// Prefiks i nazwa dostawcy są wartościami konfiguracji, nie stałymi rozsianymi po kodzie.
// (KEK jest sekretem i żyje osobno w astro:env/server jako BYOK_KEK.)

/** Prefiksy kluczy do maskowania. OpenAI `sk-` łapie też `sk-proj-`. */
export const BYOK_KEY_PREFIXES: readonly string[] = ["sk-"];

/**
 * Klasa znaków i próg długości części klucza PO prefiksie — czyni regex prefiksu
 * deterministycznym i testowalnym (bez tego „prefiks + następujące znaki" pod-/nad-dopasowuje).
 */
export const BYOK_KEY_CHARS = "[A-Za-z0-9_-]{20,}";

/** Nazwa dostawcy AI używana w komunikatach widocznych dla użytkownika (FR-024). */
export const AI_PROVIDER_NAME = "OpenAI";

/** URL strony generowania klucza API u dostawcy (US-06, niesekretna konfiguracja nazewnictwa). */
export const AI_PROVIDER_KEYS_URL = "https://platform.openai.com/api-keys";

/** Minimalna długość tokenu rozważanego przez fallback wysokiej entropii. */
export const ENTROPY_MIN_LENGTH = 32;

/** Próg entropii Shannona (bity/znak), powyżej którego długi token jest maskowany. */
export const ENTROPY_MIN_BITS_PER_CHAR = 3.5;

/** Konfiguracja maskera; pozwala maskerowi przyjąć override w testach. */
export interface ByokMaskConfig {
  keyPrefixes: readonly string[];
  keyChars: string;
  entropyMinLength: number;
  entropyMinBitsPerChar: number;
}

/** Domyślna, produkcyjna konfiguracja maskera złożona z powyższych wartości. */
export const DEFAULT_MASK_CONFIG: ByokMaskConfig = {
  keyPrefixes: BYOK_KEY_PREFIXES,
  keyChars: BYOK_KEY_CHARS,
  entropyMinLength: ENTROPY_MIN_LENGTH,
  entropyMinBitsPerChar: ENTROPY_MIN_BITS_PER_CHAR,
};
