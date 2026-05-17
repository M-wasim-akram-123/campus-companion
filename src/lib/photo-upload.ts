import { supabase } from "@/integrations/supabase/client";

export async function uploadStudentPhoto(file: File, folder = "general"): Promise<string> {
  const ext = file.name.split(".").pop();
  const fileName = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("student-photos").upload(fileName, file);
  if (error) throw error;
  return fileName;
}

export async function getPhotoUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("student-photos").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}
