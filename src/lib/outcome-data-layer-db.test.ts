import { PG_BOOTSTRAP_SQL } from "./test-support/pg-bootstrap";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

/**
 * The outcome data layer against real postgres.
 *
 * The source-text guards in outcome-capture.test.ts and reply-labels.test.ts
 * prove the SQL *says* the right thing. They cannot prove postgres agrees:
 * that a trigger actually refuses an UPDATE, that a lateral join counts only
 * the signals that existed at send time, or that a snapshot really does survive
 * the lead being rescored, which is the entire reason phase 1 exists.
 *
 * Skipped silently without a database, as the other db-backed tests here are,
 * and required in the audit-db job where AUDIT_PG_REQUIRED is set.
 */
const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";
type Pg = ReturnType<typeof postgres>;

const CAPTURE = readFileSync("supabase/migrations/20261120090000_outcome_data_layer_capture.sql", "utf8");
const LABELS = readFileSync("supabase/migrations/20261120100000_outcome_data_layer_labels.sql", "utf8");

const USER = "99999999-9999-9999-9999-999999999999";
const OTHER = "88888888-8888-8888-8888-888888888888";
const LEAD = "11111111-1111-1111-1111-111111111111";
const SEND = "22222222-2222-2222-2222-222222222222";
const ANALYSIS = "33333333-3333-3333-3333-333333333333";

/*
 * Stand-ins for the columns these migrations read. The real tables are built by
 * 419 migrations that need Supabase extensions (pg_net and friends) a bare
 * postgres does not have, so replaying the whole history is not an option. What
 * matters here is the behaviour of the two migrations under test.
 */
const STANDINS = `
${PG_BOOTSTRAP_SQL}
CREATE TABLE leads (
  id uuid PRIMARY KEY, user_id uuid,
  fit_score numeric, intent_score numeric, signal_score numeric,
  seniority text, job_title text, department text,
  employee_count int, company_size text, industry text, country text,
  email_verification_status text, source text, tier text,
  signal_date timestamptz, signals jsonb, signal_layers jsonb,
  score_breakdown jsonb, research_confidence numeric);
CREATE TABLE lead_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, lead_id uuid, campaign_id uuid,
  icp_fit text, icp_fit_confidence numeric, buying_intent text, buying_intent_confidence numeric,
  email_priority text, email_priority_confidence numeric,
  send_recommendation text, send_recommendation_confidence numeric,
  input_snapshot jsonb, input_fingerprint text, cta_strategy text, subject_strategy text,
  sequence_length text, follow_up_timing text, personalization_depth text,
  automation_review text, provider text, provider_model text);
CREATE TABLE sent_emails (
  id uuid PRIMARY KEY, user_id uuid, lead_id uuid, to_email text, subject text,
  status text DEFAULT 'sent', sent_at timestamptz DEFAULT now());
CREATE TABLE signal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, lead_id uuid,
  signal_type text, weight numeric, occurred_at timestamptz DEFAULT now());
CREATE TABLE reply_analysis (
  id uuid PRIMARY KEY, user_id uuid,
  sent_email_id uuid REFERENCES sent_emails(id) ON DELETE CASCADE,
  lead_id uuid, reply_content text, analyzed_at timestamptz DEFAULT now(),
  triage_category text, detected_signals jsonb);
`;

/*
 * Each test gets its own database, not its own tables.
 *
 * The audit job points every db-backed test file at one postgres. Creating
 * stand-in `leads` and `sent_emails` tables in the shared database, and
 * dropping them to get a clean slate, tore the schema out from under
 * outbound-infra and runtime-guards, which build tables of the same names.
 * A throwaway database per test costs milliseconds and cannot collide, and
 * these migrations hardcode the public schema so a private schema with a
 * search_path would not work.
 */
let dbCounter = 0;

