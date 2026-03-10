import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Mail, Send, Loader2, RotateCcw, Play, ArrowLeft,
  Trophy, Target, MessageSquare, Briefcase, Building2, DollarSign,
  ShieldCheck, Zap, UserCircle
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Scenario {
  id: string;
  name: string;
  type: string;
  prospect: string;
  context: string;
  icon: React.ReactNode;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  color: string;
}

interface ScoreCard {
  subjectLine: number;
  personalization: number;
  valueProposition: number;
  callToAction: number;
  brevity: number;
  overall: number;
  feedback: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: 'cold-first-touch',
    name: 'Cold First Touch',
    type: 'Initial cold email to a new prospect',
    prospect: 'Sarah Chen, VP of Revenue Operations at DataFlow (Series B, 200 employees, uses Salesforce + Outreach)',
    context: 'You found her on LinkedIn. She posted about struggling with lead quality 2 weeks ago. No prior relationship.',
    icon: <Mail className="w-5 h-5" />,
    difficulty: 'Easy',
    color: 'text-green-500',
  },
  {
    id: 'follow-up-no-reply',
    name: 'Follow-Up (No Reply)',
    type: '2nd email after no response to your cold outreach',
    prospect: 'Marcus Johnson, Head of Sales at CloudSync (mid-market SaaS, 80 employees)',
    context: 'You sent a cold email 5 days ago about improving their outbound conversion. He opened it twice but never replied.',
    icon: <Target className="w-5 h-5" />,
    difficulty: 'Medium',
    color: 'text-yellow-500',
  },
  {
    id: 'breakup-email',
    name: 'Breakup Email',
    type: 'Final email in a sequence after 3+ touches with no reply',
    prospect: 'Lisa Park, Director of Growth at FinEdge (fintech, 500 employees)',
    context: 'You\'ve sent 3 emails over 2 weeks. She opened the first one but hasn\'t engaged. This is your last attempt.',
    icon: <Briefcase className="w-5 h-5" />,
    difficulty: 'Medium',
    color: 'text-yellow-500',
  },
  {
    id: 'trigger-event',
    name: 'Trigger Event Outreach',
    type: 'Email based on a real-time buying signal',
    prospect: 'James Wright, CTO at HealthBridge (healthtech, 300 employees)',
    context: 'HealthBridge just raised $40M Series C and posted 12 SDR job openings this week. James liked a post about "scaling outbound without burning reps."',
    icon: <Zap className="w-5 h-5" />,
    difficulty: 'Easy',
    color: 'text-green-500',
  },
  {
    id: 'competitor-displacement',
    name: 'Competitor Displacement',
    type: 'Email to a prospect actively using a competitor',
    prospect: 'Rachel Torres, VP Sales at LogiCore (logistics SaaS, 400 employees)',
    context: 'LogiCore uses ZoomInfo + Apollo. Rachel mentioned in a conference panel that data quality is their biggest bottleneck. You need to position without bashing competitors.',
    icon: <ShieldCheck className="w-5 h-5" />,
    difficulty: 'Hard',
    color: 'text-red-500',
  },
  {
    id: 'exec-cold-email',
    name: 'C-Suite Cold Email',
    type: 'Cold email to a CEO/CRO with extreme brevity requirements',
    prospect: 'David Kim, CEO at Nextera AI (AI platform, 1000+ employees, public company)',
    context: 'He gets 200+ emails/day. Your email must be under 50 words. He only responds to emails that are directly relevant to revenue or board-level priorities.',
    icon: <DollarSign className="w-5 h-5" />,
    difficulty: 'Hard',
    color: 'text-red-500',
  },
];

