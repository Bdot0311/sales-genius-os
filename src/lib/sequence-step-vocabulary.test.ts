import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  STEP_TYPES,
  TRIGGER_CONDITIONS,
  isStepType,
  isTriggerCondition,
  stepTypeFor,
} from "../../supabase/functions/_shared/sequence-steps.ts";

/**
 * A customer could not add a step to a sequence. The insert answered
 *
 *   new row for relation "sequence_steps" violates check constraint
 *   "sequence_steps_step_type_check"
 *
 * and rolled back, leaving the sequence at 0 steps. It was not their data:
 * SequenceBuilder sent step_type "email", naming the CHANNEL, and the
 * constraint records the step's ROLE. Adding a step through the builder had
 * never worked for anyone.
 *
 * The reason nothing caught it is that the generated Supabase types declare
 * both constrained columns as plain `string`, so TypeScript endorsed every
 * spelling anyone invented. These tests are the type the database actually
 * has.
 */

const MIGRATION = readFileSync(
  "supabase/migrations/20260130212903_98e428a5-1cc6-43a8-a02d-e50c49d6bd68.sql",
  "utf8",
);
const WIDENED = readFileSync(
  "supabase/migrations/20260904180000_allow_custom_sequence_trigger.sql",
  "utf8",
);

describe("the vocabulary matches the constraint the database enforces", () => {
  it("lists exactly the step types the CHECK allows", () => {
    const declared = MIGRATION.match(/step_type text[^)]*CHECK \(step_type IN \(([^)]*)\)/)?.[1] ?? "";
    const fromSql = declared.split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean);
    expect([...STEP_TYPES].sort()).toEqual(fromSql.sort());
  });

  it("does not admit the channel name that caused the failure", () => {
    // Widening the constraint to accept "email" would have made the column
    // meaningless — this is an email-only product, so it distinguishes
    // nothing. The writers were wrong, not the constraint.
    expect(isStepType("email")).toBe(false);
    expect(WIDENED).toMatch(/step_type constraint is deliberately NOT widened/i);
  });

  it("accepts every value the sequence builder can produce", () => {
    const BUILDER = readFileSync("src/components/sequences/SequenceBuilder.tsx", "utf8");
    const block = BUILDER.slice(BUILDER.indexOf("const triggerConditions"), BUILDER.indexOf("const availableTriggers"));
    const offered = [...block.matchAll(/value:\s*'([a-z_]+)'/g)].map((m) => m[1]);
    expect(offered.length).toBeGreaterThan(0);
    for (const value of offered) expect(isTriggerCondition(value)).toBe(true);
  });

  it("the migration widens the trigger constraint to cover the custom tier", () => {
    // on_custom is offered to Custom-tier accounts and was in no migration, so
    // the option the plan was bought for could not be saved.
    expect(isTriggerCondition("on_custom")).toBe(true);
    expect(WIDENED).toContain("'on_custom'");
    expect(WIDENED).toContain("sequence_steps_trigger_condition_check");
  });

  it("keeps every previously valid trigger, so no stored row is invalidated", () => {
    const original = MIGRATION.match(/trigger_condition text[^)]*CHECK \(trigger_condition IN \(([^)]*)\)/)?.[1] ?? "";
    const fromSql = original.split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean);
    expect(fromSql.length).toBeGreaterThan(0);
    for (const value of fromSql) expect(isTriggerCondition(value)).toBe(true);
  });
});

describe("a step knows what it is by where it sits", () => {
  it("calls the first touch of a sequence the initial one", () => {
    expect(stepTypeFor(1)).toBe("initial");
  });

  it("calls everything after it a follow-up", () => {
    expect(stepTypeFor(2)).toBe("follow_up");
    expect(stepTypeFor(9)).toBe("follow_up");
  });

  it("does not fall off a zero or negative position", () => {
    expect(stepTypeFor(0)).toBe("initial");
    expect(stepTypeFor(-1)).toBe("initial");
  });
});

/**
 * The scan. Every literal any writer assigns to these two columns has to be a
 * value the database will take — checked against the source rather than
 * against a list someone remembered to update.
 */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("no writer can invent its own spelling again", () => {
  // agent_run_steps has its own unconstrained step_type column ("turn",
  // "tool_serial", ...). It is a different table and is not in scope here.
  const AGENT_RUN_STEP_TYPES = new Set(["turn", "tool_parallel", "tool_serial", "tool"]);

  const files = [
    ...sourceFiles("src"),
    ...sourceFiles("supabase/functions"),
  ];

  it("every step_type literal in the codebase is one the constraint allows", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/step_type:\s*["']([^"']+)["']/g)) {
        if (AGENT_RUN_STEP_TYPES.has(m[1])) continue;
        if (!isStepType(m[1])) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("every trigger_condition literal is one the constraint allows", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(/trigger_condition:\s*["']([^"']+)["']/g)) {
        if (!isTriggerCondition(m[1])) offenders.push(`${file}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

/**
 * scheduleFollowUps writes the sequence row first and the steps second. While
 * the step insert was failing, every call left an empty "AI SDR follow-ups —
 * ..." sequence behind and answered with a bare `false`.
 */
describe("a failed schedule does not leave debris", () => {
  const PLAYBOOK = readFileSync("supabase/functions/_shared/cold-email-playbook.ts", "utf8");

  it("removes the sequence it just created when the steps do not land", () => {
    const block = PLAYBOOK.slice(PLAYBOOK.indexOf("const { error: stepErr }"));
    expect(block.slice(0, 800)).toContain('.from("email_sequences").delete().eq("id", sequence.id)');
  });

  it("says why, instead of failing silently", () => {
    const block = PLAYBOOK.slice(PLAYBOOK.indexOf("const { error: stepErr }"));
    expect(block.slice(0, 800)).toContain("console.error");
  });

  it("marks its steps as follow-ups, which is what they are", () => {
    // touches[0] was already sent directly; followUps starts at touches[1].
    // stepTypeFor(i + 1) would call the first of them "initial", which is a
    // different question than the one this code is answering.
    expect(PLAYBOOK).toContain('step_type: "follow_up" satisfies StepType');
  });
});
