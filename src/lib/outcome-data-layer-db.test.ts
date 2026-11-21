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
const EXAMPLES = readFileSync("supabase/migrations/20261120110000_outcome_data_layer_training_examples.sql", "utf8");
const READINESS = readFileSync("supabase/migrations/20261120120000_outcome_data_layer_readiness.sql", "utf8");
const BACKFILL = readFileSync("supabase/migrations/20261120130000_outcome_data_layer_backfill.sql", "utf8");
const CONSENT = readFileSync("supabase/migrations/20261121100000_outcome_consent.sql", "utf8");

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
  status text DEFAULT 'sent', sent_at timestamptz DEFAULT now(),
  sequence_id uuid, sequence_step int, enrollment_id uuid);
CREATE TABLE signal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, lead_id uuid,
  signal_type text, weight numeric, occurred_at timestamptz DEFAULT now());
CREATE TABLE email_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
CREATE TABLE sequence_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, lead_id uuid,
  sequence_id uuid, status text, completed_at timestamptz, current_step int);
CREATE TABLE bounce_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, sent_email_id uuid,
  to_email text, bounce_type text, detected_at timestamptz DEFAULT now());
CREATE TABLE email_optouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, email text,
  opted_out_at timestamptz DEFAULT now());
CREATE TABLE reply_analysis (
  id uuid PRIMARY KEY, user_id uuid,
  sent_email_id uuid REFERENCES sent_emails(id) ON DELETE CASCADE,
  lead_id uuid, reply_content text, analyzed_at timestamptz DEFAULT now(),
  triage_category text, detected_signals jsonb);
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text);
CREATE TABLE profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '', full_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());

/*
 * Harness only, and the one piece of the stand-ins that is not a copy of a
 * real object.
 *
 * Phase 5 joins training_examples to profiles, so every sender now needs a
 * profile that has answered yes, and a test that forgot one would read as a
 * broken view rather than a missing row. This gives any sender a consenting
 * profile the moment it sends, so the 45 tests written before consent existed
 * still describe what they were written to describe. It never overwrites an
 * answer, so a consent test sets the flag after seeding and keeps it.
 */
CREATE FUNCTION harness_consenting_sender() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES (NEW.user_id, 'harness@example.test')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO profiles (id, email, outcome_consent, outcome_consent_decided_at)
    VALUES (NEW.user_id, 'harness@example.test', true, now())
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_harness_consenting_sender
  BEFORE INSERT ON sent_emails FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL)
  EXECUTE FUNCTION harness_consenting_sender();
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
    await sql.unsafe(EXAMPLES);
    await sql.unsafe(READINESS);
    await sql.unsafe(BACKFILL);
    await sql.unsafe(CONSENT);
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

/*
 * Phase 3: one row per first touch, with the outcome of the sequence it began.
 *
 * Every rule below was wrong at least once before postgres was asked. The
 * is_final NULL in particular read as false everywhere it was filtered on, so
 * nothing looked broken while the pending count sat at zero with open
 * conversations in it.
 */
