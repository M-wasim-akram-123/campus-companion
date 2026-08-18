import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { fetchStudentAcademicLedger } from "@/lib/intermediate-reports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function StudentAcademicLedgerCard({ studentId }: { studentId: string }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["student-academic-ledger", studentId],
    queryFn: () => fetchStudentAcademicLedger(studentId),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Academic record ledger
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading academic record…</p>
        ) : !entries.length ? (
          <p className="text-sm text-muted-foreground">
            No academic ledger entries yet. Published tests will be recorded here permanently.
          </p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">
                      {entry.subjectName} · {entry.testName}
                    </p>
                    {entry.eventType === "mark_corrected" && (
                      <Badge variant="outline">Corrected</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.teacherName ? `${entry.teacherName} · ` : ""}
                    {new Date(entry.recordedAt).toLocaleString()}
                  </p>
                </div>
                <div className="font-semibold">
                  {entry.isAbsent
                    ? "Absent"
                    : `${entry.marksObtained ?? 0} / ${entry.maxMarks ?? "—"}`}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
