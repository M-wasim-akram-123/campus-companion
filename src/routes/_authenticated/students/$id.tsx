import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { getPhotoUrl } from "@/lib/photo-upload";

export const Route = createFileRoute("/_authenticated/students/$id")({ component: StudentDetail });

function StudentDetail() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const { data: s, isLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*, programs(name), classes(name), sections(name)")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (s?.photo_url) getPhotoUrl(s.photo_url).then(setPhotoUrl);
  }, [s?.photo_url]);

  if (isLoading) return <div className="text-muted-foreground">Loading...</div>;
  if (!s) return <div>Not found</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">{s.full_name}</h1>
          <p className="text-muted-foreground">Roll: {s.roll_number}</p>
        </div>
        <Badge>{s.status}</Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-4">
          {photoUrl ? (
            <Card><CardContent className="p-3"><img src={photoUrl} alt="" className="aspect-square w-full rounded object-cover" /></CardContent></Card>
          ) : (
            <Card><CardContent className="flex aspect-square items-center justify-center p-3 text-muted-foreground">No photo</CardContent></Card>
          )}
          <Button className="w-full" variant="outline" onClick={() => navigate({ to: "/students" })}>Back to list</Button>
        </div>

        <div className="space-y-4 md:col-span-2">
          <Card>
            <CardHeader><CardTitle>Personal</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Father's name" value={s.father_name} />
              <Row label="CNIC / B-Form" value={s.cnic} />
              <Row label="Date of birth" value={s.date_of_birth} />
              <Row label="Gender" value={s.gender} />
              <Row label="Phone" value={s.phone} />
              <Row label="Email" value={s.email} />
              <Row label="Address" value={s.address} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Guardian</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Name" value={s.guardian_name} />
              <Row label="Phone" value={s.guardian_phone} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Academic</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <Row label="Program" value={(s.programs as any)?.name} />
              <Row label="Class" value={(s.classes as any)?.name} />
              <Row label="Section" value={(s.sections as any)?.name} />
              <Row label="Session" value={s.session} />
              <Row label="Admission date" value={s.admission_date} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="text-muted-foreground">{label}</div>
      <div className="col-span-2">{value || "—"}</div>
    </div>
  );
}
