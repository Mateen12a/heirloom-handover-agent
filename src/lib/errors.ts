// Convex client errors arrive wrapped: a ConvexError carries the real message
// on `data`, while a plain server Error arrives with the function name, a
// request id and a stack trace prepended. Neither should be shown to a user
// as-is, so client catch blocks run them through here.

export function userMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (typeof data === "string" && data.trim()) return data.trim();
  }

  if (err instanceof Error) {
    const firstLine = err.message.split("\n")[0] ?? "";
    const cleaned = firstLine
      .replace(/^\[CONVEX [^\]]*\]\s*/, "")
      .replace(/^Uncaught (?:ConvexError|Error):\s*/, "")
      .replace(/\s*Called by client\.?\s*$/, "")
      .trim();
    if (cleaned) return cleaned;
  }

  return fallback;
}
