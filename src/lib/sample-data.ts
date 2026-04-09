// Sample data for free-tier view-only mode
// This gives free users a taste of what the platform looks like with real data

export const SAMPLE_LEADS = [
  { id: "s1", contact_name: "Jordan Park", company_name: "Northline Systems", job_title: "Head of Sales", industry: "SaaS", icp_score: 92, lead_status: "active", contact_email: "j•••@northline.io" },
  { id: "s2", contact_name: "Rina Shah", company_name: "SignalFox", job_title: "VP Revenue", industry: "MarTech", icp_score: 87, lead_status: "active", contact_email: "r•••@signalfox.com" },
  { id: "s3", contact_name: "Alex Müller", company_name: "GraphiteIQ", job_title: "Director of Sales", industry: "Analytics", icp_score: 81, lead_status: "contacted", contact_email: "a•••@graphiteiq.com" },
  { id: "s4", contact_name: "Maya Chen", company_name: "BrightLoop", job_title: "CRO", industry: "FinTech", icp_score: 78, lead_status: "active", contact_email: "m•••@brightloop.co" },
  { id: "s5", contact_name: "Sam Torres", company_name: "PulseData", job_title: "Sales Manager", industry: "Data", icp_score: 74, lead_status: "qualified", contact_email: "s•••@pulsedata.io" },
];

export const SAMPLE_DEALS = [
  { id: "d1", title: "Northline Enterprise", company_name: "Northline Systems", value: 24000, stage: "qualified", probability: 60, contact_name: "Jordan Park" },
  { id: "d2", title: "SignalFox Expansion", company_name: "SignalFox", value: 18500, stage: "proposal", probability: 75, contact_name: "Rina Shah" },
  { id: "d3", title: "GraphiteIQ Pilot", company_name: "GraphiteIQ", value: 8000, stage: "new", probability: 30, contact_name: "Alex Müller" },
  { id: "d4", title: "BrightLoop Growth", company_name: "BrightLoop", value: 32000, stage: "negotiation", probability: 85, contact_name: "Maya Chen" },
  { id: "d5", title: "PulseData Starter", company_name: "PulseData", value: 5500, stage: "contacted", probability: 40, contact_name: "Sam Torres" },
];

export const SAMPLE_STATS = {
  totalLeads: 247,
  totalDeals: 34,
  totalValue: 89000,
  meetingsThisWeek: 8,
  avgDealSize: 2618,
};

export const SAMPLE_MEETINGS = [
  { id: "m1", subject: "Discovery Call – Northline Systems", description: "Initial qualification call with Jordan", due_date: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), leads: { contact_name: "Jordan Park", company_name: "Northline Systems" } },
  { id: "m2", subject: "Proposal Review – SignalFox", description: "Walk through pricing tiers", due_date: new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(), leads: { contact_name: "Rina Shah", company_name: "SignalFox" } },
  { id: "m3", subject: "Demo – GraphiteIQ", description: "Product demo for analytics team", due_date: new Date(Date.now() + 50 * 60 * 60 * 1000).toISOString(), leads: { contact_name: "Alex Müller", company_name: "GraphiteIQ" } },
  { id: "m4", subject: "Contract Negotiation – BrightLoop", description: "Final terms discussion", due_date: new Date(Date.now() + 74 * 60 * 60 * 1000).toISOString(), leads: { contact_name: "Maya Chen", company_name: "BrightLoop" } },
];

export const SAMPLE_ANALYTICS = {
  dealsByStage: [
    { stage: "New", count: 12 },
    { stage: "Qualified", count: 8 },
    { stage: "Proposal", count: 6 },
    { stage: "Negotiation", count: 5 },
    { stage: "Closed", count: 3 },
  ],
  leadsOverTime: [
    { month: "Oct", leads: 28 },
    { month: "Nov", leads: 35 },
    { month: "Dec", leads: 42 },
    { month: "Jan", leads: 51 },
    { month: "Feb", leads: 48 },
    { month: "Mar", leads: 43 },
  ],
};