describe("training_examples on postgres", () => {
  const SEQ = "cccccccc-0000-0000-0000-000000000001";
  const ENR = "dddddddd-0000-0000-0000-000000000001";

  /** A lead with a decision, and `touches` sends carrying snapshots. */
  async function sequence(sql: Pg, opts: {
    touches: number; firstSentDaysAgo: number; sequenceId?: string | null; enrollmentId?: string | null;
  }): Promise<string[]> {
    const lead = crypto.randomUUID();
    await sql`INSERT INTO leads (id, user_id, seniority, employee_count) VALUES (${lead}, ${USER}, 'VP Sales', 120)`;
    await sql`INSERT INTO lead_decisions (user_id, lead_id, send_recommendation, provider, provider_model)
      VALUES (${USER}, ${lead}, 'email_now', 'claude', 'v1')`;
    const ids: string[] = [];
    for (let step = 1; step <= opts.touches; step++) {
      const id = crypto.randomUUID();
      const daysAgo = opts.firstSentDaysAgo - (step - 1);
      await sql`INSERT INTO sent_emails (id, user_id, lead_id, to_email, subject, sent_at, sequence_id, sequence_step, enrollment_id)
        VALUES (${id}, ${USER}, ${lead}, ${`t${step}@x.co`}, ${`touch${step}`},
                now() - make_interval(days => ${daysAgo}), ${opts.sequenceId ?? null},
                ${opts.touches === 1 && opts.sequenceId == null ? null : step}, ${opts.enrollmentId ?? null})`;
      await sql`SELECT capture_send_snapshot(${id}, ${USER}, ${sql.json({ sent_by: "manual" })})`;
      ids.push(id);
    }
    return ids;
  }

  async function label(sql: Pg, sendId: string, outcome: string) {
    const id = crypto.randomUUID();
    await sql`INSERT INTO reply_analysis (id, user_id, sent_email_id, analyzed_at, outcome_label, label_confidence)
      VALUES (${id}, ${USER}, ${sendId}, now(), ${outcome}, 0.9)`;
    return id;
  }

  it("is undecided while a recent send is still silent, and false rather than null", async () => {
    await withPg(async (sql) => {
      await sequence(sql, { touches: 1, firstSentDaysAgo: 2 });
      const [row] = await sql`SELECT outcome, is_final FROM training_examples`;
      expect(row.outcome).toBe("no_reply");
      /*
       * Explicitly false. It was NULL, from `NULL IN (...)` on the absent
       * enrollment status poisoning the OR chain. WHERE is_final still
       * excluded it so exports looked right, but NOT is_final excluded it too
       * and the pending count read zero.
       */
      expect(row.is_final).toBe(false);
      expect(row.is_final).not.toBeNull();
    });
  });

  it("decides a lead that has been quiet past the silence window", async () => {
    await withPg(async (sql) => {
      await sequence(sql, { touches: 1, firstSentDaysAgo: 22 });
      const [row] = await sql`SELECT outcome, is_final FROM training_examples`;
      expect(row).toMatchObject({ outcome: "no_reply", is_final: true });
    });
  });

  it("rolls a reply on a later touch up to the first touch", async () => {
    await withPg(async (sql) => {
      const ids = await sequence(sql, { touches: 4, firstSentDaysAgo: 10, sequenceId: SEQ, enrollmentId: null });
      await label(sql, ids[2], "referral");
      const rows = await sql`SELECT outcome, is_final, touches, positives,
        (SELECT subject FROM sent_emails WHERE id = send_id) AS first_touch FROM training_examples`;
      // One example for the whole sequence, anchored on touch 1.
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ outcome: "positive", is_final: true, first_touch: "touch1" });
      expect(Number(rows[0].touches)).toBe(4);
    });
  });

  it("lets one positive outweigh a negative in the same sequence", async () => {
    await withPg(async (sql) => {
      const ids = await sequence(sql, { touches: 3, firstSentDaysAgo: 10, sequenceId: SEQ });
      await label(sql, ids[1], "not_interested");
      await label(sql, ids[2], "meeting_booked");
      const [row] = await sql`SELECT outcome, positives, human_replies FROM training_examples`;
      expect(row.outcome).toBe("positive");
      expect(Number(row.human_replies)).toBe(2);
    });
  });

  it("does not count an away message as a reply either way", async () => {
    await withPg(async (sql) => {
      const ids = await sequence(sql, { touches: 1, firstSentDaysAgo: 3 });
      await label(sql, ids[0], "out_of_office");
      const [row] = await sql`SELECT outcome, is_final, human_replies FROM training_examples`;
      /*
       * An out-of-office is the absence of an answer. Counting it as a
       * negative would teach a model that a good email caused it, and counting
       * it as final would close a conversation the prospect has not had yet.
       */
      expect(row).toMatchObject({ outcome: "no_reply", is_final: false });
      expect(Number(row.human_replies)).toBe(0);
    });
  });

  it("reports a hard bounce and an unsubscribe over any reply", async () => {
    await withPg(async (sql) => {
      const bounced = await sequence(sql, { touches: 1, firstSentDaysAgo: 3 });
      await sql`INSERT INTO bounce_events (user_id, sent_email_id, to_email, bounce_type)
        VALUES (${USER}, ${bounced[0]}, 't1@x.co', 'hard')`;
      const unsub = await sequence(sql, { touches: 1, firstSentDaysAgo: 3, sequenceId: SEQ });
      await label(sql, unsub[0], "positive");
      await sql`INSERT INTO email_optouts (user_id, email) VALUES (${USER}, 't1@x.co')`;
      const rows = await sql`SELECT outcome, is_final FROM training_examples ORDER BY outcome`;
      const outcomes = rows.map((r) => r.outcome);
      // Both share the recipient address, so both are unsubscribed; what
      // matters is that neither reads as a reply and both are decided.
      expect(outcomes.every((o) => o === "bounced" || o === "unsubscribed")).toBe(true);
      expect(rows.every((r) => r.is_final === true)).toBe(true);
    });
  });

  it("decides a stopped enrollment even while it is recent and silent", async () => {
    await withPg(async (sql) => {
      await sql`INSERT INTO sequence_enrollments (id, user_id, lead_id, sequence_id, status)
        VALUES (${ENR}, ${USER}, ${crypto.randomUUID()}, ${SEQ}, 'stopped')`;
      await sequence(sql, { touches: 1, firstSentDaysAgo: 1, sequenceId: SEQ, enrollmentId: ENR });
      const [row] = await sql`SELECT outcome, is_final FROM training_examples`;
      expect(row).toMatchObject({ outcome: "no_reply", is_final: true });
    });
  });

  it("lets a human correction change the outcome", async () => {
    await withPg(async (sql) => {
      const ids = await sequence(sql, { touches: 1, firstSentDaysAgo: 3 });
      const analysis = await label(sql, ids[0], "not_interested");
      expect((await sql`SELECT outcome FROM training_examples`)[0].outcome).toBe("negative_reply");
      await sql`INSERT INTO reply_label_overrides (user_id, reply_analysis_id, outcome_label, source)
        VALUES (${USER}, ${analysis}, 'meeting_booked', 'user')`;
      const [row] = await sql`SELECT outcome, human_labelled FROM training_examples`;
      expect(row.outcome).toBe("positive");
      expect(Number(row.human_labelled)).toBe(1);
    });
  });

  it("excludes a send with no snapshot, which has no features to train on", async () => {
    await withPg(async (sql) => {
      const lead = crypto.randomUUID();
      await sql`INSERT INTO leads (id, user_id) VALUES (${lead}, ${USER})`;
      await sql`INSERT INTO sent_emails (id, user_id, lead_id, to_email, subject, sent_at, sequence_step)
        VALUES (${crypto.randomUUID()}, ${USER}, ${lead}, 'n@x.co', 'nosnap', now(), 1)`;
      expect(await sql`SELECT * FROM training_examples`).toHaveLength(0);
    });
  });

  it("excludes a sequence whose only send is a follow-up", async () => {
    await withPg(async (sql) => {
      const lead = crypto.randomUUID();
      await sql`INSERT INTO leads (id, user_id) VALUES (${lead}, ${USER})`;
      const id = crypto.randomUUID();
      await sql`INSERT INTO sent_emails (id, user_id, lead_id, to_email, subject, sent_at, sequence_id, sequence_step)
        VALUES (${id}, ${USER}, ${lead}, 's@x.co', 'step2', now(), ${SEQ}, 2)`;
      await sql`SELECT capture_send_snapshot(${id}, ${USER}, ${sql.json({})})`;
      // No first touch means no example: the thing being measured never happened.
      expect(await sql`SELECT * FROM training_examples`).toHaveLength(0);
    });
  });

  it("carries the features as they were at the send, not as they are now", async () => {
    await withPg(async (sql) => {
      const ids = await sequence(sql, { touches: 1, firstSentDaysAgo: 22 });
      const [lead] = await sql`SELECT lead_id FROM sent_emails WHERE id = ${ids[0]}`;
      await sql`UPDATE leads SET seniority='Intern', employee_count=2 WHERE id = ${lead.lead_id}`;
      await sql`UPDATE lead_decisions SET send_recommendation='skip' WHERE lead_id = ${lead.lead_id}`;
      const [row] = await sql`SELECT seniority, company_size_band, send_recommendation FROM training_examples`;
      expect(row).toMatchObject({ seniority: "vp", company_size_band: "51-200", send_recommendation: "email_now" });
    });
  });
});

