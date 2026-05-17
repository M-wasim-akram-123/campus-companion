import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { getPhotoUrl } from "@/lib/photo-upload";

export const Route = createFileRoute("/_authenticated/inquiries/$id")({ component: InquiryDetail });

function InquiryDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const { data: inquiry, isLoading } = useQuery({
    queryKey: ["inquiry", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inquiries").select("*, programs(name)").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

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

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (!inquiry) return <div>Not found</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{inquiry.full_name}</h1>
          <p className="text-muted-foreground">{inquiry.phone}</p>
        </div>
        <Badge>{inquiry.status.replace("_", " ")}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Email" value={inquiry.email || "—"} />
            <Row label="Program" value={(inquiry.programs as any)?.name || "—"} />
            <Row label="Follow-up date" value={inquiry.follow_up_date || "—"} />
            <Row label="Notes" value={inquiry.notes || "—"} />
            <Row label="Created" value={new Date(inquiry.created_at).toLocaleString()} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {photoUrl && (
            <Card><CardContent className="p-3"><img src={photoUrl} alt="" className="aspect-square w-full rounded object-cover" /></CardContent></Card>
          )}
          <Card>
            <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Change status</label>
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
              <Button className="w-full" asChild>
                <Link to="/admissions/new" search={{ inquiryId: id } as any}>Convert to Admission</Link>
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/inquiries" })}>Back</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="col-span-2">{value}</div>
    </div>
  );
}
