import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import {
  DRAFT_SYSTEM_PROMPT,
  classifyPath,
  isWorthAnnouncing,
  mergeItems,
  parseDraft,
  saidNothingToAnnounce,
  type DraftItem,
} from "../../supabase/functions/_shared/changelog-draft";

const MIGRATION = readFileSync("supabase/migrations/20260914235000_changelog_entries.sql", "utf8");
const FN = readFileSync("supabase/functions/draft-changelog/index.ts", "utf8");
const WORKFLOW = readFileSync(".github/workflows/changelog-draft.yml", "utf8");
const AUTH = readFileSync("supabase/functions/_shared/changelog-auth.ts", "utf8");
const HOOK = readFileSync("src/hooks/use-changelog.tsx", "utf8");
const ADMIN = readFileSync("src/components/admin/ChangelogTab.tsx", "utf8");
const APP = readFileSync("src/App.tsx", "utf8");

/**
 * Merged pull requests draft their own changelog entry; an admin publishes it.
 *
 * Generating entries straight from PRs with nothing in between is what produced
 * the version this replaces — four entries dated the same day because four
 * branches landed, titles joining unrelated fixes with "and", and a page that
 * was almost entirely bug fixes. The gate is the feature.
 */
describe("not every merge is news", () => {
  it("excludes SMTP probes from customer updates", () => {
    expect(isWorthAnnouncing({ title: "SMTP probe now runs from System Health", files: ["supabase/functions/smtp-probe/index.ts", "src/pages/admin/SystemHealth.tsx"], filesComplete: true }).announce).toBe(false);
  });
  it("excludes security monitoring from customer updates", () => {
    expect(isWorthAnnouncing({ title: "Security monitors now actually run", files: ["supabase/functions/security-monitor/index.ts"], filesComplete: true }).announce).toBe(false);
  });
  it("skips the conventional-commit types customers never see", () => {
    for (const title of ["chore: bump deps", "ci(actions)!: retry", "test: add coverage", "refactor: extract helper"]) {
      expect(isWorthAnnouncing({ title }).announce, title).toBe(false);
    }
  });

  it("anchors the prefix instead of matching the word anywhere", () => {
    // "Fix the chore list export" is a real change to a real feature.
    expect(isWorthAnnouncing({ title: "Fix the chore list export" }).announce).toBe(true);
    expect(isWorthAnnouncing({ title: "Add build-your-own sequences" }).announce).toBe(true);
  });

  it("skips housekeeping and honours an explicit opt-out", () => {
    expect(isWorthAnnouncing({ title: "Bump vite from 5 to 6" }).announce).toBe(false);
    expect(isWorthAnnouncing({ title: "Merge pull request #12 from x" }).announce).toBe(false);
    expect(isWorthAnnouncing({ title: "A real feature", labels: ["no-changelog"] }).announce).toBe(false);
  });

  it("lets real work through", () => {
    expect(isWorthAnnouncing({ title: "Follow-ups send after the first step" }).announce).toBe(true);
  });
});

/**
 * What the gate is judged on.
 *
 * The title rules below were the whole gate for a while, and against this
 * repository they caught almost nothing: nobody here has ever typed a
 * conventional-commit prefix. Of the thirty merges before this was written,
 * twenty-eight reached the model — a skills bundle, a prerender script, a
 * seed-inbox verifier. These are those merges, by the files they changed.
 */
