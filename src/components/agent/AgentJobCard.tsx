import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Loader2, X } from "lucide-react";
import type { AgentJob } from "@/hooks/use-agent-job";

/**
 * A batch too big for one turn, while it runs.
 *
 * Counts, not narration: the rows are the truth, and the agent claiming
 * progress in prose is the thing several fixes this month were about.
 */
export const AgentJobCard = ({ job, onCancel }: { job: AgentJob; onCancel: () => void }) => {
  const settled = job.done + job.failed;
  const pct = job.total > 0 ? Math.round((settled / job.total) * 100) : 0;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
          <span>
            Drafting the rest of the batch — {settled} of {job.total}
            {job.failed > 0 ? `, ${job.failed} failed` : ""}
          </span>
        </div>
        <Button size="sm" variant="ghost" className="gap-1 h-7" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
      </div>
      <Progress value={pct} className="h-1.5" />
      <p className="text-xs text-muted-foreground">
        These keep going if you close the app. Drafts appear in Outreach as they finish.
      </p>
    </div>
  );
};
