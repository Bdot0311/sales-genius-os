import { Check, CircleHelp } from "lucide-react";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OUTCOME_LABELS, type OutcomeLabel } from "@/lib/reply-label-display";
import { LABEL_COPY, needsConfirmation } from "@/lib/reply-label-display";

/**
 * The outcome label on one inbound reply, correctable in a tap.
 *
 * Shown inline while triaging rather than behind a dialog, because the only
 * labels that get corrected are the ones a person is already looking at. A
 * label the classifier was unsure about is marked, so the quickest thing in
 * reach is confirming or fixing it.
 */
export function ReplyLabelChip({
  label,
  confidence,
  labeledBy,
  pending,
  onCorrect,
}: {
  label: OutcomeLabel | null;
  confidence: number | null;
  labeledBy: "claude" | "user" | "agent" | null;
  pending?: boolean;
  onCorrect: (next: OutcomeLabel) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!label) return null;

  const unsure = needsConfirmation({ label, confidence, labeledBy });
  const copy = LABEL_COPY[label];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label={
            unsure
              ? `Reply labelled ${copy.label}, unconfirmed. Change or confirm it.`
              : `Reply labelled ${copy.label}. Change it.`
          }
          className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[0.625rem] transition-colors disabled:opacity-50 ${
            unsure
              ? "border-dashed border-muted-foreground/50 text-muted-foreground hover:border-muted-foreground"
              : `border-transparent ${copy.color} hover:border-border`
          }`}
        >
          {unsure ? <CircleHelp className="h-2.5 w-2.5" /> : null}
          {copy.label}
          {/* A person's own label needs no further vouching. */}
          {labeledBy === "user" || labeledBy === "agent" ? <Check className="h-2.5 w-2.5" /> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {OUTCOME_LABELS.map((option) => (
          <DropdownMenuItem
            key={option}
            onSelect={() => {
              // Re-picking the same label still counts: confirming a label the
              // classifier was unsure about is the point.
              onCorrect(option);
              setOpen(false);
            }}
            className="text-xs"
          >
            <span className={option === label ? "font-medium" : ""}>{LABEL_COPY[option].label}</span>
            {option === label ? <Check className="ml-auto h-3 w-3" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
