import postgres from "postgres";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, it, expect } from "vitest";

const url=process.env.FUNCTION_AUTH_TEST_URL;
describe.skipIf(!url)("selected function authorization",()=>{
 let sql:ReturnType<typeof postgres>;
 beforeAll(async()=>{
  if(!url?.includes('127.0.0.1')) throw new Error('Isolated local database required');
  sql=postgres(url,{max:1});
  await sql.unsafe(`CREATE SCHEMA auth;
   CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
   CREATE FUNCTION has_role(uuid,text) RETURNS boolean LANGUAGE sql AS $$ SELECT coalesce(current_setting('test.admin',true),'false')='true' $$;
   CREATE TABLE system_alerts(category text,severity text,created_at timestamptz,resolved boolean,user_id uuid,message text,details jsonb);
   CREATE FUNCTION admin_get_lead_intelligence_outcomes() RETURNS TABLE(dimension text,bucket text,leads bigint,emails_sent bigint,replies bigint) LANGUAGE sql AS $$
    WITH guard AS (SELECT true AS ok) SELECT 'icp_fit'::text,'high'::text,1::bigint,2::bigint,1::bigint FROM guard WHERE ok;
   $$;`);
  await sql.unsafe(readFileSync('supabase/migrations/20260910201657_74f42f27-1c83-4c29-8f2a-ed42b6d306d6.sql','utf8'));
  await sql.unsafe(readFileSync('drizzle/migrations/0067_explicit_outcomes_and_status_authorization.sql','utf8'));
 });
 afterAll(async()=>{if(sql) await sql.end();});
 it('rejects signed-out calls and ordinary users requesting admin outcomes',async()=>{
  await expect(sql`SELECT * FROM get_service_status()`).rejects.toMatchObject({code:'42501'});
  await expect(sql`SELECT * FROM admin_get_lead_intelligence_outcomes()`).rejects.toMatchObject({code:'42501'});
  await sql`SELECT set_config('test.user','00000000-0000-0000-0000-000000000001',false)`;
  await expect(sql`SELECT * FROM admin_get_lead_intelligence_outcomes()`).rejects.toMatchObject({code:'42501'});
 });
 it('retains the admin report for verified admins',async()=>{
  await sql`SELECT set_config('test.admin','true',false)`;
  const rows=await sql`SELECT * FROM admin_get_lead_intelligence_outcomes()`;
  expect(rows).toHaveLength(1);
 });
 it('returns only safe platform-wide summaries, never private alert content',async()=>{
  await sql`INSERT INTO system_alerts VALUES
   ('system_health','error',now(),false,NULL,'private message','{"secret":"private"}'),
   ('system_health','critical',now(),false,'00000000-0000-0000-0000-000000000002','customer message','{}'),
   ('internal_only','critical',now(),false,NULL,'internal message','{}'),
   ('system_health','critical',now()-interval '24 hours',false,NULL,'old message','{}')`;
  const rows=await sql`SELECT * FROM get_service_status()`;
  expect(rows).toHaveLength(1);
  expect(Object.keys(rows[0]).sort()).toEqual(['category','severity','since']);
 });
 it('signed-out roles cannot execute either function',async()=>{
  const [row]=await sql`SELECT has_function_privilege('anon','get_service_status()','EXECUTE') AS status,has_function_privilege('anon','admin_get_lead_intelligence_outcomes()','EXECUTE') AS outcomes`;
  expect(row).toEqual({status:false,outcomes:false});
 });
});