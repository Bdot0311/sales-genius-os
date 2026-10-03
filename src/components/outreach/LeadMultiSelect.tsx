import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Mail, MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Choosing who a campaign is for.
 *
 * Outreach Studio had a single-value Select and, beside it, a separate Bulk
 * Send dialog with its own lead list, its own generator and its own send loop.
 * Two ways to write the same email, and the only difference between them was
 * how many people it went to. A user put it plainly: doing it one lead at a
 * time is too slow.
 *
 * So the field holds a set and the second mode stops needing to exist. The
 * sequence builder has the same single Select and the same problem, which is
 * why this is a component rather than markup inside the page.
 */

export interface SelectableLead {
  id: string;
  contact_name?: string | null;
  company_name?: string | null;
  contact_email?: string | null;
  email_verification_status?: string | null;
}

/**
 * Whether this lead can actually be written to.
 *
 * A lead with no address cannot be sent to at all, and send-email refuses a
 * proven-dead one outright, so including either in a campaign only produces a
 * failure later with no way to see it coming. They stay visible and selectable
 * -- the drafting still works, and a draft is useful before the address is
 * found -- but they are marked, and bulk selection leaves them out.
 */
export const leadIsReachable = (lead: SelectableLead): boolean =>
  Boolean(lead.contact_email) && lead.email_verification_status !== "invalid";

const leadLabel = (lead: SelectableLead): string =>
  [lead.contact_name, lead.company_name].filter(Boolean).join(" · ") || "Unnamed lead";

interface Props {
  leads: SelectableLead[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Overrides the empty-state wording where "lead" is not the right noun. */
  placeholder?: string;
  disabled?: boolean;
}

export const LeadMultiSelect = ({
  leads,
  value,
  onChange,
  placeholder = "Choose leads",
  disabled,
}: Props) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => new Set(value), [value]);

  const matching = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return leads;
    return leads.filter((l) =>
      [l.contact_name, l.company_name, l.contact_email]
        .filter(Boolean)
        .some((f) => String(f).toLowerCase().includes(term)),
    );
  }, [leads, query]);

  /*
   * What the closed field says.
   *
   * A name at one, a count at many. Showing "1 lead" when there is one person
   * reads as a quantity where the page means a person, and the name is the
   * thing being confirmed before an email goes to them.
   */
  const label = (() => {
    if (value.length === 0) return placeholder;
    if (value.length === 1) {
      const one = leads.find((l) => l.id === value[0]);
      return one ? leadLabel(one) : "1 lead";
    }
    return `${value.length} leads`;
  })();

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  // Bulk selection covers what is on screen, so it means the same thing with a
  // search term as without one.
  const reachableMatching = matching.filter(leadIsReachable);
  const allMatchingSelected =
    reachableMatching.length > 0 && reachableMatching.every((l) => selected.has(l.id));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={value.length === 0 ? "text-muted-foreground" : "truncate"}>{label}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="border-b border-border/60 p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company or email"
            className="h-8"
            autoFocus
          />
        </div>

        <ScrollArea className="max-h-64">
          {matching.length === 0 ? (
            <p className="px-3 py-6 text-center text-[0.8125rem] text-muted-foreground">
              {leads.length === 0 ? "No saved leads yet." : "No lead matches that."}
            </p>
          ) : (
            <ul className="p-1">
              {matching.map((lead) => {
                const reachable = leadIsReachable(lead);
                const isSelected = selected.has(lead.id);
                return (
                  <li key={lead.id}>
                    <button
                      type="button"
                      onClick={() => toggle(lead.id)}
                      aria-pressed={isSelected}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/50"
                    >
                      <Checkbox checked={isSelected} className="pointer-events-none" tabIndex={-1} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem]">{leadLabel(lead)}</span>
                        <span className="block truncate text-[0.6875rem] text-muted-foreground">
                          {lead.contact_email || "No email address"}
                        </span>
                      </span>
                      {/* Only the exception is drawn. A reachable lead needs no
                          badge saying so. */}
                      {!reachable && (
                        <MailX
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                          aria-label={lead.contact_email ? "Address failed verification" : "No address"}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2 py-1.5">
          <span className="text-[0.6875rem] text-muted-foreground">
            {value.length > 0 ? `${value.length} selected` : "None selected"}
          </span>
          <span className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-[0.6875rem]"
              disabled={reachableMatching.length === 0}
              onClick={() => {
                const next = new Set(selected);
                if (allMatchingSelected) {
                  for (const l of reachableMatching) next.delete(l.id);
                } else {
                  for (const l of reachableMatching) next.add(l.id);
                }
                onChange([...next]);
              }}
            >
              <Mail className="mr-1 h-3 w-3" aria-hidden />
              {allMatchingSelected ? "Deselect" : `Select ${reachableMatching.length}`}
            </Button>
            {value.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-[0.6875rem]"
                onClick={() => onChange([])}
              >
                Clear
              </Button>
            )}
          </span>
        </div>
      </PopoverContent>
    </Popover>
  );
};
