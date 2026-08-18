import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { getPhotoUrl } from "@/lib/photo-upload";
import { fetchProfileNames, fetchProfilesByRole, fetchStaffProfiles } from "@/lib/staff";
import {
  canAccessInquiryFollowUp,
  canAssignFollowUpOfficer,
  canDeleteInquiry,
  isFollowUpOnlyOfficer,
  isSubOfficerAllowedStatus,
  SUB_OFFICER_ALLOWED_STATUSES,
} from "@/lib/inquiry-permissions";
import { CAMPUS_ADDRESS, CAMPUS_LOGO_URL, CAMPUS_NAME, CAMPUS_TAGLINE } from "@/lib/campus";
import { Pencil, Printer, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  DetailPage,
  DetailHeader,
  Field,
  FieldGrid,
  InfoCard,
} from "@/components/detail/detail-layout";
import {
  admissionLinesTotal,
  buildAdmissionPaymentLines,
  componentMap,
  fetchFeePolicy,
  findScholarshipSlab,
  formatCurrency,
  matricPercentage,
} from "@/lib/fees";
import { FEE_COMPONENTS } from "@/lib/fees-types";
import { formatPhoneForStorage, validateWhatsAppPhone } from "@/lib/phone";
import { formatCnicForStorage, formatPakistanCnic, validatePakistanCnic } from "@/lib/cnic";
import { PhoneWhatsAppField } from "@/components/inquiries/PhoneWhatsAppField";
import { CnicInput } from "@/components/forms/CnicInput";
import { BoardRollLookup } from "@/components/inquiries/BoardRollLookup";
import type { BoardGazetteLookupResult } from "@/lib/board-gazette";

export const Route = createFileRoute("/_authenticated/inquiries/$id")({ component: InquiryDetail });