describe("record_dataset_stats on postgres", () => {
  it("counts the day, and the account-wide row matches the per-user rows", async () => {
    await withPg(async (sql) => {
      const lead = crypto.randomUUID();
      await sql`INSERT INTO leads (id, user_id, seniority, employee_count) VALUES (${lead}, ${USER}, 'VP', 120)`;
      await sql`INSERT INTO lead_decisions (user_id, lead_id, send_recommendation, provider, provider_model)
        VALUES (${USER}, ${lead}, 'email_now', 'c', 'v1')`;
      // One decided and one still open, so pending has something to miss.
      for (const [days, tag] of [[22, "old"], [1, "new"]] as const) {
        const id = crypto.randomUUID();
        await sql`INSERT INTO sent_emails (id, user_id, lead_id, to_email, subject, sent_at, sequence_id)
          VALUES (${id}, ${USER}, ${crypto.randomUUID()}, ${`${tag}@x.co`}, ${tag},
                  now() - make_interval(days => ${days}), ${crypto.randomUUID()})`;
        await sql`UPDATE sent_emails SET lead_id = ${lead} WHERE id = ${id}`;
        await sql`SELECT capture_send_snapshot(${id}, ${USER}, ${sql.json({})})`;
      }
      await sql`SELECT record_dataset_stats()`;
      const rows = await sql`SELECT user_id, finalized, positives, pending FROM dataset_stats ORDER BY user_id NULLS LAST`;
      expect(rows).toHaveLength(2);
      const perUser = rows.find((r) => r.user_id !== null)!;
      const total = rows.find((r) => r.user_id === null)!;
      expect(Number(perUser.finalized)).toBe(1);
      // The open one must be counted, which the NULL is_final used to hide.
      expect(Number(perUser.pending)).toBe(1);
      expect(Number(total.finalized)).toBe(Number(perUser.finalized));
      expect(Number(total.pending)).toBe(Number(perUser.pending));
    });
  });

  it("is idempotent for a day, so a re-run corrects rather than duplicates", async () => {
    await withPg(async (sql) => {
      await sql`SELECT record_dataset_stats()`;
      await sql`SELECT record_dataset_stats()`;
      const [{ count }] = await sql`SELECT count(*)::int AS count FROM dataset_stats`;
      expect(count).toBeLessThanOrEqual(1);
    });
  });
});

