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

/**
 * An explicit opt-in, which beats every check below it.
 *
 * The file rules are deliberately strict, and strict rules are wrong sometimes.
 * This is the one-label answer for a change that is real news from a path the
 * rules call quiet, and it is why being strict is safe.
 */
const ANNOUNCE_LABELS = new Set(["changelog", "announce", "user-facing", "customer-facing"]);

const SILENT_TITLE_HINTS = [
  /^bump /i,
  /^update (dependencies|deps|lockfile|snapshot)/i,
  /dependabot/i,
  /^merge branch/i,
  /^merge pull request/i,
  /changelog/i,
];

/**
 * Which surface a changed file belongs to.
 *
 * The title rules above used to be the whole gate, and against this repository
 * they catch almost nothing: the conventional-commit vocabulary they match is
 * one nobody here has ever typed. Of the thirty merges before this was written,
 * twenty-eight reached the model — among them a skills bundle, a prerender
 * script, a seed-inbox verifier and a byte count in a diagnostic message, none
 * of which a customer could observe if they went looking.
 *
 * A title is a claim about a change. The files are the change. So the decision
 * is made from the file list, in three kinds:
 *
 *   product  — the app behind the login, and the functions and data that run
 *              it. The only kind worth announcing.
 *   site     — the public marketing site, the blog, the legal pages. Real work,
 *              but a customer who already signed up did not open What's New to
 *              read that a comparison page exists.
 *   internal — tests, scripts, CI, docs, config, generated types, the skills
 *              bundle, the admin panel, and this changelog machinery itself.
 */
export type ChangedSurface = "product" | "site" | "internal";

/**
 * Checked first, so a test beside a product file is still a test and the admin
 * panel is still internal however it is nested.
 */
const INTERNAL_PATHS: RegExp[] = [
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  /^src\/test\//,
  /^(scripts|docs|drizzle|domain-connect-templates)\//,
  /^\.(github|claude|agents|husky|vscode)\//,
  /\.md$/i,
  /^src\/(entry-server|main|App)\.tsx$/,
  /^src\/App\.css$/,
  /^src\/integrations\/supabase\/types\.ts$/,
  // The router is plumbing: the change a customer notices arrives in the page or
  // component being routed to, and that file is judged on its own. A redirect
  // with nothing behind it is the rare case the announce label exists for.

  /^src\/(components|pages)\/admin\//,
  /^src\/pages\/Admin\.tsx$/,
  /^src\/lib\/changelog/,
  /^supabase\/functions\/(draft-changelog\/|_shared\/changelog-)/,
  /^supabase\/config\.toml$/,
  /^(package|package-lock|components|deno|skills-lock)\.json$/,
  /^bun\.lock/,
  /^tsconfig[^/]*$/,
  /\.tsbuildinfo$/,
  /^[^/]*\.config\.[cm]?[jt]s$/,
  /^(netlify\.toml|vite-plugin-seo-routes\.ts)$/,
  /^[^/]*\.sql$/,
  /^\.[^/]*$/,
  /^(\.lovable|supabase\/\.temp)\//,
  /\.d\.ts$/,
];

/**
 * Checked before the site rules, for the handful of files that live in a public
 * folder but are the product: the installed app, and the service worker that
 * delivers a notification to a customer's phone.
 */
const PRODUCT_PATHS: RegExp[] = [
  /^public\/(service-worker|sw|push-sw|firebase-messaging-sw)\.js$/,
  /^public\/manifest\.webmanifest$/,
];

/**
 * The pages behind a login, by component name.
 *
 * Listed rather than inferred because the edge function cannot read the router,
 * and listed as the positive case because a page that is not one of these is a
 * public page. That is the safe direction for a list that will go stale: a new
 * marketing page is quiet by default, and a new page inside the product fails
 * the test that checks this set against the routes in App.tsx until it is added.
 */
