// Plan-based feature gating configuration for SalesOS
// All features remain visible - plans control capacity, depth, and throughput

export const PLAN_FEATURES = {
  growth: {
    name: 'Growth',
    price: 149,
    
    // Search Credits
    monthlySearchCredits: 200,
    dailySearchLimit: 25,
    exportTier: 'standard' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 25,
    enrichmentLevel: 'standard',
    advancedFilters: false,
    apiAccessLeads: false,
    
    // AI Outreach Studio
    activeSequences: 3,
    personalizationLevel: 'basic',
    aiFirstLines: false,
    multiChannelLogic: false,
    
    // Email Sequences (NEW)
    stepsPerSequence: 3,
    sequenceType: 'basic' as const, // time-delay only
    replyAnalysis: false,
    handoffAlerts: 'none' as const,
    relevanceFilter: false,
    messageBlocks: 5,
    engagementStates: 'basic' as const,
    sequenceABTesting: 0,
    sequenceAnalytics: 'basic' as const,
    
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
    
    // Analytics Dashboard
    analyticsLevel: 'core',
    funnelAnalytics: false,
    repPerformance: false,
    customReports: false,
    dataExports: false,
    apiAccessAnalytics: false,
    
    // AI Recommendations
    recommendationLevel: 'general',
  },
  
  pro: {
    name: 'Pro',
    price: 299,
    
    // Search Credits
    monthlySearchCredits: 700,
    dailySearchLimit: 100,
    exportTier: 'advanced' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 100,
    enrichmentLevel: 'advanced',
    advancedFilters: true,
    apiAccessLeads: false,
    
    // AI Outreach Studio
    activeSequences: 15,
    personalizationLevel: 'advanced',
    aiFirstLines: true,
    multiChannelLogic: false,
    
    // Email Sequences (NEW)
    stepsPerSequence: 7,
    sequenceType: 'behavioral' as const, // state-based branching
    replyAnalysis: true,
    handoffAlerts: 'email' as const,
    relevanceFilter: 'basic' as const,
    messageBlocks: 25,
    engagementStates: 'full' as const,
    sequenceABTesting: 2,
    sequenceAnalytics: 'advanced' as const,
    
    // Meeting Automator
    calendarConnections: 5,
    smartRouting: true,
    priorityBooking: false,
    
    // Smart Deal Pipeline
    automatedStageProgression: true,
    revenueForecasting: true,
    customPipelines: false,
    advancedAutomationTriggers: false,
    
    // AI Sales Coach
    coachingLevel: 'advanced',
    realTimeAnalysis: 'full',
    liveCoaching: false,
    customPlaybooks: false,
    
    // Automation Builder
    automationRules: 25,
    advancedWorkflows: true,
    conditionalLogicDepth: 3,
    
    // Analytics Dashboard
    analyticsLevel: 'advanced',
    funnelAnalytics: true,
    repPerformance: true,
    customReports: false,
    dataExports: false,
    apiAccessAnalytics: false,
    
    // AI Recommendations
    recommendationLevel: 'contextual',
  },
  
  elite: {
    name: 'Elite',
    price: 799,
    
    // Search Credits
    monthlySearchCredits: 2000,
    dailySearchLimit: 500,
    exportTier: 'unlimited' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 500,
    enrichmentLevel: 'premium',
    advancedFilters: true,
    apiAccessLeads: true,
    
    // AI Outreach Studio
    activeSequences: -1, // unlimited
    personalizationLevel: 'premium',
    aiFirstLines: true,
    multiChannelLogic: true,
    
    // Email Sequences (NEW)
    stepsPerSequence: -1, // unlimited
    sequenceType: 'custom' as const, // custom triggers + webhooks
    replyAnalysis: true,
    replyAnalysisCustomSignals: true, // Elite exclusive
    handoffAlerts: 'webhook' as const, // includes Slack
    relevanceFilter: 'advanced' as const,
    messageBlocks: -1, // unlimited
    messageBlocksTeamSharing: true, // Elite exclusive
    engagementStates: 'custom' as const,
    sequenceABTesting: -1, // unlimited
    sequenceAnalytics: 'premium' as const,
    
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
    
    // Analytics Dashboard
    analyticsLevel: 'premium',
    funnelAnalytics: true,
    repPerformance: true,
    customReports: true,
    dataExports: true,
    apiAccessAnalytics: true,
    
    // AI Recommendations
    recommendationLevel: 'predictive',
  },
} as const;

