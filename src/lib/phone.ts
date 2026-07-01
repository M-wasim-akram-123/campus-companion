/** Pakistan mobiles: 03xx → 923xx for WhatsApp links */
export function normalizePhoneForWhatsApp(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("92") && digits.length >= 12) return digits.slice(0, 12);
  if (digits.startsWith("0") && digits.length >= 11) return `92${digits.slice(1, 11)}`;
  if (digits.length >= 10 && digits.startsWith("3")) return `92${digits.slice(0, 10)}`;
  return digits;
}

export type WhatsAppPhoneValidation = {
  valid: boolean;
  normalized: string;
  local: string;
  display: string;
  error?: string;
  whatsAppUrl?: string;
};

/** Validates Pakistan mobile format suitable for WhatsApp (03XX XXXXXXX). */
export function validateWhatsAppPhone(phone: string): WhatsAppPhoneValidation {
  const trimmed = phone.trim();
  if (!trimmed) {
    return { valid: false, normalized: "", local: "", display: "", error: "Phone number is required" };
  }

  const normalized = normalizePhoneForWhatsApp(trimmed);
  if (!/^923\d{9}$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      local: trimmed,
      display: trimmed,
      error: "Enter a valid Pakistan mobile number (03XX XXXXXXX)",
    };
  }

  const local = `0${normalized.slice(2)}`;
  const display = `${local.slice(0, 4)} ${local.slice(4)}`;

  return {
    valid: true,
    normalized,
    local,
    display,
    whatsAppUrl: `https://wa.me/${normalized}`,
  };
}

export function formatPhoneForStorage(phone: string): string {
  const result = validateWhatsAppPhone(phone);
  return result.valid ? result.local : phone.trim();
}
