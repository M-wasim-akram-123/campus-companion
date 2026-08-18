import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canManageLmsCalendar } from "@/lib/lms/permissions";
import {
  createCampusDayOff,
  createTeacherLeave,
  deleteCampusDayOff,
  deleteTeacherLeave,
  listCampusDayOffs,
  listTeacherCandidates,
  listTeacherDisplayNames,
  listTeacherLeaves,
  listTeacherProfiles,
} from "@/lib/lms/api";
import { LmsPageHeader } from "@/components/lms/LmsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/lms/calendar")({
  component: LmsCalendarPage,
});

function LmsCalendarPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles, loading } = useAuth();
  const allowed = canManageLmsCalendar(roles);

  const [offDate, setOffDate] = useState("");
  const [offReason, setOffReason] = useState("");
  const [leaveTeacherId, setLeaveTeacherId] = useState("");
  const [leaveDate, setLeaveDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");

  useEffect(() => {
    if (!loading && !allowed) void navigate({ to: "/lms" });
  }, [allowed, loading, navigate]);

  const { data: dayOffs = [], isLoading: loadingOffs } = useQuery({
    queryKey: ["lms-day-offs"],
    queryFn: listCampusDayOffs,
    enabled: allowed,
  });
  const { data: leaves = [], isLoading: loadingLeaves } = useQuery({
    queryKey: ["lms-teacher-leaves"],
    queryFn: () => listTeacherLeaves(),
    enabled: allowed,
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ["lms-teachers"],
    queryFn: listTeacherProfiles,
    enabled: allowed,
  });
  const { data: candidates = [] } = useQuery({
    queryKey: ["lms-teacher-candidates"],
    queryFn: listTeacherCandidates,
    enabled: allowed,
  });
  const { data: names = {} } = useQuery({
    queryKey: ["lms-leave-teacher-names", leaves.map((l) => l.teacher_user_id).join(",")],
    queryFn: () => listTeacherDisplayNames(leaves.map((l) => l.teacher_user_id)),
    enabled: allowed && leaves.length > 0,
  });

  const addOff = useMutation({
    mutationFn: () => createCampusDayOff(offDate, offReason),
    onSuccess: () => {
      toast.success("Campus day off saved");
      setOffDate("");
      setOffReason("");
      qc.invalidateQueries({ queryKey: ["lms-day-offs"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const removeOff = useMutation({
    mutationFn: deleteCampusDayOff,
    onSuccess: () => {
      toast.success("Day off removed");
      qc.invalidateQueries({ queryKey: ["lms-day-offs"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const addLeave = useMutation({
    mutationFn: () => createTeacherLeave(leaveTeacherId, leaveDate, leaveReason),
    onSuccess: () => {
      toast.success("Teacher leave saved");
      setLeaveDate("");
      setLeaveReason("");
      qc.invalidateQueries({ queryKey: ["lms-teacher-leaves"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const removeLeave = useMutation({
    mutationFn: deleteTeacherLeave,
    onSuccess: () => {
      toast.success("Leave removed");
      qc.invalidateQueries({ queryKey: ["lms-teacher-leaves"] });
    },
    onError: (error) => toast.error(error.message),
  });

  if (loading || !allowed) {
    return <p className="p-6 text-sm text-muted-foreground">Loading calendar…</p>;
  }

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title="Day offs & leave"
        description="Mark campus day offs and teacher leave. Coordinators cannot mark lecture delivery on those dates."
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campus day off</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={offDate} onChange={(e) => setOffDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input
                  value={offReason}
                  onChange={(e) => setOffReason(e.target.value)}
                  placeholder="Holiday / weather / event"
                />
              </div>
            </div>
            <Button
              type="button"
              disabled={!offDate || addOff.isPending}
              onClick={() => addOff.mutate()}
            >
              {addOff.isPending ? "Saving…" : "Add day off"}
            </Button>

            {loadingOffs ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !dayOffs.length ? (
              <Empty hint="No campus day offs yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dayOffs.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.off_date}</TableCell>
                      <TableCell>{row.reason ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => removeOff.mutate(row.id)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teacher leave</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Teacher</Label>
                <Select value={leaveTeacherId} onValueChange={setLeaveTeacherId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select teacher" />
                  </SelectTrigger>
                  <SelectContent>
                    {teachers
                      .filter((t) => t.is_active)
                      .map((t) => (
                        <SelectItem key={t.user_id} value={t.user_id}>
                          {candidates.find((c) => c.id === t.user_id)?.fullName ??
                            t.employee_code ??
                            "Teacher"}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={leaveDate}
                  onChange={(e) => setLeaveDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Input
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="Sick / personal"
                />
              </div>
            </div>
            <Button
              type="button"
              disabled={!leaveTeacherId || !leaveDate || addLeave.isPending}
              onClick={() => addLeave.mutate()}
            >
              {addLeave.isPending ? "Saving…" : "Add leave"}
            </Button>

            {loadingLeaves ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !leaves.length ? (
              <Empty hint="No teacher leave dates yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Teacher</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leaves.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {names[row.teacher_user_id] ??
                          teachers.find((t) => t.user_id === row.teacher_user_id)?.employee_code ??
                          "Teacher"}
                      </TableCell>
                      <TableCell>{row.leave_date}</TableCell>
                      <TableCell>{row.reason ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => removeLeave.mutate(row.id)}
                        >
                          Remove
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

function Empty({ hint }: { hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed py-10 text-center">
      <CalendarOff className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}
