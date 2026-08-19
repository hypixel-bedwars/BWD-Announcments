export function stripDisplayNamePrefix(displayName: string): string {
  // Removes a leading [ ... ] bracket group (and any following space),
  // e.g. "[323 💫] VA80" -> "VA80", "[32 ⭐] OBF77" -> "OBF77"
  return displayName.replace(/^\[[^\]]*\]\s*/, "").trim();
}
