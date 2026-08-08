import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const DEMO_TABLES = [
  "agent_actions",
  "activities",
  "deals",
  "reply_threads",
  "sent_emails",
  "sequence_enrollments",
  "sequence_steps",
  "email_sequences",
  "leads",
  "companies",
  "personas",
  "icp_profiles",
  "agent_configs",
  "reputation_snapshots",
  "sending_accounts",
  "sending_domains",
] as const;

const COMPANIES = [
  { name: "Northwind Logistics", domain: "northwindlogistics.com", industry: "Logistics", employee_count: 480, revenue_range: "$50M-$100M", city: "Chicago", country: "United States" },
  { name: "Brightpath Health", domain: "brightpathhealth.io", industry: "Healthcare", employee_count: 260, revenue_range: "$25M-$50M", city: "Austin", country: "United States" },
  { name: "Kestrel Software", domain: "kestrelsoftware.com", industry: "SaaS", employee_count: 140, revenue_range: "$10M-$25M", city: "Denver", country: "United States" },
  { name: "Arcadia Manufacturing", domain: "arcadiamfg.com", industry: "Manufacturing", employee_count: 900, revenue_range: "$100M-$250M", city: "Cleveland", country: "United States" },
  { name: "Vertex Financial Group", domain: "vertexfg.com", industry: "Financial Services", employee_count: 320, revenue_range: "$50M-$100M", city: "New York", country: "United States" },
  { name: "Lumen Retail Co", domain: "lumenretail.com", industry: "Retail", employee_count: 610, revenue_range: "$100M-$250M", city: "Toronto", country: "Canada" },
  { name: "Halcyon Energy", domain: "halcyonenergy.com", industry: "Energy", employee_count: 210, revenue_range: "$25M-$50M", city: "Houston", country: "United States" },
  { name: "Tessera Analytics", domain: "tesseraanalytics.com", industry: "SaaS", employee_count: 85, revenue_range: "$5M-$10M", city: "Seattle", country: "United States" },
  { name: "Ridgeline Construction", domain: "ridgelinebuild.com", industry: "Construction", employee_count: 540, revenue_range: "$50M-$100M", city: "Phoenix", country: "United States" },
  { name: "Meridian Insurance", domain: "meridianins.com", industry: "Insurance", employee_count: 430, revenue_range: "$50M-$100M", city: "London", country: "United Kingdom" },
];

const FIRST = ["Sarah", "Daniel", "Priya", "Marcus", "Elena", "Tom", "Aisha", "Jordan", "Nina", "Victor", "Grace", "Owen", "Lena", "Caleb", "Maya", "Ethan", "Ruth", "Felix", "Iris", "Noah"];
const LAST = ["Whitfield", "Okafor", "Raman", "Delgado", "Novak", "Bennett", "Karim", "Ellis", "Petrova", "Alvarez", "Kim", "Sullivan", "Fischer", "Moreau", "Hughes", "Barnes", "Levine", "Duarte", "Chen", "Whitaker"];
const TITLES = [
  { job_title: "VP of Sales", department: "Sales", seniority: "vp" },
  { job_title: "Head of Revenue Operations", department: "Sales", seniority: "head" },
  { job_title: "Director of Demand Generation", department: "Marketing", seniority: "director" },
  { job_title: "Chief Revenue Officer", department: "Sales", seniority: "c_level" },
  { job_title: "Sales Operations Manager", department: "Sales", seniority: "manager" },
  { job_title: "VP of Marketing", department: "Marketing", seniority: "vp" },
  { job_title: "Head of Growth", department: "Marketing", seniority: "head" },
  { job_title: "Director of Business Development", department: "Sales", seniority: "director" },
];
const STAGES = ["new", "new", "contacted", "contacted", "contacted", "replied", "replied", "meeting", "won", "lost"];
const SIGNALS = [
  { signal_type: "hiring", reason: "Posted 4 SDR roles in the last 30 days" },
  { signal_type: "funding", reason: "Raised a Series B two months ago" },
  { signal_type: "tech_change", reason: "Recently added Salesforce and Outreach" },
  { signal_type: "leadership_change", reason: "New CRO started last quarter" },
];

