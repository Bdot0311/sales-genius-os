import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Search } from "lucide-react";

export type TechChange = "removed" | "added";

const CHANGE_OPTIONS: { value: TechChange; label: string; hint: string }[] = [
  { value: "removed", label: "dropped it", hint: "they churned off this tool and are choosing a replacement now" },
  { value: "added", label: "adopted it", hint: "they just brought this tool in" },
];

/**
 * Search for people at companies that recently changed a tool.
 *
 * This is a way of starting a lead search, not a separate feature: it resolves
 * to the companies the change happened at and then searches them the same way
 * naming accounts by hand would. It sits here beside the other ways in because
 * "who dropped a competitor last month" is a targeting question, and the
 * displacement window it opens is the reason to write this week rather than
 * next.
 *
 * The role field matters. A company that dropped a CRM has hundreds of
 * employees and only a handful of them own the decision.
 */
export const TechChangeSearch = ({
  onFindLeads,
  isSearching,
}: {
  onFindLeads: (opts: { vendor: string; change: TechChange; jobTitle: string }) => void;
  isSearching?: boolean;
}) => {
  const [vendor, setVendor] = useState("");
  const [change, setChange] = useState<TechChange>("removed");
  const [jobTitle, setJobTitle] = useState("");

  const submit = () => {
    if (isSearching) return;
    onFindLeads({ vendor: vendor.trim(), change, jobTitle: jobTitle.trim() });
  };

  const activeHint = CHANGE_OPTIONS.find((o) => o.value === change)?.hint;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tech-change-vendor">Tool</Label>
        <Input
          id="tech-change-vendor"
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="e.g. HubSpot — leave blank to use your ICP competitor list"
        />
        <p className="text-xs text-muted-foreground">
          the tool you displace. blank uses the competitors already set on your ICP.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {CHANGE_OPTIONS.map((o) => (
          <Button
            key={o.value}
            type="button"
            size="sm"
            variant={change === o.value ? "default" : "outline"}
            onClick={() => setChange(o.value)}
          >
            {o.label}
          </Button>
        ))}
        {activeHint && <span className="text-xs text-muted-foreground">{activeHint}</span>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tech-change-role">Filter by role (optional)</Label>
        <Input
          id="tech-change-role"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          placeholder="e.g. VP Sales, Head of Revenue Operations"
        />
        <p className="text-xs text-muted-foreground">
          a company that dropped a tool has hundreds of contacts and only a few who chose it.
        </p>
      </div>

      <Button onClick={submit} disabled={isSearching} className="w-full sm:w-auto">
        {isSearching
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />searching</>
          : <><Search className="w-4 h-4 mr-2" />Find leads</>}
      </Button>
    </div>
  );
};