describe("the file list decides, not the title", () => {
  it("calls tests, tooling, CI, docs and generated files internal", () => {
    for (const path of [
      "src/lib/lead-filters.test.ts",
      "supabase/functions/_shared/claim-check.spec.ts",
      "src/test/setup.ts",
      "scripts/prerender.mjs",
      ".github/workflows/changelog-draft.yml",
      ".agents/skills/list-building/SKILL.md",
      ".claude/skills/cold-email/SKILL.md",
      "docs/architecture.md",
      "README.md",
      "src/integrations/supabase/types.ts",
      "src/entry-server.tsx",
      "src/App.tsx",
      "package.json",
      "tsconfig.app.tsbuildinfo",
      "vite.config.ts",
      "tailwind.config.ts",
      ".env.example",
      "src/vite-env.d.ts",
    ]) {
      expect(classifyPath(path), path).toBe("internal");
    }
  });

  it("calls the admin panel and this changelog machinery internal", () => {
    // Brandon is the only admin, and an entry about the screen he publishes
    // from is an entry about the act of publishing it.
    expect(classifyPath("src/components/admin/ChangelogTab.tsx")).toBe("internal");
    expect(classifyPath("src/pages/admin/Settings.tsx")).toBe("internal");
    expect(classifyPath("src/pages/Admin.tsx")).toBe("internal");
    expect(classifyPath("src/lib/changelog.ts")).toBe("internal");
    expect(classifyPath("supabase/functions/draft-changelog/index.ts")).toBe("internal");
    expect(classifyPath("supabase/functions/_shared/changelog-draft.ts")).toBe("internal");
  });

  it("calls the public site site, not product", () => {
    // Real work, but a customer who already signed up did not open What's New
    // to read that a comparison page exists.
    for (const path of [
      "src/pages/VsApollo.tsx",
      "src/pages/AlternativeTo.tsx",
      "src/pages/Blog.tsx",
      "src/pages/PricingPage.tsx",
      "src/data/competitors.ts",
      "src/data/blog-posts.ts",
      "src/components/landing/Hero.tsx",
      "src/components/seo/FAQSchema.tsx",
      "src/lib/related-posts.ts",
      "public/robots.txt",
      "index.html",
    ]) {
      expect(classifyPath(path), path).toBe("site");
    }
  });

  it("calls the app behind the login product", () => {
    for (const path of [
      "src/pages/Leads.tsx",
      "src/pages/Settings.tsx",
      "src/components/dashboard/AILeadCommand.tsx",
      "src/hooks/use-push.tsx",
      "src/lib/counted-as-sent.ts",
      "supabase/functions/send-email/index.ts",
      "supabase/functions/_shared/email-audit.ts",
      "supabase/migrations/20260916003000_sent_email_failure_reason.sql",
      "workers/dmarc-inbound/index.ts",
      "src/index.css",
    ]) {
      expect(classifyPath(path), path).toBe("product");
    }
  });

  it("counts the installed app and its notifications as product, not as public files", () => {
    // These sit in public/ beside the logos, and one of them is what puts a
    // notification on a phone.
    expect(classifyPath("public/push-sw.js")).toBe("product");
    expect(classifyPath("public/manifest.webmanifest")).toBe("product");
    expect(classifyPath("public/outreign-og.png")).toBe("site");
  });

  it("skips the merges that used to slip through", () => {
    const skips: [string, string[]][] = [
      ["Add signal-sourcer and list-building, and unhide symlinked skills", [
        ".agents/skills/list-building/SKILL.md",
        "scripts/build-skills.mjs",
        "src/lib/skills-bundle.test.ts",
      ]],
      ["Let a crawler read the money pages without running JavaScript", [
        "scripts/prerender.mjs",
        "src/entry-server.tsx",
        "src/lib/prerender-coverage.test.ts",
      ]],
      ["Add a way to prove the seed inbox is readable before trusting it", [
        "scripts/verify-seed-inbox.mjs",
      ]],
      ["Stop every blog post being a dead end", [
        "src/lib/related-posts.ts",
        "src/pages/BlogPost.tsx",
        "src/lib/related-posts.test.ts",
      ]],
    ];
    for (const [title, files] of skips) {
      const verdict = isWorthAnnouncing({ title, files, filesComplete: true });
      expect(verdict.announce, title).toBe(false);
      expect(verdict.reason, title).toMatch(/nothing a customer uses changed/);
    }
  });

  it("announces the merges that changed something a customer uses", () => {
    const verdict = isWorthAnnouncing({
      title: "A failed send is not a send",
      files: [
        "src/components/outreach/EmailPerformanceStats.tsx",
        "src/lib/counted-as-sent.ts",
        "src/pages/Analytics.tsx",
        "supabase/functions/send-email/index.ts",
        "src/lib/counted-as-sent.test.ts",
      ],
      filesComplete: true,
    });
    expect(verdict.announce).toBe(true);
    // The model is handed these and nothing else, so a merge with one product
    // file and nine internal ones is written up as the one.
    expect(verdict.product).not.toContain("src/lib/counted-as-sent.test.ts");
    expect(verdict.product).toContain("supabase/functions/send-email/index.ts");
  });

  it("drafts anyway when the file list proves nothing", () => {
    // No list at all is the answer an older workflow or a failed API call
    // gives, and a merge is not dropped over it.
    expect(isWorthAnnouncing({ title: "Follow-ups send after the first step" }).announce).toBe(true);
    expect(isWorthAnnouncing({ title: "A real change", files: [] }).announce).toBe(true);
    // A list cut short cannot show absence.
    expect(
      isWorthAnnouncing({ title: "A real change", files: ["scripts/x.mjs"], filesComplete: false }).announce,
    ).toBe(true);
  });

  it("takes a label as the last word, both ways", () => {
    const quiet = { title: "Ship the thing", files: ["src/pages/Leads.tsx"], filesComplete: true };
    expect(isWorthAnnouncing({ ...quiet, labels: ["no-changelog"] }).announce).toBe(false);
    const loud = { title: "chore: rename the plan", files: ["scripts/x.mjs"], filesComplete: true };
    expect(isWorthAnnouncing(loud).announce).toBe(false);
    expect(isWorthAnnouncing({ ...loud, labels: ["announce"] }).announce).toBe(true);
    expect(isWorthAnnouncing({ ...loud, labels: ["user-facing"] }).announce).toBe(true);
  });

  it("names why it went quiet, so the workflow log says it", () => {
    const verdict = isWorthAnnouncing({
      title: "Tidy the build",
      files: ["scripts/x.mjs", "src/pages/VsApollo.tsx"],
      filesComplete: true,
    });
    expect(verdict.reason).toBe("nothing a customer uses changed (internal and site only)");
  });
});

