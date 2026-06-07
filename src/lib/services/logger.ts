// Centralny logger: JEDYNY dozwolony punkt użycia `console` (egzekwowane regułą ESLint
// no-console: error z wyjątkiem dla tego pliku). Każda wiadomość i każde pole przechodzą
// przez masker przed zapisem, więc żaden klucz API nie trafi do logu (FR-026).

import { maskSecrets, maskUnknown } from "@/lib/services/mask";
import type { LogFields, LogLevel } from "@/types";

/** Limit rozwijania `cause`, by cykliczny łańcuch przyczyn nie zapętlił serializacji. */
const MAX_CAUSE_DEPTH = 4;

function formatFields(fields: LogFields | undefined): string {
  return fields === undefined ? "" : ` ${maskUnknown(fields)}`;
}

function write(level: LogLevel, message: string, fields?: LogFields): void {
  const line = `[${level}] ${maskSecrets(message)}${formatFields(fields)}`;
  switch (level) {
    case "info":
      console.info(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "error":
      console.error(line);
      break;
  }
}

export const logger = {
  info(message: string, fields?: LogFields): void {
    write("info", message, fields);
  },
  warn(message: string, fields?: LogFields): void {
    write("warn", message, fields);
  },
  error(message: string, fields?: LogFields): void {
    write("error", message, fields);
  },
};

/**
 * Rozwija obiekt błędu do zwykłej struktury: pola nieenumerowalne Error (name/message/stack)
 * jawnie, pola własne enumerowalne (np. `config`/`response` z błędów HTTP) przez kopię referencji,
 * oraz `cause` rekurencyjnie do limitu głębokości. Cykliczność w polach łapie maskUnknown.
 */
function serializeError(value: unknown, depth = 0): unknown {
  if (!(value instanceof Error)) {
    return value;
  }
  const out: Record<string, unknown> = {
    name: value.name,
    message: value.message,
    stack: value.stack,
  };
  for (const key of Object.keys(value)) {
    out[key] = (value as Record<string, unknown>)[key];
  }
  if (value.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    out.cause = serializeError(value.cause, depth + 1);
  }
  return out;
}

/**
 * Raportuje błąd, maskując CAŁY obiekt (pola enumerowalne + `cause`), nie tylko message/stack —
 * sekret może siedzieć w polu zagnieżdżonym (np. owinięty błąd HTTP z `config.headers.authorization`).
 */
export function reportError(error: unknown, fields?: LogFields): void {
  console.error(`[error] ${maskUnknown(serializeError(error))}${formatFields(fields)}`);
}
