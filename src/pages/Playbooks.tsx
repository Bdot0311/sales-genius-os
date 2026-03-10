import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen, ArrowLeft, Play, CheckCircle, Target, Brain,
  MessageSquare, Send, Loader2, ChevronRight, Lightbulb
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";

interface PlaybookStep {
  title: string;
  description: string;
  keyActions: string[];
  examples: string[];
  tips: string;
}

interface Playbook {
  id: string;
  name: string;
  tagline: string;
  description: string;
  bestFor: string;
  icon: string;
  color: string;
  steps: PlaybookStep[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const PLAYBOOKS: Playbook[] = [
  {
    id: 'trigger-based',
    name: 'Trigger-Based Outbound',
    tagline: 'Strike when buying signals appear',
    description: 'The highest-converting outbound strategy in 2025-2026. Instead of blasting cold lists, you monitor real-time signals (funding rounds, job postings, tech adoption, leadership changes) and reach out with relevant context. 3-5× higher reply rates than generic cold email.',
    bestFor: 'Any outbound team that wants higher reply rates with less volume',
    icon: '⚡',
    color: 'border-l-amber-500',
    steps: [
      {
        title: 'Define Your Trigger Events',
        description: 'Identify 3-5 buying signals that indicate a company is likely in-market for your solution.',
        keyActions: [
          'Map your top 10 closed-won deals — what happened at those companies before they bought?',
          'Common triggers: funding rounds, new exec hires, job postings (hiring for roles you replace/support), tech stack changes, expansion announcements',
          'Set up monitoring via LinkedIn Sales Navigator, Google Alerts, or Crunchbase feeds',
        ],
        examples: [
          '"Company just raised Series B" → they\'re scaling and need tooling',
          '"Posted 5+ SDR roles this month" → outbound is a priority, they need infrastructure',
          '"New VP Sales hired" → new leaders bring new tools within 90 days',
        ],
        tips: 'The best trigger events are ones your prospect would agree make your outreach timely. If they\'d think "how did they know?" — you\'ve found a great trigger.',
      },
      {
        title: 'Research in 3 Minutes or Less',
        description: 'For each triggered account, do fast but focused research. You\'re not writing a book — you need one relevant insight.',
        keyActions: [
          'Check their LinkedIn for recent posts or comments (30 sec)',
          'Scan their company page for news, blog posts, or press releases (60 sec)',
          'Look at their tech stack on BuiltWith or similar (30 sec)',
          'Find a mutual connection or shared experience (30 sec)',
        ],
        examples: [
          '"Saw you posted about struggling with lead quality last week"',
          '"Noticed you\'re hiring 8 SDRs — scaling outbound is tough without the right data"',
        ],
        tips: 'The 3-minute rule prevents over-researching. You need enough for one personalized sentence, not a dossier.',
      },
      {
        title: 'Write the Trigger Email',
        description: 'Structure: Trigger observation → Problem it implies → Your relevance → Low-friction CTA.',
        keyActions: [
          'Open with the trigger (1 sentence): "Saw you just raised your Series B — congrats."',
          'Connect to a problem (1 sentence): "Most teams at your stage struggle to scale outbound without burning through reps."',
          'State relevance, not features (1 sentence): "We help [similar company] generate 3× more qualified meetings with half the manual prospecting."',
          'CTA (1 sentence): "Worth a 15-min look, or bad timing?"',
        ],
        examples: [
          'Subject: re: your SDR hiring push\n\nNoticed you posted 6 SDR openings this month. Scaling outbound without good data is like hiring drivers without giving them a map.\n\nWe help teams like [similar co] cut prospect research time by 70% so new reps ramp in weeks, not months.\n\nWorth a quick chat, or bad timing?',
        ],
        tips: 'Under 75 words. The trigger is your permission to reach out — it replaces the need for a clever opener.',
      },
      {
        title: 'Follow-Up Sequence (3-5 touches)',
        description: 'If no reply, follow up with new value — never "just checking in."',
        keyActions: [
          'Follow-up 1 (Day 3): Share a relevant case study or data point',
          'Follow-up 2 (Day 7): Different angle — address a different pain point',
          'Follow-up 3 (Day 14): Social proof or a question',
          'Breakup (Day 21): "Closing the loop" with a soft exit',
        ],
        examples: [
          'Day 3: "Quick data point — [similar company] cut their cost-per-meeting by 40% after switching. Thought you\'d find it relevant given the scale-up."',
          'Day 21: "I\'ll assume the timing isn\'t right. If outbound data becomes a priority, I\'m easy to find. Good luck with the hiring push."',
        ],
        tips: 'Each follow-up should stand alone — assume they never saw the previous email. New value, new angle, every time.',
      },
    ],
  },
  {
    id: 'multi-channel',
    name: 'Multi-Channel Sequencing',
    tagline: 'Email + LinkedIn + phone in one cadence',
    description: 'Buyers don\'t live in one channel. The most effective outbound in 2025-2026 combines email, LinkedIn, and phone in a coordinated sequence. Multi-channel sequences see 2-3× higher response rates than email-only.',
    bestFor: 'Teams targeting mid-market and enterprise where deals justify the effort',
    icon: '🔗',
    color: 'border-l-blue-500',
    steps: [
      {
        title: 'Day 1: LinkedIn Connection + Research',
        description: 'Start by connecting on LinkedIn with a personalized note. This warms them up before your email.',
        keyActions: [
          'Send a connection request with a short note (under 300 characters)',
          'Don\'t pitch in the connection request — reference shared context',
          'While waiting for acceptance, do your 3-minute research',
        ],
        examples: [
          'Connection note: "Hi Sarah — saw your post on scaling SDR teams. Going through the same challenge with our clients. Would love to connect."',
        ],
        tips: 'LinkedIn acceptance rates are 30-40% with personalized notes vs 15% without. This is about building familiarity, not pitching.',
      },
      {
        title: 'Day 2: Cold Email #1',
        description: 'Send your primary cold email. Reference the LinkedIn touchpoint if they connected.',
        keyActions: [
          'If they connected: "Thanks for connecting on LinkedIn — wanted to share something relevant."',
          'If not yet connected: Send the cold email standalone with trigger-based personalization',
          'Keep under 100 words, one clear CTA',
        ],
        examples: [
          'Subject: scaling outbound @ [Company]\n\nHi Sarah,\n\nNoticed you\'re building out the SDR org. The hardest part isn\'t hiring — it\'s giving reps enough quality data to actually hit quota.\n\nWe help teams like [similar co] generate verified prospect lists in seconds instead of hours.\n\nOpen to a 15-min demo this week?\n\nBest, [Name]',
        ],
        tips: 'The email should feel like a natural continuation of the LinkedIn touch, not a separate blast.',
      },
      {
        title: 'Day 4: LinkedIn Engage + Email #2',
        description: 'Engage with their content on LinkedIn, then send email follow-up #1.',
        keyActions: [
          'Like or comment on one of their recent posts (genuine, not generic)',
          'Send a follow-up email with a new angle or value-add',
          'Don\'t say "following up" — lead with new value',
        ],
        examples: [
          'LinkedIn comment: "Great point about ramp time. We\'ve seen the same pattern — the bottleneck is usually data access, not training."',
          'Email: "Quick thought — [similar company]\'s new reps hit quota 40% faster after they stopped wasting time on manual research. Wrote up a 2-min case study if you\'re curious."',
        ],
        tips: 'The LinkedIn engagement makes your name familiar. When they see your email, it\'s not from a stranger anymore.',
      },
      {
        title: 'Day 7-14: Phone + Final Touches',
        description: 'If they\'ve opened emails but not replied, add a phone call. Close with a breakup email.',
        keyActions: [
          'Day 7: Call attempt (leave a voicemail referencing your email)',
          'Day 10: Send a LinkedIn DM with a different resource or question',
          'Day 14: Breakup email — give them an easy out',
        ],
        examples: [
          'Voicemail: "Hey Sarah, [Name] here. Sent you a note about scaling outbound — wanted to put a voice to the name. If it\'s relevant, I\'m at [number]. If not, no worries at all."',
          'Breakup: "I\'ll take the hint 😄 If outbound data becomes a priority later, I\'m easy to find. Wishing you luck with the hiring push."',
        ],
        tips: 'The breakup email often gets the highest reply rate in a sequence. People respond to scarcity and respect.',
      },
    ],
  },
  {
    id: 'account-based',
    name: 'Account-Based Outbound (ABO)',
    tagline: 'Surround the account, not just the contact',
    description: 'For high-value target accounts, reaching one person isn\'t enough. ABO targets 3-5 stakeholders per account with coordinated, role-specific messaging. Used by top-performing enterprise teams to break into dream accounts.',
    bestFor: 'Enterprise and strategic accounts where deal sizes justify deep investment',
    icon: '🏢',
    color: 'border-l-purple-500',
    steps: [
      {
        title: 'Build Your Account Map',
        description: 'For each target account, identify 3-5 stakeholders across the buying committee.',
        keyActions: [
          'Map the org chart: Champion (daily user), Decision Maker (budget), Influencer (technical), Blocker (procurement/legal)',
          'Find each person on LinkedIn — note their priorities, posts, and pain points',
          'Identify the "path of least resistance" — who\'s most likely to engage first?',
        ],
        examples: [
          'Target: DataFlow Inc.\n- Champion: Sarah Chen (VP RevOps) — posted about lead quality\n- Decision Maker: Mike Torres (CRO) — focused on pipeline coverage\n- Influencer: Raj Patel (Sales Ops Manager) — evaluates tools\n- Blocker: Legal team — will need security review',
        ],
        tips: 'Start with the Champion or Influencer, not the Decision Maker. Build internal momentum before going to the top.',
      },
      {
        title: 'Create Role-Specific Messaging',
        description: 'Each stakeholder cares about different things. Tailor your message to their world.',
        keyActions: [
          'Champion: Focus on daily pain and workflow improvement',
          'Decision Maker: Focus on revenue impact and strategic alignment',
          'Influencer: Focus on technical fit and ease of implementation',
          'Write 2-3 email variants per role',
        ],
        examples: [
          'To Champion (VP RevOps): "Your SDR team is spending 3 hours/day on manual research. What if that was 20 minutes?"',
          'To Decision Maker (CRO): "Companies like [peer] increased pipeline by 35% after fixing their prospecting data layer."',
          'To Influencer (Sales Ops): "We integrate with Salesforce and Outreach in under a day. No custom dev needed."',
        ],
        tips: 'Never send the same email to multiple people at the same company. They will compare notes.',
      },
      {
        title: 'Execute the Surround Campaign',
        description: 'Stagger outreach across stakeholders over 2-3 weeks. Create the impression of market presence.',
        keyActions: [
          'Week 1: Reach out to Champion and Influencer',
          'Week 2: If engagement, reach out to Decision Maker (reference the Champion conversation)',
          'Week 3: If no engagement, try a different entry point',
          'Coordinate timing so messages land on different days',
        ],
        examples: [
          'To CRO (after Champion engaged): "Sarah on your RevOps team mentioned you\'re evaluating prospecting tools. Given your pipeline goals this quarter, thought it\'d be worth connecting directly."',
        ],
        tips: 'The magic of ABO is when the Decision Maker hears your name from multiple internal sources before you even reach out to them.',
      },
      {
        title: 'Orchestrate the Meeting',
        description: 'Once you have engagement, bring stakeholders together for a unified conversation.',
        keyActions: [
          'Suggest a joint meeting with the Champion and Decision Maker',
          'Prepare a custom deck that addresses each stakeholder\'s specific concerns',
          'Have the Champion help set the agenda — they\'re selling internally for you',
        ],
        examples: [
          '"Sarah mentioned she\'d like to explore this further, and given the pipeline targets you shared at your all-hands, I thought it\'d make sense for us all to connect. Would Thursday work?"',
        ],
        tips: 'Your Champion is your internal sales rep. Arm them with the business case — a one-pager they can forward to their boss.',
      },
    ],
  },
  {
    id: 'value-first',
    name: 'Value-First Outbound',
    tagline: 'Give before you ask',
    description: 'Instead of asking for time on the first touch, lead with something genuinely useful — a relevant insight, benchmark data, a custom analysis, or a resource. This builds reciprocity and positions you as a trusted advisor, not a pushy seller. Especially effective for skeptical or senior buyers.',
    bestFor: 'Selling to senior leaders, saturated markets, or prospects who are "allergic" to cold outreach',
    icon: '🎁',
    color: 'border-l-emerald-500',
    steps: [
      {
        title: 'Create Your Value Assets',
        description: 'Build a library of assets you can share — not product collateral, but genuinely useful content.',
        keyActions: [
          'Industry benchmark reports (even a simple one-pager with 3-5 stats)',
          'Custom analysis: "I looked at your [website/LinkedIn/job postings] and noticed X"',
          'Curated roundup: "3 things top [their role] are doing differently in 2026"',
          'Template or framework they can use immediately',
        ],
        examples: [
          '"We analyzed 500 SaaS companies\' outbound metrics — here\'s where your industry segment lands."',
          '"I noticed your SDR team is using [tool X] — here\'s a workflow template that teams using it get 2× more from."',
        ],
        tips: 'The best value assets take you 30 minutes to create but save the prospect hours. Think: "Would I find this useful if I were them?"',
      },
      {
        title: 'The Value-First Email',
        description: 'Lead with the value. The CTA is to consume the resource, not to take a meeting.',
        keyActions: [
          'Open with relevance: why you\'re sending this to them specifically',
          'Deliver the value: attach/link the asset',
          'Soft CTA: "Thought you\'d find this useful — happy to walk through the implications for [their company] if you\'re curious."',
          'No pitch, no demo request on the first touch',
        ],
        examples: [
          'Subject: benchmark data for [their industry] outbound\n\nHi James,\n\nWe just published our 2026 outbound benchmark report. Given HealthBridge\'s hiring push, thought one data point would jump out: companies scaling SDR teams see 40% ramp time improvement when they invest in data quality first.\n\nAttached the full report — pages 3-4 are most relevant to healthtech.\n\nHappy to walk through how your numbers compare if useful.\n\nBest, [Name]',
        ],
        tips: 'The value-first approach works because it flips the dynamic. You\'re not asking — you\'re giving. The meeting comes naturally as a next step.',
      },
      {
        title: 'Follow Up with More Value',
        description: 'Each follow-up adds a new insight or resource — never "did you see my last email?"',
        keyActions: [
          'Follow-up 1: Different asset or angle on the same theme',
          'Follow-up 2: Personalized observation about their specific situation',
          'Follow-up 3: Social proof — what a similar company did',
        ],
        examples: [
          'Follow-up 1: "One more thing — I looked at your current outbound approach and noticed [specific observation]. Here\'s what [similar company] changed that made a big difference."',
          'Follow-up 2: "Quick question — are your SDRs spending more time researching or actually selling? That ratio is usually the first thing to fix."',
        ],
        tips: 'After 2-3 value touches, you\'ve earned the right to ask for a meeting. The conversion feels natural, not forced.',
      },
      {
        title: 'Convert to Conversation',
        description: 'After providing value, transition to a meeting request. By now, you\'re a known quantity.',
        keyActions: [
          'Reference the value you\'ve shared: "Based on the benchmarks I sent and what I see at [their company]..."',
          'Make the meeting about THEM, not your demo: "I have some specific ideas for [their company] — worth 15 minutes?"',
          'Offer a choice: meeting or async (send a Loom video)',
        ],
        examples: [
          '"I\'ve shared a few things over the past couple weeks and had a few ideas specific to HealthBridge. Would it make sense to jump on a 15-min call, or would you prefer I send a quick video walkthrough?"',
        ],
        tips: 'By this point, you\'re not cold anymore. You\'re a helpful person they recognize. The meeting conversion rate is 3-5× higher than a cold ask.',
      },
    ],
  },
  {
    id: 'referral-loop',
    name: 'The Referral & Warm Intro Engine',
    tagline: 'Turn every conversation into 2-3 more',
    description: 'The most underused outbound strategy. Every meeting, every closed deal, and every lost deal is an opportunity for warm introductions. Referred prospects convert 4-5× higher than cold outreach and close 30% faster.',
    bestFor: 'Any team that wants to compound their pipeline over time with highest-quality leads',
    icon: '🔄',
    color: 'border-l-rose-500',
    steps: [
      {
        title: 'Ask at the Right Moments',
        description: 'There are 5 natural moments to ask for referrals — most reps use zero of them.',
        keyActions: [
          'After a great demo: "Who else on your team would find this relevant?"',
          'After a closed-won deal: "You clearly get it — who else in your network faces this same challenge?"',
          'After a closed-lost deal: "I appreciate your time. Is there anyone you know who might be a better fit?"',
          'After providing value (even without a sale): Ask after sharing a useful resource',
          'During QBRs with existing customers: "Who should we be talking to?"',
        ],
        examples: [
          '"You mentioned your friend at [Company] has the same problem. Would you be open to a quick intro? I\'ll make it easy — here\'s a blurb you can forward."',
        ],
        tips: 'Make it easy. Write the intro email FOR them. "Here\'s a 2-sentence blurb you can forward — I\'ll take it from there."',
      },
      {
        title: 'The Warm Intro Email Template',
        description: 'When you get a referral, the outreach email writes itself. Leverage the social proof.',
        keyActions: [
          'Lead with the referral: "[Referrer name] suggested I reach out"',
          'One sentence on why: "They mentioned you\'re dealing with [problem]"',
          'One sentence on relevance: "We helped [referrer\'s company] with [result]"',
          'Low-friction CTA: "Worth a quick chat?"',
        ],
        examples: [
          'Subject: [Referrer name] suggested we connect\n\nHi Rachel,\n\nMarcus Johnson at CloudSync mentioned you\'re scaling outbound and running into data quality issues — same challenge he had 6 months ago.\n\nWe helped his team cut prospect research from 3 hours/day to 20 minutes. Thought it might be relevant for LogiCore.\n\nWorth 15 minutes this week?\n\nBest, [Name]',
        ],
        tips: 'Referral emails get 40-50% reply rates. The referrer\'s name does all the heavy lifting — keep the rest minimal.',
      },
      {
        title: 'Build a Systematic Referral Process',
        description: 'Don\'t leave referrals to chance. Build it into your workflow.',
        keyActions: [
          'Add "ask for referral" as a step in your post-demo and post-close workflows',
          'Track referral sources in your CRM — who generates the most intros?',
          'Create a referral incentive for customers (doesn\'t have to be monetary — early access, co-marketing)',
          'Set a goal: 2-3 referral asks per week minimum',
        ],
        examples: [
          'CRM field: "Referred by: [name]" — track conversion rates by referral source',
          'Quarterly email to happy customers: "Who else should we be helping?"',
        ],
        tips: 'The best sales orgs get 30-40% of their pipeline from referrals. It compounds — every new customer becomes a source of future intros.',
      },
    ],
  },
];

const Playbooks = () => {
  const { currentPlan, loading: planLoading, gateModalOpen, setGateModalOpen, gatedFeature } = usePlanFeatures();
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [practiceMode, setPracticeMode] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (planLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const startPractice = () => {
    if (!selectedPlaybook) return;
    setPracticeMode(true);
    setMessages([]);
  };

  const sendPracticeMessage = async () => {
    if (!input.trim() || !selectedPlaybook) return;
    const userMsg = input.trim();
    setInput("");
    setLoading(true);

    const step = selectedPlaybook.steps[activeStep];
    const updatedMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(updatedMessages);
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    const systemPrompt = `You are an expert outbound sales coach helping the user practice the "${selectedPlaybook.name}" playbook.

Current step: "${step.title}" — ${step.description}

Key actions for this step: ${step.keyActions.join(' | ')}

Example approaches: ${step.examples.join(' | ')}

The user is practicing what they would write or say to a prospect during this step of the outbound playbook.
Give brief, actionable coaching feedback (2-4 sentences):
- Does their approach follow this playbook's methodology?
- Is it specific enough, or too generic?
- Give a concrete alternative phrasing or improvement if relevant.
- Reference current outbound best practices (brevity, personalization, trigger events, single CTA).

Be encouraging but direct. Experienced outbound coaches don't sugarcoat.`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Please sign in.");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          question: userMsg,
          conversationHistory: [
            { role: 'system', content: systemPrompt },
            ...updatedMessages.map(m => ({ role: m.role, content: m.content })),
          ],
          userData: {},
        }),
      });