async function withPg(run: (sql: Pg) => Promise<void>) {
  let admin: Pg | null = null;
  try {
    admin = postgres(PG_URL, { max: 1, connect_timeout: 2 });
    await admin`select 1`;
  } catch (err) {
    if (admin) await admin.end({ timeout: 1 });
    if (process.env.AUDIT_PG_REQUIRED === "1") {
      throw new Error(`AUDIT_PG_REQUIRED is set but ${PG_URL} is not reachable: ${err instanceof Error ? err.message : err}`);
    }
    return;
  }

  const name = `odl_${process.pid}_${Date.now().toString(36)}_${dbCounter++}`;
  let sql: Pg | null = null;
  try {
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    sql = postgres(new URL(`/${name}`, PG_URL.replace(/^postgres/, "http")).href.replace(/^http/, "postgres"), {
      max: 2,
      connect_timeout: 5,
    });
    await sql.unsafe(STANDINS);
    await sql.unsafe(CAPTURE);
    await sql.unsafe(LABELS);
    await run(sql);
  } finally {
    if (sql) await sql.end({ timeout: 2 });
    // Dropped even when the test failed, so a run does not leave databases behind.
    await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(() => {});
    await admin.end({ timeout: 2 });
  }
}

async function seed(sql: Pg) {
  await sql`INSERT INTO leads (id, user_id, fit_score, intent_score, signal_score, seniority, job_title,
      department, employee_count, company_size, industry, country, email_verification_status, source, tier, signal_date)
    VALUES (${LEAD}, ${USER}, 70, 60, 50, 'VP of Engineering', 'VP of Engineering', 'eng',
      140, 'junk text', 'SaaS', 'US', 'valid', 'signal_queue', 'A', now() - interval '9 days')`;
  await sql`INSERT INTO lead_decisions (user_id, lead_id, icp_fit, icp_fit_confidence, buying_intent,
      email_priority, send_recommendation, send_recommendation_confidence, provider, provider_model)
    VALUES (${USER}, ${LEAD}, 'strong', 0.9, 'medium', 'high', 'email_now', 0.81, 'claude-lead-intel', 'v1')`;
  // One signal before the send and one after. Only the first was knowable.
  await sql`INSERT INTO signal_events (user_id, lead_id, signal_type, weight, occurred_at) VALUES
    (${USER}, ${LEAD}, 'hiring_surge', 9, now() - interval '5 days'),
    (${USER}, ${LEAD}, 'funding', 99, now() + interval '5 days')`;
  await sql`INSERT INTO sent_emails (id, user_id, lead_id, to_email, subject, sent_at)
    VALUES (${SEND}, ${USER}, ${LEAD}, 'a@b.co', 'hi', now())`;
}

const COPY = {
  subject_word_count: 3, body_word_count: 48, has_question_cta: true, has_link: false,
  personalization_type: "signal", sent_by: "manual", ai_generated: false,
  edit_ratio: 0.12, user_edited: true,
};

