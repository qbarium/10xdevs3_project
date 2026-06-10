// Konstruktor treści żądania (per endpoint) + parser odpowiedzi Chat Completions.
// Czysty moduł (bez I/O, bez env). Gałąź Responses to SZEW — rzuca UnsupportedModelError.

import { buildJsonSchema, CLASSIFICATION_SCHEMA_NAME } from "@/lib/ai/schema";
import { ClassifierContractError, UnsupportedModelError } from "@/types";

export interface ChatRequestParams {
  model: string;
  prompt: string;
  input: string;
  temperature: number;
  maxTokens: number;
  store: boolean;
  /** HMAC identyfikatora usera (FR-025) — pole `user` w Chat Completions. */
  userHash: string;
}

/** Buduje body Chat Completions ze Structured Outputs (strict json_schema). */
export function buildChatRequest(params: ChatRequestParams) {
  return {
    model: params.model,
    messages: [
      { role: "system", content: params.prompt },
      { role: "user", content: params.input },
    ],
    temperature: params.temperature,
    max_completion_tokens: params.maxTokens,
    store: params.store,
    user: params.userHash,
    response_format: {
      type: "json_schema",
      json_schema: { name: CLASSIFICATION_SCHEMA_NAME, strict: true, schema: buildJsonSchema() },
    },
  };
}

/**
 * Gałąź Responses (modele rozumujące) — SZEW w MVP: rzuca UnsupportedModelError. Ciało dopiszemy,
 * gdy przełączymy na model rozumujący (`safety_identifier` zamiast `user`, `text.format`).
 */
export function buildResponsesRequest(): never {
  throw new UnsupportedModelError();
}

/** Minimalny kształt odpowiedzi Chat Completions, którego potrzebuje parser. */
interface ChatCompletionResponse {
  choices?: {
    message?: { content?: string | null; refusal?: string | null };
    finish_reason?: string;
  }[];
}

/**
 * Wyciąga surowy tekst wyniku z `choices[0].message.content`. Rozpoznaje:
 * - `finish_reason: "length"` → obcięcie (ClassifierContractError — obcięty JSON nie przejdzie zod),
 * - `refusal` → odmowa modelu (ClassifierContractError),
 * - brak treści → ClassifierContractError.
 */
export function parseChatResponse(json: unknown): string {
  const choice = (json as ChatCompletionResponse).choices?.[0];
  if (choice?.finish_reason === "length") {
    throw new ClassifierContractError("Odpowiedź klasyfikatora została obcięta (limit tokenów).");
  }
  if (choice?.message?.refusal) {
    throw new ClassifierContractError("Model odmówił klasyfikacji wsadu.");
  }
  const content = choice?.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new ClassifierContractError("Odpowiedź klasyfikatora nie zawiera treści.");
  }
  return content;
}
