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
 * A full-width violet submit under the field was the correction that overshot:
 * the loudest object on a phone screen, and greyed out most of the time,
 * because the field starts empty.
 *
 * What is here now is a single field with its submit inset, and under it a
 * two-column list of starting points at a smaller size than the field. The
 * hierarchy is the point: field, then suggestions, then chrome, with a real
 * step between each. Flat type at generous spacing is what made the earlier
 * versions read as a signup form rather than a tool.
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
    <div>
      <form onSubmit={handleSubmit}>
        {/* The submit sits inside the field.
            Below it, full width, it was a violet slab the size of the input —
            the largest and loudest object on a phone screen, and greyed out
            most of the time because the field starts empty. Inset and compact,
            it is a control on the field rather than a banner under it. */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70"
            aria-hidden
          />
          <input
            ref={inputRef}
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="Founders at fintech companies in the UK"
            aria-label="Describe the leads you are looking for"
            // 16px on mobile, or iOS zooms the page on focus.
            className="h-12 w-full rounded-lg border border-border/40 bg-background/50 pl-9 pr-[5.5rem] text-base text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-background/80 disabled:opacity-60 sm:text-sm"
            disabled={disabled}
          />
          <Button
            type="submit"
            disabled={!command.trim() || disabled}
            className="absolute right-1.5 top-1/2 h-9 -translate-y-1/2 gap-1.5 px-3 text-xs font-medium"
          >
            {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {disabled ? "Searching" : "Search"}
          </Button>
        </div>
        <p className="mt-2 text-[0.6875rem] leading-relaxed text-muted-foreground/70">
          Plain English: the role, the kind of company, and where they are.
        </p>
      </form>

      <div className="mt-4 border-t border-border/30 pt-3">
        <p className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/50">
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
              className="group -mx-2 flex items-baseline gap-2 rounded px-2 py-1 text-left transition-colors hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-50"
            >
              <span className="shrink-0 text-[0.8125rem] font-medium text-foreground/90">
                {example.role}
              </span>
              <span className="truncate text-[0.6875rem] text-muted-foreground/70">
                {example.qualifier}
              </span>
              <ArrowUpRight
                className="ml-auto h-3 w-3 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
