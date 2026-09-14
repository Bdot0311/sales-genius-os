import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DRAFT_SYSTEM_PROMPT,
  isWorthAnnouncing,
  mergeItems,
  parseDraft,
  type DraftItem,
} from "../../supabase/functions/_shared/changelog-draft";

const MIGRATION = readFileSync("supabase/migrations/20260914235000_changelog_entries.sql", "utf8");
const FN = readFileSync("supabase/functions/draft-changelog/index.ts", "utf8");
const WORKFLOW = readFileSync(".github/workflows/changelog-draft.yml", "utf8");
const HOOK = readFileSync("src/hooks/use-changelog.tsx", "utf8");
const ADMIN = readFileSync("src/components/admin/ChangelogTab.tsx", "utf8");

/**
 * Merged pull requests draft their own changelog entry; an admin publishes it.
 *
 * Generating entries straight from PRs with nothing in between is what produced
 * the version this replaces — four entries dated the same day because four
 * branches landed, titles joining unrelated fixes with "and", and a page that
 * was almost entirely bug fixes. The gate is the feature.
 */
describe("not every merge is news", () => {
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

  it("it is service-role only", () => {
    expect(FN).toContain("requireServiceRole(req)");
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
