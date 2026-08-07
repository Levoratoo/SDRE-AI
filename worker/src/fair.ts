/** Round-robin helpers so one tenant does not starve others. */

let lastExtractUserId: string | null = null;
let lastDispatchUserId: string | null = null;

export function pickFairUserId<T extends { userId: string }>(
  rows: T[],
  lastUserId: string | null,
): T | null {
  if (!rows.length) return null;
  const alt = rows.find((r) => r.userId !== lastUserId);
  return alt ?? rows[0];
}

export function markExtractUser(userId: string) {
  lastExtractUserId = userId;
}

export function markDispatchUser(userId: string) {
  lastDispatchUserId = userId;
}

export function getLastExtractUserId() {
  return lastExtractUserId;
}

export function getLastDispatchUserId() {
  return lastDispatchUserId;
}
