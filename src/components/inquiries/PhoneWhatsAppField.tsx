import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Loader2, MessageCircle, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateWhatsAppPhone } from "@/lib/phone";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type LiveCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available"; liveCheckAvailable: true }
  | { status: "unavailable"; liveCheckAvailable: true }
  | { status: "skipped"; liveCheckAvailable: false; message?: string }
  | { status: "error"; message: string };

type PhoneWhatsAppFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  enableLiveCheck?: boolean;
};

export function PhoneWhatsAppField({
  id,
  label,
  value,
  onChange,
  required = false,
  placeholder = "03XX XXXXXXX",
  enableLiveCheck = true,
}: PhoneWhatsAppFieldProps) {
  const validation = useMemo(() => validateWhatsAppPhone(value), [value]);
  const [liveCheck, setLiveCheck] = useState<LiveCheckState>({ status: "idle" });

  useEffect(() => {
    if (!enableLiveCheck || !validation.valid) {
      setLiveCheck({ status: "idle" });
      return;
    }

    setLiveCheck({ status: "checking" });
    const timer = window.setTimeout(async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setLiveCheck({ status: "skipped", liveCheckAvailable: false, message: "Sign in to run live WhatsApp check" });
          return;
        }

        const res = await fetch(
          `/api/whatsapp/check-number?phone=${encodeURIComponent(validation.normalized)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const json = (await res.json()) as {
          formatValid?: boolean;
          onWhatsApp?: boolean | null;
          liveCheckAvailable?: boolean;
          message?: string;
          error?: string;
        };

        if (!res.ok) {
          setLiveCheck({ status: "error", message: json.error || "Could not verify WhatsApp number" });
          return;
        }

        if (!json.liveCheckAvailable) {
          setLiveCheck({
            status: "skipped",
            liveCheckAvailable: false,
            message: json.message || "Format valid for WhatsApp · live check not configured",
          });
          return;
        }

        if (json.onWhatsApp) {
          setLiveCheck({ status: "available", liveCheckAvailable: true });
          return;
        }

        setLiveCheck({ status: "unavailable", liveCheckAvailable: true });
      } catch {
        setLiveCheck({ status: "error", message: "Could not verify WhatsApp number" });
      }
    }, 700);

    return () => window.clearTimeout(timer);
  }, [enableLiveCheck, validation.valid, validation.normalized]);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      <Input
        id={id}
        required={required}
        inputMode="tel"
        autoComplete="tel"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          value.trim() && !validation.valid && "border-destructive focus-visible:ring-destructive/30",
          liveCheck.status === "available" && "border-emerald-500 focus-visible:ring-emerald-500/30",
          liveCheck.status === "unavailable" && "border-amber-500 focus-visible:ring-amber-500/30",
        )}
      />

      {value.trim() && !validation.valid && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {validation.error}
        </p>
      )}

      {validation.valid && (
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            Valid mobile format · {validation.display}
            {validation.whatsAppUrl && (
              <a
                href={validation.whatsAppUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
              >
                Open WhatsApp
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </p>

          {liveCheck.status === "checking" && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Checking if number is on WhatsApp...
            </p>
          )}

          {liveCheck.status === "available" && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <MessageCircle className="h-3.5 w-3.5 shrink-0" />
              Registered on WhatsApp
            </p>
          )}

          {liveCheck.status === "unavailable" && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <XCircle className="h-3.5 w-3.5 shrink-0" />
              Not registered on WhatsApp (or number is hidden)
            </p>
          )}

          {liveCheck.status === "skipped" && liveCheck.message && (
            <p className="text-xs text-muted-foreground">{liveCheck.message}</p>
          )}

          {liveCheck.status === "error" && (
            <p className="text-xs text-muted-foreground">{liveCheck.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
