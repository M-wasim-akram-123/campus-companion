/** How recently a user must have been seen to count as "online". */
export const ONLINE_THRESHOLD_MS = 3 * 60 * 1000;

type AccessTokenClaims = {
  sub?: string;
  session_id?: string;
  exp?: number;
};

function decodeAccessToken(accessToken: string): AccessTokenClaims | null {
  try {
    const segment = accessToken.split(".")[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(normalized)
        : Buffer.from(normalized, "base64").toString("utf8");
    return JSON.parse(json) as AccessTokenClaims;
  } catch {
    return null;
  }
}

export function sessionIdFromAccessToken(accessToken: string): string | null {
  const sessionId = decodeAccessToken(accessToken)?.session_id;
  return typeof sessionId === "string" ? sessionId : null;
}

/** Local JWT read used when Auth getUser rejects new sb_publishable_ keys. */
export function userIdFromAccessToken(accessToken: string): string | null {
  const claims = decodeAccessToken(accessToken);
  if (!claims?.sub) return null;
  if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) return null;
  return claims.sub;
}

export function isUserOnline(lastSeenAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const seen = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seen)) return false;
  return now - seen < ONLINE_THRESHOLD_MS;
}

export function formatLastSeen(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return "Never";
  if (isUserOnline(lastSeenAt)) return "Online now";
  const date = new Date(lastSeenAt);
  const diffMin = Math.floor((Date.now() - date.getTime()) / 60000);
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 1440) return `${Math.floor(diffMin / 60)}h ago`;
  return date.toLocaleString();
}
