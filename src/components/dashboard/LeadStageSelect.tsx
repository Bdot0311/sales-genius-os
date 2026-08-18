import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const LEAD_STAGES = [
  { value: "new", label: "New", className: "text-blue-400" },
  { value: "contacted", label: "Contacted", className: "text-primary" },
  { value: "no_response", label: "No Response", className: "text-orange-400" },
  { value: "replied", label: "Replied", className: "text-emerald-400" },
  { value: "bounced", label: "Bounced", className: "text-destructive" },
  { value: "meeting_booked", label: "Meeting Booked", className: "text-green-400" },
  { value: "qualified", label: "Qualified", className: "text-teal-400" },
  { value: "not_interested", label: "Not Interested", className: "text-muted-foreground" },
  { value: "won", label: "Won", className: "text-green-500" },
  { value: "lost", label: "Lost", className: "text-destructive" },
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number]["value"];

export const getStageMeta = (value?: string | null) =>
  LEAD_STAGES.find((s) => s.value === (value || "new")) ?? LEAD_STAGES[0];

interface LeadStageSelectProps {
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export const LeadStageSelect = ({ value, onChange, disabled, className }: LeadStageSelectProps) => {
  const meta = getStageMeta(value);

  return (
    <Select value={meta.value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className={`h-7 w-[150px] text-xs ${className ?? ""}`}>
        <span className={`flex items-center gap-1.5 ${meta.className}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {LEAD_STAGES.map((stage) => (
          <SelectItem key={stage.value} value={stage.value} className="text-xs">
            <span className={`flex items-center gap-1.5 ${stage.className}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
              {stage.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
