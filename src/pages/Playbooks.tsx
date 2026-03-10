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
  keyQuestions: string[];
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
    id: 'meddic',
    name: 'MEDDIC',
    tagline: 'Enterprise qualification framework',
    description: 'The gold standard for enterprise B2B sales. MEDDIC forces rigorous qualification so you invest time only in winnable deals.',
    bestFor: 'Enterprise deals with long sales cycles and multiple stakeholders',
    icon: '🎯',
    color: 'border-l-blue-500',
    steps: [
      {
        title: 'Metrics',
        description: 'Quantify the economic impact of solving the customer\'s problem.',
        keyQuestions: ['What\'s the cost of this problem today?', 'What ROI are you targeting?', 'How do you measure success internally?'],
        tips: 'Always get the prospect to state the metrics in their own words — it creates stronger buy-in than you quoting numbers at them.',
      },
      {
        title: 'Economic Buyer',
        description: 'Identify the person who controls the budget and can say yes.',
        keyQuestions: ['Who ultimately signs off on this budget?', 'Have they approved similar investments before?', 'Can we include them in the next meeting?'],
        tips: 'If you can\'t identify or access the economic buyer, your deal is at serious risk. Coach your champion on how to get you access.',
      },
      {
        title: 'Decision Criteria',
        description: 'Understand the formal and informal criteria they\'ll use to evaluate solutions.',
        keyQuestions: ['What are your must-have vs. nice-to-have requirements?', 'Are there technical requirements or compliance needs?', 'How are you weighting different criteria?'],
        tips: 'Try to influence the decision criteria early. If your strengths aren\'t on their list, you need to add them.',
      },
      {
        title: 'Decision Process',
        description: 'Map out how they\'ll actually make the buying decision.',
        keyQuestions: ['Walk me through your evaluation process.', 'Who else needs to be involved?', 'What\'s your timeline for a decision?'],
        tips: 'Get the process in writing if possible. Ask: "If everything checks out, what happens between now and going live?"',
      },
      {
        title: 'Identify Pain',
        description: 'Uncover the real, urgent problem driving this initiative.',
        keyQuestions: ['What happens if you don\'t solve this?', 'Why now — what\'s changed?', 'How is this impacting your team day-to-day?'],
        tips: 'Surface emotional pain, not just logical pain. "That must be frustrating" lands harder than "That costs $X."',
      },
      {
        title: 'Champion',
        description: 'Develop an internal advocate who sells for you when you\'re not in the room.',
        keyQuestions: ['What does solving this mean for you personally?', 'Would you be willing to champion this internally?', 'What objections will you face from the committee?'],
        tips: 'Your champion needs to sell this internally. Arm them with a one-page business case they can forward.',
      },
    ],
  },
  {
    id: 'spin',
    name: 'SPIN Selling',
    tagline: 'Consultative questioning methodology',
    description: 'Developed by Neil Rackham after studying 35,000+ sales calls. SPIN uses a strategic question sequence to guide prospects to self-discover their need for your solution.',
    bestFor: 'Complex B2B sales where the buyer doesn\'t fully understand their problem yet',
    icon: '🔄',
    color: 'border-l-purple-500',
    steps: [
      {
        title: 'Situation Questions',
        description: 'Gather facts about the prospect\'s current setup. Keep these minimal.',
        keyQuestions: ['What tools do you currently use for X?', 'How is your team structured?', 'Walk me through your current process.'],
        tips: 'Research before the call so you don\'t waste time on questions Google could answer. Max 2-3 situation questions.',
      },
      {
        title: 'Problem Questions',
        description: 'Help the prospect articulate difficulties with their current situation.',
        keyQuestions: ['What\'s the biggest challenge with your current approach?', 'Where do things break down?', 'Are you satisfied with [specific outcome]?'],
        tips: 'Don\'t rush to solve. Let them sit with the problem. Silence after a problem question is powerful.',
      },
      {
        title: 'Implication Questions',
        description: 'Expand the perceived severity of the problem. This is where deals are won.',
        keyQuestions: ['What happens to the team when that problem occurs?', 'How does that impact your ability to hit targets?', 'If this continues for another year, what\'s the cost?'],
        tips: 'This is the hardest but most valuable stage. Implication questions create urgency without you having to push.',
      },
      {
        title: 'Need-Payoff Questions',
        description: 'Get the prospect to articulate the value of solving the problem.',
        keyQuestions: ['How would it help if you could [solve problem]?', 'What would it mean for your team to have [capability]?', 'If we could cut that time in half, what would you do with it?'],
        tips: 'Let the prospect sell themselves. Their words are more convincing than yours.',
      },
    ],
  },
  {
    id: 'challenger',
    name: 'Challenger Sale',
    tagline: 'Teach, tailor, take control',
    description: 'Based on research showing that top sales performers don\'t just build relationships — they challenge buyers\' thinking. Teach them something new, tailor to their world, then take control of the sale.',
    bestFor: 'Selling disruptive or complex solutions to sophisticated buyers',
    icon: '⚡',
    color: 'border-l-orange-500',
    steps: [
      {
        title: 'Warmer (Reframe)',
        description: 'Start with an insight that challenges the prospect\'s assumptions about their business.',
        keyQuestions: ['Most companies in your space think X is the problem — but we\'ve found it\'s actually Y.', 'Here\'s a trend that\'s going to change how your industry works.'],
        tips: 'Your insight must be genuinely surprising. If they nod and say "yeah, we know," you haven\'t challenged them.',
      },
      {
        title: 'Teach (Reframe)',
        description: 'Introduce a new framework for understanding their problem. Make them see it differently.',
        keyQuestions: ['We\'ve studied 200+ companies like yours and found 3 patterns…', 'The real cost isn\'t what you think — here\'s why.'],
        tips: 'Use data and stories, not features. You\'re teaching them about their problem, not your product.',
      },
      {
        title: 'Tailor',
        description: 'Connect your insight specifically to their world — their industry, role, and pain.',
        keyQuestions: ['Given your [specific situation], this means…', 'For a [their role] at a [their company type], the impact is…'],
        tips: 'Personalization is not using their name — it\'s making the insight feel like it was discovered for them.',
      },
      {
        title: 'Take Control',
        description: 'Assertively guide the deal forward. Propose next steps. Handle pushback with confidence.',
        keyQuestions: ['Based on what we discussed, here\'s what I recommend as a next step.', 'I\'d suggest we move quickly because [reason tied to their timeline].'],
        tips: 'Taking control is not being aggressive — it\'s being confident and direct about what should happen next.',
      },
    ],
  },
  {
    id: 'bant',
    name: 'BANT',
    tagline: 'Classic qualification checklist',
    description: 'The original IBM qualification framework. Simple and effective for quickly determining if a prospect is worth pursuing. Best used early in the sales process.',
    bestFor: 'High-volume sales, SDR qualification, and initial discovery calls',
    icon: '✅',
    color: 'border-l-green-500',
    steps: [
      {
        title: 'Budget',
        description: 'Determine if they have the financial resources to buy.',
        keyQuestions: ['Do you have budget allocated for this initiative?', 'What range are you expecting for a solution like this?', 'Is this a new budget item or reallocating existing spend?'],
        tips: 'Don\'t ask "What\'s your budget?" directly on a first call. Instead, share your typical range and gauge reaction.',
      },
      {
        title: 'Authority',
        description: 'Identify who has decision-making power.',
        keyQuestions: ['Who else would be involved in this decision?', 'Have you evaluated solutions like this before — how did that process work?', 'What would your recommendation process look like?'],
        tips: 'Everyone says "I\'m the decision maker." Test it by asking about the last similar purchase they approved.',
      },
      {
        title: 'Need',
        description: 'Confirm there\'s a real, acknowledged problem to solve.',
        keyQuestions: ['What\'s driving this evaluation right now?', 'What happens if you don\'t solve this?', 'How is this impacting your team today?'],
        tips: 'No need = no deal. If they\'re "just looking," qualify whether there\'s a triggering event or it\'s a dead-end.',
      },
      {
        title: 'Timeline',
        description: 'Understand their urgency and buying timeline.',
        keyQuestions: ['When are you looking to have a solution in place?', 'Is there a deadline or event driving this timeline?', 'What needs to happen before you can move forward?'],
        tips: 'If there\'s no timeline, there\'s no urgency. Help create one by tying to their business calendar.',
      },
    ],
  },
  {
    id: 'gap-selling',
    name: 'Gap Selling',
    tagline: 'Current state → future state',
    description: 'Focus on the gap between where the prospect is now and where they want to be. The bigger the gap, the more urgent the purchase. Developed by Keenan.',
    bestFor: 'Solution selling where prospects need help quantifying their problem',
    icon: '📊',
    color: 'border-l-cyan-500',
    steps: [
      {
        title: 'Current State',
        description: 'Deeply understand their current environment, processes, and challenges.',
        keyQuestions: ['Walk me through your current workflow end to end.', 'What tools and processes do you rely on today?', 'Where do things break down most often?'],
        tips: 'Spend 60-70% of the call here. Most reps rush past this, but deep current-state understanding is what separates top performers.',
      },
      {
        title: 'Future State',
        description: 'Paint a vivid picture of what success looks like for them.',
        keyQuestions: ['In a perfect world, what does this look like in 12 months?', 'What capabilities would change the game for your team?', 'What KPIs would improve if this was solved?'],
        tips: 'Get them excited about the future state before ever mentioning your product. Their vision, not yours.',
      },
      {
        title: 'The Gap',
        description: 'Quantify the distance between current and future state. This IS the sale.',
        keyQuestions: ['So the gap between where you are and where you want to be is [X] — does that feel right?', 'What\'s the cost of staying in the current state for another quarter?'],
        tips: 'The bigger and more painful the gap, the more urgency. If the gap is small, the deal isn\'t real.',
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

    const systemPrompt = `You are an expert sales coach helping the user practice the "${selectedPlaybook.name}" framework.

Current step: "${step.title}" — ${step.description}

Key questions for this step: ${step.keyQuestions.join(', ')}

The user is practicing what they would say to a prospect during this step. 
Give brief, actionable coaching feedback (2-4 sentences):
- Was their approach effective for this step?
- What could they improve?
- Give a specific alternative phrasing if relevant.

Be encouraging but honest. Use the framework's methodology.`;

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
                Sales Playbooks
              </h1>
              <p className="text-muted-foreground text-sm">
                Master proven sales methodologies with interactive guides and AI practice sessions
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
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{pb.icon}</span>
                    <Badge variant="outline" className="text-xs">{pb.steps.length} steps</Badge>
                  </div>
                  <CardTitle className="text-lg">{pb.name}</CardTitle>
                  <CardDescription>{pb.tagline}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">{pb.description}</p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Target className="w-3 h-3" />
                    <span>Best for: {pb.bestFor}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const currentStep = selectedPlaybook.steps[activeStep];

  // Playbook detail + practice view
  return (
    <DashboardLayout>
      <FeatureGateModal open={gateModalOpen} onOpenChange={setGateModalOpen} feature={gatedFeature || 'customPlaybooks'} currentPlan={currentPlan} />
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedPlaybook(null); setPracticeMode(false); }}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-2xl">{selectedPlaybook.icon}</span>
              {selectedPlaybook.name}
            </h1>
            <p className="text-muted-foreground text-sm">{selectedPlaybook.tagline}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Step navigation */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Framework Steps</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {selectedPlaybook.steps.map((step, idx) => (
                <button
                  key={idx}
                  onClick={() => { setActiveStep(idx); if (practiceMode) { setMessages([]); } }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b last:border-b-0 transition-colors ${
                    activeStep === idx ? 'bg-primary/10 text-primary' : 'hover:bg-accent/50'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    activeStep === idx ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {idx + 1}
                  </div>
                  <span className="text-sm font-medium">{step.title}</span>
                  <ChevronRight className="w-4 h-4 ml-auto text-muted-foreground" />
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Step content / practice */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <Badge variant="outline" className="mb-2">Step {activeStep + 1} of {selectedPlaybook.steps.length}</Badge>
                    <CardTitle>{currentStep.title}</CardTitle>
                    <CardDescription className="mt-1">{currentStep.description}</CardDescription>
                  </div>
                  <Button
                    onClick={() => { if (practiceMode) { setPracticeMode(false); setMessages([]); } else startPractice(); }}
                    variant={practiceMode ? "outline" : "default"}
                    size="sm"
                    className="gap-1"
                  >
                    {practiceMode ? (
                      <><BookOpen className="w-4 h-4" /> View Guide</>
                    ) : (
                      <><Play className="w-4 h-4" /> Practice This</>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {!practiceMode ? (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-2 mb-3">
                        <MessageSquare className="w-4 h-4 text-primary" />
                        Key Questions to Ask
                      </h4>
                      <ul className="space-y-2">
                        {currentStep.keyQuestions.map((q, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                            <span>"{q}"</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 bg-accent/50 rounded-lg">
                      <h4 className="text-sm font-semibold flex items-center gap-2 mb-2">
                        <Lightbulb className="w-4 h-4 text-primary" />
                        Pro Tip
                      </h4>
                      <p className="text-sm text-muted-foreground">{currentStep.tips}</p>
                    </div>

                    <div className="flex justify-between pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={activeStep === 0}
                        onClick={() => setActiveStep(prev => prev - 1)}
                      >
                        Previous Step
                      </Button>
                      <Button
                        size="sm"
                        disabled={activeStep === selectedPlaybook.steps.length - 1}
                        onClick={() => setActiveStep(prev => prev + 1)}
                      >
                        Next Step <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-3 bg-muted rounded-lg text-sm">
                      <p className="font-medium mb-1">Practice: {currentStep.title}</p>
                      <p className="text-muted-foreground text-xs">
                        Type what you'd say to a prospect during this step. The AI coach will give you feedback.
                      </p>
                    </div>

                    {messages.length > 0 && (
                      <ScrollArea className="h-[300px] pr-4">
                        <div className="space-y-4">
                          {messages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[80%] p-3 rounded-lg ${
                                msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                              }`}>
                                {msg.role === 'assistant' ? (
                                  <div className="prose prose-sm dark:prose-invert max-w-none">
                                    {msg.content ? (
                                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                                    ) : loading ? (
                                      <span className="flex items-center gap-2 text-sm">
                                        <Loader2 className="w-4 h-4 animate-spin" /> Analyzing...
                                      </span>
                                    ) : null}
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
                    )}

                    <Textarea
                      placeholder={`Practice your ${currentStep.title.toLowerCase()} approach...`}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendPracticeMessage();
                        }
                      }}
                      className="min-h-[70px]"
                    />
                    <Button onClick={sendPracticeMessage} disabled={loading || !input.trim()} className="w-full gap-2">
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      Get AI Feedback
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Playbooks;
