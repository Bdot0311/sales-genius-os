// CAN-SPAM Compliance Utilities
// https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business

export interface ComplianceFooterOptions {
  includeUnsubscribe: boolean;
  includePhysicalAddress: boolean;
  userId: string;
  leadId?: string;
  campaignId?: string;
  physicalAddress?: string;
}

export interface UnsubscribeToken {
  userId: string;
  leadId?: string;
  campaignId?: string;
  timestamp: number;
  type: 'unsubscribe' | 'manage';
}

/**
 * Generates a secure unsubscribe URL
 * Aligns with existing handle-email-unsubscribe edge function
 */
export function generateUnsubscribeUrl(token: UnsubscribeToken): string {
  // Use the same token format as the existing system
  const payload = btoa(JSON.stringify({
    userId: token.userId,
    leadId: token.leadId,
    campaignId: token.campaignId,
    timestamp: token.timestamp,
  }));
  return `${window.location.origin}/unsubscribe?token=${payload}`;
}

/**
 * Generates the CAN-SPAM compliant footer
 * Required elements:
 * - Clear opt-out mechanism (unsubscribe link)
 * - Physical postal address of sender
 */
export function generateComplianceFooter(options: ComplianceFooterOptions): string {
  const parts: string[] = [];

  if (options.includePhysicalAddress && options.physicalAddress) {
    parts.push(options.physicalAddress);
  }

  if (options.includeUnsubscribe) {
    const token: UnsubscribeToken = {
      userId: options.userId,
      leadId: options.leadId,
      campaignId: options.campaignId,
      timestamp: Date.now(),
      type: 'unsubscribe',
    };
    const unsubscribeUrl = generateUnsubscribeUrl(token);
    parts.push(`To unsubscribe from future emails: ${unsubscribeUrl}`);
  }

  return parts.join('\n\n');
}

/**
 * Validates an unsubscribe token
 * Returns null if invalid or expired
 */
export function validateUnsubscribeToken(tokenString: string): UnsubscribeToken | null {
  try {
    const token: UnsubscribeToken = JSON.parse(atob(tokenString));

    // Check expiration (30 days)
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    if (Date.now() - token.timestamp > thirtyDays) {
      return null;
    }

    return token;
  } catch {
    return null;
  }
}

/**
 * Checks if an email is being sent at a compliant time
 * Returns { isCompliant: boolean, reason?: string }
 */
export function checkSendTimeCompliance(sendTime: Date = new Date()): {
  isCompliant: boolean;
  reason?: string;
  suggestedTime?: Date;
} {
  const hour = sendTime.getHours();
  const day = sendTime.getDay(); // 0 = Sunday, 6 = Saturday

  // Don't send on weekends
  if (day === 0 || day === 6) {
    const nextTuesday = new Date(sendTime);
    nextTuesday.setDate(sendTime.getDate() + (day === 0 ? 2 : 3));
    nextTuesday.setHours(8, 0, 0, 0);
    return {
      isCompliant: false,
      reason: "Weekend sending not recommended for deliverability",
      suggestedTime: nextTuesday,
    };
  }

  // Best times: Tue-Thu 7-9am and 1-3pm
  const isBestTime = (day >= 2 && day <= 4) && ((hour >= 7 && hour <= 9) || (hour >= 13 && hour <= 15));

  if (!isBestTime) {
    const suggested = new Date(sendTime);
    // Suggest next best window
    if (hour < 7) {
      suggested.setHours(8, 0, 0, 0);
    } else if (hour < 13) {
      suggested.setHours(14, 0, 0, 0);
    } else {
      // Move to next day
      suggested.setDate(suggested.getDate() + 1);
      suggested.setHours(8, 0, 0, 0);
    }

    return {
      isCompliant: true, // Still allows sending but warns
      reason: "Outside optimal send window",
      suggestedTime: suggested,
    };
  }

  return { isCompliant: true };
}

/**
 * Validates sender domain for compliance
 * Returns { isValid: boolean, isPersonal: boolean, warnings: string[] }
 */
export function validateSenderDomain(email: string): {
  isValid: boolean;
  isPersonal: boolean;
  isBusiness: boolean;
  warnings: string[];
} {
  const personalDomains = [
    'gmail.com', 'googlemail.com',
    'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
    'yahoo.com', 'ymail.com', 'rocketmail.com',
    'aol.com', 'icloud.com', 'me.com', 'mac.com',
    'protonmail.com', 'proton.me', 'tutanota.com',
    'zoho.com', 'gmx.com', 'mail.com'
  ];

  const domain = email.split('@')[1]?.toLowerCase();

  if (!domain) {
    return { isValid: false, isPersonal: false, isBusiness: false, warnings: ['Invalid email format'] };
  }

  const isPersonal = personalDomains.includes(domain);
  const warnings: string[] = [];

  if (isPersonal) {
    warnings.push(
      'Personal email providers have strict rate limits and lower deliverability.',
      'Use a business domain (e.g., @yourcompany.com) for bulk outreach.',
      'Consider setting up a dedicated sending subdomain (e.g., @tryyourcompany.com).'
    );
  }

  return {
    isValid: true,
    isPersonal,
    isBusiness: !isPersonal,
    warnings,
  };
}

/**
 * Spintax parser - generates variations from {option1|option2|option3} syntax
 */
export function parseSpintax(text: string): string {
  // Match {word1|word2|word3} patterns
  const spintaxRegex = /\{([^}]+)\}/g;

  return text.replace(spintaxRegex, (match, options) => {
    const choices = options.split('|').map((s: string) => s.trim());
    if (choices.length === 0) return match;
    // Random selection
    const randomChoice = choices[Math.floor(Math.random() * choices.length)];
    return randomChoice;
  });
}

/**
 * Generates multiple spintax variations for A/B testing
 */
export function generateSpintaxVariations(text: string, count: number = 3): string[] {
  const variations: string[] = [];
  for (let i = 0; i < count; i++) {
    variations.push(parseSpintax(text));
  }
  return variations;
}

// CAN-SPAM penalty amount
export const CAN_SPAM_PENALTY = 51744; // $51,744 per violation as of 2026

// Required footer text
export const REQUIRED_FOOTER_ELEMENTS = [
  'Unsubscribe link',
  'Physical postal address',
] as const;
