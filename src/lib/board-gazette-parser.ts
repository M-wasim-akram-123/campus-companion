export type GazetteResultStatus = "passed" | "failed" | "absent" | "incomplete";

export type ParsedGazetteRow = {
  roll_number: string;
  candidate_name: string | null;
  marks_obtained: number | null;
  result_status: GazetteResultStatus;
};

const ROLL_SUFFIX_RE = /(\d{6})$/;
const MARKS_RE = /\b(\d{3,4})\b/g;

export function parseGazetteLine(line: string): ParsedGazetteRow | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("Roll No") ||
    trimmed.includes("Board of Intermediate") ||
    trimmed.includes("Result Gazette")
  ) {
    return null;
  }
  if (trimmed.startsWith("Part-I") || trimmed.startsWith("Pg:")) return null;

  const match = ROLL_SUFFIX_RE.exec(trimmed);
  if (!match) return null;

  const roll = match[1];
  const prefix = trimmed.slice(0, match.index).trim();
  const upper = prefix.toUpperCase();

  let result_status: GazetteResultStatus = "passed";
  if (upper.includes("FAILED") || ` ${upper} `.includes(" MI ") || upper.endsWith(" MI")) {
    result_status = "failed";
  } else if (upper.includes("ABSENT")) {
    result_status = "absent";
  } else if (upper.includes("RCD") || prefix.includes("Attested Admission Form")) {
    result_status = "incomplete";
  }

  let marks_obtained: number | null = null;
  const markTokens = [...prefix.matchAll(MARKS_RE)].map((m) => m[1]);
  for (let i = markTokens.length - 1; i >= 0; i -= 1) {
    const value = Number(markTokens[i]);
    if (value >= 200 && value <= 1100) {
      marks_obtained = value;
      break;
    }
  }
  if (result_status !== "passed" && marks_obtained === null) {
    marks_obtained = null;
  }

  let candidate_name = prefix;
  for (const token of markTokens) {
    candidate_name = candidate_name.replace(token, " ");
  }
  candidate_name = candidate_name.replace(/\s+/g, " ").trim().replace(/[- ]+$/, "");
  for (const junk of ["FAILED TO", "MI", "RCD", "Attested Admission Form", "ABSENT"]) {
    candidate_name = candidate_name.replace(junk, " ");
  }
  candidate_name = candidate_name.replace(/\s+/g, " ").trim();

  return {
    roll_number: roll,
    candidate_name: candidate_name || null,
    marks_obtained,
    result_status,
  };
}

export function parseGazetteText(text: string): ParsedGazetteRow[] {
  const byRoll = new Map<string, ParsedGazetteRow>();
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseGazetteLine(line);
    if (parsed) byRoll.set(parsed.roll_number, parsed);
  }
  return [...byRoll.values()];
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text ?? "";
}