/**
 * The page list inside the gate cannot read the router, so this does.
 *
 * A page the router puts behind a login is product; anything else the router
 * serves is the public site. When a new page lands inside the product and the
 * gate has not been told about it, this fails — which is the right direction
 * for a list that will go stale, because the alternative is a new feature that
 * never gets announced.
 */
describe("the gate's idea of a page agrees with the router", () => {
  const SIGNED_IN = [
    "/dashboard",
    "/settings",
    "/integrations",
    "/onboarding",
    "/onboarding-status",
    "/checkout",
    "/auth",
    "/install",
    "/connect",
    "/help",
    "/confirmation",
    "/client-portal",
    "/.lovable",
  ];

  const routes = [...APP.matchAll(/<Route\s+path="([^"]+)"\s+element=\{([^}]*(?:\}[^}]*)*?)\}\s*\/>/g)]
    .map(([, path, element]) => {
      const names = [...element.matchAll(/<([A-Z][A-Za-z0-9]*)/g)].map((m) => m[1]);
      const page = names.filter((n) => n !== "MaintenanceGuard" && n !== "Navigate").pop();
      return { path, page };
    })
    .filter((r): r is { path: string; page: string } => Boolean(r.page));

  it("found the routes", () => {
    // If the regex stops matching, every assertion below passes vacuously.
    expect(routes.length).toBeGreaterThan(30);
    expect(routes.some((r) => r.page === "Leads")).toBe(true);
    expect(routes.some((r) => r.page === "VsApollo")).toBe(true);
  });

  it("classifies every routed page the way the router mounts it", () => {
    for (const { path, page } of routes) {
      if (path.startsWith("/admin")) continue;
      const file = `src/pages/${page}.tsx`;
      if (!existsSync(file)) continue;
      const expected = SIGNED_IN.some((p) => path === p || path.startsWith(`${p}/`)) ? "product" : "site";
      expect(classifyPath(file), `${path} -> ${file}`).toBe(expected);
    }
  });
});

