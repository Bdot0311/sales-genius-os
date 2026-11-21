import { PG_BOOTSTRAP_SQL } from "./test-support/pg-bootstrap";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { describe, expect, it } from "vitest";

const PG_URL = process.env.AUDIT_PG_URL ?? "postgresql://audit:audit@127.0.0.1/audit_test";

describe("agent mission claims and tenant isolation", () => {
  it("keeps the flag off, isolates workspaces, and claims a window once", async (ctx) => {
    if (!PG_URL.includes("127.0.0.1") && !PG_URL.includes("localhost")) {
      throw new Error("refusing to create test roles outside local postgres");
    }
    let sql: ReturnType<typeof postgres> | null = null;
    try {
      sql = postgres(PG_URL, { max: 1, connect_timeout: 2 });
      await sql`select 1`;
    } catch (err) {
      if (sql) await sql.end({ timeout: 1 });
      if (process.env.AUDIT_PG_REQUIRED === "1") throw err;
      ctx.skip();
      return;
    }

    try {
      const bootstrap = `
        ${PG_BOOTSTRAP_SQL}
        DO $$ BEGIN
          CREATE TYPE public.app_role AS ENUM ('admin', 'user');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
        CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
        RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
        CREATE TABLE IF NOT EXISTS public.team_members (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          team_owner_id uuid NOT NULL,
          member_email text NOT NULL,
          member_user_id uuid,
          role text NOT NULL DEFAULT 'member',
          status text NOT NULL DEFAULT 'pending',
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS public.feature_flags (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          name text UNIQUE NOT NULL,
          description text,
          is_enabled boolean NOT NULL DEFAULT false,
          target_plans text[]
        );
        DELETE FROM public.feature_flags WHERE name = 'agentMissions';
        CREATE TABLE IF NOT EXISTS public.agent_configs (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL
        );
        CREATE TABLE IF NOT EXISTS public.icp_profiles (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL
        );
        CREATE TABLE IF NOT EXISTS public.email_sequences (
          id uuid PRIMARY KEY,
          user_id uuid NOT NULL
        );
        CREATE TABLE IF NOT EXISTS public.agent_jobs (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL,
          agent_config_id uuid,
          kind text NOT NULL DEFAULT 'draft',
          request_text text,
          autonomy text NOT NULL DEFAULT 'approval',
          goal text NOT NULL DEFAULT 'introduction',
          status text NOT NULL DEFAULT 'queued',
          total integer NOT NULL DEFAULT 0,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS public.agent_job_items (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          job_id uuid NOT NULL,
          user_id uuid NOT NULL,
          lead_id uuid,
          status text NOT NULL DEFAULT 'pending',
          payload jsonb,
          created_at timestamptz NOT NULL DEFAULT now()
        );`;
      const [me] = await sql`SELECT current_user AS name, rolsuper FROM pg_roles WHERE rolname = current_user`;
      if (me.rolsuper) await sql.unsafe(bootstrap);
      else {
        const dbName = new URL(PG_URL).pathname.replace(/^\//, "") || "audit_test";
        const member = String(me.name).replace(/"/g, "");
        execFileSync("sudo", ["-u", "postgres", "psql", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-c",
          `${bootstrap}\nGRANT anon, authenticated, service_role TO "${member}";`], { stdio: "pipe" });
      }
      await sql.unsafe(readFileSync("supabase/migrations/20261117120000_agent_missions.sql", "utf8"));
      await sql.unsafe(readFileSync("supabase/migrations/20261121120000_agent_mission_guards.sql", "utf8"));

      const owner = crypto.randomUUID();
      const other = crypto.randomUUID();
      const agent = crypto.randomUUID();
      const raceAgent = crypto.randomUUID();
      const queueAgent = crypto.randomUUID();
      const foreignAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES
        (${agent}::uuid, ${owner}::uuid),
        (${raceAgent}::uuid, ${owner}::uuid),
        (${queueAgent}::uuid, ${owner}::uuid),
        (${foreignAgent}::uuid, ${other}::uuid)`;

      const [off] = await sql`SELECT is_enabled FROM public.feature_flags WHERE name = 'agentMissions'`;
      expect(off.is_enabled).toBe(false);

      const hidden = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT public.agent_missions_enabled() AS on`;
      });
      expect(hidden[0].on).toBe(false);

      await sql`UPDATE public.feature_flags SET is_enabled = true WHERE name = 'agentMissions'`;
      await sql`INSERT INTO public.agent_mission_grants (user_id, enabled) VALUES (${owner}::uuid, true)`;
      const mission = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, mode, status, timezone, days_of_week, run_hour, run_minute, next_run_at
      ) VALUES (
        ${owner}::uuid, ${agent}::uuid, 'Ops', 'Find ops leaders', 'approval', 'active',
        'America/New_York', ARRAY[1,2,3,4,5]::smallint[], 7, 0, now() - interval '1 minute'
      ) RETURNING id`;

      await expect(sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, next_run_at
      ) VALUES (
        ${owner}::uuid, ${foreignAgent}::uuid, 'Cross', 'Nope', now()
      )`).rejects.toThrow(/agent_missions_agent_fkey|foreign key/i);

      const seen = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT name FROM public.agent_missions`;
      });
      expect(seen.map((row) => row.name)).toEqual(["Ops"]);

      const otherSees = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${other}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`SELECT id FROM public.agent_missions`;
      });
      expect(otherSees).toEqual([]);

      await expect(sql.begin(async (tx) => {
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT public.claim_agent_mission_run(${mission[0].id}::uuid)`;
      })).rejects.toThrow(/permission denied/i);

      const [next] = await sql`SELECT public.agent_mission_next_run(
        '2026-11-16 22:00:00+00'::timestamptz, 'America/New_York', ARRAY[1,2,3,4,5]::smallint[], 7, 0
      ) AS at`;
      expect(new Date(next.at).toISOString()).toBe("2026-11-17T12:00:00.000Z");

      const [firstClaim] = await sql`SELECT public.claim_agent_mission_run(${mission[0].id}::uuid) AS id`;
      expect(firstClaim.id).toBeTruthy();
      const [secondClaim] = await sql`SELECT public.claim_agent_mission_run(${mission[0].id}::uuid) AS id`;
      expect(secondClaim.id).toBeNull();

      const raceMission = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, status, next_run_at
      ) VALUES (
        ${owner}::uuid, ${raceAgent}::uuid, 'Race', 'Find more', 'active', now() - interval '1 minute'
      ) RETURNING id`;
      const left = postgres(PG_URL, { max: 1 });
      const right = postgres(PG_URL, { max: 1 });
      try {
        const [a, b] = await Promise.all([
          left`SELECT public.claim_agent_mission_run(${raceMission[0].id}::uuid) AS id`,
          right`SELECT public.claim_agent_mission_run(${raceMission[0].id}::uuid) AS id`,
        ]);
        const won = [a[0].id, b[0].id].filter(Boolean);
        expect(won).toHaveLength(1);
      } finally {
        await left.end({ timeout: 1 });
        await right.end({ timeout: 1 });
      }
      const [runs] = await sql`SELECT count(*)::int AS n FROM public.agent_mission_runs WHERE mission_id = ${raceMission[0].id}::uuid`;
      expect(runs.n).toBe(1);

      const queued = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, mode, status, next_run_at
      ) VALUES (
        ${owner}::uuid, ${queueAgent}::uuid, 'Queue', 'Find and draft', 'autopilot', 'active', now() - interval '1 minute'
      ) RETURNING id`;
      const [enqueued] = await sql`SELECT public.enqueue_due_agent_missions() AS n`;
      expect(Number(enqueued.n)).toBeGreaterThanOrEqual(1);
      const jobs = await sql`SELECT j.id FROM public.agent_jobs j
        JOIN public.agent_mission_runs r ON r.job_id = j.id
        WHERE r.mission_id = ${queued[0].id}::uuid AND j.kind = 'mission'`;
      expect(jobs).toHaveLength(1);
      await sql`SELECT public.enqueue_due_agent_missions()`;
      const jobsAgain = await sql`SELECT j.id FROM public.agent_jobs j
        JOIN public.agent_mission_runs r ON r.job_id = j.id
        WHERE r.mission_id = ${queued[0].id}::uuid`;
      expect(jobsAgain).toHaveLength(1);
      const [runCount] = await sql`SELECT count(*)::int AS n FROM public.agent_mission_runs WHERE mission_id = ${queued[0].id}::uuid`;
      expect(runCount.n).toBe(1);

      const retryAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES (${retryAgent}::uuid, ${owner}::uuid)`;
      const [retryMission] = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, status, next_run_at
      ) VALUES (
        ${owner}::uuid, ${retryAgent}::uuid, 'Retry', 'Find', 'active', now() + interval '1 day'
      ) RETURNING id`;
      const [retryRun] = await sql`INSERT INTO public.agent_mission_runs (mission_id, user_id, window_key, status)
        VALUES (${retryMission.id}::uuid, ${owner}::uuid, 'retry-window', 'running') RETURNING id`;
      for (let attempt = 0; attempt < 3; attempt++) {
        const [jobId] = await sql`SELECT public.agent_mission_ensure_job(${retryRun.id}::uuid) AS id`;
        expect(jobId.id).toBeTruthy();
        await sql`UPDATE public.agent_job_items SET status = 'failed' WHERE job_id = ${jobId.id}::uuid`;
      }
      const [gaveUp] = await sql`SELECT public.agent_mission_ensure_job(${retryRun.id}::uuid) AS id`;
      expect(gaveUp.id).toBeNull();
      const [failedRun] = await sql`SELECT status FROM public.agent_mission_runs WHERE id = ${retryRun.id}::uuid`;
      expect(failedRun.status).toBe("failed");
      const [pausedMission] = await sql`SELECT status FROM public.agent_missions WHERE id = ${retryMission.id}::uuid`;
      expect(pausedMission.status).toBe("paused");
      const [retryJobs] = await sql`SELECT count(*)::int AS n FROM public.agent_jobs j
        JOIN public.agent_mission_runs r ON r.mission_id = ${retryMission.id}::uuid
        WHERE j.user_id = ${owner}::uuid AND j.kind = 'mission' AND j.request_text = 'Find'`;
      expect(retryJobs.n).toBe(3);

      const stuckAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES (${stuckAgent}::uuid, ${owner}::uuid)`;
      const [stuckMission] = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, status, next_run_at
      ) VALUES (
        ${owner}::uuid, ${stuckAgent}::uuid, 'Stuck', 'Find', 'paused', now() + interval '1 day'
      ) RETURNING id`;
      for (let i = 0; i < 26; i++) {
        await sql`INSERT INTO public.agent_mission_runs (mission_id, user_id, window_key, status, created_at)
          VALUES (${stuckMission.id}::uuid, ${owner}::uuid, ${`stuck-${i}`}, 'running', now() - interval '3 hours')`;
      }
      const goodAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES (${goodAgent}::uuid, ${owner}::uuid)`;
      const [goodMission] = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, status, next_run_at
      ) VALUES (
        ${owner}::uuid, ${goodAgent}::uuid, 'Good', 'Find', 'active', now() + interval '2 days'
      ) RETURNING id`;
      const [goodRun] = await sql`INSERT INTO public.agent_mission_runs (mission_id, user_id, window_key, status, created_at)
        VALUES (${goodMission.id}::uuid, ${owner}::uuid, 'good-window', 'queued', now()) RETURNING id`;
      await sql`SELECT public.enqueue_due_agent_missions()`;
      const [skippedOnce] = await sql`SELECT count(*)::int AS n FROM public.agent_mission_runs
        WHERE mission_id = ${stuckMission.id}::uuid AND status = 'skipped'`;
      expect(skippedOnce.n).toBe(25);
      await sql`SELECT public.enqueue_due_agent_missions()`;
      const [skippedTwice] = await sql`SELECT count(*)::int AS n FROM public.agent_mission_runs
        WHERE mission_id = ${stuckMission.id}::uuid AND status = 'skipped'`;
      expect(skippedTwice.n).toBe(26);
      const [goodJob] = await sql`SELECT job_id FROM public.agent_mission_runs WHERE id = ${goodRun.id}::uuid`;
      expect(goodJob.job_id).toBeTruthy();

      await expect(sql`INSERT INTO public.agent_missions (user_id, agent_config_id, name, goal, status, next_run_at)
        VALUES (${owner}::uuid, ${goodAgent}::uuid, 'Second', 'Find', 'active', now() + interval '1 day')
      `).rejects.toThrow(/uq_agent_missions_one_active|unique/i);
      await expect(sql`UPDATE public.agent_missions SET bounce_pause_rate = 1 WHERE id = ${goodMission.id}::uuid`)
        .rejects.toThrow(/bounce|check/i);
      await expect(sql`UPDATE public.agent_missions SET max_runs = 0 WHERE id = ${goodMission.id}::uuid`)
        .rejects.toThrow(/check/i);

      const [used] = await sql`SELECT public.agent_mission_leads_used_today(${owner}::uuid, 'UTC', NULL) AS n`;
      expect(Number(used.n)).toBeGreaterThanOrEqual(0);
      await sql`UPDATE public.agent_mission_runs SET leads_found = 4 WHERE id = ${goodRun.id}::uuid`;
      await sql`UPDATE public.agent_mission_runs SET leads_found = 6 WHERE id = ${retryRun.id}::uuid`;
      const [usedNow] = await sql`SELECT public.agent_mission_leads_used_today(${owner}::uuid, 'UTC', ${goodRun.id}::uuid) AS n`;
      const [usedAll] = await sql`SELECT public.agent_mission_leads_used_today(${owner}::uuid, 'UTC', NULL) AS n`;
      expect(Number(usedAll.n) - Number(usedNow.n)).toBe(4);

      const lead = crypto.randomUUID();
      const [firstSend] = await sql`SELECT public.claim_agent_mission_send(${goodRun.id}::uuid, ${owner}::uuid, ${lead}::uuid) AS state`;
      const [secondSend] = await sql`SELECT public.claim_agent_mission_send(${goodRun.id}::uuid, ${owner}::uuid, ${lead}::uuid) AS state`;
      expect(firstSend.state).toBe("schedule");
      expect(secondSend.state).toBe("schedule");
      const recorded = crypto.randomUUID();
      const [savedSend] = await sql`SELECT public.complete_agent_mission_send(${goodRun.id}::uuid, ${owner}::uuid, ${lead}::uuid, ${recorded}::uuid) AS id`;
      expect(savedSend.id).toBe(recorded);
      const [thirdSend] = await sql`SELECT public.claim_agent_mission_send(${goodRun.id}::uuid, ${owner}::uuid, ${lead}::uuid) AS state`;
      expect(thirdSend.state).toBe("done");
      const capOwner = crypto.randomUUID();
      const capAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES (${capAgent}::uuid, ${capOwner}::uuid)`;
      const [capMission] = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, status, next_run_at
      ) VALUES (
        ${capOwner}::uuid, ${capAgent}::uuid, 'Cap', 'Find', 'active', now() + interval '1 day'
      ) RETURNING id`;
      const [capRun] = await sql`INSERT INTO public.agent_mission_runs (mission_id, user_id, window_key, status)
        VALUES (${capMission.id}::uuid, ${capOwner}::uuid, 'cap-window', 'running') RETURNING id`;
      const [reservedLead] = await sql`SELECT public.claim_agent_mission_lead(${capOwner}::uuid, ${capRun.id}::uuid, 'UTC', 1) AS ok`;
      const [overCap] = await sql`SELECT public.claim_agent_mission_lead(${capOwner}::uuid, ${capRun.id}::uuid, 'UTC', 1) AS ok`;
      expect(reservedLead.ok).toBe(true);
      expect(overCap.ok).toBe(false);
      const [closed] = await sql`SELECT public.claim_agent_mission_lead(${capOwner}::uuid, ${capRun.id}::uuid, 'UTC', NULL::integer) AS ok`;
      expect(closed.ok).toBe(false);

      await expect(sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`UPDATE public.agent_missions SET status = 'paused' WHERE id = ${goodMission.id}::uuid`;
      })).rejects.toThrow(/permission denied/i);

      const member = crypto.randomUUID();
      const admin = crypto.randomUUID();
      await sql`INSERT INTO public.team_members (team_owner_id, member_email, member_user_id, role, status) VALUES
        (${owner}::uuid, 'member@example.com', ${member}::uuid, 'member', 'active'),
        (${owner}::uuid, 'admin@example.com', ${admin}::uuid, 'admin', 'active')`;
      const memberAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES (${memberAgent}::uuid, ${owner}::uuid)`;
      await expect(sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${member}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`INSERT INTO public.agent_missions (user_id, agent_config_id, name, goal, mode)
          VALUES (${member}::uuid, ${memberAgent}::uuid, 'Member auto', 'Find', 'autopilot')`;
      })).rejects.toThrow(/autopilot/i);
      const memberMission = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${member}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        return tx`INSERT INTO public.agent_missions (user_id, agent_config_id, name, goal, mode)
          VALUES (${member}::uuid, ${memberAgent}::uuid, 'Member approval', 'Find', 'approval')
          RETURNING id, user_id, mode`;
      });
      expect(memberMission[0].user_id).toBe(owner);
      expect(memberMission[0].mode).toBe("approval");
      await sql`UPDATE public.agent_missions SET mode = 'autopilot' WHERE id = ${memberMission[0].id}::uuid`;
      await expect(sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${member}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT public.set_agent_mission_status(${memberMission[0].id}::uuid, 'active', NULL)`;
      })).rejects.toThrow(/autopilot/i);
      await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${admin}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT public.set_agent_mission_status(${memberMission[0].id}::uuid, 'paused', 'Paused by admin')`;
      });
      const [pausedByAdmin] = await sql`SELECT status, pause_reason FROM public.agent_missions WHERE id = ${memberMission[0].id}::uuid`;
      expect(pausedByAdmin.status).toBe("paused");
      expect(pausedByAdmin.pause_reason).toBe("Paused by admin");

      const expiredAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES (${expiredAgent}::uuid, ${owner}::uuid)`;
      const [expired] = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, status, timezone, stop_on, next_run_at
      ) VALUES (
        ${owner}::uuid, ${expiredAgent}::uuid, 'Expired', 'Find', 'active', 'UTC',
        (now() AT TIME ZONE 'UTC')::date - 2, now() - interval '1 minute'
      ) RETURNING id`;
      const [expiredRun] = await sql`INSERT INTO public.agent_mission_runs (mission_id, user_id, window_key, status)
        VALUES (${expired.id}::uuid, ${owner}::uuid, 'expired-window', 'running') RETURNING id`;
      await sql`SELECT public.finish_agent_mission_run(${expiredRun.id}::uuid, 'failed', 'provider blip', true)`;
      const [finishedExpired] = await sql`SELECT status FROM public.agent_mission_runs WHERE id = ${expiredRun.id}::uuid`;
      const [pausedByFinish] = await sql`SELECT status FROM public.agent_missions WHERE id = ${expired.id}::uuid`;
      expect(finishedExpired.status).toBe("failed");
      expect(pausedByFinish.status).toBe("paused");
      await sql`UPDATE public.agent_missions SET status = 'active', pause_reason = NULL WHERE id = ${expired.id}::uuid`;

      const [retryExpired] = await sql`INSERT INTO public.agent_mission_runs (mission_id, user_id, window_key, status, job_attempts)
        VALUES (${expired.id}::uuid, ${owner}::uuid, 'expired-retry', 'running', 3) RETURNING id`;
      const [placeholderJob] = await sql`INSERT INTO public.agent_jobs (user_id, kind, status, total)
        VALUES (${owner}::uuid, 'mission', 'failed', 1) RETURNING id`;
      await sql`UPDATE public.agent_mission_runs SET job_id = ${placeholderJob.id}::uuid WHERE id = ${retryExpired.id}::uuid`;
      const [gaveUpExpired] = await sql`SELECT public.agent_mission_ensure_job(${retryExpired.id}::uuid) AS id`;
      expect(gaveUpExpired.id).toBeNull();
      const [pausedExpired] = await sql`SELECT status, pause_reason FROM public.agent_missions WHERE id = ${expired.id}::uuid`;
      expect(pausedExpired.status).toBe("paused");
      expect(pausedExpired.pause_reason).toContain("three times");

      await sql`UPDATE public.agent_missions SET status = 'active', pause_reason = NULL WHERE id = ${expired.id}::uuid`;
      await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`SELECT public.set_agent_mission_status(${expired.id}::uuid, 'stopped', 'Stopped after the date')`;
      });
      const [stoppedExpired] = await sql`SELECT status, pause_reason FROM public.agent_missions WHERE id = ${expired.id}::uuid`;
      expect(stoppedExpired.status).toBe("stopped");
      expect(stoppedExpired.pause_reason).toBe("Stopped after the date");

      await sql`UPDATE public.agent_missions
        SET status = 'active', pause_reason = NULL, next_run_at = now() - interval '1 minute'
        WHERE id = ${expired.id}::uuid`;
      const [claimedExpired] = await sql`SELECT public.claim_agent_mission_run(${expired.id}::uuid) AS id`;
      expect(claimedExpired.id).toBeNull();
      const [stoppedByClaim] = await sql`SELECT status, pause_reason FROM public.agent_missions WHERE id = ${expired.id}::uuid`;
      expect(stoppedByClaim.status).toBe("stopped");
      expect(stoppedByClaim.pause_reason).toBe("Stop date reached.");

      const localAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES (${localAgent}::uuid, ${owner}::uuid)`;
      const [localMission] = await sql`INSERT INTO public.agent_missions (
        user_id, agent_config_id, name, goal, timezone, status, next_run_at
      ) VALUES (
        ${owner}::uuid, ${localAgent}::uuid, 'Local', 'Find', 'America/Los_Angeles', 'active', now() + interval '1 day'
      ) RETURNING id`;
      const savedLocal = await sql.begin(async (tx) => {
        await tx`SET LOCAL TIME ZONE 'Pacific/Kiritimati'`;
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        const [dates] = await tx`SELECT CURRENT_DATE > (now() AT TIME ZONE 'America/Los_Angeles')::date AS ahead`;
        await tx`UPDATE public.agent_missions
          SET stop_on = (now() AT TIME ZONE 'America/Los_Angeles')::date
          WHERE id = ${localMission.id}::uuid`;
        return dates;
      });
      expect(savedLocal.ahead).toBe(true);
      const [localStop] = await sql`SELECT stop_on = (now() AT TIME ZONE 'America/Los_Angeles')::date AS ok
        FROM public.agent_missions WHERE id = ${localMission.id}::uuid`;
      expect(localStop.ok).toBe(true);
      await expect(sql.begin(async (tx) => {
        await tx`SET LOCAL TIME ZONE 'Pacific/Kiritimati'`;
        await tx`SELECT set_config('request.jwt.claim.sub', ${owner}, true)`;
        await tx`SET LOCAL ROLE authenticated`;
        await tx`UPDATE public.agent_missions
          SET stop_on = (now() AT TIME ZONE 'America/Los_Angeles')::date - 1
          WHERE id = ${localMission.id}::uuid`;
      })).rejects.toThrow(/Stop date/);

      const boomAgent = crypto.randomUUID();
      const healthyAgent = crypto.randomUUID();
      await sql`INSERT INTO public.agent_configs (id, user_id) VALUES
        (${boomAgent}::uuid, ${owner}::uuid), (${healthyAgent}::uuid, ${owner}::uuid)`;
      await sql.unsafe(`
        CREATE OR REPLACE FUNCTION public.agent_mission_test_boom() RETURNS trigger
        LANGUAGE plpgsql AS $fn$
        BEGIN
          IF NEW.name = 'Boom' THEN
            RAISE EXCEPTION 'boom mission';
          END IF;
          RETURN NEW;
        END;
        $fn$;
        DROP TRIGGER IF EXISTS agent_mission_test_boom ON public.agent_missions;
        CREATE TRIGGER agent_mission_test_boom
          BEFORE UPDATE ON public.agent_missions
          FOR EACH ROW EXECUTE FUNCTION public.agent_mission_test_boom();
      `);
      try {
        await sql`INSERT INTO public.agent_missions (user_id, agent_config_id, name, goal, status, next_run_at) VALUES
          (${owner}::uuid, ${boomAgent}::uuid, 'Boom', 'Find', 'active', now() - interval '2 minutes'),
          (${owner}::uuid, ${healthyAgent}::uuid, 'Healthy', 'Find', 'active', now() - interval '1 minute')`;
        await expect(sql`SELECT public.enqueue_due_agent_missions()`).resolves.toBeTruthy();
        const healthyRuns = await sql`SELECT r.id FROM public.agent_mission_runs r
          JOIN public.agent_missions m ON m.id = r.mission_id
          WHERE m.name = 'Healthy' AND m.user_id = ${owner}::uuid`;
        const [boom] = await sql`SELECT status FROM public.agent_missions WHERE name = 'Boom' AND user_id = ${owner}::uuid`;
        expect(healthyRuns.length).toBeGreaterThan(0);
        expect(boom.status).toBe("active");
      } finally {
        await sql`DROP TRIGGER IF EXISTS agent_mission_test_boom ON public.agent_missions`;
        await sql`DROP FUNCTION IF EXISTS public.agent_mission_test_boom()`;
      }
    } finally {
      await sql.end({ timeout: 1 });
    }
  });
});
