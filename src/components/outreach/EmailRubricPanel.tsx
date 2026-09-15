import { useEffect, useMemo, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelBody, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Lock, CheckCircle2, AlertCircle, XCircle, X } from "lucide-react";
import { computeMechanicalChecks, Severity } from "@/lib/email-rubric";
import {
  allStrong,
  barColorFor,
  suggestionKey,
  weakestDimension,
} from "@/lib/rubric-display";

interface EmailRubricPanelProps {
  subject: string;
  body: string;
  /** When provided, each suggestion gets an "apply" button that rewrites the snippet in place. */
  onApplyBody?: (nextBody: string) => void;
  onApplySubject?: (nextSubject: string) => void;
}

interface Dim { score: number; justification: string }
interface Suggestion { snippet: string; dimension: string; suggestion: string }


const DIM_LABEL: Record<string, string> = {
  relevance: "relevance", empathy: "empathy", payoff: "payoff",
  low_friction_ask: "low-friction ask", you_focused: "you-focused",
};
const DIM_ORDER = ["relevance", "empathy", "payoff", "low_friction_ask", "you_focused"];

const sevIcon = (s: Severity) =>
  s === "ok" ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
  : s === "warn" ? <AlertCircle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
  : <XCircle className="w-3.5 h-3.5 text-destructive shrink-0" />;

