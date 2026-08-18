import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Users } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { canAccessMyBsClasses } from "@/lib/lms/permissions";
import { listAcademicSessions, listMyOfferings, listStudentsForOffering } from "@/lib/lms/api";
import type { LmsMyOffering } from "@/lib/lms/types";
import { LmsPageHeader } from "@/components/lms/LmsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/lms/my-classes")({
  component: LmsMyClassesPage,
});

function LmsMyClassesPage() {
  const navigate = useNavigate();
  const { roles, teacherScope, loading, user } = useAuth();
  const allowed = canAccessMyBsClasses(roles, teacherScope);
  const [sessionId, setSessionId] = useState<string>("__all__");
  const [selectedOffering, setSelectedOffering] = useState<LmsMyOffering | null>(null);

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/settings/profile", replace: true });
  }, [allowed, loading, navigate]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["academic-sessions-lookup"],
    queryFn: listAcademicSessions,
    enabled: allowed,
  });

  const { data: offerings = [], isLoading } = useQuery({
    queryKey: ["lms-my-offerings", user?.id, sessionId],
    queryFn: () => listMyOfferings(sessionId === "__all__" ? null : sessionId),
    enabled: allowed && !!user?.id,
  });

  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["lms-offering-roster", selectedOffering?.offeringId],
    queryFn: () => listStudentsForOffering(selectedOffering!.offeringId),
    enabled: !!selectedOffering,
  });

  const sessionOptions = useMemo(() => {
    const ids = new Set(offerings.map((row) => row.academicSessionId));
    return sessions.filter((session) => ids.has(session.id) || sessionId === session.id);
  }, [offerings, sessions, sessionId]);

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading your BS classes…</div>;
  }

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title="My BS Classes"
        description="Only BS courses and students assigned to you. Intermediate students stay under Inter students."
        actions={
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All sessions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All sessions</SelectItem>
              {sessionOptions.map((session) => (
                <SelectItem key={session.id} value={session.id}>
                  {session.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-primary" />
              Assigned BS offerings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading assignments…</p>
            ) : !offerings.length ? (
              <div className="rounded-2xl border border-dashed py-12 text-center">
                <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                <p className="font-medium">No BS classes assigned</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  An academic admin can assign you under LMS → Offerings.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {offerings.map((offering) => {
                  const active = selectedOffering?.offeringId === offering.offeringId;
                  return (
                    <button
                      key={offering.offeringId}
                      type="button"
                      onClick={() => setSelectedOffering(offering)}
                      className={`w-full rounded-2xl border p-4 text-left transition ${
                        active ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold">
                            {offering.courseCode} · {offering.courseName}
                          </p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {offering.semesterName}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {offering.sessionLabel}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Badge variant={offering.isPrimary ? "default" : "secondary"}>
                            {offering.isPrimary ? "Primary" : "Co-teacher"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {offering.studentCount} student
                            {offering.studentCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              {selectedOffering
                ? `Roster · ${selectedOffering.courseCode}`
                : "Select a BS class"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedOffering ? (
              <p className="text-sm text-muted-foreground">
                Choose an assigned offering to view only those BS students.
              </p>
            ) : rosterLoading ? (
              <p className="text-sm text-muted-foreground">Loading roster…</p>
            ) : !roster.length ? (
              <p className="text-sm text-muted-foreground">
                No students enrolled in this offering yet.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student</TableHead>
                    <TableHead>Roll / Reg</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roster.map((student) => (
                    <TableRow key={student.enrollmentId}>
                      <TableCell className="font-medium">{student.fullName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {student.rollNumber || student.registrationNumber || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to="/students/$id" params={{ id: student.studentId }}>
                            Open
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
