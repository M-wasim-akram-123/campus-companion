function stripEnvValue(value: string | undefined | null): string {
  return (value ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\r|\n|\t/g, "")
    .trim();
}

export function applyRuntimeEnv(env: unknown) {
  if (!env || typeof env !== "object") return;
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    if (typeof value !== "string" || !key || key.startsWith("__")) continue;
    const incoming = stripEnvValue(value);
    if (!incoming) continue;
    const current = stripEnvValue(process.env[key]);
    // Prefer a registered legacy JWT over an unregistered sb_secret_ from the host.
    if (current.startsWith("eyJ") && incoming.startsWith("sb_")) continue;
    process.env[key] = incoming;
  }
}

export function supabaseUrl() {
  return (
    stripEnvValue(process.env.SUPABASE_URL) || stripEnvValue(process.env.VITE_SUPABASE_URL)
  );
}

export function supabasePublishableKey() {
  return (
    stripEnvValue(process.env.SUPABASE_PUBLISHABLE_KEY) ||
    stripEnvValue(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ||
    stripEnvValue(process.env.SUPABASE_ANON_KEY)
  );
}

function jwtProjectRef(key: string): string | null {
  if (!key.startsWith("eyJ")) return null;
  try {
    const segment = key.split(".")[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob === "function"
        ? atob(normalized)
        : Buffer.from(normalized, "base64").toString("utf8");
    const payload = JSON.parse(json) as { ref?: string; role?: string };
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function urlProjectRef(url: string): string | null {
  try {
    return new URL(url).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

/** Auth Admin needs the legacy service_role JWT. Hosting often injects an unregistered sb_secret_. */
export function supabaseServiceRoleKey() {
  const candidates = [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
    process.env.SUPABASE_SERVICE_KEY,
  ].map(stripEnvValue).filter(Boolean);

  const jwt = candidates.find((key) => key.startsWith("eyJ"));
  const preferred = jwt ?? candidates[0] ?? "";

  return preferred;
}

export function assertAdminKeyMatchesProject(url: string, key: string) {
  if (key.startsWith("sb_secret_")) {
    throw new Error(
      "Staging is using an unregistered sb_secret_ key for Auth Admin. Set SUPABASE_SERVICE_ROLE_KEY on the host to the legacy service_role JWT from Supabase → Settings → API (starts with eyJ). Paste the value only — no quotes.",
    );
  }
  const keyRef = jwtProjectRef(key);
  const urlRef = urlProjectRef(url);
  if (keyRef && urlRef && keyRef !== urlRef) {
    throw new Error(
      `SUPABASE_SERVICE_ROLE_KEY is for project ${keyRef} but SUPABASE_URL is ${urlRef}. Use the service_role JWT from the same project as SUPABASE_URL.`,
    );
  }
}