// Locate a rubric snippet inside the draft tolerantly. The rubric returns lightly
// normalized quotes (different case, collapsed whitespace, wrapping quotes, or a
// trailing ellipsis when truncated), so an exact substring match fails and the
// "apply" used to silently do nothing. Returns the matched span so the caller can
// splice by index and rewrite the real text.
function locateSpan(text: string, snippet: string): { start: number; end: number } | null {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const flexWs = (s: string) => esc(s).replace(/\s+/g, "\\s+");
  const snip = snippet.replace(/^["'`\s]+|["'`\s]+$/g, "").replace(/\s*(?:\.\.\.|…)\s*$/, "").trim();
  if (!snip) return null;

  const exact = text.indexOf(snip);
  if (exact >= 0) return { start: exact, end: exact + snip.length };

  const tryRe = (pattern: string) => {
    const m = new RegExp(pattern, "i").exec(text);
    return m && m[0] ? { start: m.index, end: m.index + m[0].length } : null;
  };

  // case-insensitive, whitespace-flexible
  const ci = tryRe(flexWs(snip));
  if (ci) return ci;

  // ellipsis-spanning snippet: "start ... end"
  const parts = snip.split(/\s*(?:\.\.\.|…)\s*/);
  if (parts.length === 2 && parts[0] && parts[1]) {
    const span = tryRe(`${flexWs(parts[0])}[\\s\\S]*?${flexWs(parts[1])}`);
    if (span) return span;
  }
  return null;
}

export const EmailRubricPanel = ({ subject, body, onApplyBody, onApplySubject }: EmailRubricPanelProps) => {
  const mech = useMemo(() => computeMechanicalChecks(subject, body), [subject, body]);

  const [dims, setDims] = useState<Record<string, Dim> | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // Keyed by the suggestion's own content, not its position. The array is
  // replaced on every re-score, and applying a suggestion causes a re-score,
  // so index-keyed state was wiped a second after every apply.
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [gated, setGated] = useState(false);
  const reqId = useRef(0);

  const canApply = Boolean(onApplyBody || onApplySubject);

  const applySuggestion = async (s: Suggestion) => {
    const key = suggestionKey(s);
    if (!s.snippet) { toast.error("this suggestion has no snippet to rewrite"); return; }
    // Locate the snippet tolerantly in the body first, then the subject.
    const bodySpan = onApplyBody ? locateSpan(body, s.snippet) : null;
    const subjectSpan = !bodySpan && onApplySubject ? locateSpan(subject, s.snippet) : null;
    if (!bodySpan && !subjectSpan) { toast.error("couldn't find that snippet in the current draft"); return; }

    const target = bodySpan
      ? { text: body, span: bodySpan, apply: onApplyBody! }
      : { text: subject, span: subjectSpan!, apply: onApplySubject! };
    // Rewrite the ACTUAL matched text (not the normalized snippet) so the
    // replacement fits the draft, and splice by index so we change the exact span.
    const matched = target.text.slice(target.span.start, target.span.end);

    setApplyingKey(key);
    try {
      const { data, error } = await supabase.functions.invoke("apply-rubric-suggestion", {
        body: { subject, body, snippet: matched, suggestion: s.suggestion, dimension: s.dimension },
      });
      if (error) { toast.error("couldn't apply that suggestion"); return; }
      if (data?.error) { toast.error(data.error); return; }
      const replacement = typeof data?.replacement === "string" ? data.replacement : "";
      if (!replacement) { toast.error("couldn't apply that suggestion"); return; }

      const next = target.text.slice(0, target.span.start) + replacement + target.text.slice(target.span.end);
      if (next.trim() === target.text.trim()) { toast.error("that suggestion didn't change the draft"); return; }
      target.apply(next);

      setApplied((prev) => new Set(prev).add(key));
      toast.success("suggestion applied");
    } finally {
      setApplyingKey(null);
    }
  };


  // Debounced rubric fetch. Mechanical checks above are instant and deterministic.
  useEffect(() => {
    if (!body.replace(/<[^>]*>/g, "").trim()) { setDims(null); setSuggestions([]); return; }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("check-email-rubric", { body: { subject, body } });
        if (id !== reqId.current) return;
        if (error) { setGated(false); setDims(null); return; }
        if (data?.error_code === "upgrade_required") { setGated(true); setDims(null); return; }
        if (data?.dimensions) {
          setGated(false);
          setDims(data.dimensions);
          setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
          // applied and dismissed deliberately survive a re-score. A suggestion
          // that comes back after being applied is telling us the rewrite did
          // not move what it was aimed at, which is worth showing rather than
          // resetting into a fresh-looking button.
        }
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [subject, body]);

  return (
    <Panel className="border-border/50">
      <PanelHeader className="pb-3 pt-4 px-4">
        <PanelTitle className="font-medium flex items-center gap-2">
          reply rubric
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        </PanelTitle>
      </PanelHeader>
      <PanelBody className="px-4 pb-4 space-y-4">
        {/* R.E.P.L.Y. dimensions */}
        {gated ? (
          <div className="flex items-start gap-2 p-2.5 rounded-md bg-muted/40">
            <Lock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground">the full reply rubric is on growth and above. mechanical checks below are always on.</p>
          </div>
        ) : dims ? (
          <div className="space-y-2">
            {allStrong(dims) && (
              <p className="text-[11px] text-green-500">
                Every dimension is at or above the bar. Nothing here is holding this email back.
              </p>
            )}
            {DIM_ORDER.map((d) => {
              const dim = dims[d];
              if (!dim) return null;
              // Derived, not taken from the response: the server always names a
              // weakest, even when all five are tied or all five are strong.
              const isWeak = weakestDimension(dims) === d;
              return (
                <div key={d} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className={isWeak ? "font-semibold text-destructive" : ""}>{DIM_LABEL[d]}{isWeak && " · weakest"}</span>
                    <span className="font-mono text-muted-foreground">{dim.score}/5</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${barColorFor(dim.score)}`} style={{ width: `${(dim.score / 5) * 100}%` }} />
                  </div>
                  {dim.justification && <p className="text-[11px] text-muted-foreground">{dim.justification}</p>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{loading ? "scoring..." : "write an email to score it."}</p>
        )}

        {/* Apply or ignore suggestions (user stays in control) */}
        {suggestions.length > 0 && (
          <div className="space-y-2 pt-1 border-t">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">suggestions</p>
            {suggestions.map((s) => {
              const key = suggestionKey(s);
              if (dismissed.has(key)) return null;
              const reoffered = applied.has(key);
              return (
              <div key={key} className="flex items-start gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="text-foreground/80">{s.suggestion}</p>
                  {s.snippet && <p className="text-[11px] text-muted-foreground truncate">on: "{s.snippet}"</p>}
                  {reoffered && (
                    <p className="text-[11px] text-amber-500">
                      Applied, and the rubric still wants this changed. The rewrite did not move it.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {canApply && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-[10px]"
                      disabled={applyingKey !== null}
                      onClick={() => applySuggestion(s)}
                    >
                      {applyingKey === key
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : reoffered ? "retry" : "apply"}
                    </Button>
                  )}
                  <button onClick={() => setDismissed((prev) => new Set(prev).add(key))} className="text-muted-foreground hover:text-foreground" title="ignore">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}


        {/* Mechanical checks (always on) */}
        <div className="space-y-1.5 pt-1 border-t">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">mechanics</p>
          {mech.checks.map((c) => (
            <div key={c.key} className="flex items-start gap-2 text-xs">
              {sevIcon(c.severity)}
              <span className="text-muted-foreground"><span className="text-foreground/80">{c.label}:</span> {c.detail}</span>
            </div>
          ))}
        </div>
      </PanelBody>
    </Panel>
  );
};
