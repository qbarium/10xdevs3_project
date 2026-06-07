import { describe, expect, it, vi } from "vitest";

import { decryptApiKey, encryptApiKey } from "@/lib/services/byok-crypto";

// Statyczny mock KEK = 32 bajty zakodowane base64. Faktoria nie odwołuje się do
// zmiennych zewnętrznych (wymóg hoistingu vi.mock ponad importy).
vi.mock("astro:env/server", () => {
  let binary = "";
  for (let i = 0; i < 32; i++) {
    binary += String.fromCharCode(7);
  }
  return { BYOK_KEK: btoa(binary) };
});

describe("byok-crypto — otoczka KEK (skonfigurowany)", () => {
  it("roundtrip przez otoczkę: encrypt → decrypt zwraca oryginał", async () => {
    const plain = "sk-przykladowy-klucz-uzytkownika-1234567890";
    const envelope = await encryptApiKey(plain);
    expect(await decryptApiKey(envelope)).toBe(plain);
  });

  it("produkuje kopertę w formacie v1", async () => {
    const envelope = await encryptApiKey("cokolwiek");
    expect(envelope.split(".")[0]).toBe("v1");
  });
});
