/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as welcomeEmail } from './welcome-email.tsx'
import { template as signupNotification } from './signup-notification.tsx'
import { template as founderNote } from './founder-note.tsx'
import { template as reEngagementEmail } from './re-engagement-email.tsx'
import { template as onboardingOffer } from './onboarding-offer.tsx'
import { template as nudgeRunFirstSearch } from './nudge-run-first-search.tsx'
import { template as nudgeSaveFirstLead } from './nudge-save-first-lead.tsx'
import { template as nudgeConnectMailbox } from './nudge-connect-mailbox.tsx'
import { template as nudgeSendFirstEmail } from './nudge-send-first-email.tsx'
import { template as campaignSetupRequest } from './campaign-setup-request.tsx'
import { template as campaignSetupConfirmation } from './campaign-setup-confirmation.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'welcome-email': welcomeEmail,
  'signup-notification': signupNotification,
  'founder-note': founderNote,
  're-engagement-email': reEngagementEmail,
  'onboarding-offer': onboardingOffer,
  'nudge-run-first-search': nudgeRunFirstSearch,
  'nudge-save-first-lead': nudgeSaveFirstLead,
  'nudge-connect-mailbox': nudgeConnectMailbox,
  'nudge-send-first-email': nudgeSendFirstEmail,
  'campaign-setup-request': campaignSetupRequest,
  'campaign-setup-confirmation': campaignSetupConfirmation,
}
