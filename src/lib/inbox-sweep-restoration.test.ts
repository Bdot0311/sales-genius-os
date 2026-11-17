import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const migration = readFileSync("drizzle/migrations/0061_restore_inbox_sync_sweep_helpers.sql", "utf8");

describe("restored scheduled inbox sweep", () => {
  it("ships all five service-only helpers without replacing the managed schedule", () => {
    for (const name of ["claim_inbox_sync_sweep", "release_inbox_sync_sweep", "next_inbox_sync_users", "note_inbox_sync_started", "record_inbox_sync_result"]) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${name}(`);
    }
    expect(migration.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g)).toHaveLength(5);
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).not.toContain("cron.schedule");
    expect(migration).not.toContain("REFERENCES auth.users");
  });

  it("enforces the real database lease, forty-user limit, rotation and private access", (ctx) => {
    if (!process.env.PGHOST) { ctx.skip(); return; }
    const permitted = execFileSync("psql", ["-X", "-At", "-c", "SELECT has_function_privilege(current_user,'public.release_inbox_sync_sweep()','EXECUTE');"], { encoding: "utf8" }).trim();
    if (permitted !== "t") { ctx.skip(); return; }
    // All mutations are rolled back. No mail, provider requests or cron changes.
    const result = execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-At"], {
      encoding: "utf8",
      input: `BEGIN;
        SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
        DO $$ DECLARE claimed boolean; owner uuid; failures integer; BEGIN
          IF to_regprocedure('public.claim_inbox_sync_sweep(integer)') IS NULL THEN RAISE EXCEPTION 'sweep helper missing'; END IF;
          IF has_function_privilege('anon','public.claim_inbox_sync_sweep(integer)','EXECUTE') OR has_function_privilege('authenticated','public.claim_inbox_sync_sweep(integer)','EXECUTE') THEN RAISE EXCEPTION 'customer can claim sweep'; END IF;
          IF NOT has_function_privilege('service_role','public.claim_inbox_sync_sweep(integer)','EXECUTE') THEN RAISE EXCEPTION 'backend cannot claim sweep'; END IF;
          IF has_table_privilege('authenticated','public.inbox_sync_cursors','UPDATE') THEN RAISE EXCEPTION 'customer can write cursor'; END IF;
          SELECT id INTO owner FROM public.profiles LIMIT 1;
          IF owner IS NULL THEN RAISE EXCEPTION 'real profile required'; END IF;
          PERFORM public.release_inbox_sync_sweep();
          claimed := public.claim_inbox_sync_sweep(180);
          IF claimed IS DISTINCT FROM true THEN RAISE EXCEPTION 'first lease rejected'; END IF;
          IF public.claim_inbox_sync_sweep(180) IS DISTINCT FROM false THEN RAISE EXCEPTION 'overlapping lease allowed'; END IF;
          IF NOT EXISTS (SELECT 1 FROM public.inbox_sync_lock WHERE locked_until=now()+interval '180 seconds') THEN RAISE EXCEPTION 'lease length incorrect'; END IF;
          PERFORM public.release_inbox_sync_sweep();
          IF public.claim_inbox_sync_sweep(180) IS DISTINCT FROM true THEN RAISE EXCEPTION 'released lease unavailable'; END IF;
          IF (SELECT count(*) FROM public.next_inbox_sync_users(100)) > 40 THEN RAISE EXCEPTION 'candidate cap exceeded'; END IF;
          PERFORM public.note_inbox_sync_started(owner);
          IF NOT EXISTS(SELECT 1 FROM public.inbox_sync_cursors WHERE user_id=owner AND last_attempt_at=now()) THEN RAISE EXCEPTION 'rotation not recorded'; END IF;
          PERFORM public.record_inbox_sync_result(owner,NULL);
          failures := public.record_inbox_sync_result(owner,'synthetic failure');
          IF failures <> 1 THEN RAISE EXCEPTION 'failure not counted'; END IF;
          failures := public.record_inbox_sync_result(owner,NULL);
          IF failures <> 0 OR NOT EXISTS(SELECT 1 FROM public.inbox_sync_cursors WHERE user_id=owner AND last_success_at=now() AND last_error IS NULL) THEN RAISE EXCEPTION 'success not recorded'; END IF;
        END $$;
        SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
        DO $$ BEGIN
          BEGIN PERFORM public.claim_inbox_sync_sweep(180); RAISE EXCEPTION 'customer accepted';
          EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'claim_inbox_sync_sweep is internal' THEN RAISE; END IF; END;
        END $$;
        ROLLBACK;
        SELECT 'sweep-regressions-passed';`,
    });
    expect(result).toContain("sweep-regressions-passed");
  });
});