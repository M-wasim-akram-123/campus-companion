import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { canManageAnnouncements } from "@/lib/announcement-permissions";
import { createAnnouncement, uploadAnnouncementMedia } from "@/lib/announcements";
import { AnnouncementForm } from "@/components/announcements/AnnouncementForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/announcements/new")({
  component: NewAnnouncementPage,
});

function NewAnnouncementPage() {
  const navigate = useNavigate();
  const { roles, loading, user } = useAuth();
  const allowed = canManageAnnouncements(roles);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && !allowed) navigate({ to: "/dashboard" });
  }, [allowed, loading, navigate]);

  if (loading || !allowed) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="px-0">
        <Link to="/announcements"><ArrowLeft className="mr-2 h-4 w-4" />Back to announcements</Link>
      </Button>
      <div>
        <h1 className="text-3xl font-bold">New announcement</h1>
        <p className="text-muted-foreground">Send text, record voice, or upload video for targeted students</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Announcement</CardTitle></CardHeader>
        <CardContent>
          <AnnouncementForm
            saving={saving}
            onSubmit={async (values) => {
              setSaving(true);
              try {
                let mediaPath: string | null = null;
                let mediaMime: string | null = null;
                if (values.content_type === "voice" && values.voiceBlob) {
                  mediaMime = "audio/webm";
                  mediaPath = await uploadAnnouncementMedia(values.voiceBlob, "voice", mediaMime);
                }
                if (values.content_type === "video" && values.videoFile) {
                  mediaMime = values.videoFile.type || "video/mp4";
                  mediaPath = await uploadAnnouncementMedia(values.videoFile, "video", mediaMime);
                }
                await createAnnouncement(
                  {
                    academic_session_id: values.academic_session_id,
                    title: values.title,
                    content_type: values.content_type,
                    body_text: values.body_text,
                    media_path: mediaPath,
                    media_mime_type: mediaMime,
                    class_year_level: values.class_year_level,
                    target_gender: values.target_gender,
                    section_ids: values.section_ids,
                    publish: values.publish,
                  },
                  user?.id ?? null,
                );
                toast.success(values.publish ? "Announcement published" : "Draft saved");
                navigate({ to: "/announcements" });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Could not save announcement");
              } finally {
                setSaving(false);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