describe("capture_send_snapshot on postgres", () => {
  it("copies the decision and the lead as they were at the send", async () => {
    await withPg(async (sql) => {
      await seed(sql);
      await sql`SELECT capture_send_snapshot(${SEND}, ${USER}, ${sql.json(COPY)})`;
      const [snap] = await sql`SELECT * FROM lead_feature_snapshots`;
      expect(snap.seniority).toBe("vp");
      // employee_count 140 wins over the free-text "junk text".
      expect(snap.company_size_band).toBe("51-200");
      expect(snap.send_recommendation).toBe("email_now");
      expect(Number(snap.send_recommendation_confidence)).toBeCloseTo(0.81);
      expect(snap.scorer_version).toBe("v1");
      expect(Number(snap.signal_recency_days)).toBe(9);
    });
  });

  it("counts only the signals that existed when the email went out", async () => {
    await withPg(async (sql) => {
      await seed(sql);
      await sql`SELECT capture_send_snapshot(${SEND}, ${USER}, ${sql.json(COPY)})`;
      const [snap] = await sql`SELECT signal_count, strongest_signal_type FROM lead_feature_snapshots`;
      expect(Number(snap.signal_count)).toBe(1);
      // 'funding' carries weight 99 but arrived after the send, so it is not
      // the strongest signal of this send -- it is not a signal of it at all.
      expect(snap.strongest_signal_type).toBe("hiring_surge");
    });
  });

  it("survives the lead being rescored, which is the whole point", async () => {
    await withPg(async (sql) => {
      await seed(sql);
      await sql`SELECT capture_send_snapshot(${SEND}, ${USER}, ${sql.json(COPY)})`;
      await sql`UPDATE leads SET seniority='Intern', employee_count=3, fit_score=1 WHERE id=${LEAD}`;
      await sql`UPDATE lead_decisions SET send_recommendation='skip', send_recommendation_confidence=0.1 WHERE lead_id=${LEAD}`;
      const [snap] = await sql`SELECT seniority, company_size_band, send_recommendation, fit_score FROM lead_feature_snapshots`;
      expect(snap.seniority).toBe("vp");
      expect(snap.company_size_band).toBe("51-200");
      expect(snap.send_recommendation).toBe("email_now");
      expect(Number(snap.fit_score)).toBe(70);
    });
  });

  it("writes the copy features onto the send row", async () => {
    await withPg(async (sql) => {
      await seed(sql);
      await sql`SELECT capture_send_snapshot(${SEND}, ${USER}, ${sql.json(COPY)})`;
      const [row] = await sql`SELECT * FROM sent_emails WHERE id=${SEND}`;
      expect(row.subject_word_count).toBe(3);
      expect(row.body_word_count).toBe(48);
      expect(row.has_question_cta).toBe(true);
      expect(row.personalization_type).toBe("signal");
      expect(row.sent_by).toBe("manual");
      expect(row.snapshot_id).not.toBeNull();
      expect(row.send_weekday).not.toBeNull();
    });
  });

  it("captures at most one snapshot per send, however often it is called", async () => {
    await withPg(async (sql) => {
      await seed(sql);
      const [first] = await sql`SELECT capture_send_snapshot(${SEND}, ${USER}, ${sql.json(COPY)}) AS id`;
      const [again] = await sql`SELECT capture_send_snapshot(${SEND}, ${USER}, ${sql.json({})}) AS id`;
      expect(again.id).toBe(first.id);
      const [{ count }] = await sql`SELECT count(*)::int AS count FROM lead_feature_snapshots`;
      expect(count).toBe(1);
    });
  });

  it("refuses to snapshot a send belonging to another account", async () => {
    await withPg(async (sql) => {
      await seed(sql);
      const [row] = await sql`SELECT capture_send_snapshot(${SEND}, ${OTHER}, ${sql.json({})}) AS id`;
      expect(row.id).toBeNull();
      const [{ count }] = await sql`SELECT count(*)::int AS count FROM lead_feature_snapshots`;
      expect(count).toBe(0);
    });
  });

  it("cannot be updated or deleted, service role included", async () => {
    await withPg(async (sql) => {
      await seed(sql);
      await sql`SELECT capture_send_snapshot(${SEND}, ${USER}, ${sql.json(COPY)})`;
      await expect(sql`UPDATE lead_feature_snapshots SET seniority='ic'`).rejects.toThrow(/append-only/);
      await expect(sql`DELETE FROM lead_feature_snapshots`).rejects.toThrow(/append-only/);
    });
  });
});

describe("the normalizers, on postgres", () => {
  it("bands company size on the documented boundaries", async () => {
    await withPg(async (sql) => {
      const [r] = await sql`SELECT
        outcome_company_size_band(10, null) AS b10,
        outcome_company_size_band(11, null) AS b11,
        outcome_company_size_band(200, null) AS b200,
        outcome_company_size_band(201, null) AS b201,
        outcome_company_size_band(1001, null) AS big,
        outcome_company_size_band(null, '51-200') AS fallback,
        outcome_company_size_band(null, 'about fifty') AS junk,
        outcome_company_size_band(null, null) AS nothing`;
      expect(r).toMatchObject({
        b10: "1-10", b11: "11-50", b200: "51-200", b201: "201-1000",
        big: "1000+", fallback: "51-200", junk: "unknown", nothing: "unknown",
      });
    });
  });

  it("bands seniority, and says unknown rather than guessing", async () => {
    await withPg(async (sql) => {
      const [r] = await sql`SELECT
        outcome_seniority_band('Co-Founder') AS founder,
        outcome_seniority_band('Chief Revenue Officer') AS chief,
        outcome_seniority_band('SVP Sales') AS svp,
        outcome_seniority_band('Head of Growth') AS head,
        outcome_seniority_band('Director, Ops') AS director,
        outcome_seniority_band('Account Manager') AS manager,
        outcome_seniority_band('Engineer') AS ic,
        outcome_seniority_band('  ') AS blank,
        outcome_seniority_band(null) AS missing`;
      expect(r).toMatchObject({
        founder: "founder", chief: "c_level", svp: "vp", head: "vp",
        director: "director", manager: "manager", ic: "ic",
        blank: "unknown", missing: "unknown",
      });
    });
  });
});