      if (!response.ok) throw new Error("Failed to get feedback");
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "" || !line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: fullContent };
                return updated;
              });
            }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setMessages(prev => prev.filter(m => m.content !== ''));
    } finally {
      setLoading(false);
    }
  };

  // Playbook library view
  if (!selectedPlaybook) {
    return (
      <DashboardLayout>
        <FeatureGateModal open={gateModalOpen} onOpenChange={setGateModalOpen} feature={gatedFeature || 'customPlaybooks'} currentPlan={currentPlan} />
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/coach')}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
                <BookOpen className="w-7 h-7 text-primary" />
                Outbound Playbooks
              </h1>
              <p className="text-muted-foreground text-sm">
                Proven outbound strategies with step-by-step execution guides and AI practice sessions
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLAYBOOKS.map((pb) => (
              <Card
                key={pb.id}
                className={`cursor-pointer hover:border-primary/50 transition-all hover:shadow-md border-l-4 ${pb.color}`}
                onClick={() => { setSelectedPlaybook(pb); setActiveStep(0); setPracticeMode(false); setMessages([]); }}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{pb.icon}</span>
                    <Badge variant="outline" className="text-xs">{pb.steps.length} steps</Badge>
                  </div>
                  <CardTitle className="text-base mt-2">{pb.name}</CardTitle>
                  <CardDescription>{pb.tagline}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{pb.description}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Target className="w-3 h-3" />
                    <span>{pb.bestFor}</span>
                  </div>
                  <Button variant="outline" size="sm" className="mt-4 w-full gap-2">
                    <ChevronRight className="w-4 h-4" /> Open Playbook
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Playbook detail view
  const currentStep = selectedPlaybook.steps[activeStep];

  return (
    <DashboardLayout>
      <FeatureGateModal open={gateModalOpen} onOpenChange={setGateModalOpen} feature={gatedFeature || 'customPlaybooks'} currentPlan={currentPlan} />

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedPlaybook(null); setPracticeMode(false); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <span className="text-2xl">{selectedPlaybook.icon}</span>
              {selectedPlaybook.name}
            </h1>
            <p className="text-muted-foreground text-sm">{selectedPlaybook.tagline}</p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <p className="text-sm">{selectedPlaybook.description}</p>
            <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
              <Target className="w-4 h-4" />
              <span><strong>Best for:</strong> {selectedPlaybook.bestFor}</span>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Step navigation */}
          <div className="space-y-2">
            {selectedPlaybook.steps.map((step, idx) => (
              <Card
                key={idx}
                className={`cursor-pointer transition-all ${idx === activeStep ? 'border-primary bg-primary/5' : 'hover:border-primary/30'}`}
                onClick={() => { setActiveStep(idx); setPracticeMode(false); setMessages([]); }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                    idx === activeStep ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {idx + 1}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${idx === activeStep ? 'text-primary' : ''}`}>{step.title}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Step detail */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Step {activeStep + 1}: {currentStep.title}</CardTitle>
                  <Badge variant="outline">Step {activeStep + 1} of {selectedPlaybook.steps.length}</Badge>
                </div>
                <CardDescription>{currentStep.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-2 mb-3">
                    <CheckCircle className="w-4 h-4 text-primary" />
                    Key Actions
                  </h4>
                  <ul className="space-y-2">
                    {currentStep.keyActions.map((action, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="text-primary mt-1">•</span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-sm flex items-center gap-2 mb-3">
                    <MessageSquare className="w-4 h-4 text-primary" />
                    Examples
                  </h4>
                  {currentStep.examples.map((example, i) => (
                    <div key={i} className="bg-muted/50 rounded-lg p-3 text-sm whitespace-pre-line mb-2">
                      {example}
                    </div>
                  ))}
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                  <h4 className="font-semibold text-sm flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-primary" />
                    Pro Tip
                  </h4>
                  <p className="text-sm text-muted-foreground">{currentStep.tips}</p>
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    disabled={activeStep === 0}
                    onClick={() => { setActiveStep(prev => prev - 1); setPracticeMode(false); setMessages([]); }}
                  >
                    Previous
                  </Button>
                  {activeStep < selectedPlaybook.steps.length - 1 ? (
                    <Button onClick={() => { setActiveStep(prev => prev + 1); setPracticeMode(false); setMessages([]); }}>
                      Next Step <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button variant="secondary" onClick={() => { setSelectedPlaybook(null); }}>
                      Back to Playbooks
                    </Button>
                  )}
                  <Button variant="secondary" className="ml-auto gap-2" onClick={startPractice}>
                    <Brain className="w-4 h-4" /> Practice This Step
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Practice mode */}
            {practiceMode && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="w-5 h-5 text-primary" />
                    Practice: {currentStep.title}
                  </CardTitle>
                  <CardDescription>
                    Write what you'd say or send to a prospect for this step. The AI coach will give you feedback.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[250px] pr-4 mb-4">
                    <div className="space-y-3">
                      {messages.map((msg, i) => (
                        <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                          {msg.role === 'assistant' && (
                            <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                              <Brain className="w-3.5 h-3.5 text-primary" />
                            </div>
                          )}
                          <div className={`rounded-lg px-3 py-2 max-w-[85%] ${
                            msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                          }`}>
                            {msg.role === 'assistant' ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                              </div>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  <div className="flex gap-2">
                    <Textarea
                      placeholder={`Write your ${currentStep.title.toLowerCase()} draft here...`}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendPracticeMessage();
                        }
                      }}
                      className="resize-none"
                      disabled={loading}
                    />
                    <Button onClick={sendPracticeMessage} disabled={loading || !input.trim()} size="icon" className="h-10 w-10 shrink-0">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Playbooks;
