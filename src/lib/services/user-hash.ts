// Stabilny, nieodwracalny identyfikator usera dla abuse-detection po stronie OpenAI (FR-025).
// HMAC-SHA256(userId, sól) przez Web Crypto (jak F-01 — NIE node:crypto). Fail-closed na braku soli.
// Wołany WEWNĄTRZ classify() tuż przed budową żądania — nie przez endpoint (jedno źródło hashowania).

import { CLASSIFICATION_HASH_SALT } from "astro:env/server";

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** HMAC-SHA256(userId, CLASSIFICATION_HASH_SALT) → hex. Fail-closed: brak soli rzuca błąd. */
export async function hashUserId(userId: string): Promise<string> {
  if (CLASSIFICATION_HASH_SALT === undefined || CLASSIFICATION_HASH_SALT === "") {
    throw new Error("CLASSIFICATION_HASH_SALT nie jest skonfigurowany (fail-closed).");
  }
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(CLASSIFICATION_HASH_SALT),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(userId));
  return toHex(signature);
}