const daysAgo = (d: number, hourOffset = 0) =>
  new Date(Date.now() - d * 86400000 + hourOffset * 3600000).toISOString();

function buildLeads(userId: string) {
  const leads: Record<string, unknown>[] = [];
  for (let i = 0; i < 40; i++) {
    const company = COMPANIES[i % COMPANIES.length];
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    const title = TITLES[i % TITLES.length];
    const signal = SIGNALS[i % SIGNALS.length];
    const stage = STAGES[i % STAGES.length];
    const fit = 55 + ((i * 13) % 45);
    leads.push({
      user_id: userId,
      demo_seed: true,
      company_name: company.name,
      contact_name: `${first} ${last}`,
      contact_email: `${first.toLowerCase()}.${last.toLowerCase()}@${company.domain}`,
      contact_phone: null,
      industry: company.industry,
      company_size: String(company.employee_count),
      employee_count: String(company.employee_count),
      country: company.country,
      company_website: `https://${company.domain}`,
      company_linkedin: `https://linkedin.com/company/${company.domain.split(".")[0]}`,
      company_description: `${company.name} is a ${company.industry.toLowerCase()} company based in ${company.city}.`,
      linkedin_url: `https://linkedin.com/in/${first.toLowerCase()}-${last.toLowerCase()}`,
      job_title: title.job_title,
      department: title.department,
      seniority: title.seniority,
      source: "OutReign Lead Intelligence Network",
      icp_score: fit,
      fit_score: fit,
      tier: fit >= 85 ? "A" : fit >= 70 ? "B" : "C",
      score_reason: `Strong title match (${title.job_title}) and headcount inside the ICP band.`,
      scored_at: daysAgo(3 + (i % 10)),
      score_breakdown: { industry: 25, size: 20, title: 25, tech: fit >= 85 ? 20 : 10 },
      intent_score: 40 + ((i * 11) % 60),
      intent_label: fit >= 80 ? "high" : "medium",
      intent_reasons: [signal.reason],
      recommended_angle: "Lead with pipeline efficiency and reply-rate lift.",
      signal_type: signal.signal_type,
      signal_date: daysAgo(2 + (i % 20)),
      signal_score: 40 + ((i * 9) % 55),
      signals: [signal.signal_type],
      enrichment_status: "enriched",
      enriched_at: daysAgo(5 + (i % 12)),
      research_brief: {
        summary: `${company.name} is scaling outbound. ${signal.reason}.`,
        hooks: [signal.reason, `${title.job_title} owns pipeline targets`],
        confidence: "high",
      },
      research_sources: [`https://${company.domain}/about`, "https://linkedin.com"],
      research_confidence: "high",
      researched_at: daysAgo(4 + (i % 9)),
      pipeline_stage: stage,
      engagement_state: stage === "new" ? "new" : stage === "contacted" ? "contacted" : "engaged",
      last_contacted_at: stage === "new" ? null : daysAgo(1 + (i % 14)),
      technologies: ["Salesforce", "HubSpot", "Outreach"].slice(0, 1 + (i % 3)),
      notes: null,
    });
  }
  return leads;
}

