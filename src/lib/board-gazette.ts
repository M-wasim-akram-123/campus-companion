/** Normalize board roll numbers for lookup (digits only). */
export function normalizeBoardRollNumber(value: string): string {
  return value.replace(/\D/g, "");
}

/** BISE Multan gazette rows use a 6-digit roll suffix at the end of each line. */
export function boardRollSuffix(value: string): string {
  const digits = normalizeBoardRollNumber(value);
  if (digits.length <= 6) return digits;
  return digits.slice(-6);
}

export type BoardGazetteImport = {
  id: string;
  board_code: string;
  exam_level: string;
  exam_session: string;
  exam_year: number;
  label: string;
  marks_total: number;
  is_active: boolean;
};

export type BoardGazetteLookupResult = {
  found: boolean;
  rollNumber: string;
  candidateName?: string | null;
  marksObtained?: number | null;
  marksTotal: number;
  resultStatus?: string | null;
  gazetteLabel?: string;
  message?: string;
};

export function boardGazetteImportLabel(row: BoardGazetteImport): string {
  return row.label || `${row.exam_level.toUpperCase()} ${row.exam_year}`;
}
