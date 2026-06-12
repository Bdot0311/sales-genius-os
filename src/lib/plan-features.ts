// Plan-based feature gating configuration for OutReign
// All features remain visible - plans control capacity, depth, and throughput

export const PLAN_FEATURES = {
  free: {
    name: 'Free',
    price: 0,
    
    // Credits — free trial allowance: 10 lead searches / month
    monthlySearchCredits: 10,
    dailySearchLimit: 10,
    exportTier: 'none' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 5,
    enrichmentLevel: 'none',
    advancedFilters: false,
    apiAccessLeads: false,
    
    // ICP Builder
    icpProfiles: 0,
    icpMatchScoring: false,
    icpLookalike: false,
    
    // AI Outreach Studio
    activeSequences: 0,
    personalizationLevel: 'none',
    aiFirstLines: false,
    multiChannelLogic: false,
    emailQualityChecker: false,
    
    // Email Sequences
    stepsPerSequence: 0,
    sequenceType: 'none' as const,
    sequenceBranching: false,
    sequenceTemplates: false,
    replyAnalysis: false,
    handoffAlerts: 'none' as const,
    relevanceFilter: false,
    messageBlocks: 0,
    engagementStates: 'none' as const,
    sequenceABTesting: 0,
    sequenceAnalytics: 'none' as const,
    
    // Reply Inbox
    unifiedInbox: false,
    inboxAIDrafts: false,
    inboxAutoClassification: false,
    
    // Meeting Automator
    calendarConnections: 0,
    smartRouting: false,
    priorityBooking: false,
    
    // Smart Deal Pipeline
    automatedStageProgression: false,
    revenueForecasting: false,
    customPipelines: false,
    advancedAutomationTriggers: false,
    
    // AI Sales Coach
    coachingLevel: 'view-only',
    realTimeAnalysis: 'none',
    liveCoaching: false,
    customPlaybooks: false,
    
    // Automation Builder
    automationRules: 0,
    advancedWorkflows: false,
    conditionalLogicDepth: 0,
    
    // Deliverability
    deliverabilityDashboard: false,
    mailboxWarmup: false,
    dnsHealthChecker: false,
    
    // Analytics Dashboard
    analyticsLevel: 'summary',
    funnelAnalytics: false,
    repPerformance: false,
    customReports: false,
    dataExports: false,
    apiAccessAnalytics: false,
    
    // AI Recommendations
    recommendationLevel: 'none',

    // AI SDR Agent
    aiAgentTier: null as null,
    agentMaxDailyReplies: 0,
    agentMinDelayMinutes: 60,
    agentDeliverabilityCheck: false,
    agentAutoHandleObjections: false,
    agentAutoBookMeetings: false,
  },

  starter: {
    name: 'Starter',
    price: 39,
    
    // Credits
    monthlySearchCredits: 1000,
    dailySearchLimit: 100,
    exportTier: 'standard' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 10,
    enrichmentLevel: 'basic',
    advancedFilters: false,
    apiAccessLeads: false,
    
    // ICP Builder
    icpProfiles: 3,
    icpMatchScoring: true,
    icpLookalike: false,
    
    // AI Outreach Studio
    activeSequences: 1,
    personalizationLevel: 'basic',
    aiFirstLines: false,
    multiChannelLogic: false,
    emailQualityChecker: true,
    
    // Email Sequences
    stepsPerSequence: 2,
    sequenceType: 'basic' as const,
    sequenceBranching: false,
    sequenceTemplates: true,
    replyAnalysis: false,
    handoffAlerts: 'none' as const,
    relevanceFilter: false,
    messageBlocks: 3,
    engagementStates: 'basic' as const,
    sequenceABTesting: 0,
    sequenceAnalytics: 'basic' as const,
    
    // Reply Inbox
    unifiedInbox: false,
    inboxAIDrafts: false,
    inboxAutoClassification: false,
    
    // Meeting Automator
    calendarConnections: 1,
    smartRouting: false,
    priorityBooking: false,
    
    // Smart Deal Pipeline
    automatedStageProgression: false,
    revenueForecasting: false,
    customPipelines: false,
    advancedAutomationTriggers: false,
    
    // AI Sales Coach
    coachingLevel: 'basic',
    realTimeAnalysis: 'limited',
    liveCoaching: false,
    customPlaybooks: false,
    
    // Automation Builder
    automationRules: 2,
    advancedWorkflows: false,
    conditionalLogicDepth: 0,
    
    // Deliverability
    deliverabilityDashboard: false,
    mailboxWarmup: false,
    dnsHealthChecker: false,
    
    // Analytics Dashboard
    analyticsLevel: 'basic',
    funnelAnalytics: false,
    repPerformance: false,
    customReports: false,
    dataExports: false,
    apiAccessAnalytics: false,
    
    // AI Recommendations
    recommendationLevel: 'basic',

    // AI SDR Agent
    aiAgentTier: null as null,
    agentMaxDailyReplies: 0,
    agentMinDelayMinutes: 60,
    agentDeliverabilityCheck: false,
    agentAutoHandleObjections: false,
    agentAutoBookMeetings: false,
  },

  growth: {
    name: 'Growth',
    price: 89,
    
    // Search Credits
    monthlySearchCredits: 2500,
    dailySearchLimit: 250,
    exportTier: 'advanced' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 25,
    enrichmentLevel: 'standard',
    advancedFilters: false,
    apiAccessLeads: false,
    
    // ICP Builder
    icpProfiles: 10,
    icpMatchScoring: true,
    icpLookalike: true,
    
    // AI Outreach Studio
    activeSequences: 3,
    personalizationLevel: 'basic',
    aiFirstLines: false,
    multiChannelLogic: false,
    emailQualityChecker: true,
    
    // Email Sequences
    stepsPerSequence: 3,
    sequenceType: 'basic' as const,
    sequenceBranching: false,
    sequenceTemplates: true,
    replyAnalysis: false,
    handoffAlerts: 'none' as const,
    relevanceFilter: false,
    messageBlocks: 5,
    engagementStates: 'basic' as const,
    sequenceABTesting: 0,
    sequenceAnalytics: 'basic' as const,
    
    // Reply Inbox
    unifiedInbox: true,
    inboxAIDrafts: true,
    inboxAutoClassification: true,
    
    // Meeting Automator
    calendarConnections: 1,
    smartRouting: false,
    priorityBooking: false,
    
    // Smart Deal Pipeline
    automatedStageProgression: false,
    revenueForecasting: false,
    customPipelines: false,
    advancedAutomationTriggers: false,
    
    // AI Sales Coach
    coachingLevel: 'basic',
    realTimeAnalysis: 'limited',
    liveCoaching: false,
    customPlaybooks: false,
    
    // Automation Builder
    automationRules: 5,
    advancedWorkflows: false,
    conditionalLogicDepth: 1,
    
    // Deliverability
    deliverabilityDashboard: true,
    mailboxWarmup: true,
    dnsHealthChecker: true,
    
    // Analytics Dashboard
    analyticsLevel: 'core',
    funnelAnalytics: false,
    repPerformance: false,
    customReports: false,
    dataExports: false,
    apiAccessAnalytics: false,
    
    // AI Recommendations
    recommendationLevel: 'general',

    // AI SDR Agent — Growth tier: monitor + reply to interested only, deliverability check
    aiAgentTier: 'growth' as 'growth',
    agentMaxDailyReplies: 10,
    agentMinDelayMinutes: 30,
    agentDeliverabilityCheck: true,
    agentAutoHandleObjections: false,
    agentAutoBookMeetings: false,
  },

  agency: {
    name: 'Agency',
    price: 249,

    // Search Credits
    monthlySearchCredits: 15000,
    dailySearchLimit: 1500,
    exportTier: 'unlimited' as const,

    // Lead Intelligence Engine
    maxResultsPerSearch: 200,
    enrichmentLevel: 'premium',
    advancedFilters: true,
    apiAccessLeads: true,

    // ICP Builder
    icpProfiles: -1, // unlimited
    icpMatchScoring: true,
    icpLookalike: true,

    // AI Outreach Studio
    activeSequences: -1,
    personalizationLevel: 'premium',
    aiFirstLines: true,
    multiChannelLogic: true,
    emailQualityChecker: true,

    // Email Sequences
    stepsPerSequence: -1,
    sequenceType: 'custom' as const,
    sequenceBranching: true,
    sequenceTemplates: true,
    replyAnalysis: true,
    replyAnalysisCustomSignals: true,
    handoffAlerts: 'webhook' as const,
    relevanceFilter: 'advanced' as const,
    messageBlocks: -1,
    messageBlocksTeamSharing: true,
    engagementStates: 'custom' as const,
    sequenceABTesting: -1,
    sequenceAnalytics: 'premium' as const,

    // Reply Inbox
    unifiedInbox: true,
    inboxAIDrafts: true,
    inboxAutoClassification: true,

    // Meeting Automator
    calendarConnections: -1,
    smartRouting: true,
    priorityBooking: true,

    // Smart Deal Pipeline
    automatedStageProgression: true,
    revenueForecasting: true,
    customPipelines: true,
    advancedAutomationTriggers: true,

    // AI Sales Coach
    coachingLevel: 'premium',
    realTimeAnalysis: 'full',
    liveCoaching: true,
    customPlaybooks: true,

    // Automation Builder
    automationRules: -1,
    advancedWorkflows: true,
    conditionalLogicDepth: -1,

    // Deliverability
    deliverabilityDashboard: true,
    mailboxWarmup: true,
    dnsHealthChecker: true,

    // Analytics Dashboard
    analyticsLevel: 'premium',
    funnelAnalytics: true,
    repPerformance: true,
    customReports: true,
    dataExports: true,
    apiAccessAnalytics: true,

    // AI Recommendations
    recommendationLevel: 'predictive',

    // Agency-exclusive features
    whiteLabelPortal: true,
    clientPortalAccess: true,
    agencyReporting: true,
    referralProgram: true,
    priorityAPIAccess: true,

    // AI SDR Agent — Elite tier: all features, highest limits, priority
    aiAgentTier: 'elite' as 'elite',
    agentMaxDailyReplies: 200,
    agentMinDelayMinutes: 5,
    agentDeliverabilityCheck: true,
    agentAutoHandleObjections: true,
    agentAutoBookMeetings: true,
  },

  pro: {
    name: 'Pro',
    price: 179,
    
    // Search Credits
    monthlySearchCredits: 5000,
    dailySearchLimit: 500,
    exportTier: 'unlimited' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 100,
    enrichmentLevel: 'premium',
    advancedFilters: true,
    apiAccessLeads: true,
    
    // ICP Builder
    icpProfiles: -1, // unlimited
    icpMatchScoring: true,
    icpLookalike: true,
    
    // AI Outreach Studio
    activeSequences: -1, // unlimited
    personalizationLevel: 'premium',
    aiFirstLines: true,
    multiChannelLogic: true,
    emailQualityChecker: true,
    
    // Email Sequences
    stepsPerSequence: -1, // unlimited
    sequenceType: 'custom' as const,
    sequenceBranching: true,
    sequenceTemplates: true,
    replyAnalysis: true,
    replyAnalysisCustomSignals: true,
    handoffAlerts: 'webhook' as const,
    relevanceFilter: 'advanced' as const,
    messageBlocks: -1, // unlimited
    messageBlocksTeamSharing: true,
    engagementStates: 'custom' as const,
    sequenceABTesting: -1, // unlimited
    sequenceAnalytics: 'premium' as const,
    
    // Reply Inbox
    unifiedInbox: true,
    inboxAIDrafts: true,
    inboxAutoClassification: true,
    
    // Meeting Automator
    calendarConnections: -1, // unlimited
    smartRouting: true,
    priorityBooking: true,
    
    // Smart Deal Pipeline
    automatedStageProgression: true,
    revenueForecasting: true,
    customPipelines: true,
    advancedAutomationTriggers: true,
    
    // AI Sales Coach
    coachingLevel: 'premium',
    realTimeAnalysis: 'full',
    liveCoaching: true,
    customPlaybooks: true,
    
    // Automation Builder
    automationRules: -1, // unlimited
    advancedWorkflows: true,
    conditionalLogicDepth: -1, // unlimited
    
    // Deliverability
    deliverabilityDashboard: true,
    mailboxWarmup: true,
    dnsHealthChecker: true,
    
    // Analytics Dashboard
    analyticsLevel: 'premium',
    funnelAnalytics: true,
    repPerformance: true,
    customReports: true,
    dataExports: true,
    apiAccessAnalytics: true,
    
    // AI Recommendations
    recommendationLevel: 'predictive',

    // Agency-exclusive features (not available on Pro)
    whiteLabelPortal: false,
    clientPortalAccess: false,
    agencyReporting: false,
    referralProgram: false,
    priorityAPIAccess: false,

    // AI SDR Agent — Pro tier: full features, high limits
    aiAgentTier: 'pro' as 'pro',
    agentMaxDailyReplies: 50,
    agentMinDelayMinutes: 10,
    agentDeliverabilityCheck: true,
    agentAutoHandleObjections: true,
    agentAutoBookMeetings: true,
  },
} as const;