describe("reply_labels_resolved on postgres", () => {
  async function classified(sql: Pg) {
    await seed(sql);
    await sql`INSERT INTO reply_analysis (id, user_id, sent_email_id, lead_id, analyzed_at,
        outcome_label, label_confidence, classifier_version)
      VALUES (${ANALYSIS}, ${USER}, ${SEND}, ${LEAD}, now(), 'not_interested', 0.55, 'm:abc')`;
  }

  it("reports the classifier's label and its doubt when nobody has corrected it", async () => {
    await withPg(async (sql) => {
      await classified(sql);
      const [row] = await sql`SELECT label, labeled_by, confidence FROM reply_labels_resolved`;
      expect(row).toMatchObject({ label: "not_interested", labeled_by: "claude" });
      expect(Number(row.confidence)).toBeCloseTo(0.55);
    });
  });

  it("lets a person's correction win, and treats it as certain", async () => {
    await withPg(async (sql) => {
      await classified(sql);
      await sql`INSERT INTO reply_label_overrides (user_id, reply_analysis_id, outcome_label, objection_type, source)
        VALUES (${USER}, ${ANALYSIS}, 'objection', 'budget', 'user')`;
      const [row] = await sql`SELECT label, objection_type, labeled_by, confidence FROM reply_labels_resolved`;
      expect(row).toMatchObject({ label: "objection", objection_type: "budget", labeled_by: "user" });
      expect(Number(row.confidence)).toBe(1);
    });
  });

  it("takes the newest correction and names who made it", async () => {
    await withPg(async (sql) => {
      await classified(sql);
      await sql`INSERT INTO reply_label_overrides (user_id, reply_analysis_id, outcome_label, source)
        VALUES (${USER}, ${ANALYSIS}, 'objection', 'user')`;
      await sql`INSERT INTO reply_label_overrides (user_id, reply_analysis_id, outcome_label, source, created_at)
        VALUES (${USER}, ${ANALYSIS}, 'meeting_booked', 'agent', now() + interval '1 minute')`;
      const [row] = await sql`SELECT label, labeled_by FROM reply_labels_resolved`;
      expect(row).toMatchObject({ label: "meeting_booked", labeled_by: "agent" });
    });
  });

  it("does not let the classifier re-running undo a correction", async () => {
    /*
     * The reason corrections are a separate table. analyze-reply updates its
     * own reply_analysis row when it recognises the same gmail_message_id, so
     * a correction stored there would be overwritten by the next run.
     */
    await withPg(async (sql) => {
      await classified(sql);
      await sql`INSERT INTO reply_label_overrides (user_id, reply_analysis_id, outcome_label, source)
        VALUES (${USER}, ${ANALYSIS}, 'meeting_booked', 'user')`;
      await sql`UPDATE reply_analysis SET outcome_label='auto_reply', label_confidence=0.99 WHERE id=${ANALYSIS}`;
      const [row] = await sql`SELECT label, labeled_by FROM reply_labels_resolved`;
      expect(row).toMatchObject({ label: "meeting_booked", labeled_by: "user" });
    });
  });

  it("refuses a label outside the enumerated set", async () => {
    await withPg(async (sql) => {
      await classified(sql);
      await expect(
        sql`INSERT INTO reply_label_overrides (user_id, reply_analysis_id, outcome_label)
            VALUES (${USER}, ${ANALYSIS}, 'nonsense')`,
      ).rejects.toThrow();
      await expect(
        sql`UPDATE reply_analysis SET outcome_label='nonsense' WHERE id=${ANALYSIS}`,
      ).rejects.toThrow();
    });
  });

  it("keeps corrections append-only, so a relabel history is never rewritten", async () => {
    await withPg(async (sql) => {
      await classified(sql);
      await sql`INSERT INTO reply_label_overrides (user_id, reply_analysis_id, outcome_label)
        VALUES (${USER}, ${ANALYSIS}, 'objection')`;
      await expect(sql`UPDATE reply_label_overrides SET outcome_label='other'`).rejects.toThrow(/append-only/);
      await expect(sql`DELETE FROM reply_label_overrides`).rejects.toThrow(/append-only/);
    });
  });

  it("shows nothing for a reply neither labelled nor corrected", async () => {
    await withPg(async (sql) => {
      await seed(sql);
      await sql`INSERT INTO reply_analysis (id, user_id, sent_email_id, lead_id, analyzed_at)
        VALUES (${ANALYSIS}, ${USER}, ${SEND}, ${LEAD}, now())`;
      const rows = await sql`SELECT * FROM reply_labels_resolved`;
      expect(rows).toHaveLength(0);
    });
  });
});
