import { usePresence } from "@/hooks/use-presence";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

interface Props {
  recordKey: string | null;
  editing?: boolean;
  className?: string;
}

const initials = (s?: string | null) =>
  (s || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

/**
 * Avatar stack of users currently viewing the same record. Shows a small
 * pencil overlay on anyone who has flagged themselves as editing, so you
 * can avoid simultaneous edits.
 */
export const PresenceIndicator = ({ recordKey, editing = false, className = "" }: Props) => {
  const users = usePresence(recordKey, editing);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setMeId(data.user?.id ?? null));
  }, []);

  // unique by user_id, exclude self
  const others = Object.values(
    users.reduce<Record<string, typeof users[number]>>((acc, u) => {
      if (u.user_id !== meId) acc[u.user_id] = u;
      return acc;
    }, {})
  );

  if (others.length === 0) return null;

  return (
    <TooltipProvider>
      <div className={`flex items-center -space-x-2 ${className}`}>
        {others.slice(0, 4).map((u) => (
          <Tooltip key={u.user_id}>
            <TooltipTrigger asChild>
              <div className="relative">
                <Avatar className="h-6 w-6 ring-2 ring-background">
                  {u.avatar_url && <AvatarImage src={u.avatar_url} alt={u.email} />}
                  <AvatarFallback className="text-[10px] bg-primary/15 text-primary">
                    {initials(u.name || u.email)}
                  </AvatarFallback>
                </Avatar>
                {u.editing && (
                  <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-amber-500 text-background p-0.5">
                    <Pencil className="h-2 w-2" />
                  </span>
                )}
              </div>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              <div>{u.name || u.email}</div>
              <div className="text-muted-foreground">{u.editing ? "Editing now" : "Viewing"}</div>
            </TooltipContent>
          </Tooltip>
        ))}
        {others.length > 4 && (
          <span className="text-[10px] text-muted-foreground pl-3">+{others.length - 4}</span>
        )}
      </div>
    </TooltipProvider>
  );
};