export type PlanType = keyof typeof PLAN_FEATURES;
export type PlanFeatures = typeof PLAN_FEATURES[PlanType];

// Feature upgrade messages - educational, not aggressive
export const UPGRADE_MESSAGES = {
  advancedFilters: {
    title: 'Advanced Discovery Filters',
    description: 'Target leads with intent signals, seniority levels, and buying indicators for higher conversion rates.',
    availableOn: 'pro',
  },
  apiAccessLeads: {
    title: 'Lead Intelligence API',
    description: 'Integrate lead discovery directly into your existing tools and workflows.',
    availableOn: 'elite',
  },
  aiFirstLines: {
    title: 'AI-Written First Lines',
    description: 'Let AI craft personalized opening lines that boost reply rates.',
    availableOn: 'pro',
  },
  multiChannelLogic: {
    title: 'Multi-Channel Sequences',
    description: 'Orchestrate outreach across email, LinkedIn, and calls in a single workflow.',
    availableOn: 'elite',
  },
  smartRouting: {
    title: 'Smart Meeting Routing',
    description: 'Automatically route meetings to the right rep based on lead score and territory.',
    availableOn: 'pro',
  },
  priorityBooking: {
    title: 'Priority Booking Rules',
    description: 'Give high-value prospects priority access to your calendar.',
    availableOn: 'elite',
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
    availableOn: 'elite',
  },
  liveCoaching: {
    title: 'Live Sales Coaching',
    description: 'Get real-time guidance during calls and meetings.',
    availableOn: 'elite',
  },
  customPlaybooks: {
    title: 'Custom Sales Playbooks',
    description: 'Build and deploy playbooks tailored to your team and market.',
    availableOn: 'elite',
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
    availableOn: 'elite',
  },
  dataExports: {
    title: 'Data Exports',
    description: 'Export your data for external analysis and reporting.',
    availableOn: 'elite',
  },
  higherLimits: {
    title: 'Higher Limits',
    description: 'Increase your capacity for leads, sequences, and automations.',
    availableOn: 'pro',
  },
  // NEW: Email Sequence Features
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
    availableOn: 'elite',
  },
  customReplySignals: {
    title: 'Custom Reply Signals',
    description: 'Train AI to detect your unique buying signals and objection patterns.',
    availableOn: 'elite',
  },
  advancedRelevanceFilter: {
    title: 'Advanced Relevance Rules',
    description: 'Gate sequence enrollment with lead scores, custom fields, and buying intent signals.',
    availableOn: 'elite',
  },
  messageBlocksTeamSharing: {
    title: 'Team Message Blocks',
    description: 'Share approved content blocks across your entire team for consistent messaging.',
    availableOn: 'elite',
  },
  sequenceABTesting: {
    title: 'Sequence A/B Testing',
    description: 'Test different subject lines and CTAs to optimize your outreach performance.',
    availableOn: 'pro',
  },
} as const;

export type UpgradeFeature = keyof typeof UPGRADE_MESSAGES;

export const getPlanFeatures = (plan: PlanType): PlanFeatures => {
  return PLAN_FEATURES[plan] || PLAN_FEATURES.growth;
};

export const getNextPlan = (currentPlan: PlanType): PlanType | null => {
  if (currentPlan === 'growth') return 'pro';
  if (currentPlan === 'pro') return 'elite';
  return null;
};

export const formatLimit = (limit: number): string => {
  if (limit === -1) return 'Unlimited';
  return limit.toLocaleString();
};