const SEQUENCES = [
  {
    name: "Demo — RevOps Cold Outbound",
    description: "4-step cold sequence for RevOps and Sales leaders.",
    steps: [
      { subject: "quick idea for {{company}}'s pipeline", body: "Hi {{first_name}},\n\nNoticed {{company}} is hiring SDRs. Most teams at that stage lose 30% of pipeline to slow follow-up.\n\nWorth a 15-minute look at how we fix that?\n\n— Alex" },
      { subject: "re: quick idea for {{company}}", body: "Hi {{first_name}},\n\nFollowing up on the note below. Happy to send a 2-minute walkthrough instead of a call if that's easier.\n\n— Alex" },
      { subject: "closing the loop, {{first_name}}", body: "Hi {{first_name}},\n\nLast note from me. If pipeline coverage isn't the priority this quarter, I'll step back.\n\n— Alex" },
      { subject: "one last resource", body: "Hi {{first_name}},\n\nSending over the outbound benchmark report in case it's useful regardless.\n\n— Alex" },
    ],
  },
  {
    name: "Demo — Funding Signal Play",
    description: "Triggered sequence for recently funded accounts.",
    steps: [
      { subject: "congrats on the raise", body: "Hi {{first_name}},\n\nCongrats on the round. Usually the next 90 days are about hitting a new pipeline number fast.\n\nWorth comparing notes?\n\n— Alex" },
      { subject: "re: congrats on the raise", body: "Hi {{first_name}},\n\nBumping this once in case it got buried.\n\n— Alex" },
      { subject: "should I close the file?", body: "Hi {{first_name}},\n\nIf now isn't the moment, just say the word and I'll circle back next quarter.\n\n— Alex" },
    ],
  },
  {
    name: "Demo — Re-engagement",
    description: "Win-back sequence for cold and stalled leads.",
    steps: [
      { subject: "still relevant?", body: "Hi {{first_name}},\n\nWe spoke a while back about outbound. Is pipeline still on your list this quarter?\n\n— Alex" },
      { subject: "new benchmark data for {{company}}", body: "Hi {{first_name}},\n\nJust published reply-rate benchmarks for your segment. Want me to send it over?\n\n— Alex" },
    ],
  },
];

const REPLIES = [
  { classification: "interested", body: "This is timely — we're rebuilding outbound this quarter. Can you send some times for next week?" },
  { classification: "interested", body: "Interested. What does pricing look like for a team of 6 reps?" },
  { classification: "question", body: "Do you handle deliverability setup too, or just the sequencing side?" },
  { classification: "objection", body: "We already use another tool for this. What would make you different?" },
  { classification: "not_interested", body: "Not a fit for us right now, thanks for reaching out." },
  { classification: "out_of_office", body: "I'm out of the office until the 14th with limited access to email." },
];

