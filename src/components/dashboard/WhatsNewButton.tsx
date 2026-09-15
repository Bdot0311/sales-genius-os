import { useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useWhatsNew } from "@/hooks/use-whats-new";
import { useChangelog } from "@/hooks/use-changelog";

/**
 * Header shortcut to the What's New page. Shows a highlighted "New" pill only
 * while there's an update the customer hasn't read; otherwise a quiet icon.
 *
 * Unread is measured against what is actually published, not the copy compiled
 * into the bundle — otherwise publishing an entry would never light the badge.
 */
export const WhatsNewButton = () => {
  const navigate = useNavigate();
  const { seenDate } = useWhatsNew();
  const { latestDate } = useChangelog();
  const hasUnread = Boolean(latestDate) && seenDate < latestDate;

  if (hasUnread) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => navigate("/dashboard/whats-new")}
        className="h-7 flex-shrink-0 gap-1.5 border-primary/40 bg-primary/10 px-2 text-[10px] text-primary hover:bg-primary/20 hover:text-primary sm:text-xs"
      >
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
        </span>
        <span className="whitespace-nowrap">What's new</span>
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="What's new"
            onClick={() => navigate("/dashboard/whats-new")}
            className="h-7 w-7 flex-shrink-0 text-muted-foreground hover:text-foreground"
          >
            <Sparkles className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>What's new in OutReign</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
