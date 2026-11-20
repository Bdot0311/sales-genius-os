import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  LABEL_INSTRUCTIONS,
  LOW_CONFIDENCE,
  NON_HUMAN_LABELS,
  OUTCOME_LABELS,
  POSITIVE_LABELS,
  classifierVersion,
  isHumanReply,
  isOutcomeLabel,
  isPositiveLabel,
  labelFromEvidence,
  labelFromTriage,
  needsConfirmation,
  promptHash,
  resolveLabel,
} from "../../supabase/functions/_shared/reply-labels";
import { LABEL_COPY } from "./reply-label-display";

const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const MIGRATION = readFileSync("supabase/migrations/20261120100000_outcome_data_layer_labels.sql", "utf8");
const CLASSIFIER = code(readFileSync("supabase/functions/analyze-reply/index.ts", "utf8"));
const TOOLS = code(readFileSync("supabase/functions/_shared/agent-outbound-tools.ts", "utf8"));

describe("the label set", () => {
  it("has the eleven labels the build asked for", () => {
    expect([...OUTCOME_LABELS]).toEqual([
      "positive", "interested_later", "referral", "meeting_booked", "objection",
      "not_interested", "wrong_person", "out_of_office", "auto_reply",
      "unsubscribe_request", "other",
    ]);
  });

  it("is enforced by the database too, so an unknown label cannot be stored", () => {
    for (const label of OUTCOME_LABELS) expect(MIGRATION).toContain(`'${label}'`);
    expect(MIGRATION).toContain("reply_analysis_outcome_label_check");
  });

  it("reads on screen for every label, with none left unlabelled", () => {
    for (const label of OUTCOME_LABELS) expect(LABEL_COPY[label]?.label).toBeTruthy();
    expect(Object.keys(LABEL_COPY).sort()).toEqual([...OUTCOME_LABELS].sort());
  });

  it("rejects anything outside the set", () => {
    for (const bad of ["POSITIVE", "soft_no", "", null, undefined, 1]) expect(isOutcomeLabel(bad)).toBe(false);
  });
});

describe("what counts as a win", () => {
  it("counts a referral, because the email worked even though the person changed", () => {
    expect(isPositiveLabel("referral")).toBe(true);
    expect([...POSITIVE_LABELS]).toEqual(["positive", "interested_later", "referral", "meeting_booked"]);
  });

  it("does not count an objection or a no", () => {
    for (const l of ["objection", "not_interested", "wrong_person", "other"]) expect(isPositiveLabel(l)).toBe(false);
  });

  it("treats an away message as not a human reply, so it is neither a win nor a loss", () => {
    expect(isHumanReply("out_of_office")).toBe(false);
    expect(isHumanReply("auto_reply")).toBe(false);
    expect(isPositiveLabel("out_of_office")).toBe(false);
    expect([...NON_HUMAN_LABELS]).toEqual(["out_of_office", "auto_reply"]);
  });

  it("counts an unsubscribe as a human reply that is not a win", () => {
    expect(isHumanReply("unsubscribe_request")).toBe(true);
    expect(isPositiveLabel("unsubscribe_request")).toBe(false);
  });
});

describe("needsConfirmation", () => {
  it("asks about a label the classifier was unsure of", () => {
    expect(needsConfirmation({ label: "positive", confidence: 0.4, labeledBy: "claude" })).toBe(true);
    expect(needsConfirmation({ label: "positive", confidence: LOW_CONFIDENCE - 0.01, labeledBy: "claude" })).toBe(true);
  });

  it("does not ask about a confident one", () => {
    expect(needsConfirmation({ label: "positive", confidence: 0.95, labeledBy: "claude" })).toBe(false);
    expect(needsConfirmation({ label: "positive", confidence: LOW_CONFIDENCE, labeledBy: "claude" })).toBe(false);
  });

  it("treats a missing confidence as unsure, not as certain", () => {
    expect(needsConfirmation({ label: "positive", confidence: null, labeledBy: "claude" })).toBe(true);
  });

  it("never asks again once a person has decided", () => {
    for (const by of ["user", "agent"]) {
      expect(needsConfirmation({ label: "positive", confidence: 0.1, labeledBy: by })).toBe(false);
    }
  });
});

