import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { CheckCircle2, Loader2, Search, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BoardGazetteImport, BoardGazetteLookupResult } from "@/lib/board-gazette";
import { normalizeBoardRollNumber } from "@/lib/board-gazette";
import { toast } from "sonner";

type BoardRollLookupProps = {
  gazetteImportId: string;
  rollNumber: string;
  onGazetteImportIdChange: (value: string) => void;
  onRollNumberChange: (value: string) => void;
  onLookupSuccess: (result: BoardGazetteLookupResult) => void;
};

export function BoardRollLookup({
  gazetteImportId,
  rollNumber,
  onGazetteImportIdChange,
  onRollNumberChange,
  onLookupSuccess,
}: BoardRollLookupProps) {
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "found" | "missing" | "failed" | "no_gazette"
  >("idle");
  const [lookupMessage, setLookupMessage] = useState("");
  const [candidateName, setCandidateName] = useState<string | null>(null);

  const { data: imports, isLoading: importsLoading } = useQuery({
    queryKey: ["board-gazette-imports"],
    queryFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) return [] as BoardGazetteImport[];
      const res = await fetch("/api/board-gazette/imports", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Could not load board gazettes");
      const json = (await res.json()) as { imports?: BoardGazetteImport[] };
      return json.imports ?? [];
    },
  });

  const runLookup = async () => {
    const roll = normalizeBoardRollNumber(rollNumber);
    if (!gazetteImportId) {
      toast.error("Select which exam gazette to check");
      return;
    }
    if (!roll || roll.length < 5) {
      toast.error("Enter a valid board roll number");
      return;
    }

    setLookupState("loading");
    setLookupMessage("");
    setCandidateName(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sign in required");

      const res = await fetch(
        `/api/board-gazette/lookup?importId=${encodeURIComponent(gazetteImportId)}&roll=${encodeURIComponent(roll)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const json = (await res.json()) as BoardGazetteLookupResult & { error?: string };
      if (!res.ok) throw new Error(json.error || json.message || "Lookup failed");

      if (!json.found) {
        setLookupState("missing");
        setLookupMessage(json.message || "Roll number not found in selected gazette");
        return;
      }

      if (json.resultStatus && json.resultStatus !== "passed") {
        setLookupState("failed");
        setLookupMessage(`Board result: ${json.resultStatus.replaceAll("_", " ")}`);
        setCandidateName(json.candidateName ?? null);
        onLookupSuccess(json);
        return;
      }

      if (json.marksObtained == null) {
        setLookupState("missing");
        setLookupMessage("Roll found but marks are not available in gazette");
        setCandidateName(json.candidateName ?? null);
        return;
      }

      setLookupState("found");
      setCandidateName(json.candidateName ?? null);
      setLookupMessage(
        `Marks loaded from ${json.gazetteLabel ?? "gazette"}: ${json.marksObtained} / ${json.marksTotal}`,
      );
      onRollNumberChange(json.rollNumber ?? roll);
      onLookupSuccess(json);
      toast.success("Board marks loaded");
    } catch (error) {
      setLookupState("missing");
      setLookupMessage(error instanceof Error ? error.message : "Lookup failed");
    }
  };

  if (!importsLoading && !imports?.length) {
    return (
      <div className="rounded-2xl border border-dashed bg-muted/20 p-4 sm:col-span-2">
        <p className="text-sm font-medium">Board roll lookup</p>
        <p className="mt-1 text-xs text-muted-foreground">
          No gazette imported yet. Super Admin runs the yearly import script after BISE publishes results,
          then staff can verify roll numbers here.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-muted/20 p-4 sm:col-span-2">
      <p className="mb-3 text-sm font-medium">Board result lookup</p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-end">
        <div className="space-y-2">
          <Label htmlFor="board-gazette-year">Exam gazette</Label>
          <Select value={gazetteImportId || "__none__"} onValueChange={(v) => onGazetteImportIdChange(v === "__none__" ? "" : v)}>
            <SelectTrigger id="board-gazette-year">
              <SelectValue placeholder={importsLoading ? "Loading..." : "Select exam year"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select gazette...</SelectItem>
              {imports?.map((row) => (
                <SelectItem key={row.id} value={row.id}>
                  {row.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="board-roll-number">Board roll no.</Label>
          <Input
            id="board-roll-number"
            inputMode="numeric"
            placeholder="e.g. 506124 or 121506124"
            value={rollNumber}
            onChange={(e) => {
              onRollNumberChange(normalizeBoardRollNumber(e.target.value));
              setLookupState("idle");
            }}
          />
        </div>
        <Button type="button" variant="secondary" onClick={runLookup} disabled={lookupState === "loading"}>
          {lookupState === "loading" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Search className="mr-2 h-4 w-4" />
          )}
          Verify roll
        </Button>
      </div>

      {lookupState === "found" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {lookupMessage}
          {candidateName ? ` · ${candidateName}` : ""}
        </p>
      )}
      {(lookupState === "missing" || lookupState === "failed") && lookupMessage && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-amber-700">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {lookupMessage}
          {candidateName ? ` · ${candidateName}` : ""}
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Gazettes change every year. Pick the correct exam year, then verify roll to auto-fill marks.
      </p>
    </div>
  );
}