describe("who can read what", () => {
  /*
   * This project grants privileges explicitly -- 37 migrations do, and none
   * use ALTER DEFAULT PRIVILEGES -- so a new table or view is unreadable until
   * granted. reply_labels_resolved shipped without a grant and the Unified
   * Inbox's chip would have failed with "permission denied for view" for every
   * signed-in user.
   */
  it("lets a signed-in user read the inbox surfaces", async () => {
    await withPg(async (sql) => {
      for (const rel of ["reply_labels_resolved", "dataset_stats"]) {
        const [row] = await sql`
          SELECT has_table_privilege('authenticated', ${rel}, 'SELECT') AS granted`;
        expect(row.granted, `${rel} must be readable by authenticated`).toBe(true);
      }
      const [ins] = await sql`
        SELECT has_table_privilege('authenticated', 'reply_label_overrides', 'INSERT') AS granted`;
      expect(ins.granted, "a correction has to be insertable in one tap").toBe(true);
    });
  });

  it("keeps the export surfaces away from signed-in users", async () => {
    await withPg(async (sql) => {
      for (const rel of ["training_examples", "lead_feature_snapshots"]) {
        const [row] = await sql`
          SELECT has_table_privilege('authenticated', ${rel}, 'SELECT') AS granted`;
        expect(row.granted, `${rel} is founder-only`).toBe(false);
      }
    });
  });
});

/*
 * Phase 6: the backfill, and the line it must not cross.
 *
 * A backfilled snapshot records feature values read after its send, because
 * lead_decisions had already been overwritten by the time anyone asked. That
 * is the exact leakage phase 1 exists to prevent, so these rows are kept for
 * describing the past and excluded from everything that trains.
 */
