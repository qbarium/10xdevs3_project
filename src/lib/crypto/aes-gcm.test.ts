import { describe, expect, it } from "vitest";

import { decryptFromEnvelope, encryptToEnvelope, importAesKey } from "@/lib/crypto/aes-gcm";
import { DecryptionError, EnvelopeFormatError } from "@/types";

/** Deterministyczny 32-bajtowy klucz testowy (nie jest sekretem produkcyjnym). */
async function testKey(seed = 1): Promise<CryptoKey> {
  const raw = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    raw[i] = (i * 7 + seed) % 256;
  }
  return importAesKey(raw);
}

describe("aes-gcm — rdzeń kryptograficzny", () => {
  it("roundtrip: encrypt → decrypt zwraca oryginał", async () => {
    const key = await testKey();
    const plaintext = "sk-proj-przykladowy-klucz-do-zaszyfrowania";
    const envelope = await encryptToEnvelope(plaintext, key);
    expect(await decryptFromEnvelope(envelope, key)).toBe(plaintext);
  });

  it("koperta ma format v1 z trzema segmentami", async () => {
    const key = await testKey();
    const envelope = await encryptToEnvelope("cokolwiek", key);
    const parts = envelope.split(".");
    expect(parts).toHaveLength(3);
    expect(parts[0]).toBe("v1");
  });

  it("dwa szyfrowania tego samego tekstu dają różne koperty (świeży IV)", async () => {
    const key = await testKey();
    const first = await encryptToEnvelope("ten sam tekst", key);
    const second = await encryptToEnvelope("ten sam tekst", key);
    expect(first).not.toBe(second);
  });

  it("naruszony ciphertext → DecryptionError", async () => {
    const key = await testKey();
    const parts = (await encryptToEnvelope("poufne", key)).split(".");
    const ct = parts[2];
    const replacement = ct.startsWith("A") ? "B" : "A";
    const tampered = `${parts[0]}.${parts[1]}.${replacement}${ct.slice(1)}`;
    await expect(decryptFromEnvelope(tampered, key)).rejects.toBeInstanceOf(DecryptionError);
  });

  it("zły klucz → DecryptionError", async () => {
    const envelope = await encryptToEnvelope("poufne", await testKey(1));
    await expect(decryptFromEnvelope(envelope, await testKey(2))).rejects.toBeInstanceOf(DecryptionError);
  });

  it("malformed koperta → EnvelopeFormatError", async () => {
    const key = await testKey();
    await expect(decryptFromEnvelope("nie-koperta", key)).rejects.toBeInstanceOf(EnvelopeFormatError);
    await expect(decryptFromEnvelope("v2.aaaa.bbbb", key)).rejects.toBeInstanceOf(EnvelopeFormatError);
  });

  it("importAesKey odrzuca klucz o złej długości", async () => {
    await expect(importAesKey(new Uint8Array(31))).rejects.toBeInstanceOf(RangeError);
  });
});
