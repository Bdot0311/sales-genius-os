// SalesOS Outbound Knowledge Base — 2026 Edition
// Source of truth for email quality, sequence logic, benchmarks, and deliverability thresholds.

export const OUTBOUND_KB = {

  benchmarks: {
    industryAvgReplyRate: 0.0343,       // 3.43% — Instantly 2026 Benchmark Report
    topQuartileReplyRate: 0.055,         // 5.5%+
    eliteReplyRate: 0.107,               // 10.7%+
    signalBasedReplyRate: 0.15,          // 15–25% signal-triggered campaigns
    industryAvgOpenRate: 0.277,          // 27.7%
    personalizedLiftMultiplier: 6,       // 6x lift for personalized vs. generic
    followUpReplyShare: 0.42,            // 42% of replies come from follow-ups
    email1ReplyShare: 0.58,              // 58% of replies from email 1
  },

  emailLimits: {
    coldIntroMaxWords: 75,
    coldIntroMinWords: 25,
    followUpMaxWords: 100,
    meetingRequestMaxWords: 50,
    demoInviteMaxWords: 75,
    proposalMaxWords: 125,
    subjectLineMaxChars: 45,
    subjectLineMaxWords: 7,
    maxLinksFirstTouch: 0,
    maxCtasPerEmail: 1,
  },

  sequenceRules: {
    minTouches: 4,
    maxTouches: 7,
    sweetSpot: { min: 4, max: 6 },
    cadenceDays: [0, 3, 7, 12, 18],     // Recommended send days within a sequence
    bestSendDays: ['tuesday', 'wednesday', 'thursday'],
    bestSendHoursAM: { start: 7, end: 9 },    // 7–9 AM prospect local time
    bestSendHoursPM: { start: 14, end: 16 },  // 2–4 PM prospect local time
    firstFollowUpSubject: 're_original',       // Use "Re:" only for Email 2
    subsequentFollowUpSubject: 'fresh',        // Fresh subject lines for Emails 3+
  },

  deliverability: {
    maxBounceRatePercent: 2,
    dangerBounceRatePercent: 5,
    maxSpamComplaintRatePercent: 0.1,
    dangerSpamComplaintRatePercent: 0.3,
    maxEmailsPerMailboxPerDay: 30,
    warmupMinWeeks: 2,
    warmupRecommendedWeeks: 4,
    requiredAuth: ['SPF', 'DKIM', 'DMARC'] as const,
    neverUsePrimaryDomain: true,
  },

  emailTemplateTypes: [
    'cold_introduction',
    'follow_up',
    'meeting_request',
    'demo_invite',
    'proposal',
  ] as const,

  deadPhrases: [
    "hope this finds you well",
    "hope this email finds you",
    "i'll keep this brief",
    "quick question",
    "just following up",
    "bumping this to the top",
    "circling back",
    "did you see my last email",
    "i came across your profile",
    "i was impressed by",
    "as a leader in",
    "i'd love to connect",
    "let me know if you have any questions",
    "looking forward to hearing from you",
    "innovative solution",
    "cutting-edge",
    "synergy",
    "leverage",
    "i wanted to reach out",
    "touching base",
    "any update",
    "per my last email",
    "just checking in",
    "wanted to follow up",
    "i noticed that",
    "i came across",
    "i saw on linkedin",
    "i hope this message finds you",
  ],

  deadSubjectPhrases: [
    "quick question",
    "following up",
    "checking in",
    "introduction",
    "partnership opportunity",
    "re:",     // fake Re: prefix (only valid for actual Email 2)
    "fwd:",    // fake Fwd: prefix
  ],

  qualityChecklist: [
    { id: 'single_person', label: 'Could only be sent to this one person (unique opener)', critical: true },
    { id: 'single_cta', label: 'Contains exactly one CTA', critical: true },
    { id: 'word_count', label: 'Under word count limit for template type', critical: true },
    { id: 'specific_opener', label: 'Opening line references something real and specific about prospect', critical: true },
    { id: 'outcome_framing', label: 'Value framed as outcome/result, not feature list', critical: true },
    { id: 'no_dead_phrases', label: 'Contains no filler/dead phrases', critical: true },
    { id: 'soft_cta', label: 'CTA is soft and low-friction', critical: false },
    { id: 'conversational_tone', label: 'Tone is conversational, not formal/corporate', critical: false },
    { id: 'no_html', label: 'Plain text (no HTML formatting)', critical: false },
    { id: 'no_feature_list', label: 'Does not enumerate product features', critical: false },
  ],

  personalizationTiers: {
    tier1: {
      name: 'Campaign-Level',
      description: 'Segment-specific messaging (same industry, size, role)',
      minRequired: true,
    },
    tier2: {
      name: 'Prospect-Level',
      description: 'Custom opener based on LinkedIn post, announcement, job posting, or hire',
      minRequired: false,
      replyRateLift: '2-3x vs Tier 1 alone',
    },
    tier3: {
      name: 'Signal-Based',
      description: 'Real-time buying intent trigger referenced in message',
      minRequired: false,
      replyRateLift: '5x vs generic',
      targetReplyRate: 0.09,
    },
  },

  buyingSignals: [
    { signal: 'pricing_page_visit',        weight: 10, label: 'Visited pricing page' },
    { signal: 'funding_announcement',      weight: 9,  label: 'Funding announced' },
    { signal: 'hiring_related_role',       weight: 8,  label: 'Hiring for relevant role' },
    { signal: 'tech_stack_change',         weight: 7,  label: 'Tech stack change detected' },
    { signal: 'new_executive_hire',        weight: 6,  label: 'New executive hire' },
    { signal: 'company_expansion',         weight: 5,  label: 'Company expansion/new market' },
    { signal: 'competitor_mention',        weight: 5,  label: 'Mentioned competitor publicly' },
    { signal: 'relevant_content_published', weight: 4, label: 'Published relevant content' },
    { signal: 'job_description_pain_match', weight: 4, label: 'Job posting matches your ICP pain' },
    { signal: 'linkedin_activity',         weight: 3,  label: 'Active on LinkedIn about relevant topic' },
  ],

  icpDimensions: [
    'industry_niche',
    'company_size_headcount',
    'company_size_revenue',
    'role_and_seniority',
    'specific_responsibilities',
    'tech_stack',
    'specific_pain_point',
    'buying_signals',
    'geographic_region',
  ] as const,

  complianceRules: {
    canSpam: {
      requiresPhysicalAddress: true,
      requiresUnsubscribeLink: true,
      subjectMustReflectContent: true,
      noDeceptivePrefixes: true,
      penaltyPerViolation: 51744,
    },
    gdpr: {
      legitimateInterestValid: true,
      honorOptOutWithinDays: 30,
      mustExplainDataSourceOnRequest: true,
    },
    casl: {
      requiresConsent: true,
      stricterThanCanSpam: true,
    },
  },
} as const;

export type EmailTemplateType = typeof OUTBOUND_KB.emailTemplateTypes[number];
export type BuyingSignalType = typeof OUTBOUND_KB.buyingSignals[number]['signal'];
export type ICPDimension = typeof OUTBOUND_KB.icpDimensions[number];
