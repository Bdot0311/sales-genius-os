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
      CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid UNIQUE,plan subscription_plan DEFAULT 'free',status text DEFAULT 'active',account_status text DEFAULT 'active',leads_limit int DEFAULT 100,search_credits_base int DEFAULT 0,search_credits_remaining int DEFAULT 0,search_credits_addon int DEFAULT 0,daily_email_limit int DEFAULT 10,trial_end_date timestamptz,previous_plan subscription_plan,credits_reset_at timestamptz,current_period_start timestamptz DEFAULT now(),current_period_end timestamptz DEFAULT now()+interval '1 month',updated_at timestamptz DEFAULT now(),stripe_subscription_id text,stripe_customer_id text,billing_exempt boolean DEFAULT false);
      CREATE FUNCTION public.billing_downgrade_to_free(owner_id uuid,reason text,details jsonb) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN UPDATE subscriptions SET plan='free',search_credits_base=100,search_credits_remaining=least(search_credits_remaining,100),leads_limit=100 WHERE user_id=owner_id; RETURN FOUND; END $$;
      CREATE TABLE schema_contract(table_name text,column_name text,note text,UNIQUE(table_name,column_name));
      CREATE FUNCTION public._system_health_checks() RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN PERFORM 1 FROM subscriptions WHERE plan<>'free' AND NOT billing_exempt; RETURN '{}'::jsonb; END $$;
    `);
    for (const file of ['0068_appsumo_licensing.sql', '0069_appsumo_monthly_terms_and_states.sql', '0081_require_stripe_for_customer_paid_plans.sql']) await sql.unsafe(readFileSync(`drizzle/migrations/${file}`, 'utf8'));
    await sql.unsafe(`CREATE TRIGGER enforce_admin_billing_exemption BEFORE INSERT OR UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION enforce_admin_billing_exemption();
      CREATE TRIGGER sync_admin_billing_exemption AFTER INSERT OR UPDATE OR DELETE ON user_roles FOR EACH ROW EXECUTE FUNCTION sync_admin_billing_exemption();`);
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
  it('an AppSumo Agency claim stays Free without Stripe and grants no 15,000-credit pool', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await event(key, 'activate', 5); await link(key, id);
    const [row] = await sql`SELECT plan,search_credits_base,search_credits_remaining,billing_exempt,appsumo_license_key FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ plan: 'free', search_credits_base: 0, search_credits_remaining: 0, billing_exempt: false, appsumo_license_key: key });
  });
  it('activation, upgrade and repeated claim never grant a paid tier', async () => {
    const id = await owner(), old = crypto.randomUUID(), next = crypto.randomUUID();
    const payload = await event(old, 'activate'); const claim = await link(old, id);
    await sql`SELECT appsumo_apply_event(${sql.json(payload)})`;
    await sql`SELECT appsumo_claim_license(${claim},${id})`;
    await event(next, 'upgrade', 3, old); await event(old, 'deactivate');
    const [row] = await sql`SELECT plan,appsumo_license_key,search_credits_remaining FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ plan: 'free', appsumo_license_key: next, search_credits_remaining: 0 });
  });
  it('AppSumo renewal does not reset or add credits even on a linked Stripe plan', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await event(key, 'activate', 4); await link(key, id);
    await sql`UPDATE subscriptions SET plan='agency',stripe_customer_id='cus_fixture',stripe_subscription_id='sub_fixture',search_credits_base=15000,search_credits_remaining=100,credits_reset_at=now()-interval '1 second' WHERE user_id=${id}`;
    const [renewal] = await sql`SELECT appsumo_refresh_credits() AS renewed`;
    const [row] = await sql`SELECT plan,search_credits_remaining FROM subscriptions WHERE user_id=${id}`;
    expect(renewal.renewed).toBe(0);
    expect(row).toEqual({ plan: 'agency', search_credits_remaining: 100 });
  });
  it('AppSumo cancellation and reactivation do not overwrite the Stripe tier or balance', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await event(key, 'activate'); await link(key, id);
    await sql`UPDATE subscriptions SET plan='pro',stripe_customer_id='cus_fixture',stripe_subscription_id='sub_fixture',search_credits_base=5000,search_credits_remaining=700 WHERE user_id=${id}`;
    await event(key, 'deactivate');
    const [off] = await sql`SELECT plan,appsumo_license_key FROM subscriptions WHERE user_id=${id}`;
    expect(off).toEqual({ plan: 'pro', appsumo_license_key: null });
    await event(key, 'activate');
    const [on] = await sql`SELECT plan,search_credits_remaining FROM subscriptions WHERE user_id=${id}`;
    expect(on).toEqual({ plan: 'pro', search_credits_remaining: 700 });
  });
  it.each(['starter', 'growth', 'pro', 'agency'])('rejects a backend %s grant without a Stripe subscription', async plan => {
    const id = await owner();
    await expect(sql`UPDATE subscriptions SET plan=${plan},billing_exempt=true WHERE user_id=${id}`).rejects.toThrow('Stripe subscription is required');
    const [row] = await sql`SELECT plan,billing_exempt FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ plan: 'free', billing_exempt: false });
  });
  it('rejects a forged trial or customer ID without a subscription ID', async () => {
    const id = await owner();
    await expect(sql`UPDATE subscriptions SET plan='pro',account_status='trial',trial_end_date=now()+interval '30 days',stripe_customer_id='cus_fixture' WHERE user_id=${id}`).rejects.toThrow('Stripe subscription is required');
  });
  it('preserves protected administrator access without Stripe', async () => {
    const id = await owner();
    await sql`INSERT INTO user_roles(user_id,role) VALUES(${id},'admin')`;
    await sql`UPDATE subscriptions SET plan='agency' WHERE user_id=${id}`;
    const [row] = await sql`SELECT plan,billing_exempt FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ plan: 'agency', billing_exempt: true });
  });
  it('removing an administrator role returns an unbilled paid account to Free', async () => {
    const id = await owner();
    await sql`INSERT INTO user_roles(user_id,role) VALUES(${id},'admin')`;
    await sql`UPDATE subscriptions SET plan='agency' WHERE user_id=${id}`;
    await sql`DELETE FROM user_roles WHERE user_id=${id} AND role='admin'`;
    const [row] = await sql`SELECT plan,billing_exempt FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ plan: 'free', billing_exempt: false });
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
  it('an AppSumo claim records attribution without overwriting an existing Stripe subscription', async () => {
    const id = await owner(), key = crypto.randomUUID();
    await sql`UPDATE subscriptions SET plan='pro',stripe_customer_id='cus_fixture',stripe_subscription_id='sub_fixture',search_credits_remaining=456 WHERE user_id=${id}`;
    await event(key, 'activate'); await link(key, id);
    const [row] = await sql`SELECT plan,stripe_subscription_id,search_credits_remaining FROM subscriptions WHERE user_id=${id}`;
    expect(row).toEqual({ plan: 'pro', stripe_subscription_id: 'sub_fixture', search_credits_remaining: 456 });
  });
  it('customer roles cannot execute event, claim or renewal helpers', async () => {
    const [row] = await sql`SELECT has_function_privilege('authenticated','appsumo_apply_event(jsonb)','EXECUTE') AS event,has_function_privilege('authenticated','appsumo_claim_license(text,uuid)','EXECUTE') AS claim,has_function_privilege('anon','appsumo_refresh_credits()','EXECUTE') AS renewal`;
    expect(row).toEqual({ event: false, claim: false, renewal: false });
  });
});