const LiveCoaching = () => {
  const { currentPlan, loading: planLoading, gateModalOpen, setGateModalOpen, gatedFeature } = usePlanFeatures();
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionActive, setSessionActive] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [scoreCard, setScoreCard] = useState<ScoreCard | null>(null);
  const [scoring, setScoring] = useState(false);
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

  const startSession = (scenario: Scenario) => {
    setSelectedScenario(scenario);
    setSessionActive(true);
    setTurnCount(0);
    setScoreCard(null);
    setMessages([{
      role: 'assistant',
      content: `**📧 Email Role-Play: ${scenario.name}**\n\n**Scenario:** ${scenario.type}\n\n**Prospect:** ${scenario.prospect}\n\n**Context:** ${scenario.context}\n\n---\n\nWrite your email below. Include a subject line (start with \`Subject:\`) followed by the body. I'll respond as the prospect would — or give you coaching feedback if you ask.\n\nWhen you're ready to be scored, click **"End & Score."**`
    }]);
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedScenario) return;
    const userMsg = input.trim();
    setInput("");
    setLoading(true);
    const newTurn = turnCount + 1;
    setTurnCount(newTurn);

    const updatedMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(updatedMessages);

    const systemPrompt = `You are an expert outbound email coach running an interactive email role-play exercise.

SCENARIO: ${selectedScenario.name} — ${selectedScenario.type}
PROSPECT: ${selectedScenario.prospect}
CONTEXT: ${selectedScenario.context}
DIFFICULTY: ${selectedScenario.difficulty}

YOUR ROLE:
- If the user writes an email draft (contains "Subject:" or looks like an email), respond AS THE PROSPECT would. React realistically based on the prospect's profile and the email quality. If the email is weak, the prospect might ignore it, push back, or ask a dismissive question. If it's strong, engage positively.
- If the user asks for help, coaching, or feedback, switch to coach mode and give actionable advice.
- Keep responses concise (2-4 sentences as the prospect, 3-5 as coach).
- Reference current outbound best practices: personalization using trigger events, brevity (under 100 words for cold emails), clear single CTA, no "just checking in" language, problem-focused not product-focused.`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Please sign in.");

      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

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
            ...updatedMessages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
          ],
          userData: {},
        }),
      });

      if (!response.ok) throw new Error("Failed to get response");
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

  const endAndScore = async () => {
    if (messages.length < 3) {
      toast({ title: "Keep going", description: "Write at least one email draft before scoring." });
      return;
    }
    setScoring(true);

    const transcript = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'Sales Rep' : 'Coach/Prospect'}: ${m.content}`)
      .join('\n\n');

    const scorePrompt = `You are an expert outbound email coach. Analyze this email role-play and score the sales rep's email writing.

SCENARIO: ${selectedScenario?.name} — ${selectedScenario?.type} (${selectedScenario?.difficulty} difficulty)
PROSPECT: ${selectedScenario?.prospect}

TRANSCRIPT:
${transcript}

Score each category from 0-100 based on modern outbound best practices:
1. **Subject Line** - Is it short (<7 words), curiosity-driven, and not spammy?
2. **Personalization** - Does it reference specific prospect details, trigger events, or research?
3. **Value Proposition** - Is it problem-focused (not product-focused), relevant to the prospect's world?
4. **Call to Action** - Is there a single, low-friction CTA? (not "let me know your thoughts")
5. **Brevity & Tone** - Is it under 100 words, conversational, and free of filler phrases?

