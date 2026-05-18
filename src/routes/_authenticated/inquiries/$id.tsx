import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { getPhotoUrl } from "@/lib/photo-upload";
import { fetchProfileNames, fetchStaffProfiles } from "@/lib/staff";
import {
  DetailPage,
  DetailHeader,
  Field,
  FieldGrid,
  InfoCard,
} from "@/components/detail/detail-layout";

export const Route = createFileRoute("/_authenticated/inquiries/$id")({ component: InquiryDetail });

function formatGender(gender: string | null) {
  if (gender === "male") return "Male (Boys)";
  if (gender === "female") return "Female (Girls)";
  return "—";
}

function InquiryDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");

  const { data: inquiry, isLoading } = useQuery({
    queryKey: ["inquiry", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("*, programs(name), sections:preferred_section_id(name, gender)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: nameMap } = useQuery({
    queryKey: ["inquiry-profiles", inquiry?.created_by, inquiry?.assigned_to],
    enabled: !!inquiry,
    queryFn: () =>
      fetchProfileNames([inquiry!.created_by, inquiry!.assigned_to].filter(Boolean) as string[]),
  });

  const { data: staffMembers } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: fetchStaffProfiles,
  });

  useEffect(() => {
    if (!inquiry) return;
    setFollowUpDate(inquiry.follow_up_date ?? "");
    setAssignedTo(inquiry.assigned_to ?? "");
  }, [inquiry]);

  useEffect(() => {
    if (inquiry?.photo_url) getPhotoUrl(inquiry.photo_url).then(setPhotoUrl);
  }, [inquiry?.photo_url]);

  const updateStatus = async (status: string) => {
    const { error } = await supabase.from("inquiries").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Status updated");
    qc.invalidateQueries({ queryKey: ["inquiry", id] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
  };

  const saveFollowUp = async () => {
    const { error } = await supabase
      .from("inquiries")
      .update({ follow_up_date: followUpDate || null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Follow-up date saved");
    qc.invalidateQueries({ queryKey: ["inquiry", id] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
  };

  const saveAssignment = async () => {
    const { error } = await supabase
      .from("inquiries")
      .update({ assigned_to: assignedTo || null })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Assignment updated");
    qc.invalidateQueries({ queryKey: ["inquiry", id] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
  };

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (!inquiry) return <p>Not found</p>;

  const officerName = inquiry.created_by ? nameMap?.get(inquiry.created_by) ?? "—" : "—";
  const assigneeName = inquiry.assigned_to ? nameMap?.get(inquiry.assigned_to) ?? "—" : "Unassigned";
  const programName = (inquiry.programs as { name?: string })?.name;
  const sectionLabel = inquiry.sections
    ? `${(inquiry.sections as { gender?: string }).gender === "girls" ? "Girls" : "Boys"} — ${(inquiry.sections as { name?: string }).name}`
    : "—";

  return (
    <DetailPage>
      <DetailHeader
        title={inquiry.full_name}
        subtitle={`${inquiry.phone}${inquiry.email ? ` · ${inquiry.email}` : ""}`}
        badge={<Badge className="capitalize">{inquiry.status.replace("_", " ")}</Badge>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/inquiries" })}>
              Back
            </Button>
            <Button size="sm" asChild>
              <Link to="/admissions/new" search={{ inquiryId: id } as any}>Convert to admission</Link>
            </Button>
          </>
        }
        photo={
          photoUrl ? (
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border sm:h-24 sm:w-24">
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <InfoCard title="Student & contact">
            <FieldGrid cols={3}>
              <Field label="Father's name" value={inquiry.father_name} />
              <Field label="Gender" value={formatGender(inquiry.gender)} />
              <Field label="Phone" value={inquiry.phone} />
              <Field label="Email" value={inquiry.email} />
              <Field label="Program" value={programName} />
              <Field label="Preferred section" value={sectionLabel} />
            </FieldGrid>
          </InfoCard>

          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard title="Matriculation">
              <FieldGrid cols={1}>
                <Field label="School" value={inquiry.matric_school} />
                <Field
                  label="Marks"
                  value={
                    inquiry.matric_marks_obtained != null && inquiry.matric_marks_total != null
                      ? `${inquiry.matric_marks_obtained} / ${inquiry.matric_marks_total}`
                      : inquiry.matric_marks_obtained
                  }
                />
              </FieldGrid>
            </InfoCard>

            <InfoCard title="Staff & follow-up">
              <FieldGrid cols={1}>
                <Field label="Inquiry officer" value={officerName} />
                <Field label="Assigned to" value={assigneeName} />
                <Field label="Follow-up date" value={inquiry.follow_up_date} />
                <Field label="Created" value={new Date(inquiry.created_at).toLocaleString()} />
              </FieldGrid>
            </InfoCard>
          </div>

          {inquiry.notes && (
            <InfoCard title="Notes">
              <p className="text-sm whitespace-pre-wrap">{inquiry.notes}</p>
            </InfoCard>
          )}
        </div>

        <div className="lg:col-span-4">
          <InfoCard title="Actions" className="lg:sticky lg:top-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={inquiry.status} onValueChange={updateStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">New</SelectItem>
                    <SelectItem value="follow_up">Follow up</SelectItem>
                    <SelectItem value="interested">Interested</SelectItem>
                    <SelectItem value="converted">Converted</SelectItem>
                    <SelectItem value="lost">Lost</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Follow-up date</Label>
                <div className="flex gap-2">
                  <Input type="date" className="flex-1" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                  <Button type="button" variant="secondary" size="sm" onClick={saveFollowUp}>
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Assign to</Label>
                <Select
                  value={assignedTo || "__none__"}
                  onValueChange={(v) => setAssignedTo(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {staffMembers?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.full_name || s.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="secondary" size="sm" className="w-full" onClick={saveAssignment}>
                  Save assignment
                </Button>
              </div>
            </div>
          </InfoCard>
        </div>
      </div>
    </DetailPage>
  );
}
