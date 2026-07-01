/** College / campus branding — set VITE_CAMPUS_NAME in .env */
export const CAMPUS_NAME =
  (import.meta.env.VITE_CAMPUS_NAME as string | undefined)?.trim() || "Campus Companion College";

export const CAMPUS_TAGLINE =
  (import.meta.env.VITE_CAMPUS_TAGLINE as string | undefined)?.trim() ||
  "Excellence in Education";

export const CAMPUS_ADDRESS =
  (import.meta.env.VITE_CAMPUS_ADDRESS as string | undefined)?.trim() || "";

/** Optional logo for vouchers/reports — place file in public/ e.g. /logo.png */
export const CAMPUS_LOGO_URL =
  (import.meta.env.VITE_CAMPUS_LOGO_URL as string | undefined)?.trim() || "";
