// Dekodowanie bajtów pliku wsadu do stringa (FR-003). Obsługiwane kodowania (obowiązkowe wg PRD):
// UTF-8 (z BOM i bez) oraz Windows-1250. Edge runtime (workerd) — bez `node:*`, używamy natywnego
// `TextDecoder` (Encoding Standard pokrywa `windows-1250`). Jeśli runtime nie wspiera etykiety,
// `TextDecoder` rzuci przy konstrukcji — łapiemy to jak każdą porażkę dekodowania i przechodzimy
// do fallbacku / błędu (wtedy plan przewiduje dołożenie `iconv-lite`).
//
// Kolejność: zdejmij UTF-8 BOM → UTF-8 strict; bez BOM → UTF-8 strict; fallback → Windows-1250 strict.
// `fatal: true` jest kluczowe: bez niego UTF-8 podmieniłby złe bajty na U+FFFD i fallback nigdy by
// nie zadziałał. Na końcu strażnik binariów (bajt NUL) — bo jednobajtowy Windows-1250 w ICU dekoduje
// dosłownie każdy bajt, więc bez niego żaden plik nie byłby „nieczytalny".
//
// decodeFile NIE sanityzuje — to robi wołający przez sanitizeInput (ta sama normalizacja co paste).

import { UnsupportedEncodingError } from "@/types";

/** Bajty znacznika kolejności bajtów UTF-8 (EF BB BF). */
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;

/** Znak NUL (U+0000) — nie występuje w plikach tekstowych; jego obecność znamionuje plik binarny. */
const NUL = String.fromCharCode(0);

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2];
}

/** Próbuje zdekodować bajty w danym kodowaniu w trybie strict; zwraca null przy jakiejkolwiek porażce. */
function tryDecode(bytes: Uint8Array, encoding: string): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    // Niepoprawna sekwencja w danym kodowaniu (fatal) LUB runtime nie zna etykiety — traktujemy jednakowo.
    return null;
  }
}

/**
 * Dekoduje bajty pliku do stringa wg obsługiwanych kodowań. Zwraca tekst i rozpoznaną etykietę
 * (do metadanych logu — NIE do treści logu). Nieczytalny / binarny → UnsupportedEncodingError.
 */
export function decodeFile(bytes: Uint8Array): { text: string; encoding: string } {
  let decoded: { text: string; encoding: string } | null = null;

  // 1. UTF-8 z BOM — zdejmij trzy bajty BOM, dekoduj resztę strict.
  if (hasUtf8Bom(bytes)) {
    const text = tryDecode(bytes.subarray(3), "utf-8");
    if (text === null) throw new UnsupportedEncodingError();
    decoded = { text, encoding: "utf-8" };
  } else {
    // 2. UTF-8 bez BOM (najczęstszy przypadek).
    const utf8 = tryDecode(bytes, "utf-8");
    if (utf8 !== null) {
      decoded = { text: utf8, encoding: "utf-8" };
    } else {
      // 3. Fallback: Windows-1250 (legacy polskich plików z Notatnika/edytorów).
      const win1250 = tryDecode(bytes, "windows-1250");
      if (win1250 !== null) decoded = { text: win1250, encoding: "windows-1250" };
    }
  }

  // 4. Żadne obsługiwane kodowanie nie zadziałało (runtime bez etykiety lub niepoprawna sekwencja).
  if (decoded === null) throw new UnsupportedEncodingError();

  // 5. Strażnik binariów: pliki tekstowe nie zawierają bajtu NUL. Jego obecność oznacza plik binarny
  //    pod rozszerzeniem .txt/.md albo nieobsługiwane kodowanie (np. UTF-16) zdekodowane na siłę przez
  //    jednobajtowy Windows-1250 do mojibake. Odrzucamy zamiast wysyłać śmieci do klasyfikatora.
  if (decoded.text.includes(NUL)) throw new UnsupportedEncodingError();

  return decoded;
}
