type LogLevel = "debug" | "info" | "warn" | "error";

const isDev = import.meta.env.DEV;

const SENSITIVE_KEYS = new Set([
  "password",
  "senha",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "jwt",
  "secret",
  "apiKey",
  "clientSecret",
  "cpf",
  "cnpj",
  "rg",
]);

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    // Mask long-ish secrets but keep type/shape for debugging.
    if (value.length >= 16) return "[REDACTED]";
    return value;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k) ? "[REDACTED]" : redactValue(v);
    }
    return out;
  }
  return value;
}

function emit(level: LogLevel, ...args: unknown[]) {
  if (!isDev) return;
  const safeArgs = args.map(redactValue);
  // eslint-disable-next-line no-console
  (console[level] ?? console.log)(...safeArgs);
}

export const logger = {
  debug: (...args: unknown[]) => emit("debug", ...args),
  info: (...args: unknown[]) => emit("info", ...args),
  warn: (...args: unknown[]) => emit("warn", ...args),
  error: (...args: unknown[]) => emit("error", ...args),
};

