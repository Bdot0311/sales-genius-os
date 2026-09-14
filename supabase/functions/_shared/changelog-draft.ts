/**
 * Turning a merged pull request into something a customer would read.
 *
 * The rules live here rather than inline in the function because they are the
 * whole difference between this and what it replaces. The previous changelog
 * was generated from merged PRs with no editorial constraint, and it showed:
 * four entries dated the same day because four branches landed, titles joining
 * two unrelated fixes with "and" because they shipped together, and
 * twenty-four of twenty-five items tagged fixed or improved — which is what a
 * week of engineering looks like from the inside, and tells a customer the
 * product keeps breaking.
 */

export type DraftTag = "new" | "improved" | "fixed" | "billing";

export interface DraftItem {
  tag: DraftTag;
  title: string;
  description: string;
  href?: string;
}

export interface Draft {
  title: string;
  summary: string;
  items: DraftItem[];
}

const TAGS: DraftTag[] = ["new", "improved", "fixed", "billing"];

/**
 * Merges that are invisible to a customer.
 *
 * An entry about a dependency bump is worse than no entry: it fills the page a
 * customer checks for news with things that are not news. Matched on the
 * conventional-commit prefix rather than anywhere in the title, so "Fix the
 * chore list export" is not skipped for containing the word chore.
 */
const SILENT_PREFIXES = /^(chore|ci|build|test|refactor|style|docs|revert)(\([^)]*\))?!?:/i;

/** An explicit opt-out, for the cases the heuristics get wrong. */
const SILENT_LABELS = new Set(["no-changelog", "skip-changelog", "internal"]);

const SILENT_TITLE_HINTS = [
  /^bump /i,
  /^update (dependencies|deps|lockfile|snapshot)/i,
  /dependabot/i,
  /^merge branch/i,
  /^merge pull request/i,
  /changelog/i,
];

export function isWorthAnnouncing(pr: { title: string; body?: string; labels?: string[] }): {
  announce: boolean;
  reason?: string;
} {
  const title = String(pr.title ?? "").trim();
  if (!title) return { announce: false, reason: "no title" };

  for (const label of pr.labels ?? []) {
    if (SILENT_LABELS.has(String(label).toLowerCase())) {
      return { announce: false, reason: `labelled ${label}` };
    }
  }
  if (SILENT_PREFIXES.test(title)) {
    return { announce: false, reason: "conventional-commit type that customers never see" };
  }
  for (const hint of SILENT_TITLE_HINTS) {
    if (hint.test(title)) return { announce: false, reason: "housekeeping" };
  }
  return { announce: true };
}

/**
 * What the model is told.
 *
 * Written as constraints rather than encouragement, because the failure mode is
 * not a bad writer — it is a good writer describing the wrong thing. Every rule
 * here corresponds to something the previous version actually did.
 */
export const DRAFT_SYSTEM_PROMPT = `You write changelog entries for OutReign, a B2B outbound sales tool. Your reader is a customer using the product, not an engineer.

You are given one merged pull request. Return ONE JSON object and nothing else:

{"title": string, "summary": string, "items": [{"tag": "new"|"improved"|"fixed"|"billing", "title": string, "description": string, "href": string (optional)}]}

Rules, in order of importance:

1. BILLING FIRST. If the change alters what a customer is charged, what a credit buys, or what a plan includes, tag it "billing", make it the FIRST item, and say plainly what now costs something and what stays free. Never soften a charge into a description of a meter. This rule outranks every other rule here.

2. Write about what the customer can now do, or what changed about something they already use. Not about the code. "Follow-ups send" — not "fixed the sequence dispatch worker".

3. Titles name ONE thing. Under 9 words. Never join two changes with "and".

4. Descriptions are one or two sentences, concrete and specific. If a fix, say what was going wrong in terms the customer would have noticed. Never write a sentence that could describe any feature ("now shows the complete picture", "works as expected").

5. "href" must be a real in-app path starting /dashboard — one of: /dashboard, /dashboard/leads, /dashboard/leads/saved, /dashboard/accounts, /dashboard/pipeline, /dashboard/outreach, /dashboard/inbox, /dashboard/calendar, /dashboard/analytics, /dashboard/coach, /dashboard/deliverability, /dashboard/agent, /dashboard/icp, /dashboard/integrations, /dashboard/settings. Omit it if the change has no single obvious home. Never invent a path.

6. Tag honestly. "new" is something that did not exist. "improved" is something that got better. "fixed" is something that was broken. Do not inflate a fix into a feature.

7. If the pull request only changes tests, internal structure, or developer tooling, return {"items": []}.

8. British or American spelling, follow the PR. No exclamation marks. No "we're excited to". No emoji.

Return only the JSON object.`;

/** Pull the JSON object out of a model response that may be fenced or chatty. */
export function parseDraft(raw: string): Draft | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;

  const items = Array.isArray(obj.items) ? obj.items : [];
  const clean: DraftItem[] = [];
  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const it = entry as Record<string, unknown>;
    const tag = String(it.tag ?? "").toLowerCase() as DraftTag;
    const title = String(it.title ?? "").trim();
    if (!TAGS.includes(tag) || !title) continue;
    const href = typeof it.href === "string" && it.href.startsWith("/dashboard") ? it.href : undefined;
    clean.push({
      tag,
      title: title.slice(0, 120),
      description: String(it.description ?? "").trim().slice(0, 600),
      ...(href ? { href } : {}),
    });
  }

  // Billing leads, whatever order the model returned. The rule is too important
  // to leave to the model getting it right every time.
  clean.sort((a, b) => Number(b.tag === "billing") - Number(a.tag === "billing"));

  const title = String(obj.title ?? "").trim().slice(0, 120);
  if (!title || clean.length === 0) return null;

  return { title, summary: String(obj.summary ?? "").trim().slice(0, 600), items: clean };
}

/**
 * Fold a new draft's items into the day's existing ones.
 *
 * Two merges can describe the same customer-visible change — a fix and its
 * follow-up, or a feature split across branches — and the entry should say it
 * once. Matched on the title rather than on identity, because the same change
 * described twice is what a reader would call a duplicate.
 */
export function mergeItems(existing: DraftItem[], incoming: DraftItem[]): DraftItem[] {
  const seen = new Map<string, DraftItem>();
  const key = (i: DraftItem) => i.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  for (const item of Array.isArray(existing) ? existing : []) {
    if (item?.title) seen.set(key(item), item);
  }
  for (const item of incoming) {
    const k = key(item);
    const prior = seen.get(k);
    // The longer description usually carries more of the answer, and a later
    // merge often explains a change the first one only named.
    if (!prior || item.description.length > prior.description.length) seen.set(k, item);
  }

  return [...seen.values()].sort(
    (a, b) => Number(b.tag === "billing") - Number(a.tag === "billing"),
  );
}