describe("the model's output is not trusted as-is", () => {
  it("survives fencing and chatter", () => {
    const fenced = '```json\n{"title":"T","summary":"S","items":[{"tag":"fixed","title":"A","description":"d"}]}\n```';
    expect(parseDraft(fenced)?.items).toHaveLength(1);
    expect(parseDraft('Sure!\n{"title":"T","items":[{"tag":"new","title":"A"}]}')?.title).toBe("T");
  });

  it("returns null rather than a half-entry", () => {
    expect(parseDraft("no json here")).toBeNull();
    expect(parseDraft('{"title":"T","items":[]}')).toBeNull();
    expect(parseDraft('{"items":[{"tag":"new","title":"A"}]}')).toBeNull();
  });

  it("drops tags it does not recognise", () => {
    expect(parseDraft('{"title":"T","items":[{"tag":"wat","title":"A"},{"tag":"new","title":"B"}]}')?.items).toHaveLength(1);
  });

  it("refuses an href that is not an in-app path", () => {
    // The prompt says never invent one; this is what happens when it does.
    const off = parseDraft('{"title":"T","items":[{"tag":"new","title":"A","href":"https://evil.example"}]}');
    expect(off?.items[0].href).toBeUndefined();
    const on = parseDraft('{"title":"T","items":[{"tag":"new","title":"A","href":"/dashboard/leads"}]}');
    expect(on?.items[0].href).toBe("/dashboard/leads");
  });

  it("puts billing first whatever order the model used", () => {
    // Too important to depend on the model getting it right every time.
    const mixed = parseDraft('{"title":"T","items":[{"tag":"fixed","title":"A"},{"tag":"billing","title":"B"}]}');
    expect(mixed?.items[0].tag).toBe("billing");
  });
});

/**
 * Declining is not failing.
 *
 * Rule 7 tells the model to return no items for a change a customer cannot
 * observe. The first merge after the file gate shipped was exactly that case,
 * and the run reported `HTTP 502 {"error":"The model returned nothing usable"}`
 * with a warning telling whoever read it to write the entry by hand — for an
 * entry that should not exist. The model had done its job; the function could
 * not tell that apart from a response that was never JSON.
 */
describe("the model declining is reported as a skip, not a failure", () => {
  it("recognises an empty item list, however the model wrapped it", () => {
    expect(saidNothingToAnnounce('{"title":"","summary":"","items":[]}')).toBe(true);
    expect(saidNothingToAnnounce('```json\n{"items": []}\n```')).toBe(true);
    expect(saidNothingToAnnounce('Sure.\n{"title":"T","summary":"S","items":[]}')).toBe(true);
  });

  it("does not mistake a broken answer for a deliberate one", () => {
    // This is the branch that should still be a 502.
    expect(saidNothingToAnnounce("no json here")).toBe(false);
    expect(saidNothingToAnnounce("")).toBe(false);
    expect(saidNothingToAnnounce("{not json")).toBe(false);
    expect(saidNothingToAnnounce('{"title":"T"}')).toBe(false);
    expect(saidNothingToAnnounce('{"items":"none"}')).toBe(false);
  });

  it("never calls a usable draft a decline", () => {
    const real = '{"title":"T","summary":"S","items":[{"tag":"new","title":"A","description":"d"}]}';
    expect(saidNothingToAnnounce(real)).toBe(false);
    expect(parseDraft(real)?.items).toHaveLength(1);
  });

  it("the function answers 200 with a reason instead of 502", () => {
    expect(FN).toContain("if (saidNothingToAnnounce(raw))");
    expect(FN).toContain('reason: "the model found nothing a customer would notice"');
    // And the 502 is still there for the answer that really is unusable.
    expect(FN).toContain('return json({ error: "The model returned nothing usable" }, 502);');
    expect(FN.indexOf("saidNothingToAnnounce(raw)")).toBeLessThan(
      FN.indexOf('"The model returned nothing usable"'),
    );
  });
});