function formatGender(gender: string | null) {
  if (gender === "male") return "Male (Boys)";
  if (gender === "female") return "Female (Girls)";
  return "—";
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function InquiryDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, hasRole, roles } = useAuth();
  const followUpOnly = isFollowUpOnlyOfficer(roles);
  const canAssignFollowUp = canAssignFollowUpOfficer(roles);
  const canDelete = canDeleteInquiry(roles);
  const printRef = useRef<HTMLDivElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [followUpDate, setFollowUpDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [followUpAssignedTo, setFollowUpAssignedTo] = useState("");
  const [interactionType, setInteractionType] = useState("visit");
  const [interactionRemarks, setInteractionRemarks] = useState("");
  const [interactionFollowUpDate, setInteractionFollowUpDate] = useState("");
  const [interactionStatus, setInteractionStatus] = useState("follow_up");
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: "",
    father_name: "",
    cnic: "",
    phone: "",
    email: "",
    gender: "",
    matric_school: "",
    matric_marks_obtained: "",
    matric_marks_total: "",
    board_gazette_import_id: "",
    board_roll_number: "",
    notes: "",
    status: "new",
    program_id: "",
    academic_session_id: "",
    class_id: "",
    guardian_name: "",
    guardian_phone: "",
    guardian_occupation: "",
    guardian_details: "",
  });

  const { data: inquiry, isLoading } = useQuery({
    queryKey: ["inquiry", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("*, programs(name)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: interactions } = useQuery({
    queryKey: ["inquiry-interactions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inquiry_interactions")
        .select("*")
        .eq("inquiry_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: nameMap } = useQuery({
    queryKey: ["inquiry-profiles", inquiry?.created_by, inquiry?.assigned_to, inquiry?.converted_by, interactions],
    enabled: !!inquiry,
    queryFn: () =>
      fetchProfileNames([
        inquiry!.created_by,
        inquiry!.assigned_to,
        inquiry!.follow_up_assigned_to,
        inquiry!.converted_by,
        ...(interactions?.map((row) => row.created_by).filter(Boolean) ?? []),
      ].filter(Boolean) as string[]),
  });

  const { data: staffMembers } = useQuery({
    queryKey: ["staff-profiles"],
    enabled: hasRole("super_admin"),
    queryFn: fetchStaffProfiles,
  });

  const { data: followUpOfficers } = useQuery({
    queryKey: ["follow-up-officers"],
    enabled: canAssignFollowUp,
    queryFn: () => fetchProfilesByRole("sub_admission_officer"),
  });

  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("*").order("name")).data ?? [],
  });

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const { data: editClasses } = useQuery({
    queryKey: ["classes", editForm.program_id],
    enabled: !!editForm.program_id,
    queryFn: async () =>
      (await supabase.from("classes").select("*").eq("program_id", editForm.program_id).order("year_level")).data ?? [],
  });

  const { data: sessionLabel } = useQuery({
    queryKey: ["inquiry-session-label", inquiry?.academic_session_id],
    enabled: !!inquiry?.academic_session_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_sessions")
        .select("label")
        .eq("id", inquiry!.academic_session_id)
        .maybeSingle();
      return data?.label ?? null;
    },
  });

  const { data: classLabel } = useQuery({
    queryKey: ["inquiry-class-label", inquiry?.class_id],
    enabled: !!inquiry?.class_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("classes")
        .select("name")
        .eq("id", inquiry!.class_id)
        .maybeSingle();
      return data?.name ?? null;
    },
  });

  const { data: feePolicy } = useQuery({
    queryKey: ["inquiry-fee-preview", inquiry?.program_id, inquiry?.academic_session_id],
    enabled: !!inquiry?.program_id && !!inquiry?.academic_session_id,
    queryFn: () => fetchFeePolicy(inquiry!.program_id!, inquiry!.academic_session_id!),
  });

  useEffect(() => {
    if (!inquiry) return;
    setFollowUpDate(inquiry.follow_up_date ?? "");
    setAssignedTo(inquiry.assigned_to ?? "");
    setFollowUpAssignedTo(inquiry.follow_up_assigned_to ?? "");
    setInteractionStatus(inquiry.status ?? "follow_up");
    setEditForm({
      full_name: inquiry.full_name ?? "",
      father_name: inquiry.father_name ?? "",
      cnic: formatPakistanCnic(inquiry.cnic ?? ""),
      phone: inquiry.phone ?? "",
      email: inquiry.email ?? "",
      gender: inquiry.gender ?? "",
      matric_school: inquiry.matric_school ?? "",
      matric_marks_obtained:
        inquiry.matric_marks_obtained != null ? String(inquiry.matric_marks_obtained) : "",
      matric_marks_total: inquiry.matric_marks_total != null ? String(inquiry.matric_marks_total) : "",
      board_gazette_import_id: inquiry.board_gazette_import_id ?? "",
      board_roll_number: inquiry.board_roll_number ?? "",
      notes: inquiry.notes ?? "",
      status: inquiry.status ?? "new",
      program_id: inquiry.program_id ?? "",
      academic_session_id: inquiry.academic_session_id ?? "",
      class_id: inquiry.class_id ?? "",
      guardian_name: inquiry.guardian_name ?? "",
      guardian_phone: inquiry.guardian_phone ?? "",
      guardian_occupation: inquiry.guardian_occupation ?? "",
      guardian_details: inquiry.guardian_details ?? "",
    });
  }, [inquiry]);

  useEffect(() => {
    if (!inquiry || !user?.id || !hasRole("admission_officer") || hasRole("super_admin") || inquiry.assigned_to) return;
    let cancelled = false;
    async function assignToCurrentOfficer() {
      const assignedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("inquiries")
        .update({ assigned_to: user!.id, assigned_at: assignedAt, updated_at: assignedAt })
        .eq("id", id)
        .is("assigned_to", null)
        .select("id")
        .maybeSingle();
      if (error || !data || cancelled) return;
      await supabase.from("inquiry_interactions").insert({
        inquiry_id: id,
        interaction_type: "assignment",
        remarks: "Inquiry automatically assigned when opened by admission officer.",
        created_by: user!.id,
      });
      qc.invalidateQueries({ queryKey: ["inquiry", id] });
      qc.invalidateQueries({ queryKey: ["inquiries"] });
      qc.invalidateQueries({ queryKey: ["inquiry-interactions", id] });
    }
    void assignToCurrentOfficer();
    return () => {
      cancelled = true;
    };
  }, [inquiry, user?.id, hasRole, id, qc]);

  useEffect(() => {
    if (inquiry?.photo_url) getPhotoUrl(inquiry.photo_url).then(setPhotoUrl);
  }, [inquiry?.photo_url]);

  const updateStatus = async (status: string) => {
    const { error } = await supabase
      .from("inquiries")
      .update({ status: status as any, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("inquiry_interactions").insert({
      inquiry_id: id,
      interaction_type: "status_change",
      remarks: `Status changed to ${statusLabel(status)}.`,
      status_after: status as any,
      created_by: user?.id ?? null,
    });
    toast.success("Status updated");
    qc.invalidateQueries({ queryKey: ["inquiry", id] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
    qc.invalidateQueries({ queryKey: ["inquiry-interactions", id] });
  };

  const saveFollowUp = async () => {
    const { error } = await supabase
      .from("inquiries")
      .update({ follow_up_date: followUpDate || null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("inquiry_interactions").insert({
      inquiry_id: id,
      interaction_type: "follow_up",
      remarks: followUpDate ? `Next follow-up set for ${followUpDate}.` : "Follow-up date cleared.",
      follow_up_date: followUpDate || null,
      status_after: inquiry?.status ?? null,
      created_by: user?.id ?? null,
    });
    toast.success("Follow-up date saved");
    qc.invalidateQueries({ queryKey: ["inquiry", id] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
    qc.invalidateQueries({ queryKey: ["inquiry-interactions", id] });
  };

  const saveFollowUpAssignment = async () => {
    const assignedAt = followUpAssignedTo ? new Date().toISOString() : null;
    const { error } = await supabase
      .from("inquiries")
      .update({
        follow_up_assigned_to: followUpAssignedTo || null,
        follow_up_assigned_at: assignedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("inquiry_interactions").insert({
      inquiry_id: id,
      interaction_type: "assignment",
      remarks: followUpAssignedTo
        ? "Follow-up officer assignment updated."
        : "Follow-up officer assignment cleared.",
      status_after: inquiry?.status ?? null,
      created_by: user?.id ?? null,
    });
    toast.success("Follow-up officer updated");
    qc.invalidateQueries({ queryKey: ["inquiry", id] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
    qc.invalidateQueries({ queryKey: ["inquiry-interactions", id] });
  };

  const saveAssignment = async () => {
    const { error } = await supabase
      .from("inquiries")
      .update({
        assigned_to: assignedTo || null,
        assigned_at: assignedTo ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    await supabase.from("inquiry_interactions").insert({
      inquiry_id: id,
      interaction_type: "assignment",
      remarks: assignedTo ? "Inquiry assignment updated." : "Inquiry assignment cleared.",
      status_after: inquiry?.status ?? null,
      created_by: user?.id ?? null,
    });
    toast.success("Assignment updated");
    qc.invalidateQueries({ queryKey: ["inquiry", id] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
    qc.invalidateQueries({ queryKey: ["inquiry-interactions", id] });
  };

  const saveInteraction = async () => {
    if (!interactionRemarks.trim()) return toast.error("Add remarks for this inquiry history entry");
    const status = interactionStatus || inquiry?.status || "follow_up";
    if (followUpOnly && !isSubOfficerAllowedStatus(status)) {
      return toast.error("You can only set follow up, interested, or lost status");
    }
    setSavingInteraction(true);
    try {
      const followUp = interactionFollowUpDate || null;
      const { error } = await supabase.from("inquiry_interactions").insert({
        inquiry_id: id,
        interaction_type: interactionType,
        remarks: interactionRemarks.trim(),
        follow_up_date: followUp,
        status_after: status as any,
        created_by: user?.id ?? null,
      });
      if (error) throw error;

      const { error: updateError } = await supabase
        .from("inquiries")
        .update({
          status: status as any,
          follow_up_date: followUp,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (updateError) throw updateError;

      toast.success("Inquiry history saved");
      setInteractionRemarks("");
      setInteractionFollowUpDate("");
      setInteractionType("visit");
      qc.invalidateQueries({ queryKey: ["inquiry", id] });
      qc.invalidateQueries({ queryKey: ["inquiries"] });
      qc.invalidateQueries({ queryKey: ["inquiry-interactions", id] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save inquiry history");
    } finally {
      setSavingInteraction(false);
    }
  };

  const saveInquiryEdit = async () => {
    const phoneCheck = validateWhatsAppPhone(editForm.phone);
    if (!phoneCheck.valid) return toast.error(phoneCheck.error ?? "Enter a valid phone number");
    if (editForm.guardian_phone.trim()) {
      const guardianCheck = validateWhatsAppPhone(editForm.guardian_phone);
      if (!guardianCheck.valid) return toast.error(guardianCheck.error ?? "Enter a valid guardian phone number");
    }
    if (editForm.cnic.trim()) {
      const cnicCheck = validatePakistanCnic(editForm.cnic);
      if (!cnicCheck.valid) return toast.error(cnicCheck.error ?? "Enter a valid CNIC / B-Form");
    }

    const { error } = await supabase
      .from("inquiries")
      .update({
        full_name: editForm.full_name.trim(),
        father_name: editForm.father_name.trim() || null,
        cnic: formatCnicForStorage(editForm.cnic),
        phone: formatPhoneForStorage(editForm.phone),
        email: editForm.email.trim() || null,
        gender: editForm.gender || null,
        matric_school: editForm.matric_school.trim() || null,
        matric_marks_obtained: editForm.matric_marks_obtained
          ? Number(editForm.matric_marks_obtained)
          : null,
        matric_marks_total: editForm.matric_marks_total ? Number(editForm.matric_marks_total) : null,
        board_gazette_import_id: editForm.board_gazette_import_id || null,
        board_roll_number: editForm.board_roll_number.trim() || null,
        notes: editForm.notes.trim() || null,
        status: editForm.status as any,
        program_id: editForm.program_id || null,
        academic_session_id: editForm.academic_session_id || null,
        class_id: editForm.class_id || null,
        guardian_name: editForm.guardian_name.trim() || null,
        guardian_phone: editForm.guardian_phone.trim() ? formatPhoneForStorage(editForm.guardian_phone) : null,
        guardian_occupation: editForm.guardian_occupation.trim() || null,
        guardian_details: editForm.guardian_details.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Inquiry updated");
    setEditOpen(false);
    qc.invalidateQueries({ queryKey: ["inquiry", id] });
    qc.invalidateQueries({ queryKey: ["inquiries"] });
  };

  const deleteInquiry = async () => {
    if (!canDelete) return toast.error("Only Super Admin can delete inquiries");
    await supabase.from("students").update({ inquiry_id: null }).eq("inquiry_id", id);
    const { error } = await supabase.from("inquiries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Inquiry deleted");
    qc.invalidateQueries({ queryKey: ["inquiries"] });
    navigate({ to: "/inquiries" });
  };

  if (isLoading) return <p className="text-muted-foreground">Loading...</p>;
  if (!inquiry) return <p>Not found</p>;
  if (!canAccessInquiryFollowUp(inquiry, user?.id, roles)) {
    return (
      <DetailPage>
        <DetailHeader
          title="Access denied"
          subtitle="This inquiry is not assigned to you for follow-up."
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/inquiries" })}>
              Back to inquiries
            </Button>
          }
        />
      </DetailPage>
    );
  }

  const officerName = inquiry.created_by ? nameMap?.get(inquiry.created_by) ?? "—" : "—";
  const assigneeName = inquiry.assigned_to ? nameMap?.get(inquiry.assigned_to) ?? "—" : "Unassigned";
  const followUpOfficerName = inquiry.follow_up_assigned_to
    ? nameMap?.get(inquiry.follow_up_assigned_to) ?? "—"
    : "Unassigned";
  const programName = (inquiry.programs as { name?: string })?.name;

  if (followUpOnly) {
    return (
      <DetailPage>
        <DetailHeader
          title={inquiry.full_name}
          subtitle={`${inquiry.phone}${inquiry.father_name ? ` · ${inquiry.father_name}` : ""}`}
          badge={<Badge className="capitalize">{statusLabel(inquiry.status)}</Badge>}
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/inquiries" })}>
              Back
            </Button>
          }
        />

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-8">
            <InfoCard title="Current standing">
              <FieldGrid cols={2}>
                <Field label="Status" value={statusLabel(inquiry.status)} />
                <Field label="Next follow-up" value={inquiry.follow_up_date} />
                <Field label="Program" value={programName} />
                <Field label="Admission officer" value={assigneeName} />
              </FieldGrid>
            </InfoCard>

            <InfoCard title="Contact for follow-up">
              <FieldGrid cols={2}>
                <Field label="Phone" value={inquiry.phone} />
                <Field label="Email" value={inquiry.email} />
                <Field label="Father's name" value={inquiry.father_name} />
              </FieldGrid>
            </InfoCard>

            <InfoCard title="Follow-up history">
              <div className="mb-4 space-y-3 rounded-2xl border bg-muted/30 p-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-2">
                    <Label>Interaction type</Label>
                    <Select value={interactionType} onValueChange={setInteractionType}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="visit">Visit</SelectItem>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="message">Message</SelectItem>
                        <SelectItem value="follow_up">Follow up</SelectItem>
                        <SelectItem value="note">Note</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Status after discussion</Label>
                    <Select value={interactionStatus} onValueChange={setInteractionStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SUB_OFFICER_ALLOWED_STATUSES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {statusLabel(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Next follow-up date</Label>
                    <Input
                      type="date"
                      value={interactionFollowUpDate}
                      onChange={(e) => setInteractionFollowUpDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Remarks / discussion history</Label>
                  <Textarea
                    rows={3}
                    value={interactionRemarks}
                    onChange={(e) => setInteractionRemarks(e.target.value)}
                    placeholder="Record what was discussed and what should happen next."
                  />
                </div>
                <Button type="button" onClick={saveInteraction} disabled={savingInteraction}>
                  {savingInteraction ? "Saving..." : "Save follow-up"}
                </Button>
              </div>

              {!interactions?.length ? (
                <p className="text-sm text-muted-foreground">No follow-up history yet.</p>
              ) : (
                <div className="space-y-3">
                  {interactions.map((entry) => (
                    <div key={entry.id} className="rounded-2xl border p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="outline" className="capitalize">
                          {entry.interaction_type.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(entry.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm">{entry.remarks}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span>By {entry.created_by ? nameMap?.get(entry.created_by) ?? "Unknown" : "System"}</span>
                        {entry.status_after && <span>Status: {statusLabel(entry.status_after)}</span>}
                        {entry.follow_up_date && <span>Follow-up: {entry.follow_up_date}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </InfoCard>
          </div>

          <div className="space-y-4 lg:col-span-4">
            <InfoCard title="Update follow-up date" className="lg:sticky lg:top-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Follow-up date</Label>
                  <Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} />
                </div>
                <Button type="button" variant="secondary" size="sm" className="w-full" onClick={saveFollowUp}>
                  Save follow-up date
                </Button>
              </div>
            </InfoCard>
          </div>
        </div>
      </DetailPage>
    );
  }

  const matricPct = matricPercentage(
    inquiry.matric_marks_obtained != null ? Number(inquiry.matric_marks_obtained) : null,
    inquiry.matric_marks_total != null ? Number(inquiry.matric_marks_total) : null,
  );
  const feeMap = feePolicy ? componentMap(feePolicy.fee_policy_components) : null;
  const admissionLines = feeMap
    ? buildAdmissionPaymentLines(feeMap, feePolicy?.default_admission_components as any)
    : [];
  const scholarship = feePolicy ? findScholarshipSlab(feePolicy.fee_scholarship_slabs, matricPct) : null;
  const payAtAdmission = admissionLinesTotal(admissionLines, scholarship);
  const totalPolicyFee = feeMap ? Object.values(feeMap).reduce((sum, value) => sum + Number(value ?? 0), 0) : 0;
  const scholarshipAmount =
    scholarship && feeMap ? Math.round(((feeMap[scholarship.applies_to] ?? 0) * scholarship.discount) / 100) : 0;
  const feeBreakdown = feeMap
    ? FEE_COMPONENTS.map((component) => {
        const amount = feeMap[component.key] ?? 0;
        const discount =
          scholarship?.applies_to === component.key ? Math.round((amount * scholarship.discount) / 100) : 0;
        return {
          ...component,
          amount,
          discount,
          remaining: Math.max(0, amount - discount),
        };
      }).filter((row) => row.amount > 0)
    : [];
  const totalDiscount = feeBreakdown.reduce((sum, row) => sum + row.discount, 0);
  const remainingPolicyFee = feeBreakdown.reduce((sum, row) => sum + row.remaining, 0);

  const printInquiry = () => {
    if (!printRef.current) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html><head>
  <meta charset="utf-8" />
  <title>Inquiry - ${inquiry.full_name}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { margin: 0; color: #111; font-family: Arial, Helvetica, sans-serif; }
    .sheet { border: 2px solid #111; padding: 18px; min-height: calc(297mm - 28mm); }
    .header { display: grid; grid-template-columns: 90px 1fr 90px; align-items: center; gap: 12px; border-bottom: 2px solid #111; padding-bottom: 12px; text-align: center; }
    .logo, .photo { width: 82px; height: 82px; object-fit: contain; border: 1px solid #999; }
    .photo { object-fit: cover; }
    h1 { margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: .04em; }
    h2 { margin: 12px 0 8px; font-size: 15px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .muted { color: #555; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; }
    .field { font-size: 13px; }
    .label { color: #555; display: block; font-size: 11px; text-transform: uppercase; }
    .value { font-weight: 600; white-space: pre-wrap; }
    .notes { border: 1px solid #bbb; min-height: 70px; padding: 8px; font-size: 13px; white-space: pre-wrap; }
    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 38px; text-align: center; font-size: 12px; }
    .signatures div { border-top: 1px solid #111; padding-top: 8px; }
  </style>
</head><body>${printRef.current.innerHTML}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  return (
    <DetailPage>
      <DetailHeader
        title={inquiry.full_name}
        subtitle={`${inquiry.phone}${inquiry.email ? ` · ${inquiry.email}` : ""}`}
        badge={<Badge className="capitalize">{statusLabel(inquiry.status)}</Badge>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => navigate({ to: "/inquiries" })}>
              Back
            </Button>
            <Button variant="outline" size="sm" onClick={printInquiry}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </Button>
            {canDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this inquiry?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the inquiry record for {inquiry.full_name}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteInquiry} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Delete inquiry
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              size="sm"
              variant={inquiry.status === "ready_for_admission" ? "default" : "outline"}
              asChild
            >
              <Link to="/admissions/new" search={{ inquiryId: id } as any}>
                {inquiry.status === "ready_for_admission" ? "Confirm admission" : "Convert to admission"}
              </Link>
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

      <div className="hidden">
        <div ref={printRef}>
          <InquiryPrintSheet
            inquiry={inquiry}
            photoUrl={photoUrl}
            officerName={officerName}
            assigneeName={assigneeName}
            programName={programName}
            sessionLabel={sessionLabel}
            classLabel={classLabel}
          />
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit inquiry</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Student name</Label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Father&apos;s name</Label>
              <Input value={editForm.father_name} onChange={(e) => setEditForm({ ...editForm, father_name: e.target.value })} />
            </div>
            <CnicInput
              id="edit-inquiry-cnic"
              className="sm:col-span-2"
              value={editForm.cnic}
              onChange={(cnic) => setEditForm({ ...editForm, cnic })}
            />
            <div className="space-y-2 sm:col-span-2">
              <PhoneWhatsAppField
                id="edit-inquiry-phone"
                label="Phone"
                required
                value={editForm.phone}
                onChange={(phone) => setEditForm({ ...editForm, phone })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select value={editForm.gender || "__none__"} onValueChange={(v) => setEditForm({ ...editForm, gender: v === "__none__" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not selected</SelectItem>
                  <SelectItem value="male">Male (Boys)</SelectItem>
                  <SelectItem value="female">Female (Girls)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="follow_up">Follow up</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="ready_for_admission">Ready for admission</SelectItem>
                  <SelectItem value="converted">Converted</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Program</Label>
              <Select
                value={editForm.program_id || "__none__"}
                onValueChange={(v) => setEditForm({ ...editForm, program_id: v === "__none__" ? "" : v, class_id: "" })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No program</SelectItem>
                  {programs?.map((program) => (
                    <SelectItem key={program.id} value={program.id}>{program.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Academic session</Label>
              <Select
                value={editForm.academic_session_id || "__none__"}
                onValueChange={(v) => setEditForm({ ...editForm, academic_session_id: v === "__none__" ? "" : v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No session</SelectItem>
                  {sessions?.map((session) => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.label}{session.is_active ? " (running)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Year / class</Label>
              <Select
                value={editForm.class_id || "__none__"}
                onValueChange={(v) => setEditForm({ ...editForm, class_id: v === "__none__" ? "" : v })}
                disabled={!editForm.program_id}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No class</SelectItem>
                  {editClasses?.map((classRow) => (
                    <SelectItem key={classRow.id} value={classRow.id}>{classRow.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Guardian name</Label>
              <Input value={editForm.guardian_name} onChange={(e) => setEditForm({ ...editForm, guardian_name: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <PhoneWhatsAppField
                id="edit-inquiry-guardian-phone"
                label="Guardian phone"
                value={editForm.guardian_phone}
                onChange={(guardian_phone) => setEditForm({ ...editForm, guardian_phone })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Guardian occupation</Label>
              <Input value={editForm.guardian_occupation} onChange={(e) => setEditForm({ ...editForm, guardian_occupation: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Guardian details</Label>
              <Textarea rows={3} value={editForm.guardian_details} onChange={(e) => setEditForm({ ...editForm, guardian_details: e.target.value })} />
            </div>
            <BoardRollLookup
              gazetteImportId={editForm.board_gazette_import_id}
              rollNumber={editForm.board_roll_number}
              onGazetteImportIdChange={(board_gazette_import_id) =>
                setEditForm({ ...editForm, board_gazette_import_id })
              }
              onRollNumberChange={(board_roll_number) => setEditForm({ ...editForm, board_roll_number })}
              onLookupSuccess={(result: BoardGazetteLookupResult) => {
                if (result.marksObtained != null) {
                  setEditForm((current) => ({
                    ...current,
                    matric_marks_obtained: String(result.marksObtained),
                    matric_marks_total: String(result.marksTotal ?? 1100),
                    board_roll_number: result.rollNumber ?? current.board_roll_number,
                  }));
                }
              }}
            />
            <div className="space-y-2 sm:col-span-2">
              <Label>Matric school</Label>
              <Input value={editForm.matric_school} onChange={(e) => setEditForm({ ...editForm, matric_school: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Marks obtained</Label>
                <Input type="number" value={editForm.matric_marks_obtained} onChange={(e) => setEditForm({ ...editForm, matric_marks_obtained: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Total marks</Label>
                <Input type="number" value={editForm.matric_marks_total} onChange={(e) => setEditForm({ ...editForm, matric_marks_total: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={4} value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="button" onClick={saveInquiryEdit}>Save changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <InfoCard title="Student & contact">
            <FieldGrid cols={3}>
              <Field label="Father's name" value={inquiry.father_name} />
              <Field label="CNIC / B-Form" value={inquiry.cnic} />
              <Field label="Gender" value={formatGender(inquiry.gender)} />
              <Field label="Phone" value={inquiry.phone} />
              <Field label="Email" value={inquiry.email} />
              <Field label="Program" value={programName} />
              <Field label="Session" value={sessionLabel} />
              <Field label="Class / year" value={classLabel} />
            </FieldGrid>
          </InfoCard>

          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard title="Guardian">
              <FieldGrid cols={1}>
                <Field label="Guardian name" value={inquiry.guardian_name} />
                <Field label="Guardian phone" value={inquiry.guardian_phone} />
                <Field label="Occupation" value={inquiry.guardian_occupation} />
                <Field label="Details" value={inquiry.guardian_details} />
              </FieldGrid>
            </InfoCard>

            <InfoCard title="Matriculation">
              <FieldGrid cols={1}>
                <Field label="Board roll no." value={inquiry.board_roll_number} />
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
          </div>

          <div className="grid gap-4">
            <InfoCard title="Estimated fee & scholarship breakdown" className="md:col-span-2">
              {!inquiry.program_id || !inquiry.academic_session_id ? (
                <p className="text-sm text-muted-foreground">
                  Select program and academic session on the inquiry to preview fees.
                </p>
              ) : !feePolicy || !feeMap ? (
                <p className="text-sm text-muted-foreground">
                  No active fee policy found for this program and session.
                </p>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-2xl border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Total policy fee</p>
                      <p className="text-lg font-black">{formatCurrency(totalPolicyFee)}</p>
                    </div>
                    <div className="rounded-2xl border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Scholarship discount</p>
                      <p className="text-lg font-black text-emerald-700">{formatCurrency(totalDiscount)}</p>
                    </div>
                    <div className="rounded-2xl border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Remaining fee</p>
                      <p className="text-lg font-black">{formatCurrency(remainingPolicyFee)}</p>
                    </div>
                    <div className="rounded-2xl border bg-muted/30 p-3">
                      <p className="text-xs text-muted-foreground">Pay at admission</p>
                      <p className="text-lg font-black">{formatCurrency(payAtAdmission)}</p>
                    </div>
                  </div>
                  {scholarship ? (
                    <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm">
                      <p className="font-semibold text-emerald-700">
                        {scholarship.label} scholarship applied
                      </p>
                      <p className="text-muted-foreground">
                        {scholarship.discount}% off {FEE_COMPONENTS.find((c) => c.key === scholarship.applies_to)?.label}
                        {" "}({formatCurrency(scholarshipAmount)})
                      </p>
                    </div>
                  ) : (
                    <p className="rounded-2xl border bg-muted/30 p-3 text-sm text-muted-foreground">
                      No scholarship rule matched the entered matric marks.
                    </p>
                  )}
                  <div className="overflow-hidden rounded-2xl border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Fee head</th>
                          <th className="px-3 py-2 text-right font-semibold">Total fee</th>
                          <th className="px-3 py-2 text-right font-semibold">Scholarship</th>
                          <th className="px-3 py-2 text-right font-semibold">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {feeBreakdown.map((row) => (
                          <tr key={row.key} className="border-t">
                            <td className="px-3 py-2 font-medium">{row.label}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(row.amount)}</td>
                            <td className="px-3 py-2 text-right text-emerald-700">
                              {row.discount > 0 ? `${scholarship?.discount}% (${formatCurrency(row.discount)})` : "—"}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold">{formatCurrency(row.remaining)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Matric percentage: {matricPct != null ? `${matricPct.toFixed(1)}%` : "not entered"}.
                  </p>
                </div>
              )}
            </InfoCard>

          </div>

          {inquiry.notes && (
            <InfoCard title="Notes">
              <p className="text-sm whitespace-pre-wrap">{inquiry.notes}</p>
            </InfoCard>
          )}

          <InfoCard title="Inquiry history">
            <div className="mb-4 space-y-3 rounded-2xl border bg-muted/30 p-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Interaction type</Label>
                  <Select value={interactionType} onValueChange={setInteractionType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visit">Visit</SelectItem>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="message">Message</SelectItem>
                      <SelectItem value="follow_up">Follow up</SelectItem>
                      <SelectItem value="note">Note</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Status after discussion</Label>
                  <Select value={interactionStatus} onValueChange={setInteractionStatus}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New</SelectItem>
                      <SelectItem value="follow_up">Follow up</SelectItem>
                      <SelectItem value="interested">Interested</SelectItem>
                      <SelectItem value="ready_for_admission">Ready for admission</SelectItem>
                      <SelectItem value="lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Next follow-up date</Label>
                  <Input
                    type="date"
                    value={interactionFollowUpDate}
                    onChange={(e) => setInteractionFollowUpDate(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Remarks / discussion history</Label>
                <Textarea
                  rows={3}
                  value={interactionRemarks}
                  onChange={(e) => setInteractionRemarks(e.target.value)}
                  placeholder="Example: Student visited with father, interested in ICS, asked to follow up after test result."
                />
              </div>
              <Button type="button" onClick={saveInteraction} disabled={savingInteraction}>
                {savingInteraction ? "Saving..." : "Save history"}
              </Button>
            </div>

            {!interactions?.length ? (
              <p className="text-sm text-muted-foreground">No discussion history yet.</p>
            ) : (
              <div className="space-y-3">
                {interactions.map((entry) => (
                  <div key={entry.id} className="rounded-2xl border p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <Badge variant="outline" className="capitalize">
                        {entry.interaction_type.replace("_", " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString()}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm">{entry.remarks}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>By {entry.created_by ? nameMap?.get(entry.created_by) ?? "Unknown" : "System"}</span>
                      {entry.status_after && <span>Status: {statusLabel(entry.status_after)}</span>}
                      {entry.follow_up_date && <span>Follow-up: {entry.follow_up_date}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </InfoCard>
        </div>

        <div className="space-y-4 lg:col-span-4">
          <InfoCard title="Staff & follow-up">
            <FieldGrid cols={1}>
              <Field label="Inquiry officer" value={officerName} />
              <Field label="Assigned to" value={assigneeName} />
              <Field label="Follow-up officer" value={followUpOfficerName} />
              <Field label="Follow-up date" value={inquiry.follow_up_date} />
              <Field label="Created" value={new Date(inquiry.created_at).toLocaleString()} />
            </FieldGrid>
            {canAssignFollowUp && (
              <div className="mt-4 space-y-2 border-t pt-4">
                <Label>Assign follow-up officer</Label>
                <Select
                  value={followUpAssignedTo || "__none__"}
                  onValueChange={(v) => setFollowUpAssignedTo(v === "__none__" ? "" : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Unassigned</SelectItem>
                    {followUpOfficers?.map((officer) => (
                      <SelectItem key={officer.id} value={officer.id}>
                        {officer.full_name || officer.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="secondary" size="sm" className="w-full" onClick={saveFollowUpAssignment}>
                  Save follow-up officer
                </Button>
              </div>
            )}
          </InfoCard>

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
                    <SelectItem value="ready_for_admission">Ready for admission</SelectItem>
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

              {hasRole("super_admin") && (
                <div className="space-y-2">
                  <Label>Reassign inquiry</Label>
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
              )}
            </div>
          </InfoCard>
        </div>
      </div>
    </DetailPage>
  );
}

function printValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function PrintField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="field">
      <span className="label">{label}</span>
      <span className="value">{printValue(value)}</span>
    </div>
  );
}

function InquiryPrintSheet({
  inquiry,
  photoUrl,
  officerName,
  assigneeName,
  programName,
  sessionLabel,
  classLabel,
}: {
  inquiry: any;
  photoUrl: string | null;
  officerName: string;
  assigneeName: string;
  programName?: string;
  sessionLabel?: string | null;
  classLabel?: string | null;
}) {
  const marks =
    inquiry.matric_marks_obtained != null && inquiry.matric_marks_total != null
      ? `${inquiry.matric_marks_obtained} / ${inquiry.matric_marks_total}`
      : inquiry.matric_marks_obtained;

  return (
    <div className="sheet">
      <div className="header">
        <div>
          {CAMPUS_LOGO_URL ? (
            <img className="logo" src={CAMPUS_LOGO_URL} alt={CAMPUS_NAME} />
          ) : (
            <div className="logo" />
          )}
        </div>
        <div>
          <h1>{CAMPUS_NAME}</h1>
          {CAMPUS_TAGLINE && <div className="muted">{CAMPUS_TAGLINE}</div>}
          {CAMPUS_ADDRESS && <div className="muted">{CAMPUS_ADDRESS}</div>}
          <div style={{ marginTop: 8, fontWeight: 700 }}>STUDENT INQUIRY FORM</div>
          <div className="muted">Printed: {new Date().toLocaleString()}</div>
        </div>
        <div>
          {photoUrl ? <img className="photo" src={photoUrl} alt="" /> : <div className="photo" />}
        </div>
      </div>

      <h2>Student & Contact</h2>
      <div className="grid">
        <PrintField label="Student name" value={inquiry.full_name} />
        <PrintField label="Father's name" value={inquiry.father_name} />
        <PrintField label="CNIC / B-Form" value={inquiry.cnic} />
        <PrintField label="Gender" value={formatGender(inquiry.gender)} />
        <PrintField label="Phone" value={inquiry.phone} />
        <PrintField label="Email" value={inquiry.email} />
        <PrintField label="Status" value={statusLabel(String(inquiry.status ?? ""))} />
      </div>

      <h2>Academic Interest</h2>
      <div className="grid">
        <PrintField label="Program" value={programName} />
        <PrintField label="Session" value={sessionLabel} />
        <PrintField label="Class / year" value={classLabel} />
        <PrintField label="Matric school" value={inquiry.matric_school} />
        <PrintField label="Matric marks" value={marks} />
      </div>

      <h2>Guardian</h2>
      <div className="grid">
        <PrintField label="Guardian name" value={inquiry.guardian_name} />
        <PrintField label="Guardian phone" value={inquiry.guardian_phone} />
        <PrintField label="Occupation" value={inquiry.guardian_occupation} />
      </div>
      <div className="notes">{printValue(inquiry.guardian_details)}</div>

      <h2>Staff & Follow-up</h2>
      <div className="grid">
        <PrintField label="Inquiry officer" value={officerName} />
        <PrintField label="Assigned to" value={assigneeName} />
        <PrintField label="Follow-up date" value={inquiry.follow_up_date} />
        <PrintField label="Created" value={new Date(inquiry.created_at).toLocaleString()} />
      </div>

      <h2>Notes</h2>
      <div className="notes">{printValue(inquiry.notes)}</div>

      <div className="signatures">
        <div>Inquiry officer</div>
        <div>Student / Parent</div>
        <div>Admission office</div>
      </div>
    </div>
  );
}