describe("backfill on postgres", () => {
  async function historicalSend(sql: Pg, daysAgo: number, withDecision = true) {
    const lead = crypto.randomUUID();
    const send = crypto.randomUUID();
    await sql`INSERT INTO leads (id, user_id, seniority, employee_count) VALUES (${lead}, ${USER}, 'VP Sales', 120)`;
    if (withDecision) {
      await sql`INSERT INTO lead_decisions (user_id, lead_id, send_recommendation, provider, provider_model)
        VALUES (${USER}, ${lead}, 'email_now', 'claude', 'v1')`;
    }
    await sql`INSERT INTO sent_emails (id, user_id, lead_id, to_email, subject, sent_at, sequence_step)
      VALUES (${send}, ${USER}, ${lead}, ${`h${daysAgo}@x.co`}, 'old',
              now() - make_interval(days => ${daysAgo}), 1)`;
    return { lead, send };
  }

  it("creates a snapshot for a send that predates capture", async () => {
    await withPg(async (sql) => {
      await historicalSend(sql, 60);
      expect(await sql`SELECT * FROM training_examples`).toHaveLength(0);
      const [{ created }] = await sql`SELECT backfill_outcome_snapshots(100) AS created`;
      expect(Number(created)).toBe(1);
      const [snap] = await sql`SELECT scorer_version, seniority, company_size_band FROM lead_feature_snapshots`;
      expect(snap).toMatchObject({ scorer_version: "backfill", seniority: "vp", company_size_band: "51-200" });
    });
  });

  it("dates the snapshot to the send, not to the backfill run", async () => {
    await withPg(async (sql) => {
      await historicalSend(sql, 60);
      await sql`SELECT backfill_outcome_snapshots(100)`;
      /*
       * So signal recency and the send-hour features are computed against the
       * moment of the send. The alternative is a captured_at that disagrees
       * with the send it describes.
       */
      const [row] = await sql`
        SELECT captured_at::date = (now() - interval '60 days')::date AS dated_to_the_send
          FROM lead_feature_snapshots`;
      expect(row.dated_to_the_send).toBe(true);
    });
  });

  it("can be run again without writing a second snapshot for anything", async () => {
    await withPg(async (sql) => {
      await historicalSend(sql, 60);
      await historicalSend(sql, 50);
      expect(Number((await sql`SELECT backfill_outcome_snapshots(100) AS c`)[0].c)).toBe(2);
      expect(Number((await sql`SELECT backfill_outcome_snapshots(100) AS c`)[0].c)).toBe(0);
      const [{ count }] = await sql`SELECT count(*)::int AS count FROM lead_feature_snapshots`;
      expect(count).toBe(2);
    });
  });

  it("marks rows at insert, leaving the snapshot table append-only", async () => {
    await withPg(async (sql) => {
      await historicalSend(sql, 60);
      await sql`SELECT backfill_outcome_snapshots(100)`;
      /*
       * The marker is written by capture_send_snapshot's own parameter. An
       * UPDATE afterwards would need the append-only trigger disabled, which
       * takes an ACCESS EXCLUSIVE lock on the table per row and would block
       * every live capture for the length of the backfill.
       */
      await expect(sql`UPDATE lead_feature_snapshots SET scorer_version='x'`).rejects.toThrow(/append-only/);
      expect(BACKFILL).not.toMatch(/DISABLE TRIGGER/);
    });
  });

  it("still snapshots a send whose decision is already gone", async () => {
    await withPg(async (sql) => {
      // The common case: lead_decisions was overwritten long ago.
      await historicalSend(sql, 60, false);
      expect(Number((await sql`SELECT backfill_outcome_snapshots(100) AS c`)[0].c)).toBe(1);
      const [snap] = await sql`SELECT scorer, scorer_version, send_recommendation FROM lead_feature_snapshots`;
      expect(snap.scorer_version).toBe("backfill");
      // No decision to copy, so no recommendation -- recorded as absent, not invented.
      expect(snap.send_recommendation).toBeNull();
    });
  });

  it("keeps backfilled rows out of readiness while still naming them", async () => {
    await withPg(async (sql) => {
      await historicalSend(sql, 60);
      await sql`SELECT backfill_outcome_snapshots(100)`;
      const [{ r }] = await sql`SELECT dataset_readiness() AS r`;
      const totals = (r as Record<string, Record<string, number>>).totals;
      // Counting them would overstate how much trainable data exists.
      expect(Number(totals.finalized)).toBe(0);
      expect(Number(totals.backfilled)).toBe(1);
      expect(totals.positive_rate).toBeNull();
    });
  });

  it("keeps them out of the breakdowns, which answer whether scoring predicts", async () => {
    await withPg(async (sql) => {
      await historicalSend(sql, 60);
      await sql`SELECT backfill_outcome_snapshots(100)`;
      expect(await sql`SELECT * FROM dataset_breakdown('send_recommendation')`).toHaveLength(0);
    });
  });

  it("counts a real capture alongside them, so the two do not contaminate", async () => {
    await withPg(async (sql) => {
      await historicalSend(sql, 60);
      await sql`SELECT backfill_outcome_snapshots(100)`;
      const live = await historicalSend(sql, 30);
      await sql`SELECT capture_send_snapshot(${live.send}, ${USER}, ${sql.json({})})`;
      const [{ r }] = await sql`SELECT dataset_readiness() AS r`;
      const totals = (r as Record<string, Record<string, number>>).totals;
      expect(Number(totals.finalized)).toBe(1);
      expect(Number(totals.backfilled)).toBe(1);
      const rows = await sql`SELECT * FROM dataset_breakdown('send_recommendation')`;
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].finalized)).toBe(1);
    });
  });

  it("flags each example so an export can tell them apart", async () => {
    await withPg(async (sql) => {
      await historicalSend(sql, 60);
      await sql`SELECT backfill_outcome_snapshots(100)`;
      const live = await historicalSend(sql, 30);
      await sql`SELECT capture_send_snapshot(${live.send}, ${USER}, ${sql.json({})})`;
      const rows = await sql`SELECT is_backfilled, scorer_version FROM training_examples ORDER BY is_backfilled`;
      expect(rows.map((r) => r.is_backfilled)).toEqual([false, true]);
    });
  });
});