describe("a second merge on the same day amends the first", () => {
  const existing: DraftItem[] = [{ tag: "fixed", title: "Follow ups send", description: "short" }];
  const incoming: DraftItem[] = [
    { tag: "fixed", title: "Follow-ups  send!", description: "a much longer explanation" },
    { tag: "new", title: "New thing", description: "x" },
  ];

  it("does not say the same change twice", () => {
    expect(mergeItems(existing, incoming)).toHaveLength(2);
  });

  it("keeps the fuller description", () => {
    const merged = mergeItems(existing, incoming);
    expect(merged.find((i) => /follow/i.test(i.title))?.description).toBe("a much longer explanation");
  });

  it("still leads with billing", () => {
    const merged = mergeItems([{ tag: "fixed", title: "A", description: "" }], [{ tag: "billing", title: "B", description: "" }]);
    expect(merged[0].tag).toBe("billing");
  });

  it("the entry is keyed by day in the database", () => {
    // Without this, four merges on Tuesday are four entries again.
    expect(MIGRATION).toContain("create unique index if not exists changelog_entries_date_idx");
    expect(MIGRATION).toContain("on public.changelog_entries (entry_date)");
  });
});

describe("the prompt states the rules the old one lacked", () => {
  it("billing outranks everything", () => {
    expect(DRAFT_SYSTEM_PROMPT).toMatch(/BILLING FIRST/);
    expect(DRAFT_SYSTEM_PROMPT).toMatch(/outranks every other rule/);
    expect(DRAFT_SYSTEM_PROMPT).toMatch(/Never soften a charge/);
  });

  it("bans the sentence that could describe anything", () => {
    expect(DRAFT_SYSTEM_PROMPT).toMatch(/could describe any feature/);
  });

  it("caps title length and bans joining two changes", () => {
    expect(DRAFT_SYSTEM_PROMPT).toMatch(/Titles name ONE thing/);
    expect(DRAFT_SYSTEM_PROMPT).toMatch(/Never join two changes with "and"/);
  });
});

