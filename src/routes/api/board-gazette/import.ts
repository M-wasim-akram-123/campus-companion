import { createFileRoute } from "@tanstack/react-router";
import { requireSuperAdmin } from "@/lib/api-auth.server";
import { importBoardGazette } from "@/lib/board-gazette-import.server";
import { extractPdfText, parseGazetteText } from "@/lib/board-gazette-parser";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function errorJson(error: unknown) {
  if (error instanceof Response) {
    return json({ error: await error.text() }, error.status);
  }
  const message = error instanceof Error ? error.message : "Gazette import failed.";
  return json({ error: message }, 500);
}

function defaultLabel(level: string, session: string, year: number) {
  const levelLabel = level === "ssc" ? "SSC" : "HSSC";
  const sessionLabel = session.replace(/_/g, " ");
  return `${levelLabel} ${sessionLabel} ${year} - BISE Multan`;
}

export const Route = createFileRoute("/api/board-gazette/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          await requireSuperAdmin(request);

          const form = await request.formData();
          const file = form.get("file");
          if (!(file instanceof File)) {
            return json({ error: "Upload a gazette PDF file." }, 400);
          }
          if (!file.name.toLowerCase().endsWith(".pdf")) {
            return json({ error: "Only PDF files are supported." }, 400);
          }

          const examYear = Number(form.get("examYear"));
          const examLevel = String(form.get("examLevel") ?? "hssc");
          const examSession = String(form.get("examSession") ?? "1st_annual");
          const boardCode = String(form.get("boardCode") ?? "bise_multan");
          const marksTotal = Number(form.get("marksTotal") ?? 1100);
          const replace = String(form.get("replace") ?? "") === "true";
          const labelInput = String(form.get("label") ?? "").trim();

          if (!Number.isFinite(examYear) || examYear < 2000 || examYear > 2100) {
            return json({ error: "Enter a valid exam year." }, 400);
          }
          if (examLevel !== "ssc" && examLevel !== "hssc") {
            return json({ error: "Exam level must be SSC or HSSC." }, 400);
          }
          if (!Number.isFinite(marksTotal) || marksTotal <= 0) {
            return json({ error: "Enter valid total marks." }, 400);
          }

          const buffer = Buffer.from(await file.arrayBuffer());
          const text = await extractPdfText(buffer);
          const rows = parseGazetteText(text);
          const label = labelInput || defaultLabel(examLevel, examSession, examYear);

          const result = await importBoardGazette({
            rows,
            boardCode,
            examLevel,
            examSession,
            examYear,
            label,
            marksTotal,
            sourceFile: file.name,
            replace,
          });

          return json({
            ok: true,
            importId: result.importId,
            rowCount: result.rowCount,
            label,
          });
        } catch (error) {
          return errorJson(error);
        }
      },
    },
  },
});
