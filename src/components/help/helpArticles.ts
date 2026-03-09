export type HelpCategory = 'getting-started' | 'account' | 'features' | 'integrations' | 'troubleshooting' | 'api';

export interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  category: HelpCategory;
  description: string;
  content: string;
  readTime: number;
  tags: string[];
  relatedArticles: string[];
  popular?: boolean;
}

export interface HelpCategoryInfo {
  id: HelpCategory;
  title: string;
  description: string;
  icon: string;
}

export const helpCategories: HelpCategoryInfo[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Learn the basics and get up and running quickly',
    icon: 'Rocket'
  },
  {
    id: 'account',
    title: 'Account & Billing',
    description: 'Manage your subscription, team, and payments',
    icon: 'CreditCard'
  },
  {
    id: 'features',
    title: 'Features & How-To',
    description: 'Master all SalesOS features and capabilities',
    icon: 'Sparkles'
  },
  {
    id: 'integrations',
    title: 'Integrations',
    description: 'Connect SalesOS with your favorite tools',
    icon: 'Plug'
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    description: 'Quick fixes for common issues',
    icon: 'Wrench'
  },
  {
    id: 'api',
    title: 'API & Developers',
    description: 'Technical documentation and developer resources',
    icon: 'Code'
  }
];

export const helpArticles: HelpArticle[] = [
  // Getting Started
  {
    id: 'gs-1',
    slug: 'create-first-lead',
    title: 'How to Create Your First Lead',
    category: 'getting-started',
    description: 'Learn how to add and manage leads in SalesOS',
    content: `
## Creating Your First Lead

Adding leads to SalesOS is simple and can be done in multiple ways.

### Method 1: Manual Entry

1. Navigate to **Dashboard → Leads**
2. Click the **"Add Lead"** button in the top right
3. Fill in the lead details:
   - Contact name (required)
   - Company name (required)
   - Email address
   - Job title
   - Phone number
4. Click **"Save Lead"**

### Method 2: AI Lead Search

1. Go to **Dashboard → Leads**
2. Use the AI search bar at the top
3. Enter a natural language query like "marketing directors at tech companies in New York"
4. Select leads from the results to save them

### Method 3: Import from CSV

1. Navigate to **Dashboard → Leads**
2. Click **"Import Leads"**
3. Upload your CSV file
4. Map the columns to SalesOS fields
5. Click **"Import"**

### Tips for Better Lead Management

- Add detailed notes to track conversations
- Use tags to organize leads by campaign or source
- Set follow-up reminders using activities
    `,
    readTime: 3,
    tags: ['leads', 'getting started', 'basics'],
    relatedArticles: ['gs-2', 'gs-3'],
    popular: true
  },
  {
    id: 'gs-2',
    slug: 'import-leads-csv',
    title: 'Importing Leads from CSV',
    category: 'getting-started',
    description: 'Bulk import leads from spreadsheets and CSV files',
    content: `
## Importing Leads from CSV

SalesOS supports bulk importing leads from CSV files for quick data migration.

### Preparing Your CSV File

Your CSV should include columns for:
- Contact Name (required)
- Company Name (required)
- Email
- Phone
- Job Title
- Industry
- LinkedIn URL

### Import Steps

1. **Navigate to Leads** - Go to Dashboard → Leads
2. **Click Import** - Select "Import Leads" from the actions menu
3. **Upload File** - Drag and drop or browse for your CSV
4. **Map Fields** - Match your CSV columns to SalesOS fields
5. **Review** - Check the preview for any issues
6. **Import** - Click "Import" to add the leads

### Common Issues

- **Duplicate Detection**: SalesOS automatically detects duplicates by email
- **Encoding**: Use UTF-8 encoding for special characters
- **File Size**: Maximum 10MB or 10,000 rows per import

### After Import

- Review the import summary for any skipped records
- Check the Import History in Settings for details
    `,
    readTime: 4,
    tags: ['import', 'csv', 'bulk'],
    relatedArticles: ['gs-1', 'ts-2']
  },
  {
    id: 'gs-3',
    slug: 'setup-pipeline-stages',
    title: 'Setting Up Your Pipeline Stages',
    category: 'getting-started',
    description: 'Customize your sales pipeline for your workflow',
    content: `
## Setting Up Pipeline Stages

Your sales pipeline represents the journey from lead to closed deal.

### Default Pipeline Stages

SalesOS comes with these default stages:
1. **Lead** - Initial contact, not yet qualified
2. **Qualified** - Confirmed fit and interest
3. **Meeting** - Demo or discovery scheduled
4. **Proposal** - Proposal or quote sent
5. **Negotiation** - Terms being discussed
6. **Closed Won** - Deal successfully closed
7. **Closed Lost** - Deal did not close

### Customizing Stages

Currently, pipeline stages are managed through the settings:

1. Go to **Settings → Pipeline**
2. Add, remove, or reorder stages
3. Set win probability percentages for forecasting
4. Choose stage colors for visual organization

### Best Practices

- Keep stages action-oriented (e.g., "Proposal Sent" not "Proposal")
- Limit to 5-7 stages for clarity
- Define clear criteria for moving between stages
- Use consistent probability percentages
    `,
    readTime: 3,
    tags: ['pipeline', 'stages', 'deals'],
    relatedArticles: ['gs-1', 'ft-1']
  },
  {
    id: 'gs-4',
    slug: 'configure-email-integration',
    title: 'Configuring Email Integration',
    category: 'getting-started',
    description: 'Connect your email account to send messages from SalesOS',
    content: `
## Configuring Email Integration

Connect your Gmail account to send personalized emails directly from SalesOS.

### Connecting Gmail

1. Navigate to **Settings → Integrations**
2. Find **Gmail** in the integrations list
3. Click **"Connect"**
4. Sign in with your Google account
5. Grant the required permissions
6. Return to SalesOS

### What Permissions Are Needed?

- Send emails on your behalf
- View email messages (for tracking)
- Access calendar (optional, for scheduling)

### Sending Your First Email

1. Go to **Outreach** from the dashboard
2. Select a lead or enter recipient details
3. Use AI generation or write manually
4. Review and click **"Send"**

### Email Limits

- Gmail allows 500 emails per day
- SalesOS tracks your daily usage
- Credits are separate from Gmail limits

### Troubleshooting

If emails aren't sending:
- Re-authorize the Gmail connection
- Check your daily limit hasn't been exceeded
- Verify the recipient email is valid
    `,
    readTime: 4,
    tags: ['email', 'gmail', 'integration', 'setup'],
    relatedArticles: ['ts-1', 'int-4'],
    popular: true
  },
  {
    id: 'gs-5',
    slug: 'understanding-dashboard',
    title: 'Understanding Your Dashboard',
    category: 'getting-started',
    description: 'Navigate the SalesOS dashboard and key features',
    content: `
## Understanding Your Dashboard

The SalesOS dashboard is your command center for sales operations.

### Dashboard Sections

#### Left Sidebar
- **Dashboard** - Overview and stats
- **Leads** - Lead management and search
- **Saved Leads** - Your saved prospects
- **Pipeline** - Visual deal tracking
- **Outreach** - Email composition and history
- **Calendar** - Scheduled activities
- **Analytics** - Performance metrics
- **Automations** - Workflow builder
- **AI Coach** - Sales coaching assistant

#### Top Bar
- **Search Credits** - Remaining AI searches
- **Trial/Plan Status** - Your subscription info
- **Settings** - Account configuration

### Key Metrics

The main dashboard shows:
- Total leads and new this week
- Active deals and pipeline value
- Upcoming activities
- Recent lead activity

### Quick Actions

- Use keyboard shortcuts for faster navigation
- Click the + button for quick lead/deal creation
- Access settings from your profile menu
    `,
    readTime: 3,
    tags: ['dashboard', 'navigation', 'overview'],
    relatedArticles: ['gs-1', 'ft-5']
  },
  
  // Account & Billing
  {
    id: 'ac-1',
    slug: 'upgrade-downgrade-plan',
    title: 'Upgrading or Downgrading Your Plan',
    category: 'account',
    description: 'Change your subscription plan at any time',
    content: `
## Changing Your Plan

You can upgrade or downgrade your SalesOS subscription at any time.

### How to Change Plans

1. Go to **Settings → Credits & Usage**
2. Click **"Manage Subscription"**
3. Select your desired plan
4. Confirm the change

### Plan Options

| Plan | Price | Verified Prospects | Features |
|------|-------|-------------------|----------|
| Free | \\$0/forever | 0 | View-only dashboard access |
| Starter | \\$39/mo | 400/month (reset each cycle) | 50/day limit, AI email generator |
| Growth | \\$89/mo | 1,200/month (credits roll over) | 150/day limit, advanced filters |
| Pro | \\$179/mo | 3,000/month (credits roll over) | 400/day limit, unlimited sequences |

Save ~20% with annual billing. Yearly plans grant your full annual credit pool upfront:
- Starter: 4,800 prospects (\\$31/mo, \\$372/yr)
- Growth: 14,400 prospects (\\$71/mo, \\$852/yr)
- Pro: 36,000 prospects (\\$143/mo, \\$1,716/yr)

### Upgrade Benefits

- Immediate access to new features
- Pro-rated billing for the current period
- Higher prospect limits applied instantly

### Downgrade Notes

- Takes effect at next billing cycle
- Some features may become unavailable

### Enterprise Plans

For custom pricing and dedicated support, contact sales@bdotindustries.com
    `,
    readTime: 3,
    tags: ['billing', 'subscription', 'upgrade'],
    relatedArticles: ['ac-3', 'ac-4'],
    popular: true
  },
  {
    id: 'ac-2',
    slug: 'managing-team-members',
    title: 'Managing Team Members',
    category: 'account',
    description: 'Add, remove, and manage team access',
    content: `
## Managing Team Members

Collaborate with your team by adding members to your SalesOS workspace.

### Adding Team Members

1. Go to **Settings → Team**
2. Click **"Invite Member"**
3. Enter their email address
4. Select their role (Admin, Member, Viewer)
5. Click **"Send Invitation"**

### Team Roles

| Role | Permissions |
|------|-------------|
| **Owner** | Full access, billing, delete account |
| **Admin** | Manage team, all features |
| **Member** | Use all features, no team management |
| **Viewer** | Read-only access to leads and deals |

### Removing Members

1. Go to **Settings → Team**
2. Find the member in the list
3. Click the menu (⋮) and select **"Remove"**
4. Confirm the removal

### Team Limits by Plan

- **Free**: 1 user
- **Starter**: 1 user
- **Growth**: 5 users
- **Pro**: Unlimited
    `,
    readTime: 3,
    tags: ['team', 'users', 'collaboration'],
    relatedArticles: ['ac-1', 'ac-5']
  },
  {
    id: 'ac-3',
    slug: 'understanding-prospect-usage',
    title: 'Understanding Prospect Usage',
    category: 'account',
    description: 'Learn how verified prospect limits work and track usage',
    content: `
## Understanding Prospect Usage

Your plan includes a monthly limit of verified prospects you can contact.

### What Counts Against Your Limit?

| Action | Cost |
|--------|------|
| Accessing verified prospect data | 1 prospect |
| Searching (without accessing data) | Free |
| AI Email Generation | Free |
| AI Coach Conversation | Free |

### Checking Your Balance

- View remaining prospects in the top bar
- Detailed usage in **Settings → Credits & Usage**
- Historical usage graphs available

### Credit Allocation

**Monthly plans:**
- Starter: 400 prospects per month (resets each cycle)
- Growth: 1,200 prospects per month (unused credits roll over)
- Pro: 3,000 prospects per month (unused credits roll over)

**Yearly plans (full pool granted upfront):**
- Starter: 4,800 prospects for the year
- Growth: 14,400 prospects for the year
- Pro: 36,000 prospects for the year

### Running Low?

Options when prospects are depleted:
1. Wait for your next billing cycle reset
2. Purchase a one-time credit pack (200, 400, or 600 prospects)
3. Upgrade to a higher plan

### One-Time Credit Packs

Buy extra prospects anytime with no recurring commitment:
- 200 prospects: \\$37.50
- 400 prospects: \\$67.50
- 600 prospects: \\$90.00

Purchase from **Settings → Credits & Usage → Buy Credits**
    `,
    readTime: 4,
    tags: ['prospects', 'usage', 'billing'],
    relatedArticles: ['ac-1', 'ft-1'],
    popular: true
  },
  {
    id: 'ac-4',
    slug: 'cancel-subscription',
    title: 'Canceling Your Subscription',
    category: 'account',
    description: 'How to cancel and what happens to your data',
    content: `
## Canceling Your Subscription

You can cancel your SalesOS subscription at any time.

### How to Cancel

1. Go to **Settings → Credits & Usage**
2. Click **"Manage Subscription"**
3. Select **"Cancel Subscription"**
4. Choose a reason (helps us improve)
5. Confirm cancellation

### What Happens After Cancellation

- Access continues until the end of billing period
- Your data is retained for 30 days
- You can reactivate within 30 days
- After 30 days, data is permanently deleted

### Exporting Your Data

Before canceling, you may want to export:
1. Go to **Settings → Data Export**
2. Select data to export (Leads, Deals, etc.)
3. Download as CSV or JSON

### Reactivating

Within 30 days:
1. Log in to your account
2. Go to **Settings → Credits & Usage**
3. Click **"Reactivate"**
4. Choose a plan

### Need Help?

If you're canceling due to issues, contact support@bdotindustries.com - we may be able to help!
    `,
    readTime: 3,
    tags: ['cancel', 'subscription', 'billing'],
    relatedArticles: ['ac-1', 'ac-5']
  },
  {
    id: 'ac-5',
    slug: 'update-payment-info',
    title: 'Updating Payment Information',
    category: 'account',
    description: 'Change your credit card or billing details',
    content: `
## Updating Payment Information

Keep your billing information current to avoid service interruptions.

### Update Credit Card

1. Go to **Settings → Credits & Usage**
2. Click **"Manage Subscription"**
3. Select **"Update Payment Method"**
4. Enter new card details
5. Click **"Save"**

### Update Billing Address

1. Access the billing portal via Settings
2. Click on **"Billing Address"**
3. Update your address information
4. Save changes

### View Invoices

1. Go to **Settings → Credits & Usage**
2. Click **"View Billing History"**
3. Download PDF invoices as needed

### Failed Payments

If a payment fails:
- We'll retry automatically over 3 days
- You'll receive email notifications
- Update your card to avoid service pause
- Contact support if issues persist

### Payment Security

- All payments processed via Stripe
- PCI-DSS compliant
- Card details never stored on our servers
    `,
    readTime: 2,
    tags: ['payment', 'billing', 'credit card'],
    relatedArticles: ['ac-1', 'ac-4']
  },

  // Features & How-To
  {
    id: 'ft-1',
    slug: 'ai-email-generation',
    title: 'Using AI Email Generation',
    category: 'features',
    description: 'Create personalized cold emails with AI',
    content: `
## Using AI Email Generation

SalesOS AI writes personalized cold emails using proven frameworks.

### The 4-Sentence Email Framework

Our AI uses a proven structure:

1. **Opener** - Hook with one of 7 power words (You, Saw, How, Spoke, Noticed, Referred, Remember)
2. **Pain Point** - Address their challenge with a question
3. **Value** - Present your solution with social proof
4. **CTA** - Permission-based call to action

### Generating an Email

1. Go to **Outreach → Compose**
2. Select a lead or enter recipient info
3. Choose your **Opener Word** (e.g., "Noticed")
4. Add **Trigger Context** (what prompted the outreach)
5. Select **Tone** (Professional, Friendly, Bold)
6. Add **Social Proof** (save it for reuse)
7. Click **"Generate Email"**

### Example Output

> **Subject:** Quick question about your hiring

> Hi Sarah,
>
> Noticed your team is expanding the sales department this quarter. How are you handling the ramp-up time for new reps?
>
> We helped Acme Corp cut onboarding from 90 to 30 days using AI-powered training. Worth a quick chat?
>
> Best,
> [Your name]

### Tips for Better Emails

- Be specific in trigger context
- Update social proof regularly
- Personalize the subject line
- A/B test different openers
    `,
    readTime: 4,
    tags: ['email', 'AI', 'outreach', 'cold email'],
    relatedArticles: ['gs-4', 'ft-2'],
    popular: true
  },
  {
    id: 'ft-2',
    slug: 'workflow-automations',
    title: 'Setting Up Workflow Automations',
    category: 'features',
    description: 'Automate repetitive tasks with visual workflows',
    content: `
## Setting Up Workflow Automations

Automate your sales processes with visual workflow builders.

### Creating a Workflow

1. Go to **Automations** from the sidebar
2. Click **"New Workflow"**
3. Drag and drop workflow components
4. Configure triggers and actions
5. Save and activate

### Workflow Components

#### Triggers (Start the workflow)
- New lead added
- Lead stage changed
- Deal value updated
- Time-based (daily, weekly)

#### Conditions (Decision points)
- If lead score > X
- If industry equals Y
- If no activity in Z days

#### Actions (Do something)
- Send email
- Create activity
- Update lead status
- Add to list
- Notify team member

### Example: Follow-up Automation

**Trigger:** New lead added
**Condition:** Has email address
**Action 1:** Send welcome email (Day 0)
**Action 2:** Create follow-up task (Day 3)
**Action 3:** If no response, send reminder (Day 7)

### Best Practices

- Start simple, then add complexity
- Test workflows with dummy leads
- Monitor automation logs
- Set up alerts for failures
    `,
    readTime: 5,
    tags: ['automation', 'workflow', 'productivity'],
    relatedArticles: ['ft-1', 'ft-5']
  },
  {
    id: 'ft-3',
    slug: 'lead-scoring-explained',
    title: 'Lead Scoring Explained',
    category: 'features',
    description: 'Understand how AI scores and prioritizes your leads',
    content: `
## Lead Scoring Explained

AI-powered lead scoring helps you focus on the most promising prospects.

### How Scoring Works

Our AI analyzes multiple factors:

| Factor | Weight |
|--------|--------|
| ICP Match | 30% |
| Engagement | 25% |
| Company Fit | 25% |
| Data Quality | 20% |

### Score Ranges

- **90-100**: Hot lead, prioritize immediately
- **70-89**: Warm lead, good potential
- **50-69**: Lukewarm, needs nurturing
- **Below 50**: Cold, may not be a fit

### What Affects Scores

**Positive factors:**
- Matches your ideal customer profile
- High engagement (opened emails, clicked links)
- Company size/industry alignment
- Complete contact information
- Recent activity

**Negative factors:**
- No email address
- Unsubscribed from emails
- Company outside target market
- Stale data (no activity in 90+ days)

### Viewing Lead Scores

- See scores on the Leads list
- Filter by score range
- Sort to prioritize high scores

### Improving Scores

- Add more data to leads
- Track engagement
- Keep information current
    `,
    readTime: 4,
    tags: ['scoring', 'leads', 'AI', 'prioritization'],
    relatedArticles: ['gs-1', 'ft-5']
  },
  {
    id: 'ft-4',
    slug: 'calendar-sync-setup',
    title: 'Calendar Sync Setup',
    category: 'features',
    description: 'Sync your activities with Google Calendar',
    content: `
## Calendar Sync Setup

Keep your sales activities synchronized with Google Calendar.

### Connecting Google Calendar

1. Go to **Settings → Integrations**
2. Find **Google Calendar**
3. Click **"Connect"**
4. Sign in and authorize access
5. Choose which calendars to sync

### What Syncs?

| SalesOS Activity | Google Calendar |
|------------------|-----------------|
| Meetings | ✅ Syncs both ways |
| Calls | ✅ Syncs both ways |
| Tasks | ✅ One-way (SalesOS → Google) |
| Follow-ups | ✅ One-way (SalesOS → Google) |

### Creating Synced Events

1. Create an activity in SalesOS
2. Select "Add to Calendar"
3. Activity appears in Google Calendar
4. Changes sync automatically

### Calendar View in SalesOS

- Access from **Calendar** in sidebar
- See all activities in day/week/month view
- Drag to reschedule
- Click to view details

### Troubleshooting

- **Events not syncing?** Re-authorize the connection
- **Duplicates?** Check you haven't added manually
- **Wrong calendar?** Update calendar selection in Settings
    `,
    readTime: 3,
    tags: ['calendar', 'google', 'sync', 'activities'],
    relatedArticles: ['gs-4', 'int-3']
  },
  {
    id: 'ft-5',
    slug: 'analytics-reporting',
    title: 'Analytics and Reporting',
    category: 'features',
    description: 'Track performance with built-in analytics',
    content: `
## Analytics and Reporting

Monitor your sales performance with comprehensive analytics.

### Dashboard Metrics

The main dashboard shows:
- **Pipeline Value** - Total value of active deals
- **Win Rate** - Deals won vs. total closed
- **Average Deal Size** - Mean deal value
- **Sales Cycle** - Average days to close

### Analytics Page

Access detailed analytics from **Analytics** in the sidebar:

#### Activity Metrics
- Emails sent this period
- Calls logged
- Meetings completed
- Follow-up completion rate

#### Lead Analytics
- New leads by source
- Lead conversion rate
- Top-performing campaigns
- Lead velocity

#### Deal Analytics
- Stage conversion rates
- Pipeline by stage
- Deal progression over time
- Revenue forecasting

### Custom Reports

1. Go to **Analytics → Reports**
2. Click **"New Report"**
3. Select metrics and filters
4. Choose date range
5. Save or export

### Exporting Data

Export any chart or report:
- Click the export icon (📥)
- Choose format (CSV, PDF)
- Download immediately

### Pro Tip

Set up weekly email reports in Settings → Notifications
    `,
    readTime: 4,
    tags: ['analytics', 'reports', 'metrics', 'performance'],
    relatedArticles: ['gs-5', 'ft-3']
  },

  // Integrations
  {
    id: 'int-1',
    slug: 'connect-hubspot-salesforce',
    title: 'Connecting to HubSpot/Salesforce/Pipedrive',
    category: 'integrations',
    description: 'Sync leads with your existing CRM',
    content: `
## CRM Integration Guide

Connect SalesOS with your existing CRM for seamless data sync.

### Supported CRMs

- HubSpot
- Salesforce
- Pipedrive
- Zoho CRM (coming soon)

### Connecting HubSpot

1. Go to **Settings → Integrations**
2. Find **HubSpot** and click **"Connect"**
3. Log in to your HubSpot account
4. Authorize the connection
5. Select sync settings

### Connecting Salesforce

1. Navigate to **Settings → Integrations**
2. Click **"Connect"** on Salesforce
3. Enter your Salesforce credentials
4. Grant API access
5. Map fields between systems

### Connecting Pipedrive

1. Go to **Settings → Integrations**
2. Select **Pipedrive**
3. Enter your Pipedrive API key
4. Configure sync direction

### Sync Options

| Option | Description |
|--------|-------------|
| Two-way | Changes sync both directions |
| SalesOS → CRM | Push to CRM only |
| CRM → SalesOS | Pull from CRM only |

### Field Mapping

- Map SalesOS fields to CRM fields
- Create custom field mappings
- Set default values for missing data

### Troubleshooting

- Check API permissions in your CRM
- Verify field mapping is correct
- Review sync logs in Settings
    `,
    readTime: 5,
    tags: ['CRM', 'hubspot', 'salesforce', 'pipedrive', 'sync'],
    relatedArticles: ['int-2', 'int-4']
  },
  {
    id: 'int-2',
    slug: 'zapier-workflows',
    title: 'Setting Up Zapier Workflows',
    category: 'integrations',
    description: 'Connect SalesOS to 5000+ apps with Zapier',
    content: `
## Zapier Integration

Connect SalesOS to thousands of apps through Zapier.

### Getting Started

1. Create a Zapier account at zapier.com
2. Search for "SalesOS" in Zapier
3. Create a new Zap

### Available Triggers

When these happen in SalesOS:
- New lead created
- Lead status changed
- New deal created
- Deal stage changed
- Email sent

### Available Actions

SalesOS can do these:
- Create a new lead
- Update a lead
- Create a deal
- Add an activity
- Search for leads

### Example Zaps

**Lead from Form:**
Typeform → SalesOS (Create Lead)

**Slack Notification:**
SalesOS (New Deal) → Slack (Send Message)

**Spreadsheet Backup:**
SalesOS (New Lead) → Google Sheets (Add Row)

### Setting Up

1. Choose trigger app and event
2. Connect your accounts
3. Map fields between apps
4. Test the Zap
5. Turn it on

### Best Practices

- Start with simple Zaps
- Test before going live
- Monitor Zap history
- Use filters to avoid unnecessary triggers
    `,
    readTime: 4,
    tags: ['zapier', 'automation', 'integration'],
    relatedArticles: ['ft-2', 'int-1']
  },
  {
    id: 'int-3',
    slug: 'google-calendar-integration',
    title: 'Google Calendar Integration',
    category: 'integrations',
    description: 'Full guide to Google Calendar sync',
    content: `
## Google Calendar Integration

Full sync between SalesOS activities and Google Calendar.

### Prerequisites

- Google account
- SalesOS Pro plan or higher

### Setup Steps

1. **Navigate to Integrations**
   - Go to Settings → Integrations
   - Find Google Calendar

2. **Authorize Access**
   - Click "Connect"
   - Sign in to Google
   - Allow calendar permissions

3. **Select Calendars**
   - Choose which calendars to display
   - Set a default calendar for new events

4. **Configure Sync Settings**
   - Sync direction (two-way recommended)
   - Activity types to sync
   - Reminder preferences

### Using the Integration

#### Create Events
- Activities created in SalesOS appear in Google
- Include lead/deal info in event description

#### View Events
- Google events appear in SalesOS Calendar
- Filter by calendar source

#### Update Events
- Changes in either system sync automatically
- Conflicts show a warning

### Advanced Settings

- Color-code by activity type
- Set default meeting duration
- Configure buffer time between meetings
    `,
    readTime: 4,
    tags: ['google', 'calendar', 'sync', 'meetings'],
    relatedArticles: ['ft-4', 'int-4']
  },
  {
    id: 'int-4',
    slug: 'email-provider-setup',
    title: 'Email Provider Setup (Gmail, SMTP)',
    category: 'integrations',
    description: 'Configure email sending for outreach',
    content: `
## Email Provider Setup

Connect your email account to send personalized outreach from SalesOS.

### Option 1: Gmail (Recommended)

**Setup:**
1. Go to Settings → Integrations
2. Click "Connect" on Gmail
3. Sign in with your Google account
4. Grant sending permissions

**Benefits:**
- Easiest setup
- Reliable delivery
- Automatic tracking
- Thread management

**Limits:**
- 500 emails/day (Gmail limit)
- Tracked in Settings → Usage

### Option 2: Custom SMTP

For advanced users or company email servers.

**Setup:**
1. Go to Settings → Integrations
2. Select "Custom SMTP"
3. Enter server details:
   - SMTP Host
   - Port (usually 587 or 465)
   - Username
   - Password
4. Test connection
5. Save

**Common SMTP Settings:**

| Provider | Host | Port |
|----------|------|------|
| Gmail | smtp.gmail.com | 587 |
| Outlook | smtp.office365.com | 587 |
| Yahoo | smtp.mail.yahoo.com | 465 |

### Best Practices

- Use a dedicated sending address
- Warm up new email accounts gradually
- Monitor bounce rates
- Keep your sender reputation clean
    `,
    readTime: 4,
    tags: ['email', 'gmail', 'SMTP', 'setup'],
    relatedArticles: ['gs-4', 'ts-1'],
    popular: true
  },

  // Troubleshooting
  {
    id: 'ts-1',
    slug: 'email-not-sending',
    title: 'Email Not Sending - Common Fixes',
    category: 'troubleshooting',
    description: 'Quick solutions when emails fail to send',
    content: `
## Email Not Sending - Common Fixes

Follow these steps to resolve email sending issues.

### Step 1: Check Gmail Connection

1. Go to **Settings → Integrations**
2. Find Gmail in the list
3. Check the connection status
4. If disconnected, click **"Reconnect"**
5. Re-authorize if prompted

### Step 2: Verify Daily Limit

Gmail has sending limits:
- 500 emails per day for personal accounts
- 2,000 for Workspace accounts

Check your usage:
1. Go to **Settings → Credits & Usage**
2. View "Emails Sent Today"
3. Wait for reset if limit reached (midnight PT)

### Step 3: Check Recipient Email

Common issues:
- Typos in email address
- Extra spaces before/after
- Invalid domain
- Bounced previously

Validate the email format and try again.

### Step 4: Review Error Message

Error messages provide clues:
- "Authorization failed" → Reconnect Gmail
- "Rate limit exceeded" → Wait and retry
- "Invalid recipient" → Check email address
- "Sending quota exceeded" → Daily limit reached

### Step 5: Test with Different Recipient

Send a test email to yourself to isolate the issue.

### Still Not Working?

Contact support@bdotindustries.com with:
- Your account email
- The recipient email (if applicable)
- The error message
- Screenshot if possible
    `,
    readTime: 4,
    tags: ['email', 'troubleshooting', 'gmail', 'errors'],
    relatedArticles: ['gs-4', 'int-4'],
    popular: true
  },
  {
    id: 'ts-2',
    slug: 'lead-import-errors',
    title: 'Lead Import Errors',
    category: 'troubleshooting',
    description: 'Fix common CSV import issues',
    content: `
## Lead Import Errors

Troubleshoot and fix common lead import problems.

### Common Errors

#### "Invalid CSV format"

**Cause:** File isn't proper CSV format

**Fix:**
1. Open in Excel/Google Sheets
2. Save As → CSV (Comma delimited)
3. Ensure UTF-8 encoding
4. Try importing again

#### "Required field missing"

**Cause:** Contact Name or Company Name column not mapped

**Fix:**
1. Check your field mapping
2. Ensure required columns have data
3. Map to correct SalesOS fields

#### "Duplicate entries skipped"

**Cause:** Leads with same email already exist

**This is normal behavior.** SalesOS prevents duplicates by email.

**Options:**
- Skip duplicates (default)
- Update existing records
- Create duplicates (not recommended)

#### "Row X has invalid email"

**Cause:** Email format is incorrect

**Fix:**
1. Check row X in your CSV
2. Correct the email format
3. Remove any extra characters
4. Re-import

### File Requirements

| Requirement | Limit |
|-------------|-------|
| File size | Max 10MB |
| Row count | Max 10,000 |
| Format | CSV (comma-separated) |
| Encoding | UTF-8 |

### Best Practices

- Preview before importing
- Start with a small test file
- Keep a backup of original data
- Review the import summary
    `,
    readTime: 4,
    tags: ['import', 'CSV', 'errors', 'troubleshooting'],
    relatedArticles: ['gs-2', 'gs-1']
  },
  {
    id: 'ts-3',
    slug: 'api-authentication-issues',
    title: 'API Authentication Issues',
    category: 'troubleshooting',
    description: 'Resolve API key and authentication errors',
    content: `
## API Authentication Issues

Troubleshoot API authentication problems.

### Error: "Invalid API Key"

**Cause:** The API key is incorrect or malformed

**Fix:**
1. Go to **Settings → API Keys**
2. Copy the full API key (starts with "sos_")
3. Ensure no extra spaces
4. Use in the X-API-Key header

### Error: "API Key Expired"

**Cause:** Key has passed its expiration date

**Fix:**
1. Go to **Settings → API Keys**
2. Check the expiration date
3. Rotate the key or create a new one
4. Update your integration with new key

### Error: "Rate Limit Exceeded"

**Cause:** Too many requests in time window

**Details:**
- 60 requests per minute (default)
- 1,000 requests per day

**Fix:**
- Implement exponential backoff
- Cache responses where possible
- Contact support for limit increase

### Error: "Unauthorized"

**Cause:** Missing or incorrect authorization

**Fix:**
- Ensure header is "X-API-Key" (not "Authorization")
- Check the key is active
- Verify account is in good standing

### Testing Your Key

Use this curl command:

\`\`\`bash
curl -X GET "https://api.salesos.com/v1/leads" \\
  -H "X-API-Key: YOUR_API_KEY"
\`\`\`

### Security Best Practices

- Never expose keys in client-side code
- Rotate keys regularly
- Use environment variables
- Monitor usage for anomalies
    `,
    readTime: 4,
    tags: ['API', 'authentication', 'errors', 'keys'],
    relatedArticles: ['api-1', 'ts-5']
  },
  {
    id: 'ts-4',
    slug: 'webhook-delivery-failures',
    title: 'Webhook Delivery Failures',
    category: 'troubleshooting',
    description: 'Debug and fix webhook issues',
    content: `
## Webhook Delivery Failures

Diagnose and fix webhook delivery problems.

### Check Webhook Logs

1. Go to **Settings → Webhooks**
2. Click on the webhook
3. View **Delivery Logs**
4. Check status codes and responses

### Common Failure Reasons

#### HTTP 400 Bad Request

**Cause:** Your endpoint rejected the payload

**Fix:**
- Verify your endpoint accepts POST requests
- Check Content-Type is application/json
- Validate your payload parsing

#### HTTP 401/403 Unauthorized

**Cause:** Authentication failed

**Fix:**
- Check your endpoint auth configuration
- Verify webhook signature validation
- Ensure secrets match

#### HTTP 500 Server Error

**Cause:** Your server had an error

**Fix:**
- Check your server logs
- Ensure endpoint handles the payload
- Add error handling

#### Timeout (no response)

**Cause:** Endpoint didn't respond in 30 seconds

**Fix:**
- Optimize endpoint performance
- Return 200 immediately, process async
- Check server availability

### Retry Policy

Failed webhooks are retried:
- 1st retry: 1 minute
- 2nd retry: 10 minutes
- 3rd retry: 1 hour
- 4th retry: 24 hours

### Manual Replay

1. Go to webhook delivery logs
2. Find the failed delivery
3. Click **"Replay"**
4. Monitor the result

### Testing Webhooks

Use the **"Test Webhook"** button to send a sample payload without affecting real data.
    `,
    readTime: 4,
    tags: ['webhooks', 'errors', 'debugging'],
    relatedArticles: ['api-3', 'ts-3']
  },
  {
    id: 'ts-5',
    slug: 'rate-limit-exceeded',
    title: 'Rate Limit Exceeded Solutions',
    category: 'troubleshooting',
    description: 'Handle API rate limiting gracefully',
    content: `
## Rate Limit Exceeded Solutions

Best practices for handling rate limits.

### Understanding Rate Limits

Default limits:
- **Per minute:** 60 requests
- **Per day:** 1,000 requests

Headers returned:
\`\`\`
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
X-RateLimit-Reset: 1699999999
\`\`\`

### Handling 429 Responses

When you receive HTTP 429:

\`\`\`javascript
async function makeRequest() {
  const response = await fetch(url, options);
  
  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') || 60;
    await sleep(retryAfter * 1000);
    return makeRequest(); // Retry
  }
  
  return response;
}
\`\`\`

### Best Practices

1. **Implement exponential backoff**
   - First retry: 1 second
   - Second retry: 2 seconds
   - Third retry: 4 seconds

2. **Cache responses**
   - Store lead data locally
   - Only fetch when needed
   - Use ETags for cache validation

3. **Batch operations**
   - Combine multiple requests
   - Use bulk endpoints when available

4. **Monitor usage**
   - Track requests per endpoint
   - Set up alerts at 80% usage

### Increasing Limits

For higher limits:
1. Upgrade to Pro plan (10x limits)
2. Contact support for custom limits
3. Apply for partner program

### Endpoint-Specific Limits

| Endpoint | Per Minute | Per Day |
|----------|------------|---------|
| /leads | 60 | 1,000 |
| /deals | 60 | 1,000 |
| /search | 30 | 500 |
| /enrich | 10 | 100 |
    `,
    readTime: 4,
    tags: ['rate limit', 'API', 'errors', '429'],
    relatedArticles: ['ts-3', 'api-4']
  },

  // API & Developers
  {
    id: 'api-1',
    slug: 'api-documentation',
    title: 'API Documentation Overview',
    category: 'api',
    description: 'Getting started with the SalesOS API',
    content: `
## API Documentation Overview

Build powerful integrations with the SalesOS REST API.

### Quick Links

- [Full API Documentation](/api-docs)
- [API Status Page](/api-status)

### Base URL

\`\`\`
https://api.salesos.com/v1
\`\`\`

### Authentication

All requests require an API key:

\`\`\`bash
curl -X GET "https://api.salesos.com/v1/leads" \\
  -H "X-API-Key: sos_your_api_key"
\`\`\`

### Getting Your API Key

1. Go to **Settings → API Keys**
2. Click **"Generate New Key"**
3. Name your key (e.g., "Production")
4. Copy and store securely

### Available Endpoints

| Endpoint | Methods | Description |
|----------|---------|-------------|
| /leads | GET, POST, PUT, DELETE | Manage leads |
| /deals | GET, POST, PUT, DELETE | Manage deals |
| /activities | GET, POST | Track activities |
| /search | POST | AI-powered search |

### Response Format

All responses are JSON:

\`\`\`json
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "total": 100
  }
}
\`\`\`

### Error Handling

Errors include helpful messages:

\`\`\`json
{
  "success": false,
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Email is required"
  }
}
\`\`\`

Visit [API Docs](/api-docs) for complete documentation.
    `,
    readTime: 3,
    tags: ['API', 'documentation', 'getting started'],
    relatedArticles: ['api-2', 'api-3', 'api-4']
  },
  {
    id: 'api-2',
    slug: 'api-status-monitoring',
    title: 'API Status and Monitoring',
    category: 'api',
    description: 'Monitor API health and uptime',
    content: `
## API Status and Monitoring

Stay informed about API health and incidents.

### Status Page

Visit our [API Status Page](/api-status) for:
- Real-time system status
- Historical uptime data
- Active incidents
- Scheduled maintenance

### Current Status Indicators

| Status | Meaning |
|--------|---------|
| 🟢 Operational | All systems working normally |
| 🟡 Degraded | Partial issues, reduced performance |
| 🔴 Outage | System unavailable |

### Subscribe to Updates

Get notified about incidents:
1. Visit [API Status](/api-status)
2. Click **"Subscribe to Updates"**
3. Enter your email
4. Confirm subscription

### Uptime SLA

- **Target:** 99.9% uptime
- **Calculated:** Monthly rolling basis
- **Excludes:** Scheduled maintenance

### Incident Response

When issues occur:
1. Issue identified and logged
2. Status page updated
3. Investigation begins
4. Updates posted every 30 minutes
5. Resolution and post-mortem

### Health Check Endpoint

Monitor programmatically:

\`\`\`bash
curl https://api.salesos.com/health
\`\`\`

Response:
\`\`\`json
{
  "status": "healthy",
  "version": "1.2.3",
  "timestamp": "2024-01-15T10:30:00Z"
}
\`\`\`
    `,
    readTime: 3,
    tags: ['API', 'status', 'monitoring', 'uptime'],
    relatedArticles: ['api-1', 'ts-3']
  },
  {
    id: 'api-3',
    slug: 'webhook-signature-verification',
    title: 'Webhook Signature Verification',
    category: 'api',
    description: 'Secure your webhook endpoints',
    content: `
## Webhook Signature Verification

Verify webhook authenticity using HMAC signatures.

### How It Works

Every webhook includes a signature header:
\`\`\`
X-Salesos-Signature: sha256=abc123...
\`\`\`

This is an HMAC-SHA256 hash of the payload using your webhook secret.

### Getting Your Secret

1. Go to **Settings → Webhooks**
2. Click on your webhook
3. Copy the **Signing Secret**

### Verification Code

#### JavaScript/Node.js

\`\`\`javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
  
  return \`sha256=\${expected}\` === signature;
}

// In your endpoint
app.post('/webhook', (req, res) => {
  const signature = req.headers['x-salesos-signature'];
  const isValid = verifySignature(
    JSON.stringify(req.body),
    signature,
    process.env.WEBHOOK_SECRET
  );
  
  if (!isValid) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process webhook...
  res.status(200).send('OK');
});
\`\`\`

#### Python

\`\`\`python
import hmac
import hashlib

def verify_signature(payload, signature, secret):
    expected = hmac.new(
        secret.encode(),
        payload.encode(),
        hashlib.sha256
    ).hexdigest()
    return f"sha256={expected}" == signature
\`\`\`

### Security Best Practices

- Always verify signatures in production
- Use constant-time comparison
- Reject requests with missing signatures
- Log verification failures for monitoring
    `,
    readTime: 4,
    tags: ['webhooks', 'security', 'HMAC', 'verification'],
    relatedArticles: ['ts-4', 'api-4']
  },
  {
    id: 'api-4',
    slug: 'rate-limits-best-practices',
    title: 'Rate Limits and Best Practices',
    category: 'api',
    description: 'Optimize your API usage',
    content: `
## Rate Limits and Best Practices

Build reliable integrations that respect rate limits.

### Current Limits

| Plan | Requests/Min | Requests/Day |
|------|--------------|--------------|
| Growth | 30 | 500 |
| Pro | 60 | 1,000 |
| Elite | 120 | 5,000 |

### Rate Limit Headers

Every response includes:
\`\`\`
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 42
X-RateLimit-Reset: 1699999999
\`\`\`

### Best Practices

#### 1. Implement Retry Logic

\`\`\`javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || 60;
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      continue;
    }
    
    return response;
  }
  throw new Error('Max retries exceeded');
}
\`\`\`

#### 2. Use Caching

- Cache read-heavy data locally
- Use ETags for cache validation
- Implement TTL-based expiration

#### 3. Batch Requests

Instead of:
\`\`\`
GET /leads/1
GET /leads/2
GET /leads/3
\`\`\`

Use:
\`\`\`
GET /leads?ids=1,2,3
\`\`\`

#### 4. Use Webhooks

Instead of polling, subscribe to webhooks for real-time updates.

### Monitoring Your Usage

View usage in **Settings → API Keys → View Usage**

Set up alerts when approaching limits.
    `,
    readTime: 4,
    tags: ['API', 'rate limits', 'best practices', 'optimization'],
    relatedArticles: ['ts-5', 'api-1']
  }
];

export function getArticlesByCategory(category: HelpCategory): HelpArticle[] {
  return helpArticles.filter(article => article.category === category);
}

export function getPopularArticles(): HelpArticle[] {
  return helpArticles.filter(article => article.popular);
}

export function searchArticles(query: string): HelpArticle[] {
  const lowerQuery = query.toLowerCase();
  return helpArticles.filter(article => 
    article.title.toLowerCase().includes(lowerQuery) ||
    article.description.toLowerCase().includes(lowerQuery) ||
    article.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
    article.content.toLowerCase().includes(lowerQuery)
  );
}

export function getArticleBySlug(slug: string): HelpArticle | undefined {
  return helpArticles.find(article => article.slug === slug);
}

export function getRelatedArticles(articleId: string): HelpArticle[] {
  const article = helpArticles.find(a => a.id === articleId);
  if (!article) return [];
  
  return article.relatedArticles
    .map(id => helpArticles.find(a => a.id === id))
    .filter((a): a is HelpArticle => a !== undefined);
}

export function getCategoryInfo(categoryId: HelpCategory): HelpCategoryInfo | undefined {
  return helpCategories.find(c => c.id === categoryId);
}
