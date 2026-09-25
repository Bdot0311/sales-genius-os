import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useBackgroundWork } from "@/hooks/use-background-work";

/**
 * What is still running, wherever you have navigated to.
 *
 * It lives in the shell rather than on a page because that is the whole point:
 * start a batch on one screen, walk to another, and the work is still there.
 * A per-page indicator unmounts with the page and is how this got lost in the
 * first place.
 *
 * It renders nothing when nothing is open — a permanent status strip that
 * reads "idle" trains people to stop looking at it.
 */
export const BackgroundWorkBar = () => {
  const { jobs, summary } = useBackgroundWork();
  if (!summary || jobs.length === 0) return null;

  const failed = jobs.reduce((n, j) => n + (j.failed ?? 0), 0);

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-border/60 bg-muted/30 px-4 sm:px-6 lg:px-8 py-2 text-sm flex items-center gap-2 flex-wrap"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" aria-hidden />
      {/* Named, never a bare count. Three screens from where it started,
          "still working" without saying on what is worse than silence. */}
      <span className="text-muted-foreground">Still working — {summary}.</span>
      {failed > 0 && (
        <span className="text-destructive">
          {failed} failed.
        </span>
      )}
      <Link
        to="/dashboard/ai-agent"
        className="underline underline-offset-2 text-muted-foreground hover:text-foreground"
      >
        Open the agent
      </Link>
    </div>
  );
};
