// Umowa klasyfikacji: classify(rawText, opts) → ClassifiedItem[]. Spina resolver → hash → request
// → fetch → parser → zod w jedną ścieżkę z mapowaniem błędów na typowane wyjątki. Klucz API żyje
// tylko w nagłówku żądania, NIGDY w logu (logger maskuje, ale i tak logujemy wyłącznie metadane, §7).

import { CLASSIFICATION_PROMPT } from "@/lib/ai/prompt";
import { buildChatRequest, buildResponsesRequest, parseChatResponse } from "@/lib/ai/request";
import { resolveEndpoint } from "@/lib/ai/resolver";
import { classificationResultSchema } from "@/lib/ai/schema";
import { aiConfig } from "@/lib/config/ai";
import { logger } from "@/lib/services/logger";
import { hashUserId } from "@/lib/services/user-hash";
import { ClassifierAuthError, ClassifierContractError, ClassifierProviderError, UnsupportedModelError } from "@/types";
import type { ClassifiedItem } from "@/types";

export interface ClassifyOptions {
  /** Odszyfrowany klucz BYOK usera; trafia wyłącznie do nagłówka Authorization. */
  apiKey: string;
  /** Surowy identyfikator usera; classify hashuje go wewnętrznie (FR-025) — jedyne miejsce hashowania. */
  userId: string;
  /** Sygnał AbortController (timeout 60 s ustawia endpoint, Faza 3). */
  signal: AbortSignal;
}

/** Kształt `usage` z odpowiedzi (opcjonalny) — wyłącznie do metadanych logu. */
interface UsageEnvelope {
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/**
 * Klasyfikuje wsad przez wybraną gałąź endpointu. mock/responses to szwy (rzucają
 * UnsupportedModelError); chat wykonuje pełne wywołanie OpenAI Chat Completions.
 * Błędy mapowane: 401 → ClassifierAuthError, 5xx/sieć → ClassifierProviderError,
 * obcięcie/zły JSON/zod → ClassifierContractError, AbortError przechodzi (timeout).
 */
export async function classify(rawText: string, opts: ClassifyOptions): Promise<ClassifiedItem[]> {
  const { kind } = resolveEndpoint(aiConfig.model);
  logger.info("classify: resolver", { kind, model: aiConfig.model });

  if (kind === "mock") {
    // Szew pod E2E (wytyczne §3) — ciało atrapy powstanie przy wejściu testów E2E.
    throw new UnsupportedModelError("Tryb mock nie ma jeszcze ciała atrapy (szew E2E).");
  }
  if (kind === "responses") {
    buildResponsesRequest(); // rzuca UnsupportedModelError (model rozumujący poza MVP)
  }

  // hashUserId WEWNĄTRZ classify, tuż przed budową żądania (jedyne miejsce hashowania — F2 z przeglądu).
  const userHash = await hashUserId(opts.userId);
  const body = buildChatRequest({
    model: aiConfig.model,
    prompt: CLASSIFICATION_PROMPT,
    input: rawText,
    temperature: aiConfig.temperature,
    maxTokens: aiConfig.maxTokens,
    store: aiConfig.store,
    userHash,
  });

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${aiConfig.baseUrl}/chat/completions`, {
      method: "POST",
      signal: opts.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (isAbortError(err)) throw err; // endpoint zmapuje na sesję failed/timeout
    throw new ClassifierProviderError("Błąd sieci przy wywołaniu klasyfikatora.", { cause: err });
  }

  if (!response.ok) {
    logger.warn("classify: provider non-ok", { status: response.status });
    if (response.status === 401) {
      throw new ClassifierAuthError();
    }
    throw new ClassifierProviderError(`Klasyfikator zwrócił status ${response.status}.`);
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch (cause) {
    throw new ClassifierContractError("Odpowiedź klasyfikatora nie jest poprawnym JSON.", { cause });
  }

  // Rozpoznaje obcięcie (finish_reason:"length"), odmowę i brak treści → ClassifierContractError.
  const text = parseChatResponse(json);

  let payload: unknown;
  try {
    payload = (JSON.parse(text) as { items?: unknown }).items;
  } catch (cause) {
    throw new ClassifierContractError("Treść odpowiedzi nie jest poprawnym JSON.", { cause });
  }

  const parsed = classificationResultSchema.safeParse(payload);
  if (!parsed.success) {
    throw new ClassifierContractError("Odpowiedź klasyfikatora narusza kontrakt itemów.", { cause: parsed.error });
  }

  const usage = (json as UsageEnvelope).usage;
  logger.info("classify: ok", {
    kind,
    durationMs: Date.now() - startedAt,
    itemCount: parsed.data.length,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
  });
  return parsed.data;
}
