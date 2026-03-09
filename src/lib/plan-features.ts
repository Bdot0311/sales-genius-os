// Plan-based feature gating configuration for SalesOS
// All features remain visible - plans control capacity, depth, and throughput

export const PLAN_FEATURES = {
  free: {
    name: 'Free',
    price: 0,
    
    // Credits
    monthlySearchCredits: 0,
    dailySearchLimit: 0,
    exportTier: 'none' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 0,
    enrichmentLevel: 'none',
    advancedFilters: false,
    apiAccessLeads: false,
    
    // AI Outreach Studio
    activeSequences: 0,
    personalizationLevel: 'none',
    aiFirstLines: false,
    multiChannelLogic: false,
    
    // Email Sequences
    stepsPerSequence: 0,
    sequenceType: 'none' as const,
    replyAnalysis: false,
    handoffAlerts: 'none' as const,
    relevanceFilter: false,
    messageBlocks: 0,
    engagementStates: 'none' as const,
    sequenceABTesting: 0,
    sequenceAnalytics: 'none' as const,
    
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
    
    // Analytics Dashboard
    analyticsLevel: 'summary',
    funnelAnalytics: false,
    repPerformance: false,
    customReports: false,
    dataExports: false,
    apiAccessAnalytics: false,
    
    // AI Recommendations
    recommendationLevel: 'none',
  },

  starter: {
    name: 'Starter',
    price: 39,
    
    // Credits
    monthlySearchCredits: 400,
    dailySearchLimit: 50,
    exportTier: 'standard' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 10,
    enrichmentLevel: 'basic',
    advancedFilters: false,
    apiAccessLeads: false,
    
    // AI Outreach Studio
    activeSequences: 1,
    personalizationLevel: 'basic',
    aiFirstLines: false,
    multiChannelLogic: false,
    
    // Email Sequences
    stepsPerSequence: 2,
    sequenceType: 'basic' as const,
    replyAnalysis: false,
    handoffAlerts: 'none' as const,
    relevanceFilter: false,
    messageBlocks: 3,
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
    automationRules: 2,
    advancedWorkflows: false,
    conditionalLogicDepth: 0,
    
    // Analytics Dashboard
    analyticsLevel: 'basic',
    funnelAnalytics: false,
    repPerformance: false,
    customReports: false,
    dataExports: false,
    apiAccessAnalytics: false,
    
    // AI Recommendations
    recommendationLevel: 'basic',
  },

  growth: {
    name: 'Growth',
    price: 49,
    
    // Search Credits
    monthlySearchCredits: 150,
    dailySearchLimit: 15,
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
    
    // Email Sequences
    stepsPerSequence: 3,
    sequenceType: 'basic' as const,
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
    price: 149,
    
    // Search Credits
    monthlySearchCredits: 500,
    dailySearchLimit: 50,
    exportTier: 'advanced' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 50,
    enrichmentLevel: 'advanced',
    advancedFilters: true,
    apiAccessLeads: false,
    
    // AI Outreach Studio
    activeSequences: 15,
    personalizationLevel: 'advanced',
    aiFirstLines: true,
    multiChannelLogic: false,
    
    // Email Sequences
    stepsPerSequence: 7,
    sequenceType: 'behavioral' as const,
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
    price: 399,
    
    // Search Credits
    monthlySearchCredits: 1500,
    dailySearchLimit: 150,
    exportTier: 'unlimited' as const,
    
    // Lead Intelligence Engine
    maxResultsPerSearch: 100,
    enrichmentLevel: 'premium',
    advancedFilters: true,
    apiAccessLeads: true,
    
    // AI Outreach Studio
    activeSequences: -1, // unlimited
    personalizationLevel: 'premium',
    aiFirstLines: true,
    multiChannelLogic: true,
    
    // Email Sequences
    stepsPerSequence: -1, // unlimited
    sequenceType: 'custom' as const,
    replyAnalysis: true,
    replyAnalysisCustomSignals: true,
    handoffAlerts: 'webhook' as const,
    relevanceFilter: 'advanced' as const,
    messageBlocks: -1, // unlimited
    messageBlocksTeamSharing: true,
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
  return PLAN_FEATURES[plan] || PLAN_FEATURES.free;
};

export const getNextPlan = (currentPlan: PlanType): PlanType | null => {
  if (currentPlan === 'free') return 'growth';
  if (currentPlan === 'growth') return 'pro';
  if (currentPlan === 'pro') return 'elite';
  return null;
};

export const formatLimit = (limit: number): string => {
  if (limit === -1) return 'Unlimited';
  return limit.toLocaleString();
};
