export function getSupabaseErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message) return message;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }

  return fallback;
}

export function isMissingSchemaColumnError(error: unknown) {
  const message = getSupabaseErrorMessage(error, "").toLowerCase();
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code || "")
      : "";

  return (
    code === "42703" ||
    code === "PGRST204" ||
    message.includes("does not exist") ||
    message.includes("could not find") ||
    message.includes("unknown column")
  );
}
