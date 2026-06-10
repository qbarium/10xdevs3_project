import { describe, expect, it } from "vitest";

import { buildChatRequest, buildResponsesRequest, parseChatResponse } from "@/lib/ai/request";
import { ClassifierContractError, UnsupportedModelError } from "@/types";

const baseParams = {
  model: "gpt-4o-mini",
  prompt: "PROMPT",
  input: "WSAD",
  temperature: 0.5,
  maxTokens: 16000,
  store: false,
  userHash: "deadbeef",
};

describe("buildChatRequest (Structured Outputs)", () => {
  it("ustawia poprawne pola żądania", () => {
    const req = buildChatRequest(baseParams);
    expect(req.model).toBe("gpt-4o-mini");
    expect(req.messages[0]).toEqual({ role: "system", content: "PROMPT" });
    expect(req.messages[1]).toEqual({ role: "user", content: "WSAD" });
    expect(req.temperature).toBe(0.5);
    expect(req.max_completion_tokens).toBe(16000);
    expect(req.store).toBe(false);
    expect(req.user).toBe("deadbeef");
  });

  it("używa strict json_schema o nazwie classification", () => {
    const req = buildChatRequest(baseParams);
    expect(req.response_format.type).toBe("json_schema");
    expect(req.response_format.json_schema.strict).toBe(true);
    expect(req.response_format.json_schema.name).toBe("classification");
  });
});

describe("buildResponsesRequest (szew)", () => {
  it("rzuca UnsupportedModelError (model rozumujący poza MVP)", () => {
    expect(() => buildResponsesRequest()).toThrow(UnsupportedModelError);
  });
});

describe("parseChatResponse", () => {
  it("zwraca treść z choices[0].message.content", () => {
    const json = { choices: [{ message: { content: "wynik" }, finish_reason: "stop" }] };
    expect(parseChatResponse(json)).toBe("wynik");
  });

  it("obcięcie (finish_reason:length) → ClassifierContractError", () => {
    const json = { choices: [{ message: { content: "{" }, finish_reason: "length" }] };
    expect(() => parseChatResponse(json)).toThrow(ClassifierContractError);
  });

  it("odmowa (refusal) → ClassifierContractError", () => {
    const json = { choices: [{ message: { refusal: "nie mogę", content: null } }] };
    expect(() => parseChatResponse(json)).toThrow(ClassifierContractError);
  });

  it("brak treści → ClassifierContractError", () => {
    expect(() => parseChatResponse({ choices: [{ message: {} }] })).toThrow(ClassifierContractError);
    expect(() => parseChatResponse({})).toThrow(ClassifierContractError);
  });
});
