import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { BoardGazetteImport } from "@/lib/board-gazette";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";

type GazetteImportRow = BoardGazetteImport & {
  row_count: number;
  imported_at: string;
  source_file: string | null;
};

async function authFetch(path: string, init?: RequestInit) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sign in required");
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

export const Route = createFileRoute("/_authenticated/settings/board-gazette")({
  component: BoardGazetteSettingsPage,
});

function BoardGazetteSettingsPage() {
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [examYear, setExamYear] = useState(String(new Date().getFullYear()));
  const [examLevel, setExamLevel] = useState<"hssc" | "ssc">("hssc");
  const [examSession, setExamSession] = useState("1st_annual");
  const [marksTotal, setMarksTotal] = useState("1100");
  const [label, setLabel] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);

  const { data: imports = [], isLoading } = useQuery({
    queryKey: ["board-gazette-imports", "all"],
    enabled: hasRole("super_admin"),
    queryFn: async () => {
      const res = await authFetch("/api/board-gazette/imports?all=1");
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || "Could not load gazettes");
      }
      const json = (await res.json()) as { imports?: GazetteImportRow[] };
      return json.imports ?? [];
    },
  });

  if (!hasRole("super_admin")) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center text-muted-foreground">
        Only Super Admin can manage board gazettes.
      </div>
    );
  }

  const uploadGazette = async () => {
    if (!file) {
      toast.error("Choose a gazette PDF to upload");
      return;
    }
    const year = Number(examYear);
    if (!Number.isFinite(year)) {
      toast.error("Enter a valid exam year");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("examYear", String(year));
      form.append("examLevel", examLevel);
      form.append("examSession", examSession);
      form.append("marksTotal", marksTotal || "1100");
      form.append("replace", replaceExisting ? "true" : "false");
      if (label.trim()) form.append("label", label.trim());

      const res = await authFetch("/api/board-gazette/import", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        rowCount?: number;
        label?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Upload failed");

      toast.success(`Imported ${json.rowCount?.toLocaleString()} rolls for ${json.label}`);
      setFile(null);
      setReplaceExisting(false);
      await queryClient.invalidateQueries({ queryKey: ["board-gazette-imports"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const toggleActive = async (row: GazetteImportRow, isActive: boolean) => {
    try {
      const res = await authFetch("/api/board-gazette/imports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, is_active: isActive }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not update gazette");
      toast.success(isActive ? "Gazette enabled for inquiry lookup" : "Gazette hidden from inquiry lookup");
      await queryClient.invalidateQueries({ queryKey: ["board-gazette-imports"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Board gazettes</h1>
        <p className="text-muted-foreground">
          Upload BISE Multan result gazettes each exam year. Staff can verify roll numbers on inquiry forms.
        </p>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Upload gazette PDF</CardTitle>
          <CardDescription>
            Large gazettes may take 2–3 minutes to import. Keep this page open until the upload finishes.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="gazette-file">Gazette PDF</Label>
            <Input
              id="gazette-file"
              type="file"
              accept="application/pdf,.pdf"
              disabled={uploading}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          <div className="space-y-2">
            <Label>Exam year</Label>
            <Input
              value={examYear}
              disabled={uploading}
              onChange={(event) => setExamYear(event.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2">
            <Label>Exam level</Label>
            <Select
              value={examLevel}
              disabled={uploading}
              onValueChange={(value) => setExamLevel(value as "hssc" | "ssc")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hssc">HSSC (Intermediate)</SelectItem>
                <SelectItem value="ssc">SSC (Matric)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Exam session</Label>
            <Select value={examSession} disabled={uploading} onValueChange={setExamSession}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1st_annual">1st annual</SelectItem>
                <SelectItem value="2nd_annual">2nd annual</SelectItem>
                <SelectItem value="supply">Supply</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Total marks</Label>
            <Input
              value={marksTotal}
              disabled={uploading}
              onChange={(event) => setMarksTotal(event.target.value)}
              inputMode="numeric"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Display label (optional)</Label>
            <Input
              value={label}
              disabled={uploading}
              placeholder="HSSC 1st Annual 2026 - BISE Multan"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 sm:col-span-2">
            <Checkbox
              id="replace-existing"
              checked={replaceExisting}
              disabled={uploading}
              onCheckedChange={(checked) => setReplaceExisting(checked === true)}
            />
            <Label htmlFor="replace-existing" className="font-normal">
              Replace existing gazette for the same year, level, and session
            </Label>
          </div>
          <div className="sm:col-span-2">
            <Button disabled={uploading || !file} onClick={uploadGazette}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing gazette…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload and import
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle>Imported gazettes</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : imports.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gazettes imported yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Label</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Rolls</TableHead>
                  <TableHead>Imported</TableHead>
                  <TableHead>Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {imports.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="font-medium">{row.label}</div>
                      {row.source_file ? (
                        <div className="text-xs text-muted-foreground">{row.source_file}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>{row.exam_year}</TableCell>
                    <TableCell>{row.row_count.toLocaleString()}</TableCell>
                    <TableCell>{new Date(row.imported_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <Switch
                        checked={row.is_active}
                        onCheckedChange={(checked) => toggleActive(row, checked)}
                      />
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