describe("nothing reaches a customer unreviewed", () => {
  it("the function only ever writes a draft", () => {
    expect(FN).toContain('status: "draft"');
    expect(FN).not.toMatch(/status:\s*["']published["']/);
  });

  it("it refuses to amend an entry that is already live", () => {
    expect(FN).toContain('existing.status === "published"');
  });

  it("uses a key scoped to this function, not the shared internal secret", () => {
    // The caller is a GitHub Actions workflow, so the credential lives in a
    // repository secret — readable by every workflow and usable by anyone with
    // write access. INTERNAL_TRIGGER_SECRET authorises sixteen functions,
    // among them the ones that send mail to customers.
    expect(FN).toContain("requireChangelogCaller(req)");
    expect(FN).not.toContain("requireServiceRole");
    expect(AUTH).toContain('Deno.env.get("CHANGELOG_DRAFT_SECRET")');
    // Matched on reading the variable rather than on the name appearing: the
    // comment above it names the shared secret to explain why this is not it,
    // and an assertion that forbids the word forbids the explanation too.
    expect(AUTH).not.toContain('Deno.env.get("INTERNAL_TRIGGER_SECRET")');
  });

  it("an unset secret does not accept an empty bearer", () => {
    expect(AUTH).toContain("if (!a || !b || a.length !== b.length) return false;");
  });

  it("compares the token in constant time", () => {
    expect(AUTH).toContain("diff |= a.charCodeAt(i) ^ b.charCodeAt(i)");
  });

  it("drafts are invisible to customers", () => {
    expect(MIGRATION).toContain("using (status = 'published')");
  });

  it("only admins write", () => {
    expect(MIGRATION).toContain(`create policy "admins write changelog entries"`);
    expect(MIGRATION).toMatch(/for all\s*\n\s*using \(public\.has_role\(auth\.uid\(\), 'admin'::app_role\)\)/);
  });
});

describe("the migration can be applied twice", () => {
  it("guards the publication membership", () => {
    // `alter publication ... add table` errors on a table already in it, and
    // applied migrations get re-run here.
    expect(MIGRATION).toContain("from pg_publication_tables");
    expect(MIGRATION).not.toMatch(/^alter publication supabase_realtime add table/m);
  });

  it("guards every object it creates", () => {
    expect(MIGRATION).toContain("create table if not exists public.changelog_entries");
    expect(MIGRATION).toContain("drop policy if exists");
    expect(MIGRATION).toContain("drop trigger if exists");
  });
});

describe("the workflow", () => {
  it("only fires on a merge, not on every close", () => {
    // `closed` fires for abandoned PRs too.
    expect(WORKFLOW).toContain("github.event.pull_request.merged == true");
  });

  it("does not interpolate a PR body into a shell-built JSON string", () => {
    // A PR body is arbitrary text.
    expect(WORKFLOW).toContain("jq -n");
    expect(WORKFLOW).toContain("--arg pr_body");
    expect(WORKFLOW).toContain("--data-binary @payload.json");
  });

  it("never fails the merge over a failed draft", () => {
    expect(WORKFLOW).toContain("::warning::");
    expect(WORKFLOW).toContain('if [ -z "$FUNCTIONS_URL" ]');
  });

  it("asks which files the merge touched, and passes them on", () => {
    expect(WORKFLOW).toContain("pull-requests: read");
    expect(WORKFLOW).toContain("/files?per_page=100&page=$page");
    expect(WORKFLOW).toContain("--argjson files ");
    expect(WORKFLOW).toContain("--argjson files_complete ");
    expect(FN).toContain("Array.isArray(body.files)");
    expect(FN).toContain("body.files_complete !== false");
    expect(FN).toMatch(/isWorthAnnouncing\(\{[^}]*files,[^}]*filesComplete[^}]*\}\)/);
  });

  it("says the list is incomplete rather than claiming nothing was found", () => {
    // Absence of a product file in a truncated list is not absence, and a
    // long merge must not disappear because page four was never asked for.
    expect(WORKFLOW).toContain("complete=true");
    expect(WORKFLOW).toMatch(/complete=false\n\s*for page in/);
  });
});

describe("the customer page survives the gaps", () => {
  it("falls back to the checked-in file", () => {
    // This ships before the migration is applied and before anything is
    // published; a blank page in either window is worse than yesterday's truth.
    expect(HOOK).toContain("CHANGELOG");
    expect(HOOK).toContain("usingFallback");
    expect(HOOK).toContain("rows.length > 0");
  });

  it("publishing reaches open tabs", () => {
    expect(HOOK).toContain('table: "changelog_entries"');
    expect(HOOK).toContain("removeChannel");
  });
});

describe("the admin screen", () => {
  it("makes publishing the obvious action", () => {
    expect(ADMIN).toContain("Publish");
    expect(ADMIN).toContain("Waiting to publish");
  });

  it("marks a billing item as the one to read carefully", () => {
    expect(ADMIN).toContain('item.tag === "billing"');
    expect(ADMIN).toContain("should not have to infer a charge");
  });

  it("does not shout on a database that has not been migrated yet", () => {
    expect(ADMIN).toContain("console.warn");
  });
});
