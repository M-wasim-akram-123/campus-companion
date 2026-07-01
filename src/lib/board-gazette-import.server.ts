import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ParsedGazetteRow } from "@/lib/board-gazette-parser";

export type ImportBoardGazetteInput = {
  rows: ParsedGazetteRow[];
  boardCode: string;
  examLevel: "ssc" | "hssc";
  examSession: string;
  examYear: number;
  label: string;
  marksTotal: number;
  sourceFile: string;
  replace: boolean;
};

const BATCH_SIZE = 500;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function insertBatch(chunk: Record<string, unknown>[]) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { error } = await supabaseAdmin.from("board_gazette_results").insert(chunk);
    if (!error) return;
    if (attempt === 4) throw new Error(error.message);
    await sleep(2000 * (attempt + 1));
  }
}

export async function importBoardGazette(input: ImportBoardGazetteInput) {
  const rowCount = input.rows.length;
  if (rowCount === 0) {
    throw new Error("No roll numbers found in the PDF. Check that it is a BISE Multan result gazette.");
  }

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("board_gazette_imports")
    .select("id")
    .eq("board_code", input.boardCode)
    .eq("exam_level", input.examLevel)
    .eq("exam_session", input.examSession)
    .eq("exam_year", input.examYear)
    .maybeSingle();
  if (existingErr) throw new Error(existingErr.message);

  if (existing && !input.replace) {
    throw new Error(
      "A gazette already exists for this board, level, session, and year. Enable replace to reload it.",
    );
  }

  let importId: string;

  if (existing && input.replace) {
    importId = existing.id;
    const { error: deleteErr } = await supabaseAdmin
      .from("board_gazette_results")
      .delete()
      .eq("import_id", importId);
    if (deleteErr) throw new Error(deleteErr.message);

    const { error: updateErr } = await supabaseAdmin
      .from("board_gazette_imports")
      .update({
        label: input.label,
        marks_total: input.marksTotal,
        source_file: input.sourceFile,
        row_count: rowCount,
        imported_at: new Date().toISOString(),
        is_active: true,
      })
      .eq("id", importId);
    if (updateErr) throw new Error(updateErr.message);
  } else {
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from("board_gazette_imports")
      .insert({
        board_code: input.boardCode,
        exam_level: input.examLevel,
        exam_session: input.examSession,
        exam_year: input.examYear,
        label: input.label,
        marks_total: input.marksTotal,
        source_file: input.sourceFile,
        row_count: rowCount,
        is_active: true,
      })
      .select("id")
      .single();
    if (insertErr || !inserted) throw new Error(insertErr?.message ?? "Could not create gazette import");
    importId = inserted.id;
  }

  const payload = input.rows.map((row) => ({
    import_id: importId,
    roll_number: row.roll_number,
    candidate_name: row.candidate_name,
    marks_obtained: row.marks_obtained,
    result_status: row.result_status,
  }));

  for (let i = 0; i < payload.length; i += BATCH_SIZE) {
    await insertBatch(payload.slice(i, i + BATCH_SIZE));
  }

  return { importId, rowCount };
}
