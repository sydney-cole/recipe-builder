export function safeAppRedirect(value: string | null) {
  if (value === null) return "/app";
  try {
    const base = "https://perfectplate.local";
    const target = new URL(value, base);
    if (
      target.origin !== base ||
      (target.pathname !== "/app" && !target.pathname.startsWith("/app/"))
    ) {
      return "/app";
    }
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/app";
  }
}
