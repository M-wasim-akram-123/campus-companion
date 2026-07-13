import { supabase } from "@/integrations/supabase/client";
import type { SeriesSectionOption } from "@/lib/internal-exams";
import { fetchSectionsForClassYear } from "@/lib/internal-exams";

export const ANNOUNCEMENT_MEDIA_BUCKET = "announcement-media";

export type AnnouncementContentType = "text" | "voice" | "video";
export type AnnouncementStatus = "draft" | "published";

export type Announcement = {
  id: string;
  academic_session_id: string;
  title: string;
  body_text: string | null;
  content_type: AnnouncementContentType;
  media_path: string | null;
  media_mime_type: string | null;
  class_year_level: number | null;
  target_gender: "boys" | "girls" | null;
  status: AnnouncementStatus;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  academic_sessions?: { label?: string } | null;
};

export type CreateAnnouncementInput = {
  academic_session_id: string;
  title: string;
  content_type: AnnouncementContentType;
  body_text?: string | null;
  media_path?: string | null;
  media_mime_type?: string | null;
  class_year_level?: number | null;
  target_gender?: "boys" | "girls" | null;
  section_ids?: string[];
  publish?: boolean;
};

function throwErr(error: { message?: string }) {
  throw new Error(error.message ?? "Request failed");
}

export async function fetchAnnouncements(sessionId?: string): Promise<Announcement[]> {
  let query = supabase
    .from("announcements")
    .select("*, academic_sessions(label)")
    .order("created_at", { ascending: false });
  if (sessionId) query = query.eq("academic_session_id", sessionId);
  const { data, error } = await query;
  if (error) throwErr(error);
  return (data ?? []) as Announcement[];
}

export async function fetchStudentAnnouncements(): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from("announcements")
    .select("*, academic_sessions(label)")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) throwErr(error);
  return (data ?? []) as Announcement[];
}

export async function uploadAnnouncementMedia(
  file: Blob | File,
  contentType: "voice" | "video",
  mimeType: string,
): Promise<string> {
  const ext = contentType === "voice" ? "webm" : mimeType.includes("mp4") ? "mp4" : "mp4";
  const path = `${contentType}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(ANNOUNCEMENT_MEDIA_BUCKET).upload(path, file, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throwErr(error);
  return path;
}

export async function getAnnouncementMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ANNOUNCEMENT_MEDIA_BUCKET)
    .createSignedUrl(path, 3600);
  if (error) throwErr(error);
  return data.signedUrl;
}

export async function createAnnouncement(
  input: CreateAnnouncementInput,
  createdBy?: string | null,
): Promise<Announcement> {
  const now = input.publish ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("announcements")
    .insert({
      academic_session_id: input.academic_session_id,
      title: input.title.trim(),
      content_type: input.content_type,
      body_text: input.body_text?.trim() || null,
      media_path: input.media_path ?? null,
      media_mime_type: input.media_mime_type ?? null,
      class_year_level: input.class_year_level ?? null,
      target_gender: input.target_gender ?? null,
      status: input.publish ? "published" : "draft",
      published_at: now,
      created_by: createdBy ?? null,
    })
    .select("*, academic_sessions(label)")
    .single();
  if (error) throwErr(error);

  if (input.section_ids?.length) {
    const { error: sectionErr } = await supabase.from("announcement_sections").insert(
      input.section_ids.map((sectionId) => ({
        announcement_id: data.id,
        section_id: sectionId,
      })),
    );
    if (sectionErr) throwErr(sectionErr);
  }

  return data as Announcement;
}

export async function publishAnnouncement(id: string): Promise<Announcement> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("announcements")
    .update({ status: "published", published_at: now, updated_at: now })
    .eq("id", id)
    .select("*, academic_sessions(label)")
    .single();
  if (error) throwErr(error);
  return data as Announcement;
}

export function targetingSummary(announcement: Announcement, sections?: SeriesSectionOption[]): string {
  const parts: string[] = [];
  if (announcement.class_year_level) {
    parts.push(`${announcement.class_year_level}${announcement.class_year_level === 1 ? "st" : announcement.class_year_level === 2 ? "nd" : "rd"} Year`);
  }
  if (announcement.target_gender) {
    parts.push(announcement.target_gender === "boys" ? "Boys" : "Girls");
  }
  if (sections?.length) {
    parts.push(`${sections.length} section(s)`);
  }
  if (!parts.length) return "All students in session";
  return parts.join(" · ");
}

export { fetchSectionsForClassYear };
