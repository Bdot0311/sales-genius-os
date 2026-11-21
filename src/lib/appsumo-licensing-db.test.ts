import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';

const url = process.env.APPSUMO_DB_TEST_URL;
describe.skipIf(!url)('AppSumo durable licensing rules', () => {
  let sql: ReturnType<typeof postgres>;
  let tick = Date.now();
  beforeAll(async () => {
    if (!url || !url.includes('127.0.0.1') || !url.includes('appsumo_licensing_tests')) throw new Error('Isolated AppSumo test database required');
    sql = postgres(url, { max: 1 });
    await sql.unsafe(`
      DO $$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
      END $$;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TYPE public.subscription_plan AS ENUM('free','starter','growth','pro','agency');
      CREATE TABLE profiles(id uuid PRIMARY KEY);
      CREATE TABLE user_roles(user_id uuid,role text);
      CREATE FUNCTION public.has_role(owner_id uuid,role_name text) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=owner_id AND role=role_name) $$;
      CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,plan subscription_plan DEFAULT 'free',status text DEFAULT 'active',account_status text DEFAULT 'active',leads_limit int DEFAULT 100,search_credits_base int DEFAULT 0,search_credits_remaining int DEFAULT 0,search_credits_addon int DEFAULT 0,daily_email_limit int DEFAULT 10,trial_end_date timestamptz,previous_plan subscription_plan,credits_reset_at timestamptz,current_period_start timestamptz DEFAULT now(),current_period_end timestamptz DEFAULT now()+interval '1 month',updated_at timestamptz DEFAULT now(),stripe_subscription_id text,billing_exempt boolean DEFAULT false);
      CREATE TABLE schema_contract(table_name text,column_name text,note text,UNIQUE(table_name,column_name));
      CREATE FUNCTION public._system_health_checks() RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN PERFORM 1 FROM subscriptions WHERE plan<>'free' AND NOT billing_exempt; RETURN '{}'::jsonb; END $$;
    `);
    for (const file of ['0068_appsumo_licensing.sql', '0069_appsumo_monthly_terms_and_states.sql']) await sql.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    await sql.unsafe(`INSERT INTO appsumo_plan_config(tier,plan,credits,daily_email_limit,renewal) VALUES (1,'starter',1000,100,'monthly'),(2,'growth',2500,250,'monthly'),(3,'pro',5000,500,'monthly'),(4,'agency',15000,1500,'monthly'),(5,'agency',15000,1500,'monthly')`);
  });
  afterAll(async () => { if (sql) await sql.end(); });
  async function owner() {
    const id = crypto.randomUUID();
    await sql`INSERT INTO profiles(id) VALUES(${id})`;
    await sql`INSERT INTO subscriptions(user_id) VALUES(${id})`;
    return id;
  }
  async function event(key: string, type: string, tier = 1, previous?: string, isTest = false) {
    const payload = { license_key: key, event: type, tier, event_timestamp: ++tick, test: isTest, ...(previous ? { prev_license_key: previous } : {}) };
    await sql`SELECT appsumo_apply_event(${sql.json(payload)})`;
    return payload;
  }
  async function link(key: string, user: string) {
    const claim = crypto.randomUUID(); // Isolated database fixture, not a deployed credential.
    await sql`INSERT INTO appsumo_redemption_claims(token_hash,license_key,expires_at) VALUES(${claim},${key},now()+interval '30 minutes')`;
    await sql`SELECT appsumo_claim_license(${claim},${user})`;
    return claim;
  }
  it('Done-for-you receives Agency and 15,000 monthly credits without billing exemption', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await event(key, 'activate', 5); await link(key, id);
    const [row] = await sql`SELECT plan,search_credits_base,search_credits_remaining,billing_exempt,credits_reset_at>now() AS renews,current_period_end<now()+interval '2 months' AS monthly FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ plan: 'agency', search_credits_base: 15000, search_credits_remaining: 15000, billing_exempt: false, renews: true, monthly: true });
  });
  it('duplicate activation and repeated claim do not refill spent credits', async () => {
    const id = await owner(), key = crypto.randomUUID();
    const payload = await event(key, 'activate'); const claim = await link(key, id);
    await sql`UPDATE subscriptions SET search_credits_remaining=700 WHERE user_id=${id}`;
    await sql`SELECT appsumo_apply_event(${sql.json(payload)})`;
    await event(key, 'activate');
    await sql`SELECT appsumo_claim_license(${claim},${id})`;
    const [row] = await sql`SELECT search_credits_remaining FROM subscriptions WHERE user_id=${id}`;
    expect(row.search_credits_remaining).toBe(700);
  });
  it('upgrade transfers ownership and a delayed old-key deactivation cannot revoke the new plan', async () => {
    const id = await owner(), old = crypto.randomUUID(), next = crypto.randomUUID();
    await event(old, 'activate'); await link(old, id);
    await event(next, 'upgrade', 2, old); await event(old, 'deactivate');
    const [row] = await sql`SELECT plan,appsumo_license_key FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ plan: 'growth', appsumo_license_key: next });
    const [previous] = await sql`SELECT license_status FROM appsumo_licenses WHERE license_key=${old}`;
    expect(previous.license_status).toBe('inactive');
  });
  it('cancellation removes only the AppSumo plan and reactivation does not regrant credits', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await event(key, 'activate'); await link(key, id);
    await sql`UPDATE subscriptions SET search_credits_remaining=700 WHERE user_id=${id}`;
    await event(key, 'deactivate');
    const [off] = await sql`SELECT plan,appsumo_license_key FROM subscriptions WHERE user_id=${id}`;
    expect(off).toEqual({ plan: 'free', appsumo_license_key: null });
    await event(key, 'activate');
    const [on] = await sql`SELECT plan,search_credits_remaining FROM subscriptions WHERE user_id=${id}`;
    expect(on).toEqual({ plan: 'starter', search_credits_remaining: 700 });
  });
  it('Starter renews monthly by resetting to 1,000, only once per period', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await event(key, 'activate'); await link(key, id);
    await sql`UPDATE subscriptions SET search_credits_remaining=700,credits_reset_at=now()-interval '1 second' WHERE user_id=${id}`;
    await sql`SELECT appsumo_refresh_credits()`; await sql`SELECT appsumo_refresh_credits()`;
    const [row] = await sql`SELECT search_credits_remaining FROM subscriptions WHERE user_id=${id}`;
    expect(row.search_credits_remaining).toBe(1000);
  });
  it('Agency monthly renewal retains normal rollover and adds 15,000 only once', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await event(key, 'activate', 4); await link(key, id);
    await sql`UPDATE subscriptions SET search_credits_remaining=100,credits_reset_at=now()-interval '1 second' WHERE user_id=${id}`;
    await sql`SELECT appsumo_refresh_credits()`; await sql`SELECT appsumo_refresh_credits()`;
    const [row] = await sql`SELECT search_credits_remaining FROM subscriptions WHERE user_id=${id}`;
    expect(row.search_credits_remaining).toBe(15100);
  });
  it('a consumed claim cannot be linked to another account', async () => {
    const id = await owner(), other = await owner(), key = crypto.randomUUID();
    await event(key, 'activate'); const claim = await link(key, id);
    await expect(sql`SELECT appsumo_claim_license(${claim},${other})`).rejects.toThrow('already used');
  });
  it('test licenses can never be redeemed to a real account', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await event(key, 'activate', 1, undefined, true);
    await expect(link(key, id)).rejects.toThrow('not redeemable');
  });
  it('existing Stripe subscriptions are not overwritten', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await sql`UPDATE subscriptions SET stripe_subscription_id='test_existing_subscription' WHERE user_id=${id}`;
    await event(key, 'activate');
    await expect(link(key, id)).rejects.toThrow('existing billed subscription');
    const [license] = await sql`SELECT user_id FROM appsumo_licenses WHERE license_key=${key}`;
    expect(license.user_id).toBeNull();
  });
  it('customer roles cannot execute event, claim or renewal helpers', async () => {
    const [row] = await sql`SELECT has_function_privilege('authenticated','appsumo_apply_event(jsonb)','EXECUTE') AS event,has_function_privilege('authenticated','appsumo_claim_license(text,uuid)','EXECUTE') AS claim,has_function_privilege('anon','appsumo_refresh_credits()','EXECUTE') AS renewal`;
    expect(row).toEqual({ event: false, claim: false, renewal: false });
  });
});