const PRODUCT_PAGES = new Set([
  "Accounts",
  "Agent",
  "AgentChat",
  "Analytics",
  "Auth",
  "Calendar",
  "Checkout",
  "ClientPortal",
  "Coach",
  "Confirmation",
  "Connect",
  "Dashboard",
  "DashboardIntegrations",
  "Deliverability",
  "HelpCenter",
  "ICP",
  "Inbox",
  "Install",
  "Leads",
  "LiveCoaching",
  "MessageBlocks",
  "OAuthConsent",
  "Onboarding",
  "OnboardingStatus",
  "Outreach",
  "Pipeline",
  "Playbooks",
  "SavedLeads",
  "SequenceDetail",
  "Sequences",
  "Settings",
  "WhatsNew",
]);

const SITE_PATHS: RegExp[] = [
  /^src\/components\/(landing|seo)\//,
  /^src\/lib\/(related-posts|blog|seo|sitemap)/,
  /^src\/components\/(Navbar|Footer|NavLink|Pricing)\.tsx$/,
  /^src\/data\/(blog|competitors)/,
  /^public\//,
  /^index\.html$/,
];

export function classifyPath(path: string): ChangedSurface {
  const file = String(path ?? "").trim().replace(/^\.\//, "");
  if (!file) return "internal";

  for (const pattern of INTERNAL_PATHS) {
    if (pattern.test(file)) return "internal";
  }

  const page = file.match(/^src\/pages\/([^/]+)\.tsx$/);
  if (page) return PRODUCT_PAGES.has(page[1]) ? "product" : "site";

  for (const pattern of PRODUCT_PATHS) {
    if (pattern.test(file)) return "product";
  }
  for (const pattern of SITE_PATHS) {
    if (pattern.test(file)) return "site";
  }

  // Everything left is the product: the dashboard components, the hooks and
  // libraries behind them, the edge functions, the schema, the workers.
  return "product";
}

export interface AnnounceVerdict {
  announce: boolean;
  reason?: string;
  /** The changed files a customer could actually notice, for the model to write about. */
  product: string[];
}

export function isWorthAnnouncing(pr: {
  title: string;
  body?: string;
  labels?: string[];
  files?: string[];
  /**
   * False when the file list was cut short. Absence of a product file then
   * proves nothing, so the merge is announced rather than silently dropped.
   */
  filesComplete?: boolean;
}): AnnounceVerdict {
  const title = String(pr.title ?? "").trim();
  const files = (pr.files ?? []).map((f) => String(f).trim()).filter(Boolean);
  const product = files.filter((f) => classifyPath(f) === "product");

  if (!title) return { announce: false, reason: "no title", product };

  const labels = (pr.labels ?? []).map((l) => String(l).toLowerCase().trim());
  for (const label of labels) {
    if (SILENT_LABELS.has(label)) {
      return { announce: false, reason: `labelled ${label}`, product };
    }
  }
  if (labels.some((l) => ANNOUNCE_LABELS.has(l))) {
    return { announce: true, product };
  }

  if (SILENT_PREFIXES.test(title)) {
    return { announce: false, reason: "conventional-commit type that customers never see", product };
  }
  for (const hint of SILENT_TITLE_HINTS) {
    if (hint.test(title)) return { announce: false, reason: "housekeeping", product };
  }

  if (product.length > 0) return { announce: true, product };
  // No file list means nothing to judge on — the same answer as before this
  // check existed, so an older workflow or a failed API call still drafts.
  if (files.length === 0) return { announce: true, product };
  if (pr.filesComplete === false) return { announce: true, product };

  const kinds = [...new Set(files.map(classifyPath))].sort();
  return {
    announce: false,
    reason: `nothing a customer uses changed (${kinds.join(" and ")} only)`,
    product,
  };
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

7. If the pull request only changes tests, internal structure, or developer tooling, return {"items": []}. When you are given a list of customer-facing files, that list is your evidence: write about what those files changed and nothing else.

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