Respond in this EXACT JSON format (no markdown, just raw JSON):
{
  "subjectLine": <number>,
  "personalization": <number>,
  "valueProposition": <number>,
  "callToAction": <number>,
  "brevity": <number>,
  "overall": <number>,
  "feedback": "<3-4 sentences of specific, actionable coaching>"
}`;

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
          question: scorePrompt,
          conversationHistory: [],
          userData: {},
        }),
      });

      if (!response.ok) throw new Error("Failed to score");
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
            if (content) fullContent += content;
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }

      let cleanJson = fullContent.trim();
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      }
      const scores = JSON.parse(cleanJson) as ScoreCard;
      setScoreCard(scores);
    } catch (error: any) {
      toast({ title: "Scoring failed", description: "Try ending the session again.", variant: "destructive" });
    } finally {
      setScoring(false);
    }
  };

  const resetSession = () => {
    setSelectedScenario(null);
    setMessages([]);
    setSessionActive(false);
    setTurnCount(0);
    setScoreCard(null);
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return '[&>div]:bg-green-500';
    if (score >= 60) return '[&>div]:bg-yellow-500';
    return '[&>div]:bg-red-500';
  };

  return (
    <DashboardLayout>
      <FeatureGateModal
        open={gateModalOpen}
        onOpenChange={setGateModalOpen}
        feature={gatedFeature || 'liveCoaching'}
        currentPlan={currentPlan}
      />

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/coach')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Mail className="w-7 h-7 text-primary" />
              Outbound Email Role-Play
            </h1>
            <p className="text-muted-foreground text-sm">
              Practice writing cold emails, follow-ups, and breakup emails — get scored on modern outbound best practices
            </p>
          </div>
        </div>

        {!sessionActive ? (
          <div>
            <h2 className="text-lg font-semibold mb-2">Choose a Scenario</h2>
            <p className="text-sm text-muted-foreground mb-4">Each scenario simulates a real outbound situation. Write your email, get prospect reactions, and receive a scorecard.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {SCENARIOS.map((scenario) => (
                <Card
                  key={scenario.id}
                  className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md"
                  onClick={() => startSession(scenario)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        {scenario.icon}
                      </div>
                      <Badge variant="outline" className={scenario.color}>
                        {scenario.difficulty}
                      </Badge>
                    </div>
                    <CardTitle className="text-base mt-2">{scenario.name}</CardTitle>
                    <CardDescription>{scenario.type}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-1 font-medium">Prospect:</p>
                    <p className="text-sm mb-2">{scenario.prospect.split(',')[0]}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{scenario.context}</p>
                    <Button variant="outline" size="sm" className="mt-4 w-full gap-2">
                      <Play className="w-4 h-4" /> Start Scenario
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chat area */}
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        {selectedScenario?.icon}
                      </div>
                      <div>
                        <CardTitle className="text-base">{selectedScenario?.name}</CardTitle>
                        <CardDescription className="text-xs">{selectedScenario?.type}</CardDescription>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="secondary">Turn {turnCount}</Badge>
                      <Button variant="outline" size="sm" onClick={resetSession} className="gap-1">
                        <RotateCcw className="w-3 h-3" /> Reset
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px] pr-4">
                    <div className="space-y-4">
                      {messages.filter(m => m.role !== 'system').map((msg, i) => (
                        <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                          {msg.role === 'assistant' && (
                            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                              <UserCircle className="w-4 h-4 text-primary" />
                            </div>
                          )}
                          <div className={`rounded-lg px-4 py-3 max-w-[85%] ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}>
                            {msg.role === 'assistant' ? (
                              <div className="prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                              </div>
                            ) : (
                              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            )}
                          </div>
                          {msg.role === 'user' && (
                            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center shrink-0">
                              <MessageSquare className="w-4 h-4 text-primary-foreground" />
                            </div>
                          )}
                        </div>
                      ))}
                      {loading && messages[messages.length - 1]?.content === '' && (
                        <div className="flex gap-3">
                          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                            <Loader2 className="w-4 h-4 text-primary animate-spin" />
                          </div>
                          <div className="bg-muted rounded-lg px-4 py-3">
                            <p className="text-sm text-muted-foreground">Thinking...</p>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>

                  <div className="flex gap-2 mt-4">
                    <Textarea
                      placeholder="Write your email (start with Subject: ...) or ask for coaching help..."
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      className="resize-none min-h-[80px]"
                      disabled={loading}
                    />
                    <div className="flex flex-col gap-2">
                      <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon" className="h-10 w-10">
                        <Send className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Scenario Brief</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium text-xs text-muted-foreground mb-1">PROSPECT</p>
                    <p>{selectedScenario?.prospect}</p>
                  </div>
                  <div>
                    <p className="font-medium text-xs text-muted-foreground mb-1">CONTEXT</p>
                    <p>{selectedScenario?.context}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Quick Tips</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-2">
                  <p>✅ Keep cold emails under 100 words</p>
                  <p>✅ Start with "Subject:" then your subject line</p>
                  <p>✅ Reference a trigger event or specific detail</p>
                  <p>✅ One clear CTA — don't give options</p>
                  <p>✅ Problem-focused, not product-focused</p>
                  <p>❌ No "just checking in" or "I hope this finds you well"</p>
                  <p>❌ No feature dumps or company intros</p>
                </CardContent>
              </Card>

              <Button
                onClick={endAndScore}
                disabled={scoring || messages.length < 3}
                className="w-full gap-2"
                variant="default"
              >
                {scoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                {scoring ? 'Scoring...' : 'End & Score'}
              </Button>

              {scoreCard && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-primary" />
                      Email Scorecard
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-center">
                      <span className={`text-4xl font-bold ${getScoreColor(scoreCard.overall)}`}>
                        {scoreCard.overall}
                      </span>
                      <p className="text-xs text-muted-foreground">Overall Score</p>
                    </div>

                    {[
                      { label: 'Subject Line', value: scoreCard.subjectLine },
                      { label: 'Personalization', value: scoreCard.personalization },
                      { label: 'Value Proposition', value: scoreCard.valueProposition },
                      { label: 'Call to Action', value: scoreCard.callToAction },
                      { label: 'Brevity & Tone', value: scoreCard.brevity },
                    ].map((item) => (
                      <div key={item.label} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{item.label}</span>
                          <span className={`font-semibold ${getScoreColor(item.value)}`}>{item.value}</span>
                        </div>
                        <Progress value={item.value} className={`h-2 ${getProgressColor(item.value)}`} />
                      </div>
                    ))}

                    <div className="mt-4 p-3 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-1">Coach's Notes</p>
                      <p className="text-sm text-muted-foreground">{scoreCard.feedback}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default LiveCoaching;