export type PlanType = keyof typeof PLAN_FEATURES;
export type PlanFeatures = typeof PLAN_FEATURES[PlanType];

// Feature upgrade messages - educational, not aggressive
export const UPGRADE_MESSAGES = {
  leadSearch: {
    title: 'Lead Discovery',
    description: 'Unlock AI-powered lead search to find qualified prospects that match your ideal customer profile.',
    availableOn: 'growth',
  },
  enrichment: {
    title: 'Lead Enrichment',
    description: 'Enrich your leads with verified contact data, company info, and buying signals.',
    availableOn: 'growth',
  },
  pipelineAccess: {
    title: 'Full Pipeline Access',
    description: 'Manage your deals with a visual pipeline, drag-and-drop stages, and deal tracking.',
    availableOn: 'growth',
  },
  advancedFilters: {
    title: 'Advanced Discovery Filters',
    description: 'Target leads with intent signals, seniority levels, and buying indicators for higher conversion rates.',
    availableOn: 'pro',
  },
  apiAccessLeads: {
    title: 'Lead Intelligence API',
    description: 'Integrate lead discovery directly into your existing tools and workflows.',
    availableOn: 'pro',
  },
  aiFirstLines: {
    title: 'AI-Written First Lines',
    description: 'Let AI craft personalized opening lines that boost reply rates.',
    availableOn: 'pro',
  },
  multiChannelLogic: {
    title: 'Multi-Channel Sequences',
    description: 'Orchestrate outreach across email, LinkedIn, and calls in a single workflow.',
    availableOn: 'pro',
  },
  smartRouting: {
    title: 'Smart Meeting Routing',
    description: 'Automatically route meetings to the right rep based on lead score and territory.',
    availableOn: 'pro',
  },
  priorityBooking: {
    title: 'Priority Booking Rules',
    description: 'Give high-value prospects priority access to your calendar.',
    availableOn: 'pro',
  },
  automatedStageProgression: {
    title: 'Automated Pipeline Updates',
    description: 'Let deals move through stages automatically based on engagement signals.',
    availableOn: 'pro',
  },
  revenueForecasting: {
    title: 'Revenue Forecasting',
    description: 'Predict close dates and revenue with AI-powered insights.',
    availableOn: 'pro',
  },
  customPipelines: {
    title: 'Custom Pipelines',
    description: 'Create unlimited custom pipelines tailored to your sales process.',
    availableOn: 'pro',
  },
  liveCoaching: {
    title: 'Live Sales Coaching',
    description: 'Get real-time guidance during calls and meetings.',
    availableOn: 'pro',
  },
  customPlaybooks: {
    title: 'Custom Sales Playbooks',
    description: 'Build and deploy playbooks tailored to your team and market.',
    availableOn: 'pro',
  },
  advancedWorkflows: {
    title: 'Advanced Workflows',
    description: 'Build complex automation with conditional logic and multiple triggers.',
    availableOn: 'pro',
  },
  funnelAnalytics: {
    title: 'Funnel Analytics',
    description: 'See exactly where deals drop off and optimize your conversion rates.',
    availableOn: 'pro',
  },
  customReports: {
    title: 'Custom Reports',
    description: 'Build reports tailored to your business metrics and KPIs.',
    availableOn: 'pro',
  },
  dataExports: {
    title: 'Data Exports',
    description: 'Export your data for external analysis and reporting.',
    availableOn: 'pro',
  },
  higherLimits: {
    title: 'Higher Limits',
    description: 'Increase your capacity for leads, sequences, and automations.',
    availableOn: 'pro',
  },
  stateBasedSequences: {
    title: 'State-Based Sequences',
    description: 'Create different follow-up paths based on prospect behavior (opens, clicks, silence).',
    availableOn: 'pro',
  },
  replyAnalysis: {
    title: 'AI Reply Scoring',
    description: 'Automatically identify high-intent replies that deserve immediate attention.',
    availableOn: 'pro',
  },
  handoffAlerts: {
    title: 'Smart Handoff Alerts',
    description: 'Get notified when prospects show buying signals so you can jump in at the right moment.',
    availableOn: 'pro',
  },
  relevanceFilter: {
    title: 'Relevance Filter',
    description: 'Ensure only qualified leads enter sequences with role and title matching.',
    availableOn: 'pro',
  },
  webhookHandoffs: {
    title: 'Webhook Handoffs',
    description: 'Route handoff alerts to Slack, your CRM, or any tool via webhooks.',
    availableOn: 'pro',
  },
  customReplySignals: {
    title: 'Custom Reply Signals',
    description: 'Train AI to detect your unique buying signals and objection patterns.',
    availableOn: 'pro',
  },
  advancedRelevanceFilter: {
    title: 'Advanced Relevance Rules',
    description: 'Gate sequence enrollment with lead scores, custom fields, and buying intent signals.',
    availableOn: 'pro',
  },
  messageBlocksTeamSharing: {
    title: 'Team Message Blocks',
    description: 'Share approved content blocks across your entire team for consistent messaging.',
    availableOn: 'pro',
  },
  sequenceABTesting: {
    title: 'Sequence A/B Testing',
    description: 'Test different subject lines and CTAs to optimize your outreach performance.',
    availableOn: 'pro',
  },
  icpBuilder: {
    title: 'ICP Builder',
    description: 'Create Ideal Customer Profiles with match scoring to prioritize leads that fit your target market.',
    availableOn: 'starter',
  },
  icpLookalike: {
    title: 'ICP Lookalike Discovery',
    description: 'Find more prospects similar to your closed-won deals using ICP data.',
    availableOn: 'growth',
  },
  emailQualityChecker: {
    title: 'Email Quality Checker',
    description: 'Pre-send quality analysis with spam scoring, readability, CTA detection, and personalization depth.',
    availableOn: 'starter',
  },
  unifiedInbox: {
    title: 'Unified Reply Inbox',
    description: 'All prospect replies in one inbox with auto-classification and AI-drafted responses.',
    availableOn: 'growth',
  },
  deliverabilityDashboard: {
    title: 'Deliverability Dashboard',
    description: 'Monitor mailbox health, warmup progress, and DNS configuration to maximize inbox placement.',
    availableOn: 'growth',
  },
  sequenceBranching: {
    title: 'Sequence Branching',
    description: 'Split sequences into conditional paths based on opens and replies for smarter follow-ups.',
    availableOn: 'pro',
  },
  sequenceTemplates: {
    title: 'Sequence Templates',
    description: 'Launch sequences faster with pre-built templates like Signal Strike, Executive Thread, and The Challenger.',
    availableOn: 'starter',
  },
} as const;

export type UpgradeFeature = keyof typeof UPGRADE_MESSAGES;

export const getPlanFeatures = (plan: PlanType): PlanFeatures => {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.free;
};

export const getNextPlan = (currentPlan: PlanType): PlanType | null => {
  if (currentPlan === 'free') return 'starter';
  if (currentPlan === 'starter') return 'growth';
  if (currentPlan === 'growth') return 'pro';
  if (currentPlan === 'pro') return 'agency';
  return null;
};

export const formatLimit = (limit: number): string => {
  if (limit === -1) return 'Unlimited';
  return limit.toLocaleString();
};
