function nameTokens(name: string): string[] {
  return name.trim().split(/\s+/).filter((token) => token.length > 0);
}

/** Text monogram only. Never an image. */
export function initialsFromName(name: string): string {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return '?';
  if (tokens.length === 1) {
    return Array.from(tokens[0]).slice(0, 2).join('').toUpperCase();
  }
  const first = Array.from(tokens[0])[0];
  const last = Array.from(tokens[tokens.length - 1])[0];
  return `${first}${last}`.toUpperCase();
}

/** First whitespace-delimited token. Empty / whitespace-only names fall back to an em dash. */
export function firstNameFromFullName(name: string): string {
  const tokens = nameTokens(name);
  return tokens[0] ?? '—';
}
