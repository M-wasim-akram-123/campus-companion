const CNIC_DIGIT_LENGTH = 13;

export function stripCnicDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, CNIC_DIGIT_LENGTH);
}

/** Formats Pakistan CNIC / B-Form as XXXXX-XXXXXXX-X while typing. */
export function formatPakistanCnic(value: string): string {
  const digits = stripCnicDigits(value);
  if (!digits) return "";
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function validatePakistanCnic(value: string, required = false) {
  const trimmed = value.trim();
  const formatted = formatPakistanCnic(trimmed);

  if (!trimmed) {
    return required
      ? { valid: false as const, formatted: "", error: "CNIC / B-Form is required" }
      : { valid: true as const, formatted: "" };
  }

  const digits = stripCnicDigits(trimmed);
  if (digits.length !== CNIC_DIGIT_LENGTH) {
    return {
      valid: false as const,
      formatted,
      error: "Enter a valid CNIC / B-Form (XXXXX-XXXXXXX-X)",
    };
  }

  return { valid: true as const, formatted };
}

export function formatCnicForStorage(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const result = validatePakistanCnic(trimmed);
  return result.valid ? result.formatted : trimmed;
}
