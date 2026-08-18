import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SeriesSectionPicker } from "@/components/exams/SeriesSectionPicker";
import { VoiceRecorder } from "@/components/announcements/VoiceRecorder";
import {
  type AnnouncementContentType,
  type CreateAnnouncementInput,
  fetchSectionsForClassYear,
} from "@/lib/announcements";
import type { SeriesSectionOption } from "@/lib/internal-exams";
import { ordinalYearLabel } from "@/lib/academic";

const EMPTY_SECTIONS: SeriesSectionOption[] = [];

type Props = {
  saving?: boolean;
  onSubmit: (values: CreateAnnouncementInput & { voiceBlob?: Blob | null; videoFile?: File | null }) => Promise<void>;
};

export function AnnouncementForm({ onSubmit, saving }: Props) {
  const [sessionId, setSessionId] = useState("");
  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<AnnouncementContentType>("text");
  const [bodyText, setBodyText] = useState("");
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [classYearLevel, setClassYearLevel] = useState("__all__");
  const [targetGender, setTargetGender] = useState("__all__");
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [publishNow, setPublishNow] = useState(true);

  const { data: sessions } = useQuery({
    queryKey: ["academic-sessions"],
    queryFn: async () =>
      (await supabase.from("academic_sessions").select("*").order("start_year", { ascending: false })).data ?? [],
  });

  const yearLevelNum = classYearLevel === "__all__" ? 1 : Number(classYearLevel);
  const { data: sectionsData } = useQuery({
    queryKey: ["announcement-sections", sessionId, classYearLevel],
    enabled: !!sessionId && classYearLevel !== "__all__",
    queryFn: () => fetchSectionsForClassYear(sessionId, yearLevelNum),
  });
  const sections = sectionsData ?? EMPTY_SECTIONS;

  useEffect(() => {
    if (!sessionId && sessions?.length) {
      const active = sessions.find((s) => s.is_active) ?? sessions[0];
      setSessionId(active.id);
    }
  }, [sessionId, sessions]);

  useEffect(() => {
    setSectionIds((prev) => {
      const next = prev.filter((id) => sections.some((s) => s.id === id));
      return next.length === prev.length && next.every((id, i) => id === prev[i]) ? prev : next;
    });
  }, [sections]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      academic_session_id: sessionId,
      title,
      content_type: contentType,
      body_text: bodyText.trim() || null,
      class_year_level: classYearLevel === "__all__" ? null : Number(classYearLevel),
      target_gender: targetGender === "__all__" ? null : (targetGender as "boys" | "girls"),
      section_ids: sectionIds,
      publish: publishNow,
      voiceBlob,
      videoFile,
    });
  };

  const canSubmit =
    title.trim() &&
    sessionId &&
    (contentType === "text"
      ? bodyText.trim()
      : contentType === "voice"
        ? !!voiceBlob
        : !!videoFile);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Test 1 schedule update" required />
        </div>
        <div className="space-y-2">
          <Label>Academic session</Label>
          <Select value={sessionId} onValueChange={setSessionId}>
            <SelectTrigger><SelectValue placeholder="Session" /></SelectTrigger>
            <SelectContent>
              {(sessions ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}{s.is_active ? " (running)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Class year (optional)</Label>
          <Select value={classYearLevel} onValueChange={setClassYearLevel}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All years</SelectItem>
              {[1, 2, 3].map((level) => (
                <SelectItem key={level} value={String(level)}>
                  {ordinalYearLabel(level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Gender (optional)</Label>
          <Select value={targetGender} onValueChange={setTargetGender}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Boys &amp; girls</SelectItem>
              <SelectItem value="boys">Boys only</SelectItem>
              <SelectItem value="girls">Girls only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {classYearLevel !== "__all__" && (
        <div className="space-y-2">
          <Label>Sections (optional — narrow further)</Label>
          <SeriesSectionPicker
            sections={sections}
            selectedIds={sectionIds}
            onChange={setSectionIds}
            disabled={saving}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Text message</Label>
        <p className="text-xs text-muted-foreground">
          Required for text-only announcements. You can also add a written note with voice or video.
        </p>
        <Textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Write your announcement or add a caption for the recording..."
          rows={4}
          required={contentType === "text"}
        />
      </div>

      <div className="space-y-2">
        <Label>Media (optional for text)</Label>
        <Tabs value={contentType} onValueChange={(v) => setContentType(v as AnnouncementContentType)}>
          <TabsList>
            <TabsTrigger value="text">Text only</TabsTrigger>
            <TabsTrigger value="voice">Voice</TabsTrigger>
            <TabsTrigger value="video">Video</TabsTrigger>
          </TabsList>
          <TabsContent value="text" className="mt-3">
            <p className="text-sm text-muted-foreground">Text-only announcement — use the message box above.</p>
          </TabsContent>
          <TabsContent value="voice" className="mt-3">
            <VoiceRecorder onRecorded={setVoiceBlob} disabled={saving} />
          </TabsContent>
          <TabsContent value="video" className="mt-3">
            <Input
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
            />
            <p className="mt-2 text-xs text-muted-foreground">MP4 or WebM recommended.</p>
            {videoFile && <p className="mt-1 text-sm">Selected: {videoFile.name}</p>}
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex items-center gap-2">
        <Checkbox id="publish-now" checked={publishNow} onCheckedChange={(v) => setPublishNow(v === true)} />
        <Label htmlFor="publish-now" className="font-normal">
          Publish immediately to student mobile apps
        </Label>
      </div>

      <Button type="submit" disabled={saving || !canSubmit}>
        {saving ? "Saving…" : publishNow ? "Publish announcement" : "Save draft"}
      </Button>
    </form>
  );
}
