import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  academicYearLabel,
  fetchStudentPublishedResults,
  groupStudentPublishedResults,
} from "@/lib/internal-exams";
import { ordinalYearLabel } from "@/lib/academic";

type Props = {
  studentId: string;
};

export function StudentTestResultsCard({ studentId }: Props) {
  const { data: results = [], isLoading } = useQuery({
    queryKey: ["student-published-results", studentId],
    queryFn: () => fetchStudentPublishedResults(studentId),
  });

  const grouped = useMemo(() => groupStudentPublishedResults(results), [results]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Internal test results</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading test results…</p>
        ) : !grouped.length ? (
          <p className="text-sm text-muted-foreground">No published internal test results yet.</p>
        ) : (
          grouped.map((series) => (
            <div key={`${series.seriesName}-${series.academicYearStart}`} className="space-y-3">
              <div>
                <h3 className="font-semibold">{series.seriesName}</h3>
                <p className="text-xs text-muted-foreground">
                  {ordinalYearLabel(series.classYearLevel)} · {academicYearLabel(series.academicYearStart)}
                </p>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {series.subjects.map((row) => (
                    <TableRow key={row.testId}>
                      <TableCell className="font-medium">{row.subjectName}</TableCell>
                      <TableCell>{row.testDate}</TableCell>
                      <TableCell className="text-right">
                        {row.isAbsent ? (
                          <Badge variant="secondary">Absent</Badge>
                        ) : (
                          <span className="font-semibold">
                            {row.marksObtained ?? 0} / {row.maxMarks}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
