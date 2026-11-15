// Whether a visitor rule may run. Caps and dedupe live here so the worker
// cannot "just this once" skip them. Sending is not an action: enrollment is
// written paused, and drafts go through generate-email.

export const VISITOR_ACTIONS = ["find_contacts", "enrich", "research", "score", "draft", "enroll"] as const;
export type VisitorAction = (typeof VISITOR_ACTIONS)[number];

/** Hard ceiling, even if a rule asks for more. */
export const RULE_DAILY_CAP_MAX = 25;
export const WORKSPACE_DAILY_CAP = 25;
export const CONTACTS_PER_RUN = 3;

export interface RuleShape {
  enabled: boolean;
  minConfidence: number;
  pageTypes: string[];
  eventNames: string[];
  actions: string[];
  dailyCap: number;
  sequenceId: string | null;
}

export interface MatchShape {
  status: "matched" | "unknown";
  confidence: number | null;
  pageTypes: string[];
  eventNames: string[];
}

export interface RulePlan {
  run: boolean;
  reason: string;
  actions: VisitorAction[];
}

export function clampDailyCap(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(Math.round(value), RULE_DAILY_CAP_MAX));
}

export function allowedActions(actions: string[], sequenceId: string | null): VisitorAction[] {
  const out: VisitorAction[] = [];
  for (const action of actions) {
    if (action === "send") continue;
    if (!VISITOR_ACTIONS.includes(action as VisitorAction)) continue;
    if (action === "enroll" && !sequenceId) continue;
    if (!out.includes(action as VisitorAction)) out.push(action as VisitorAction);
  }
  return out;
}

export function planRuleRun(input: {
  rule: RuleShape;
  match: MatchShape;
  runsTodayForRule: number;
  runsTodayForWorkspace: number;
  alreadyRan: boolean;
}): RulePlan {
  const actions = allowedActions(input.rule.actions, input.rule.sequenceId);
  if (!input.rule.enabled) return { run: false, reason: "Rule is off.", actions: [] };
  if (input.alreadyRan) return { run: false, reason: "This company visit already ran this rule.", actions: [] };
  if (input.match.status !== "matched" || input.match.confidence == null) {
    return { run: false, reason: "The visitor is Unknown, so the rule did not run.", actions: [] };
  }
  if (input.match.confidence < input.rule.minConfidence) {
    return {
      run: false,
      reason: `Confidence ${input.match.confidence} is below the rule minimum ${input.rule.minConfidence}.`,
      actions: [],
    };
  }
  if (input.rule.pageTypes.length && !input.rule.pageTypes.some((type) => input.match.pageTypes.includes(type))) {
    return { run: false, reason: "None of the visited pages match this rule.", actions: [] };
  }
  if (input.rule.eventNames.length && !input.rule.eventNames.some((name) => input.match.eventNames.includes(name))) {
    return { run: false, reason: "None of the events match this rule.", actions: [] };
  }
  if (!actions.length) return { run: false, reason: "The rule has no allowed actions.", actions: [] };
  const cap = clampDailyCap(input.rule.dailyCap);
  if (input.runsTodayForRule >= cap) return { run: false, reason: `Rule daily cap of ${cap} is reached.`, actions: [] };
  if (input.runsTodayForWorkspace >= WORKSPACE_DAILY_CAP) {
    return { run: false, reason: `Workspace daily cap of ${WORKSPACE_DAILY_CAP} is reached.`, actions: [] };
  }
  return { run: true, reason: "Matched.", actions };
}