describe("backfilling the labels of older replies", () => {
  async function legacyReply(sql: Pg, triage: string | null) {
    const lead = crypto.randomUUID();
    const send = crypto.randomUUID();
    const analysis = crypto.randomUUID();
    await sql`INSERT INTO leads (id, user_id) VALUES (${lead}, ${USER})`;
    await sql`INSERT INTO sent_emails (id, user_id, lead_id, to_email, subject, sent_at)
      VALUES (${send}, ${USER}, ${lead}, 'l@x.co', 'l', now() - interval '40 days')`;
    await sql`INSERT INTO reply_analysis (id, user_id, sent_email_id, analyzed_at, detected_signals)
      VALUES (${analysis}, ${USER}, ${send}, now() - interval '39 days',
              ${sql.json(triage === null ? {} : { triage_category: triage })})`;
    return analysis;
  }

  it("reads triage_category from where analyze-reply actually stores it", async () => {
    await withPg(async (sql) => {
      // detected_signals, not the dedicated column, which was never written.
      await legacyReply(sql, "positive");
      expect(Number((await sql`SELECT backfill_reply_labels(100) AS c`)[0].c)).toBe(1);
      const [row] = await sql`SELECT outcome_label, classifier_version FROM reply_analysis`;
      expect(row).toMatchObject({ outcome_label: "positive", classifier_version: "backfill" });
    });
  });

  it("records no confidence, because nothing measured one", async () => {
    await withPg(async (sql) => {
      await legacyReply(sql, "positive");
      await sql`SELECT backfill_reply_labels(100)`;
      /*
       * A null sends the reply to a person to confirm, which is the right
       * outcome for a label guessed from a coarser one.
       */
      expect((await sql`SELECT label_confidence FROM reply_analysis`)[0].label_confidence).toBeNull();
    });
  });

  it("refuses to guess on soft_no, which covered two different outcomes", async () => {
    await withPg(async (sql) => {
      await legacyReply(sql, "soft_no");
      await sql`SELECT backfill_reply_labels(100)`;
      expect((await sql`SELECT outcome_label FROM reply_analysis`)[0].outcome_label).toBe("other");
    });
  });

  it("never overwrites a label that is already set", async () => {
    await withPg(async (sql) => {
      const analysis = await legacyReply(sql, "hard_no");
      await sql`UPDATE reply_analysis SET outcome_label='meeting_booked', label_confidence=0.95,
        classifier_version='m:real' WHERE id = ${analysis}`;
      expect(Number((await sql`SELECT backfill_reply_labels(100) AS c`)[0].c)).toBe(0);
      const [row] = await sql`SELECT outcome_label, classifier_version FROM reply_analysis`;
      expect(row).toMatchObject({ outcome_label: "meeting_booked", classifier_version: "m:real" });
    });
  });

  it("agrees with the classifier's own mapping for every legacy value", async () => {
    /*
     * The SQL used by the backfill and the TypeScript used by the classifier
     * must not disagree about what an old reply meant.
     */
    await withPg(async (sql) => {
      const { labelFromTriage } = await import("../../supabase/functions/_shared/reply-labels");
      for (const triage of ["positive", "soft_no", "hard_no", "ooo", "wrong_person", "info_request", "", "nonsense"]) {
        const [row] = await sql`SELECT outcome_label_from_triage(${triage}) AS label`;
        expect(row.label, `triage "${triage}"`).toBe(labelFromTriage(triage));
      }
      const [nullRow] = await sql`SELECT outcome_label_from_triage(NULL) AS label`;
      expect(nullRow.label).toBe(labelFromTriage(null));
    });
  });
});

/**
 * Phase 5: consent, and the gate that enforces it.
 *
 * The drafted wording promises the training use happens only where the
 * customer agreed and stops when they withdraw. That promise is kept in one
 * place -- the join in training_examples -- because every export and every
 * readiness count reads that view, so a consumer written later inherits the
 * gate instead of having to remember it.
 *
 * The flag is tri-state and NULL is not a yes. An account that predates the
 * prompt contributes nothing at all until its owner answers, which is what was
 * asked for: every existing customer gets asked as well as every new one.
 */
