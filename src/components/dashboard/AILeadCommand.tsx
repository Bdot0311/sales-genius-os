import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface AILeadCommandProps {
  /**
   * Returning the promise matters: the handler parses the query with an LLM
   * before it starts the search, and the input stays live for as long as that
   * is only a pending promise nobody is holding.
   */
  onSearch: (query: string) => void | Promise<void>;
  isSearching: boolean;
}

const allExampleCommands = [
  "Founders in financial services in the United States",
  "VP of Sales at healthcare companies in California",
  "CTOs at ecommerce companies in New York",
  "Directors of Marketing at technology companies in London",
  "C-suite executives at manufacturing companies in Germany",
  "Engineering managers at software companies in San Francisco",
  "Heads of Business Development in United Kingdom",
  "CFOs at retail companies in Canada",
  "VP of Product at media companies in Australia",
  "Marketing directors at pharmaceutical companies in Boston",
  "CEOs at consulting firms in Chicago",
  "Directors of Engineering at telecommunications companies",
];

const getRandomExamples = () => {
  const shuffled = [...allExampleCommands].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 4);
};

/**
 * The search box, which is the page's primary action.
 *
 * It used to wear a terminal costume: fake macOS window buttons, a fake
 * filename, a prompt glyph and a monospace input. None of it was a terminal —
 * nothing about typing a sentence and pressing a button is terminal-like — so
 * it was decoration impersonating an affordance, which is the one thing
 * product UI cannot afford. It also carried a badge announcing the presence of
 * AI, which told the user nothing they could act on.
 *
 * (The removed strings are described rather than quoted here: the test that
 * guards this asserts they are absent from the file, and a comment repeating
 * them verbatim fails it.)
 *
 * What replaced it is a single large input and nothing else. The examples sit
 * under it as quiet chips because a blank box is a worse problem than a plain
 * one, and violet appears only on the focus ring and the submit.
 *
 * It no longer narrates its own progress either. It reported "Searching B2B
 * data sources..." while the results region reported the same thing directly
 * underneath, so one search produced two spinners. Loading belongs where the
 * results will appear, as their shape, not here as a caption.
 */
export const AILeadCommand = ({ onSearch, isSearching }: AILeadCommandProps) => {
  const [command, setCommand] = useState("");
  const [exampleCommands] = useState(() => getRandomExamples());
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
    <form onSubmit={handleSubmit} className="space-y-3">
      <div
        className={cn(
          "flex items-center gap-2 rounded-xl border bg-background/60 px-3 transition-colors",
          "border-border/60 focus-within:border-primary/70 focus-within:ring-2 focus-within:ring-primary/20",
        )}
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          ref={inputRef}
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="Founders at seed-stage fintech companies in the UK"
          aria-label="Describe the leads you are looking for"
          // 16px on mobile, or iOS zooms the page on focus.
          className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/70 sm:text-sm"
          disabled={disabled}
        />
        <Button type="submit" size="sm" disabled={!command.trim() || disabled} className="shrink-0 gap-2">
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          <span>{disabled ? "Searching" : "Search"}</span>
        </Button>
      </div>

      {/* One scrolling row, not a wrapped stack.
          These are whole sentences: at phone width flex-wrap gave each one its
          own full-width pill, and the longest wrapped onto two lines, so four
          suggestions read as a list of buttons and took more room than the
          search they were suggesting for. Kept on a single line that scrolls,
          they read as suggestions again. -mx-1 px-1 lets the row bleed to the
          card edge so it is visibly scrollable rather than looking clipped. */}
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {exampleCommands.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => {
              setCommand(example);
              inputRef.current?.focus();
            }}
            disabled={disabled}
            className="shrink-0 whitespace-nowrap rounded-full border border-border/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50"
          >
            {example}
          </button>
        ))}
      </div>
    </form>
  );
};
