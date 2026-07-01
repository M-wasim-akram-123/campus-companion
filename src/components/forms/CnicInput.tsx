import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPakistanCnic, validatePakistanCnic } from "@/lib/cnic";
import { cn } from "@/lib/utils";

type CnicInputProps = {
  id: string;
  label?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
};

export function CnicInput({
  id,
  label = "CNIC / B-Form",
  value,
  onChange,
  required = false,
  className,
}: CnicInputProps) {
  const validation = validatePakistanCnic(value, required);

  return (
    <div className={cn("space-y-2", className)}>
      {label ? (
        <Label htmlFor={id}>
          {label}
          {required ? " *" : ""}
        </Label>
      ) : null}
      <Input
        id={id}
        required={required}
        inputMode="numeric"
        autoComplete="off"
        placeholder="36501-1411201-7"
        value={value}
        onChange={(e) => onChange(formatPakistanCnic(e.target.value))}
        className={cn(value.trim() && !validation.valid && "border-destructive focus-visible:ring-destructive/30")}
      />
      {value.trim() && !validation.valid && validation.error && (
        <p className="text-xs text-destructive">{validation.error}</p>
      )}
    </div>
  );
}