async function seed(admin: ReturnType<typeof createClient>, userId: string) {
  await clear(admin, userId);

  // Companies
  await admin.from("companies").insert(
    COMPANIES.map((c) => ({ ...c, user_id: userId, demo_seed: true, tech_stack: ["Salesforce", "Outreach"] })),
  );

  // ICP profiles
  const { data: icps } = await admin
    .from("icp_profiles")
    .insert([
      {
        user_id: userId,
        demo_seed: true,
        name: "Demo ICP — Mid-market RevOps",
        industries: ["SaaS", "Financial Services", "Logistics"],
        company_size_min: 100,
        company_size_max: 1000,
        geographies: ["United States", "Canada", "United Kingdom"],
        target_titles: ["VP of Sales", "Head of Revenue Operations", "CRO"],
        departments: ["Sales", "Marketing"],
        seniority_levels: ["vp", "director", "c_level"],
        buying_signals: ["Hiring SDRs", "Recent funding", "New sales leader"],
        pain_points: ["Low reply rates", "Manual prospecting", "Poor deliverability"],
        value_proposition: "Full-cycle AI SDR that finds, researches and emails your ICP.",
        scoring_weights: { industry: 25, size: 20, title: 30, tech: 25 },
      },
      {
        user_id: userId,
        demo_seed: true,
        name: "Demo ICP — Enterprise Manufacturing",
        industries: ["Manufacturing", "Construction", "Energy"],
        company_size_min: 500,
        company_size_max: 5000,
        geographies: ["United States"],
        target_titles: ["Director of Business Development", "VP of Sales"],
        departments: ["Sales"],
        seniority_levels: ["director", "vp"],
        buying_signals: ["Expansion into new region"],
        pain_points: ["Long sales cycles", "Fragmented CRM data"],
        value_proposition: "Signal-based outbound for long-cycle industrial sales.",
      },
    ])
    .select("id");

  // Personas
  await admin.from("personas").insert([
    { user_id: userId, demo_seed: true, label: "Revenue Leader", seniority_band: "vp_plus", function: "Sales", required: true, sort_order: 0 },
    { user_id: userId, demo_seed: true, label: "RevOps Owner", seniority_band: "director", function: "Operations", required: false, sort_order: 1 },
  ]);

  // Leads
  const { data: leads } = await admin.from("leads").insert(buildLeads(userId)).select("id, contact_name, contact_email, company_name, pipeline_stage");
  const leadRows = leads ?? [];

  // Sequences + steps
  const { data: seqs } = await admin
    .from("email_sequences")
    .insert(
      SEQUENCES.map((s, idx) => ({
        user_id: userId,
        demo_seed: true,
        name: s.name,
        description: s.description,
        status: idx === 2 ? "paused" : "active",
        total_enrollments: idx === 0 ? 24 : idx === 1 ? 12 : 8,
        total_completed: idx === 0 ? 9 : idx === 1 ? 3 : 5,
      })),
    )
    .select("id, name");
  const seqRows = seqs ?? [];

  const stepRows: Record<string, unknown>[] = [];
  seqRows.forEach((seq, si) => {
    SEQUENCES[si].steps.forEach((st, i) => {
      stepRows.push({
        user_id: userId,
        demo_seed: true,
        sequence_id: seq.id,
        step_number: i + 1,
        delay_days: i === 0 ? 0 : i * 3,
        subject_template: st.subject,
        body_template: st.body,
        step_type: i === 0 ? "initial" : "follow_up",
        is_active: true,
      });
    });
  });
  await admin.from("sequence_steps").insert(stepRows);

  // Enrollments
  const enrollRows = leadRows.slice(0, 24).map((lead, i) => {
    const seq = seqRows[i % Math.max(seqRows.length, 1)];
    const done = i % 6 === 0;
    return {
      user_id: userId,
      demo_seed: true,
      sequence_id: seq.id,
      lead_id: lead.id,
      current_step: 1 + (i % 3),
      status: done ? "completed" : i % 7 === 0 ? "paused" : "active",
      engagement_state: i % 5 === 0 ? "engaged" : "contacted",
      enrolled_at: daysAgo(20 - (i % 18)),
      completed_at: done ? daysAgo(2 + (i % 5)) : null,
      last_activity_at: daysAgo(i % 12),
      next_action_at: done ? null : daysAgo(-(1 + (i % 3))),
      paused_reason: i % 7 === 0 ? "Replied — handed to human" : null,
    };
  });
  const { data: enrollments } = await admin.from("sequence_enrollments").insert(enrollRows).select("id, lead_id, sequence_id");

  // Sending domain + account + reputation
  const { data: domain } = await admin
    .from("sending_domains")
    .insert({
      user_id: userId,
      demo_seed: true,
      domain: "demo-outreign.com",
      spf_status: "pass",
      dkim_status: "pass",
      dmarc_status: "pass",
      dkim_selector: "outreign",
      last_checked_at: daysAgo(0, -2),
    })
    .select("id")
    .maybeSingle();

  const { data: account } = await admin
    .from("sending_accounts")
    .insert({
      user_id: userId,
      demo_seed: true,
      email: "alex@demo-outreign.com",
      provider: "google",
      daily_limit: 120,
      sent_today: 38,
      warmup_enabled: true,
      reputation_score: 92,
      status: "active",
    })
    .select("id")
    .maybeSingle();

  if (account?.id) {
    const snaps = Array.from({ length: 14 }, (_, i) => ({
      user_id: userId,
      demo_seed: true,
      sending_account_id: account.id,
      snapshot_date: new Date(Date.now() - (13 - i) * 86400000).toISOString().slice(0, 10),
      reputation_score: 86 + ((i * 3) % 12),
      volume: 30 + ((i * 7) % 40),
      bounce_rate: i % 5 === 0 ? 1.2 : 0.3,
      complaint_rate: 0,
      open_rate: 48 + ((i * 5) % 20),
      created_at: daysAgo(13 - i),
    }));
    await admin.from("reputation_snapshots").insert(snaps);
  }


  // Sent emails over the last 30 days
  const sentRows: Record<string, unknown>[] = [];
  for (let i = 0; i < 60; i++) {
    const lead = leadRows[i % Math.max(leadRows.length, 1)];
    const enrollment = (enrollments ?? [])[i % Math.max((enrollments ?? []).length, 1)];
    const opened = i % 3 !== 0;
    const replied = i % 9 === 0;
    const bounced = i % 19 === 0;
    const sentAt = daysAgo(29 - Math.floor(i / 2), -(i % 8));
    sentRows.push({
      user_id: userId,
      demo_seed: true,
      lead_id: lead?.id ?? null,
      to_email: lead?.contact_email ?? "demo@demo-outreign.com",
      subject: `quick idea for ${lead?.company_name ?? "your team"}'s pipeline`,
      body_text: `Hi ${(lead?.contact_name as string | undefined)?.split(" ")[0] ?? "there"},\n\nNoticed your team is scaling outbound. Worth a 15-minute look?\n\n— Alex`,
      body_html: null,
      status: bounced ? "bounced" : "sent",
      sent_at: sentAt,
      created_at: sentAt,
      opened_at: opened && !bounced ? daysAgo(29 - Math.floor(i / 2), -(i % 8) + 2) : null,
      replied_at: replied && !bounced ? daysAgo(28 - Math.floor(i / 2)) : null,
      clicked_at: i % 7 === 0 && !bounced ? daysAgo(28 - Math.floor(i / 2)) : null,
      sequence_id: enrollment?.sequence_id ?? null,
      sequence_step: 1 + (i % 3),
      enrollment_id: enrollment?.id ?? null,
      sending_account_id: account?.id ?? null,
      gmail_thread_id: `demo-thread-${i}`,
      gmail_message_id: `demo-msg-${i}`,
    });
  }
  const { data: sent } = await admin.from("sent_emails").insert(sentRows).select("id, lead_id, to_email, subject");
  const sentEmails = sent ?? [];

  // Reply threads (inbox)
  const replyRows = REPLIES.map((r, i) => {
    const lead = leadRows[(i * 5) % Math.max(leadRows.length, 1)];
    return {
      user_id: userId,
      demo_seed: true,
      lead_id: lead?.id ?? null,
      subject: `Re: quick idea for ${lead?.company_name ?? "your team"}'s pipeline`,
      original_email_body: "Hi there,\n\nNoticed your team is scaling outbound. Worth a 15-minute look?\n\n— Alex",
      reply_body: r.body,
      sender_email: (lead?.contact_email as string | undefined) ?? "demo@demo-outreign.com",
      classification: r.classification,
      read: i > 2,
      created_at: daysAgo(i + 1, -3),
      replied_at: i < 2 ? daysAgo(i, -1) : null,
    };
  });
  await admin.from("reply_threads").insert(replyRows);

  // Deals
  const dealStages = ["new", "qualified", "proposal", "negotiation", "won", "lost"];
  const dealRows = leadRows.slice(0, 12).map((lead, i) => ({
    user_id: userId,
    demo_seed: true,
    lead_id: lead.id,
    title: `${lead.company_name} — Outbound program`,
    company_name: lead.company_name,
    contact_name: lead.contact_name,
    value: 6000 + i * 2500,
    stage: dealStages[i % dealStages.length],
    probability: [10, 30, 55, 75, 100, 0][i % 6],
    expected_close_date: new Date(Date.now() + (10 + i * 4) * 86400000).toISOString().slice(0, 10),
    notes: "Demo deal — created by demo mode.",
    created_at: daysAgo(25 - i),
  }));
  const { data: deals } = await admin.from("deals").insert(dealRows).select("id, lead_id");

  // Activities
  const activityTypes = ["call", "email", "meeting", "task"];
  const activityRows = (deals ?? []).slice(0, 10).map((deal, i) => ({
    user_id: userId,
    demo_seed: true,
    deal_id: deal.id,
    lead_id: deal.lead_id,
    type: activityTypes[i % activityTypes.length],
    subject: ["Discovery call", "Sent proposal", "Demo scheduled", "Follow up on pricing"][i % 4],
    description: "Demo activity — created by demo mode.",
    completed: i % 3 !== 0,
    due_date: daysAgo(-(i % 5) - 1),
    created_at: daysAgo(12 - i),
  }));
  await admin.from("activities").insert(activityRows);

  // Agent config + run history
  const { data: agent } = await admin
    .from("agent_configs")
    .insert({
      user_id: userId,
      demo_seed: true,
      enabled: true,
      agent_name: "Alex (Demo)",
      role: "full_cycle",
      is_primary: false,
      tone: "professional",
      company_context: "OutReign is a full-cycle AI SDR platform for outbound sales teams.",
      value_props: ["Finds and researches your ICP", "Writes and sends personalised outreach", "Classifies and handles replies"],
      can_find_leads: true,
      can_send_outreach: true,
      can_reply_interested: true,
      can_handle_objections: true,
      can_book_meetings: true,
      approval_mode: true,
      daily_lead_target: 25,
      max_daily_new_emails: 40,
      icp_profile_id: icps?.[0]?.id ?? null,
      prospecting_job_title: "VP of Sales",
      prospecting_industry: "SaaS",
      prospecting_country: "United States",
    })
    .select("id")
    .maybeSingle();

  const actionRows: Record<string, unknown>[] = [];
  for (let i = 0; i < 18; i++) {
    const email = sentEmails[i % Math.max(sentEmails.length, 1)];
    const kind = ["lead_found", "email_drafted", "email_sent", "reply_classified", "reply_sent"][i % 5];
    actionRows.push({
      user_id: userId,
      demo_seed: true,
      agent_config_id: agent?.id ?? null,
      run_id: `00000000-0000-4000-8000-${String(100000000000 + Math.floor(i / 5)).slice(0, 12)}`,
      sent_email_id: kind.startsWith("email") || kind.startsWith("reply") ? email?.id ?? null : null,
      action_type: kind,
      status: i % 11 === 0 ? "failed" : "completed",
      prospect_email: email?.to_email ?? null,
      subject: email?.subject ?? null,
      classification: kind === "reply_classified" ? REPLIES[i % REPLIES.length].classification : null,
      reply_content: kind === "reply_sent" ? "Happy to help — here are a few times that work." : null,
      error_message: i % 11 === 0 ? "Simulated failure (demo data)" : null,
      description: `Demo agent action: ${kind.replace(/_/g, " ")}`,
      metadata: { demo: true },
      created_at: daysAgo(Math.floor(i / 3), -(i % 6)),
    });
  }
  await admin.from("agent_actions").insert(actionRows);

  return await status(admin, userId);
}

