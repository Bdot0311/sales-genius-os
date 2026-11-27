import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { sequenceContextPrompt } from "../../supabase/functions/_shared/sequence-context.ts";

const code = (path: string) =>
  readFileSync(path, "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");

const MIGRATION = "supabase/migrations/20261127050000_sequence_remembers_its_brief.sql";
const sql = readFileSync(MIGRATION, "utf8");
const BUILDER = code("src/components/sequences/AiSequenceBuilder.tsx");
const SEND = code("supabase/functions/process-sequence-step/index.ts");
const PREVIEW = code("supabase/functions/generate-sequence/index.ts");

/**
 * A campaign brief carries forbidden_claims: what this account must never
 * say, in any wording. The builder took a briefId, generated with it, and
 * then dropped it -- so by send time nothing recorded which brief a sequence
 * was written from, and every forbidden claim was a rule the preview honoured
 * and the email never saw.
 */
describe("a sequence remembers the brief it was written from", () => {
  it("adds the column nullable, and keeps the sequence when the brief goes", () => {
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS brief_id uuid");
    // A sequence outlives the brief; losing one must not delete the other.
    expect(sql).toContain("ON DELETE SET NULL");
    /*
     * Scoped to the ADD COLUMN statement. A bare /NOT NULL/ over the whole
     * file matched the index's own `WHERE brief_id IS NOT NULL` predicate,
     * which is correct and has nothing to do with the column's nullability.
     */
    const addColumn = sql.slice(sql.indexOf("ALTER TABLE public.email_sequences"), sql.indexOf(";", sql.indexOf("ADD COLUMN")));
    expect(addColumn).not.toMatch(/NOT NULL/);
  });

  it("is mirrored into the drizzle stream and the schema contract", () => {
    const drizzle = readFileSync("drizzle/migrations/0086_sequence_remembers_its_brief.sql", "utf8");
    expect(drizzle).toContain("ADD COLUMN IF NOT EXISTS brief_id uuid");
    expect(sql).toContain("INSERT INTO public.schema_contract");
  });

  it("stores the link without risking the save before the migration lands", () => {
    /*
     * The migration ships on a Lovable publish; this bundle ships on merge.
     * Between the two the column does not exist. As part of the insert that
     * would fail the whole save -- as a separate best-effort update it leaves
     * brief_id null, which is exactly today's behaviour.
     */
    expect(BUILDER).toContain('.update({ brief_id: briefId } as never)');
    /*
     * Sliced forward from the insert. The first version measured from
     * `.from("email_sequences")` to `.select("id")`, and `.select("id")`
     * occurs earlier in the file than the insert does -- so the slice was
     * empty and the assertion passed with brief_id added to the insert.
     */
    const insertAt = BUILDER.indexOf('.from("email_sequences")');
    expect(insertAt).toBeGreaterThan(-1);
    const insertBlock = BUILDER.slice(insertAt, BUILDER.indexOf(".single()", insertAt));
    expect(insertBlock.length, "slice must not be empty").toBeGreaterThan(50);
    expect(insertBlock, "brief_id must not be part of the insert").not.toContain("brief_id");
  });
});

describe("the forbidden claims reach the email that sends", () => {
  it("is read from the brief the sequence points at", () => {
    expect(SEND).toContain("brief_id");
    expect(SEND).toContain('.from("campaign_briefs")');
    expect(SEND).toContain('.select("forbidden_claims")');
    expect(SEND).toContain("forbiddenClaims,");
  });

  it("scopes the brief to the enrolment's owner, not just its id", () => {
    // A sequence pointing at another account's brief must not import its rules.
    const read = SEND.slice(SEND.indexOf('.from("campaign_briefs")'));
    const call = read.slice(0, read.indexOf("maybeSingle"));
    expect(call).toContain('.eq("user_id", enrollment.user_id)');
  });

  it("does not name the new column in a select list", () => {
    /*
     * check-schema-refs compares every selected column against the generated
     * types, which will not carry brief_id until they are regenerated from
     * the published database. The enrolment query already selects
     * email_sequences(*), so the column arrives without being named.
     */
    expect(SEND).toContain("sequence:email_sequences(*)");
    expect(SEND).not.toContain('.select("brief_id');
    expect(SEND).not.toMatch(/select\([`'"][^`'"]*\bbrief_id\b/);
  });

  it("survives a sequence with no brief", () => {
    expect(SEND).toContain("Promise.resolve({ data: null })");
    expect(SEND).toContain("Array.isArray(");
  });

  it("holds the preview and the send to the same list", () => {
    // The preview withheld these while the sender could not read them.
    expect(PREVIEW).toContain("forbiddenClaims,");
    expect(PREVIEW).toContain("brief?.forbidden_claims");
    expect(SEND).toContain("forbiddenClaims,");
  });

  it("turns them into hard bans in the prompt", () => {
    const prompt = sequenceContextPrompt({ forbiddenClaims: ["We guarantee a 3x return"] });
    expect(prompt).toContain("FORBIDDEN CLAIMS");
    expect(prompt).toContain("We guarantee a 3x return");
  });
});
