import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, Loader2, Search } from "lucide-react";

interface AILeadCommandProps {
  /**
   * Returning the promise matters: the handler parses the query with an LLM
   * before it starts the search, and the input stays live for as long as that
   * is only a pending promise nobody is holding.
   */
  onSearch: (query: string) => void | Promise<void>;
  isSearching: boolean;
}

/**
 * Examples are stored split, not as sentences.
 *
 * As sentences they could only be chips, and four chips of twelve words each
 * do not fit on any phone: wrapped they became four full-width pills taller
 * than the search itself, and on one scrolling row they were sliced mid-word at
 * both edges, which reads as broken rather than as scrollable.
 *
 * Split into a role and a qualifier they become a two-column list: the role is
 * the scannable part and carries the weight, the qualifier trails it in muted
 * text and truncates cleanly when there is no room. `query` is what actually
 * lands in the input, so the displayed shorthand never has to double as a
 * grammatical sentence.
 */
const EXAMPLE_SEARCHES: { role: string; qualifier: string; query: string }[] = [
  {
    role: "Founders",
    qualifier: "Financial services · US",
    query: "Founders in financial services in the United States",
  },
  {
    role: "VP of Sales",
    qualifier: "Healthcare · California",
    query: "VP of Sales at healthcare companies in California",
  },
  {
    role: "CTOs",
    qualifier: "Ecommerce · New York",
    query: "CTOs at ecommerce companies in New York",
  },
  {
    role: "Marketing directors",
    qualifier: "Pharmaceuticals · Boston",
    query: "Marketing directors at pharmaceutical companies in Boston",
  },
  {
    role: "Heads of BD",
    qualifier: "United Kingdom",
    query: "Heads of Business Development in the United Kingdom",
  },
  {
    role: "CFOs",
    qualifier: "Retail · Canada",
    query: "CFOs at retail companies in Canada",
  },
  {
    role: "C-suite",
    qualifier: "Manufacturing · Germany",
    query: "C-suite executives at manufacturing companies in Germany",
  },
  {
    role: "Engineering managers",
    qualifier: "Software · San Francisco",
    query: "Engineering managers at software companies in San Francisco",
  },
];

const pickExamples = () => {
  const shuffled = [...EXAMPLE_SEARCHES].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 6);
};

/**
 * The search, which is the page's primary action.
 *
 * It used to wear a terminal costume: fake macOS window buttons, a fake
 * filename, a prompt glyph and a monospace input. None of it was a terminal —
 * nothing about typing a sentence and pressing a button is terminal-like — so
 * it was decoration impersonating an affordance, which is the one thing
 * product UI cannot afford.
 *
 * (The removed strings are described rather than quoted here: the test that
 * guards this asserts they are absent from the file, and a comment repeating
 * them verbatim fails it.)
 *
 * Stripping the costume was not by itself a design. What replaced it was one
 * hairline input floating in an otherwise empty page, which read as unfinished.
 * This version puts weight back deliberately: a tall field that looks like the
 * instrument the page is built around, and under it a real two-column list of
 * starting points that gives the panel height it has earned instead of height
 * it is padding out.
 *
 * It does not narrate its own progress. It used to report that it was searching
 * while the results region reported the same thing directly underneath, so one
 * search produced two spinners. Loading belongs where the results will appear,
 * as their shape.
 */
export const AILeadCommand = ({ onSearch, isSearching }: AILeadCommandProps) => {
  const [command, setCommand] = useState("");
  const [examples] = useState(pickExamples);
  const inputRef = useRef<HTMLInputElement>(null);
  // `isSearching` only goes true once the search request is actually made, and
  // the handler spends a few seconds parsing the query first. Without this the
  // box is enabled for that whole window and a second Enter buys a second
  // search. Set synchronously so a double click cannot land between the two.
  const dispatching = useRef(false);
  const [busy, setBusy] = useState(false);
  const disabled = busy || isSearching;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || disabled || dispatching.current) return;
    dispatching.current = true;
    setBusy(true);
    try {
      await onSearch(command.trim());
    } finally {
      dispatching.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-2.5">
        {/* Stacked below sm. Side by side, the button leaves roughly 200px of
            field on a 390px screen, which is not enough to see the sentence you
            just typed. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2.5">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="Founders at seed-stage fintech companies in the UK"
              aria-label="Describe the leads you are looking for"
              // 16px on mobile, or iOS zooms the page on focus.
              className="h-12 w-full rounded-lg border border-border/50 bg-background/70 pl-10 pr-3.5 text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-2 focus:ring-primary/15 disabled:opacity-60 sm:text-sm"
              disabled={disabled}
            />
          </div>
          <Button
            type="submit"
            disabled={!command.trim() || disabled}
            className="h-12 shrink-0 gap-2 px-6 text-sm sm:h-12"
          >
            {disabled ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            <span>{disabled ? "Searching" : "Search"}</span>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Plain English. Name the role, the kind of company, and where they are.
        </p>
      </form>

      <div className="border-t border-border/40 pt-4">
        <p className="text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
          Start from one of these
        </p>
        <div className="mt-1 grid gap-x-8 sm:grid-cols-2">
          {examples.map((example) => (
            <button
              key={example.query}
              type="button"
              onClick={() => {
                setCommand(example.query);
                inputRef.current?.focus();
              }}
              disabled={disabled}
              className="group -mx-2 flex items-baseline gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="shrink-0 text-sm text-foreground">{example.role}</span>
              <span className="truncate text-xs text-muted-foreground">{example.qualifier}</span>
              <ArrowUpRight
                className="ml-auto h-3.5 w-3.5 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