describe("outcome consent on postgres", () => {
  /** One send with a snapshot, old enough to be final. The owner is returned. */
  async function sendFor(sql: Pg, userId: string): Promise<string> {
    const lead = crypto.randomUUID();
    const send = crypto.randomUUID();
    await sql`INSERT INTO leads (id, user_id, seniority, employee_count) VALUES (${lead}, ${userId}, 'VP Sales', 120)`;
    await sql`INSERT INTO lead_decisions (user_id, lead_id, send_recommendation, provider, provider_model)
      VALUES (${userId}, ${lead}, 'email_now', 'claude', 'v1')`;
    await sql`INSERT INTO sent_emails (id, user_id, lead_id, to_email, subject, sent_at)
      VALUES (${send}, ${userId}, ${lead}, 'a@b.co', 'hi', now() - interval '30 days')`;
    await sql`SELECT capture_send_snapshot(${send}, ${userId}, ${sql.json({ sent_by: "manual" })})`;
    return send;
  }

  const setFlag = (sql: Pg, userId: string, value: boolean | null) =>
    sql`UPDATE profiles SET outcome_consent = ${value}, outcome_consent_decided_at = ${value === null ? null : sql`now()`} WHERE id = ${userId}`;

  it("starts at not-asked, and not-asked trains on nothing", async () => {
    await withPg(async (sql) => {
      const send = await sendFor(sql, USER);
      await setFlag(sql, USER, null);
      const [profile] = await sql`SELECT outcome_consent, outcome_consent_decided_at FROM profiles WHERE id = ${USER}`;
      expect(profile.outcome_consent).toBeNull();
      expect(profile.outcome_consent_decided_at).toBeNull();
      // The send and its snapshot are there; only the training use is withheld.
      expect((await sql`SELECT 1 FROM lead_feature_snapshots s JOIN sent_emails e ON e.snapshot_id = s.id WHERE e.id = ${send}`).length).toBe(1);
      expect((await sql`SELECT 1 FROM training_examples`).length).toBe(0);
    });
  });

  it("declining trains on nothing either", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await setFlag(sql, USER, false);
      expect((await sql`SELECT 1 FROM training_examples`).length).toBe(0);
    });
  });

  it("agreeing is the only state that trains", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await setFlag(sql, USER, true);
      const rows = await sql`SELECT user_id, is_final FROM training_examples`;
      expect(rows.length).toBe(1);
      expect(rows[0]).toMatchObject({ user_id: USER, is_final: true });
    });
  });

  it("withdrawing stops the use of data already captured", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await setFlag(sql, USER, true);
      expect((await sql`SELECT 1 FROM training_examples`).length).toBe(1);
      // "We will stop using your data for this purpose from that point" has to
      // cover what was already recorded, not just what comes next.
      await sql`SELECT set_outcome_consent(${USER}, false, 'settings')`;
      expect((await sql`SELECT 1 FROM training_examples`).length).toBe(0);
    });
  });

  it("gates one owner without gating another", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await sendFor(sql, OTHER);
      await setFlag(sql, USER, true);
      await setFlag(sql, OTHER, false);
      const rows = await sql`SELECT user_id FROM training_examples`;
      expect(rows.map((row) => row.user_id)).toEqual([USER]);
    });
  });

  it("readiness and the stats row count only what consent allows", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await setFlag(sql, USER, true);
      const [agreed] = await sql`SELECT dataset_readiness() AS r`;
      expect(agreed.r.totals.finalized).toBe(1);
      await sql`SELECT set_outcome_consent(${USER}, false, 'settings')`;
      const [declined] = await sql`SELECT dataset_readiness() AS r`;
      expect(declined.r.totals.finalized).toBe(0);
      await sql`SELECT record_dataset_stats()`;
      const [stats] = await sql`SELECT finalized FROM dataset_stats ORDER BY created_at DESC LIMIT 1`;
      expect(Number(stats.finalized)).toBe(0);
    });
  });

  it("says how much the gate is withholding, so a zero meter is not a mystery", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await sendFor(sql, OTHER);
      await setFlag(sql, USER, true);
      await setFlag(sql, OTHER, null);
      const [row] = await sql`SELECT outcome_consent_summary() AS s`;
      expect(row.s).toMatchObject({ agreed: 1, declined: 0, not_asked: 1, withheld_sends: 1 });
    });
  });

  it("keeps every answer, and refuses to rewrite or erase one", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await sql`SELECT set_outcome_consent(${USER}, true, 'prompt')`;
      await sql`SELECT set_outcome_consent(${USER}, false, 'settings')`;
      const log = await sql`SELECT consent, source FROM outcome_consent_log WHERE user_id = ${USER} ORDER BY decided_at`;
      expect(log.map((row) => [row.consent, row.source])).toEqual([[true, "prompt"], [false, "settings"]]);
      // Withdrawal has to be evidenced later, so the history is append-only.
      await expect(sql`UPDATE outcome_consent_log SET consent = true WHERE user_id = ${USER}`)
        .rejects.toThrow(/append-only/);
      await expect(sql`DELETE FROM outcome_consent_log WHERE user_id = ${USER}`)
        .rejects.toThrow(/append-only/);
    });
  });

  it("reads the three states back without flattening not-asked into no", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await setFlag(sql, USER, null);
      const notAsked = (await sql`SELECT outcome_consent_state(${USER}) AS s`)[0].s;
      expect(notAsked.consent).toBeNull();
      expect(notAsked.decided_at).toBeNull();
      await sql`SELECT set_outcome_consent(${USER}, false, 'prompt')`;
      const declined = (await sql`SELECT outcome_consent_state(${USER}) AS s`)[0].s;
      expect(declined.consent).toBe(false);
      expect(typeof declined.decided_at).toBe("string");
      await sql`SELECT set_outcome_consent(${USER}, true, 'settings')`;
      expect((await sql`SELECT outcome_consent_state(${USER}) AS s`)[0].s.consent).toBe(true);
    });
  });

  it("refuses to record a non-answer, so NULL can only mean not asked", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await expect(sql`SELECT set_outcome_consent(${USER}, ${null}, 'prompt')`).rejects.toThrow(/explicit answer/);
      await expect(sql`SELECT set_outcome_consent(${USER}, true, 'guess')`).rejects.toThrow(/prompt or settings/);
      expect((await sql`SELECT 1 FROM outcome_consent_log WHERE user_id = ${USER}`).length).toBe(0);
    });
  });

  it("does not let a customer write the flag or another customer's history", async () => {
    await withPg(async (sql) => {
      await sendFor(sql, USER);
      await sql`SELECT set_outcome_consent(${USER}, true, 'prompt')`;
      await sql`ALTER TABLE outcome_consent_log FORCE ROW LEVEL SECURITY`;
      // Each check gets its own transaction: a refused statement aborts the one
      // it is in, and a shared transaction would make the next check fail for
      // that reason instead of the one it is testing.
      const asOther = async (run: (tx: Pg) => Promise<void>) => {
        let assertion: unknown = null;
        await sql.begin(async (tx) => {
          await tx`SELECT set_config('request.jwt.claim.sub', ${OTHER}, true)`;
          await tx`SET LOCAL ROLE authenticated`;
          try { await run(tx as unknown as Pg); } catch (err) { assertion = err; }
          // Always leave by rolling back. A refused statement rejects the
          // transaction as well as the query, and the transaction's copy would
          // otherwise fail the test the query's copy was there to prove.
          throw new Error("deliberate rollback");
        }).catch(() => {});
        if (assertion) throw assertion;
      };
      // The owner's own answers are readable; another customer's are not there.
      await asOther(async (tx) => {
        expect((await tx`SELECT 1 FROM outcome_consent_log`).length).toBe(0);
      });
      // Wrapped in a thunk: postgres.js raises a refused statement as the tag
      // is evaluated, so `expect(tag).rejects` never sees a promise to reject.
      const refused = (run: () => unknown) => expect((async () => { await run(); })()).rejects.toThrow(/permission denied/);
      await asOther(async (tx) => {
        await refused(() => tx`INSERT INTO outcome_consent_log (user_id, consent) VALUES (${OTHER}, true)`);
      });
      // The flag itself is never written from the browser: the function that
      // writes it and its history together is service-only.
      await asOther(async (tx) => {
        await refused(() => tx`SELECT set_outcome_consent(${OTHER}, true, 'prompt')`);
      });
      // Reading it is service-only as well, so one customer cannot ask the
      // database what another one answered.
      await asOther(async (tx) => {
        await refused(() => tx`SELECT outcome_consent_state(${USER})`);
      });
    });
  });
});