async function clear(admin: ReturnType<typeof createClient>, userId: string) {
  for (const table of DEMO_TABLES) {
    const { error } = await admin.from(table).delete().eq("user_id", userId).eq("demo_seed", true);
    if (error) console.error(`clear ${table}:`, error.message);
  }
  return { cleared: true };
}

async function status(admin: ReturnType<typeof createClient>, userId: string) {
  const counts: Record<string, number> = {};
  for (const table of DEMO_TABLES) {
    const { count } = await admin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("demo_seed", true);
    counts[table] = count ?? 0;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, total };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Missing authorization header" }, 200);

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Not authenticated" }, 200);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin privileges required" }, 200);

    const body = await req.json().catch(() => ({}));
    const action = body?.action;

    if (action === "seed") {
      const result = await seed(admin, userId);
      await admin.from("admin_settings").upsert(
        {
          setting_key: "demo_mode",
          category: "general",
          setting_value: { enabled: true, admin_user_id: userId, seeded_at: new Date().toISOString() },
          description: "Demo mode for sales calls: seeds demo data, blocks real sends and unlocks all features for this admin",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" },
      );
      return json({ ok: true, action, ...result });
    }

    if (action === "clear") {
      await clear(admin, userId);
      await admin.from("admin_settings").upsert(
        {
          setting_key: "demo_mode",
          category: "general",
          setting_value: { enabled: false, admin_user_id: userId, seeded_at: null },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" },
      );
      return json({ ok: true, action, counts: {}, total: 0 });
    }

    if (action === "status") {
      return json({ ok: true, action, ...(await status(admin, userId)) });
    }

    return json({ error: "Unknown action. Use seed, clear or status." }, 200);
  } catch (e) {
    console.error("admin-demo-data error:", e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 200);
  }
});
