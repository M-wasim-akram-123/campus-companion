import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { canManageLmsAcademics } from "@/lib/lms/permissions";
import { createCourse, listCourses, listDepartments, updateCourseStatus } from "@/lib/lms/api";
import { courseSchema } from "@/lib/lms/schemas";
import { LmsPageHeader } from "@/components/lms/LmsPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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

export const Route = createFileRoute("/_authenticated/lms/courses")({
  component: LmsCoursesPage,
});

function LmsCoursesPage() {
  const qc = useQueryClient();
  const { roles } = useAuth();
  const canManage = canManageLmsAcademics(roles);
  const [departmentId, setDepartmentId] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [credits, setCredits] = useState("3");
  const [theory, setTheory] = useState("3");
  const [lab, setLab] = useState("0");
  const [lectures, setLectures] = useState("48");
  const [labs, setLabs] = useState("0");
  const [book, setBook] = useState("");
  const [author, setAuthor] = useState("");
  const [publisher, setPublisher] = useState("");
  const [outline, setOutline] = useState("");
  const [outcomes, setOutcomes] = useState("");

  const { data: departments = [] } = useQuery({
    queryKey: ["lms-departments"],
    queryFn: listDepartments,
  });
  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["lms-courses"],
    queryFn: listCourses,
  });
  const create = useMutation({
    mutationFn: createCourse,
    onSuccess: () => {
      toast.success("Course added to catalog");
      setCode("");
      setName("");
      setBook("");
      setAuthor("");
      setPublisher("");
      setOutline("");
      setOutcomes("");
      qc.invalidateQueries({ queryKey: ["lms-courses"] });
      qc.invalidateQueries({ queryKey: ["lms-dashboard"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      updateCourseStatus(id, active ? "active" : "inactive"),
    onSuccess: () => {
      toast.success("Course status updated");
      qc.invalidateQueries({ queryKey: ["lms-courses"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = courseSchema.safeParse({
      department_id: departmentId,
      code,
      name,
      credit_hours: credits,
      theory_hours: theory,
      lab_hours: lab,
      lecture_count: lectures,
      lab_count: labs,
      recommended_book: book,
      author,
      publisher,
      course_outline: outline,
      learning_outcomes_text: outcomes,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message);
    const { learning_outcomes_text, ...course } = parsed.data;
    create.mutate({
      ...course,
      learning_outcomes: (learning_outcomes_text ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    });
  };

  return (
    <div className="space-y-6">
      <LmsPageHeader
        title="Course Catalog"
        description="Maintain credits, contact hours, books, outlines, learning outcomes, and department ownership."
      />
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add course</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Department">
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Course code">
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="SE-201"
                />
              </Field>
              <Field label="Course name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Data Structures"
                />
              </Field>
              <Field label="Credit hours">
                <Input
                  type="number"
                  step="0.5"
                  value={credits}
                  onChange={(e) => setCredits(e.target.value)}
                />
              </Field>
              <Field label="Theory hours">
                <Input
                  type="number"
                  step="0.5"
                  value={theory}
                  onChange={(e) => setTheory(e.target.value)}
                />
              </Field>
              <Field label="Lab hours">
                <Input
                  type="number"
                  step="0.5"
                  value={lab}
                  onChange={(e) => setLab(e.target.value)}
                />
              </Field>
              <Field label="Lectures">
                <Input
                  type="number"
                  value={lectures}
                  onChange={(e) => setLectures(e.target.value)}
                />
              </Field>
              <Field label="Labs">
                <Input type="number" value={labs} onChange={(e) => setLabs(e.target.value)} />
              </Field>
              <Field label="Recommended book">
                <Input value={book} onChange={(e) => setBook(e.target.value)} />
              </Field>
              <Field label="Author">
                <Input value={author} onChange={(e) => setAuthor(e.target.value)} />
              </Field>
              <Field label="Publisher">
                <Input value={publisher} onChange={(e) => setPublisher(e.target.value)} />
              </Field>
              <div className="hidden xl:block" />
              <div className="space-y-2 md:col-span-2">
                <Label>Course outline</Label>
                <Textarea value={outline} onChange={(e) => setOutline(e.target.value)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Learning outcomes (one per line)</Label>
                <Textarea value={outcomes} onChange={(e) => setOutcomes(e.target.value)} />
              </div>
              <div className="md:col-span-2 xl:col-span-4">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Add course"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Catalog</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading courses…</p>
          ) : !courses.length ? (
            <div className="rounded-2xl border border-dashed py-12 text-center">
              <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-medium">No courses</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Credits</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Status</TableHead>
                  {canManage && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((course) => (
                  <TableRow key={course.id}>
                    <TableCell>
                      <Badge variant="outline">{course.code}</Badge>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{course.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {course.recommended_book || "No book specified"}
                      </p>
                    </TableCell>
                    <TableCell>
                      {departments.find((d) => d.id === course.department_id)?.code ?? "—"}
                    </TableCell>
                    <TableCell>{course.credit_hours}</TableCell>
                    <TableCell>
                      {course.theory_hours}T + {course.lab_hours}L
                    </TableCell>
                    <TableCell>
                      <Badge variant={course.status === "active" ? "default" : "secondary"}>
                        {course.status}
                      </Badge>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            toggle.mutate({ id: course.id, active: course.status !== "active" })
                          }
                        >
                          {course.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