describe("resolveLabel: a person always beats the classifier", () => {
  it("prefers a correction over a confident classifier label", () => {
    expect(resolveLabel({
      classifier: { label: "not_interested", confidence: 0.99 },
      overrides: [{ label: "objection", objectionType: "budget", source: "user", createdAt: "2026-01-01T00:00:00Z" }],
    })).toEqual({ label: "objection", objectionType: "budget", labeledBy: "user", confidence: 1 });
  });

  it("takes the newest correction when there are several", () => {
    const r = resolveLabel({
      classifier: { label: "other", confidence: 0.5 },
      overrides: [
        { label: "objection", source: "user", createdAt: "2026-01-01T00:00:00Z" },
        { label: "meeting_booked", source: "user", createdAt: "2026-03-01T00:00:00Z" },
        { label: "not_interested", source: "user", createdAt: "2026-02-01T00:00:00Z" },
      ],
    });
    expect(r.label).toBe("meeting_booked");
  });

  it("distinguishes an agent's correction from a person's", () => {
    expect(resolveLabel({
      classifier: { label: "other", confidence: 0.2 },
      overrides: [{ label: "positive", source: "agent", createdAt: "2026-01-01T00:00:00Z" }],
    }).labeledBy).toBe("agent");
  });

  it("falls back to the classifier when there is no correction", () => {
    expect(resolveLabel({ classifier: { label: "positive", confidence: 0.8 }, overrides: [] })).toEqual({
      label: "positive", objectionType: null, labeledBy: "claude", confidence: 0.8,
    });
  });

  it("ignores a correction holding a label outside the set", () => {
    const r = resolveLabel({
      classifier: { label: "positive", confidence: 0.8 },
      overrides: [{ label: "nonsense", source: "user", createdAt: "2026-05-01T00:00:00Z" }],
    });
    expect(r.label).toBe("positive");
    expect(r.labeledBy).toBe("claude");
  });

  it("reports no label when the classifier produced none", () => {
    expect(resolveLabel({ classifier: { label: null, confidence: null } }).label).toBeNull();
  });
});

describe("the database resolves labels the same way the app does", () => {
  it("newest correction wins in the view too", () => {
    expect(MIGRATION).toContain("ORDER BY o.created_at DESC, o.id DESC");
    expect(MIGRATION).toContain("COALESCE(ovr.outcome_label, ra.outcome_label)");
  });
  it("reports a human label as certain rather than inheriting the classifier's doubt", () => {
    expect(MIGRATION).toContain("CASE WHEN ovr.id IS NULL THEN ra.label_confidence ELSE 1 END");
  });
  it("runs as the caller, so the view cannot leak another account's replies", () => {
    expect(MIGRATION).toContain("security_invoker = true");
  });
});

describe("corrections cannot be rewritten or forged", () => {
  it("are append-only, enforced by a trigger as well as by policy", () => {
    expect(MIGRATION).toContain("BEFORE UPDATE OR DELETE ON public.reply_label_overrides");
    expect(MIGRATION).toContain("is append-only");
  });
  it("can only be written against an analysis row the account owns", () => {
    expect(MIGRATION).toContain("WHERE ra.id = reply_analysis_id AND ra.user_id = auth.uid()");
  });
  it("are readable only by their owner", () => {
    expect(MIGRATION).toMatch(/FOR SELECT USING \(auth\.uid\(\) = user_id\)/);
  });
});

describe("the classifier", () => {
  it("asks for the label, the objection type and its own confidence", () => {
    expect(CLASSIFIER).toContain("outcome_label");
    expect(CLASSIFIER).toContain("objection_type");
    expect(CLASSIFIER).toContain("label_confidence");
    expect(CLASSIFIER).toContain("LABEL_INSTRUCTIONS");
  });

  it("stores a version naming the model, so rows can be traced to what labelled them", () => {
    expect(CLASSIFIER).toContain("classifier_version: classifierVersion(CLASSIFIER_MODEL)");
    expect(CLASSIFIER).toContain("model: CLASSIFIER_MODEL");
  });

  it("leaves triage_category alone, because the agent's behaviour reads it", () => {
    // It lives in detected_signals and must keep its six legacy values.
    expect(CLASSIFIER).toContain("triage_category: analysis.triage_category || 'soft_no'");
  });

  it("lets header evidence override the model, and falls back to other on a bad label", () => {
    expect(CLASSIFIER).toContain("labelFromEvidence({ isAutoReply");
    expect(CLASSIFIER).toContain('isOutcomeLabel(analysis.outcome_label) ? analysis.outcome_label : "other"');
  });
});

