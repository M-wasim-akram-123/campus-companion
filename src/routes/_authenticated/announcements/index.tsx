import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { canManageAnnouncements } from "@/lib/announcement-permissions";
import { fetchAnnouncements, publishAnnouncement, targetingSummary } from "@/lib/announcements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/announcements/")({
  component: AnnouncementsIndexPage,
});

function AnnouncementsIndexPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles, loading } = useAuth();
  const allowed = canManageAnnouncements(roles);
  const [sessionId, setSessionId] = useState("");
  const [publishingId, setPublishingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/dashboard" });
  }, [allowed, loading, navigate]);

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const active = sessions?.find((s) => s.is_active);
  const sid = sessionId || active?.id || sessions?.[0]?.id || "";

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["announcements", sid],
    enabled: !!sid && allowed,
    queryFn: () => fetchAnnouncements(sid),
  });

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Announcements</h1>
          <p className="text-muted-foreground">Text, voice, or video messages for student mobile apps</p>
        </div>
        <Button asChild>
          <Link to="/announcements/new"><Plus className="mr-2 h-4 w-4" />New announcement</Link>
        </Button>
      </div>

      <Select value={sid} onValueChange={setSessionId}>
        <SelectTrigger className="w-[220px]"><SelectValue placeholder="Session" /></SelectTrigger>
        <SelectContent>
          {(sessions ?? []).map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.label}{s.is_active ? " (active)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card>
        <CardHeader><CardTitle>All announcements</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : !items.length ? (
            <p className="text-sm text-muted-foreground">No announcements yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Audience</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.title}</TableCell>
                    <TableCell className="capitalize">{row.content_type}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{targetingSummary(row)}</TableCell>
                    <TableCell>
                      <Badge variant={row.status === "published" ? "default" : "secondary"} className="capitalize">
                        {row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.published_at ? new Date(row.published_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.status === "draft" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={publishingId === row.id}
                          onClick={async () => {
                            setPublishingId(row.id);
                            try {
                              await publishAnnouncement(row.id);
                              toast.success("Published to student apps");
                              qc.invalidateQueries({ queryKey: ["announcements"] });
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : "Publish failed");
                            } finally {
                              setPublishingId(null);
                            }
                          }}
                        >
                          Publish
                        </Button>
                      )}
                    </TableCell>
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