describe("classifier version", () => {
  it("changes when the instructions change, without anyone bumping a number", () => {
    expect(promptHash(LABEL_INSTRUCTIONS)).not.toBe(promptHash(LABEL_INSTRUCTIONS + " "));
    expect(promptHash("a")).toBe(promptHash("a"));
    expect(promptHash(LABEL_INSTRUCTIONS)).toHaveLength(8);
  });
  it("names the model as well as the prompt", () => {
    expect(classifierVersion("gemini-x")).toBe(`gemini-x:${promptHash(LABEL_INSTRUCTIONS)}`);
  });
});

describe("labelFromEvidence", () => {
  it("does nothing when the headers prove nothing", () => {
    expect(labelFromEvidence({ isAutoReply: false, modelLabel: "positive" })).toBeNull();
  });
  it("calls an automated reply automated, whatever the model thought", () => {
    expect(labelFromEvidence({ isAutoReply: true, modelLabel: "positive" })).toBe("auto_reply");
  });
  it("keeps out_of_office, which is a more specific true statement", () => {
    expect(labelFromEvidence({ isAutoReply: true, modelLabel: "out_of_office" })).toBe("out_of_office");
  });
});

describe("labelFromTriage, for backfilling older replies", () => {
  it("maps the values that map cleanly", () => {
    expect(labelFromTriage("positive")).toBe("positive");
    expect(labelFromTriage("hard_no")).toBe("not_interested");
    expect(labelFromTriage("ooo")).toBe("out_of_office");
    expect(labelFromTriage("wrong_person")).toBe("wrong_person");
  });
  it("refuses to guess on soft_no, which covered two different outcomes", () => {
    expect(labelFromTriage("soft_no")).toBe("other");
  });
  it("is other for anything unrecognised", () => {
    for (const v of ["", null, undefined, "nonsense"]) expect(labelFromTriage(v)).toBe("other");
  });
});

describe("the agent can read and correct labels, as the repo requires of every user action", () => {
  it("has both tools", () => {
    expect(TOOLS).toContain('fn("list_reply_labels"');
    expect(TOOLS).toContain('fn("set_reply_label"');
  });

  it("reads the resolved view, so the agent sees what the inbox shows", () => {
    expect(TOOLS).toContain('from("reply_labels_resolved")');
  });

  it("writes a correction as a new row, never an update", () => {
    expect(TOOLS).toContain('from("reply_label_overrides").insert(');
    expect(TOOLS).toContain('source: "agent"');
  });

  it("checks the analysis row belongs to the account before relabelling it", () => {
    const region = TOOLS.slice(TOOLS.indexOf('case "set_reply_label"'), TOOLS.indexOf('case "list_sending_accounts"'));
    expect(region).toContain('.eq("user_id", userId)');
    expect(region).toContain("No reply analysis with that id in this account");
  });

  it("rejects a label outside the set rather than storing it", () => {
    const region = TOOLS.slice(TOOLS.indexOf('case "set_reply_label"'), TOOLS.indexOf('case "list_sending_accounts"'));
    expect(region).toContain("isOutcomeLabel(args.label)");
  });
});

describe("the inbox chip", () => {
  const PAGE = code(readFileSync("src/pages/Inbox.tsx", "utf8"));

  it("writes a correction as a new override row", () => {
    expect(PAGE).toContain('from("reply_label_overrides").insert(');
    expect(PAGE).toContain('source: "user"');
  });

  it("reads the resolved view rather than the classifier's own column", () => {
    expect(PAGE).toContain('from("reply_labels_resolved")');
  });

  it("refreshes the labels after a correction, so the chip does not lie", () => {
    expect(PAGE).toContain('queryKey: ["inbox-reply-labels"]');
    expect(PAGE).toContain("invalidateQueries");
  });

  it("only offers the chip on inbound messages that have an analysis row", () => {
    expect(PAGE).toContain('m.direction === "in" && m.replyAnalysisId');
  });

  it("does not reuse the shared label list by copying it", () => {
    const display = readFileSync("src/lib/reply-label-display.ts", "utf8");
    expect(display).toContain("_shared/reply-labels");
    expect(display).toContain("OUTCOME_LABELS");
  });
});
