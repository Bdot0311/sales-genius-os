import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  Radio, Send, Loader2, UserCircle, RotateCcw, Play, ArrowLeft,
  Trophy, Target, MessageSquare, Briefcase, Building2, DollarSign,
  ShieldCheck, Zap
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

interface Persona {
  id: string;
  name: string;
  title: string;
  company: string;
  personality: string;
  icon: React.ReactNode;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  color: string;
}

interface ScoreCard {
  rapport: number;
  discovery: number;
  valueProposition: number;
  objectionHandling: number;
  closing: number;
  overall: number;
  feedback: string;
}

const PERSONAS: Persona[] = [
  {
    id: 'startup-ceo',
    name: 'Alex Rivera',
    title: 'CEO & Co-Founder',
    company: 'NovaTech (Series A Startup)',
    personality: 'Fast-paced, budget-conscious, wants quick ROI proof. Skeptical of big promises.',
    icon: <Zap className="w-5 h-5" />,
    difficulty: 'Easy',
    color: 'text-green-500',
  },
  {
    id: 'vp-sales',
    name: 'Jordan Mitchell',
    title: 'VP of Sales',
    company: 'MidCorp Solutions (200 employees)',
    personality: 'Data-driven, wants metrics, currently using a competitor. Needs to justify the switch to the C-suite.',
    icon: <Target className="w-5 h-5" />,
    difficulty: 'Medium',
    color: 'text-yellow-500',
  },
  {
    id: 'enterprise-cfo',
    name: 'Dr. Sarah Chen',
    title: 'CFO',
    company: 'GlobalTech Industries (Fortune 500)',
    personality: 'Risk-averse, compliance-focused, needs security docs and ROI analysis. Very busy, tests your ability to be concise.',
    icon: <DollarSign className="w-5 h-5" />,
    difficulty: 'Hard',
    color: 'text-red-500',
  },
  {
    id: 'procurement',
    name: 'Marcus Williams',
    title: 'Head of Procurement',
    company: 'Enterprise Corp (1000+ employees)',
    personality: 'Process-oriented, will ask about compliance, SLAs, and pricing breakdown. Master negotiator.',
    icon: <ShieldCheck className="w-5 h-5" />,
    difficulty: 'Hard',
    color: 'text-red-500',
  },
  {
    id: 'it-director',
    name: 'Priya Patel',
    title: 'IT Director',
    company: 'HealthFirst Medical Group',
    personality: 'Technical, concerned about integrations and data security. Needs to see how it fits their stack.',
    icon: <Building2 className="w-5 h-5" />,
    difficulty: 'Medium',
    color: 'text-yellow-500',
  },
  {
    id: 'skeptical-founder',
    name: 'Tom Barrett',
    title: 'Founder',
    company: 'Barrett & Co. (bootstrapped)',
    personality: 'Has been burned before, deeply skeptical, will object to everything. If you win him over, you can sell to anyone.',
    icon: <Briefcase className="w-5 h-5" />,
    difficulty: 'Hard',
    color: 'text-red-500',
  },
];

const LiveCoaching = () => {
  const { currentPlan, features, loading: planLoading, gateModalOpen, setGateModalOpen, gatedFeature } = usePlanFeatures();
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
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

  const startSession = async (persona: Persona) => {
    setSelectedPersona(persona);
    setSessionActive(true);
    setTurnCount(0);
    setScoreCard(null);
    setLoading(true);

    const systemPrompt = `You are role-playing as ${persona.name}, ${persona.title} at ${persona.company}. 
Personality: ${persona.personality}

RULES:
- Stay completely in character. Never break character.
- You are on a discovery/sales call with a sales rep who is trying to sell you their product.
- React naturally based on your personality. Ask tough questions. Raise real objections.
- Be realistic — don't make it too easy or impossible. Match the ${persona.difficulty} difficulty level.
- Keep responses concise (2-4 sentences typically, like a real conversation).
- Start by briefly introducing yourself and asking what this call is about.`;

    const openingMessages: Message[] = [
      { role: 'system', content: systemPrompt },
    ];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Please sign in first.");

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          question: "Start the role-play. Introduce yourself in character.",
          conversationHistory: openingMessages,
          userData: {},
          isRolePlay: true,
        }),
      });

      if (!response.ok) throw new Error("Failed to start session");
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      setMessages([{ role: 'assistant', content: '' }]);

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
              setMessages([{ role: 'assistant', content: fullContent }]);
            }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSessionActive(false);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedPersona) return;
    const userMsg = input.trim();
    setInput("");
    setLoading(true);
    const newTurn = turnCount + 1;
    setTurnCount(newTurn);

    const updatedMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(updatedMessages);

    const systemPrompt = `You are role-playing as ${selectedPersona.name}, ${selectedPersona.title} at ${selectedPersona.company}. 
Personality: ${selectedPersona.personality}
Stay in character. Keep responses conversational and concise (2-4 sentences). Difficulty: ${selectedPersona.difficulty}.`;

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
          isRolePlay: true,
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
      toast({ title: "Keep going", description: "Have at least a few exchanges before scoring." });
      return;
    }
    setScoring(true);

    const transcript = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'Sales Rep' : selectedPersona?.name}: ${m.content}`)
      .join('\n\n');

    const scorePrompt = `You are an expert sales coach. Analyze this role-play transcript and score the sales rep's performance.

PERSONA: ${selectedPersona?.name}, ${selectedPersona?.title} at ${selectedPersona?.company} (${selectedPersona?.difficulty} difficulty)

TRANSCRIPT:
${transcript}

Score each category from 0-100:
1. **Rapport Building** - Did they build connection and trust?
2. **Discovery** - Did they ask good qualifying questions?
3. **Value Proposition** - Did they articulate clear value tied to the buyer's needs?
4. **Objection Handling** - How well did they handle pushback?
5. **Closing Technique** - Did they move toward next steps?

Respond in this EXACT JSON format (no markdown, just raw JSON):
{
  "rapport": <number>,
  "discovery": <number>,
  "valueProposition": <number>,
  "objectionHandling": <number>,
  "closing": <number>,
  "overall": <number>,
  "feedback": "<2-3 sentences of actionable coaching advice>"
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
          isRolePlay: true,
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

      // Parse JSON from response (handle potential markdown wrapping)
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
    setSelectedPersona(null);
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
              <Radio className="w-7 h-7 text-primary" />
              Live Sales Role-Play
            </h1>
            <p className="text-muted-foreground text-sm">
              Practice selling to realistic buyer personas and get scored on your technique
            </p>
          </div>
        </div>

        {!sessionActive ? (
          <div>
            <h2 className="text-lg font-semibold mb-4">Choose a Buyer Persona</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {PERSONAS.map((persona) => (
                <Card
                  key={persona.id}
                  className="cursor-pointer hover:border-primary/50 transition-all hover:shadow-md"
                  onClick={() => startSession(persona)}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        {persona.icon}
                      </div>
                      <Badge variant="outline" className={persona.color}>
                        {persona.difficulty}
                      </Badge>
                    </div>
                    <CardTitle className="text-base mt-2">{persona.name}</CardTitle>
                    <CardDescription>{persona.title}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-2">{persona.company}</p>
                    <p className="text-sm">{persona.personality}</p>
                    <Button variant="outline" size="sm" className="mt-4 w-full gap-2">
                      <Play className="w-4 h-4" /> Start Role-Play
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chat area */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                      <UserCircle className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{selectedPersona?.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {selectedPersona?.title} · {selectedPersona?.company}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{turnCount} turns</Badge>
                    <Button variant="outline" size="sm" onClick={resetSession}>
                      <RotateCcw className="w-4 h-4 mr-1" /> Reset
                    </Button>
                    <Button
                      size="sm"
                      onClick={endAndScore}
                      disabled={scoring || messages.length < 3}
                      className="gap-1"
                    >
                      {scoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                      End & Score
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-[450px] pr-4">
                  <div className="space-y-4">
                    {messages.filter(m => m.role !== 'system').map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] p-4 rounded-lg ${
                            msg.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}
                        >
                          {msg.role === 'assistant' && (
                            <div className="flex items-center gap-2 mb-2">
                              <UserCircle className="w-4 h-4 text-primary" />
                              <span className="text-xs font-medium">{selectedPersona?.name}</span>
                            </div>
                          )}
                          {msg.role === 'assistant' ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              {msg.content ? (
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                              ) : loading ? (
                                <span className="flex items-center gap-2 text-sm">
                                  <Loader2 className="w-4 h-4 animate-spin" /> Thinking...
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

                <div className="space-y-2">
                  <Textarea
                    placeholder="Respond to the buyer..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                      }
                    }}
                    className="min-h-[70px]"
                  />
                  <Button onClick={sendMessage} disabled={loading || !input.trim()} className="w-full gap-2">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Score / Tips panel */}
            <div className="space-y-4">
              {scoreCard ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Trophy className="w-5 h-5 text-primary" />
                      Performance Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-center mb-4">
                      <span className={`text-5xl font-bold ${getScoreColor(scoreCard.overall)}`}>
                        {scoreCard.overall}
                      </span>
                      <p className="text-sm text-muted-foreground mt-1">Overall Score</p>
                    </div>

                    {[
                      { label: 'Rapport Building', value: scoreCard.rapport },
                      { label: 'Discovery', value: scoreCard.discovery },
                      { label: 'Value Proposition', value: scoreCard.valueProposition },
                      { label: 'Objection Handling', value: scoreCard.objectionHandling },
                      { label: 'Closing Technique', value: scoreCard.closing },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{label}</span>
                          <span className={getScoreColor(value)}>{value}</span>
                        </div>
                        <Progress value={value} className={`h-2 ${getProgressColor(value)}`} />
                      </div>
                    ))}

                    <div className="mt-4 p-3 bg-accent/50 rounded-lg">
                      <p className="text-sm font-medium mb-1">Coach Feedback</p>
                      <p className="text-sm text-muted-foreground">{scoreCard.feedback}</p>
                    </div>

                    <Button onClick={resetSession} variant="outline" className="w-full gap-2 mt-2">
                      <RotateCcw className="w-4 h-4" /> Try Another Persona
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <MessageSquare className="w-5 h-5 text-primary" />
                      Tips
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3 text-sm text-muted-foreground">
                      <li>• Start by building rapport — don't pitch immediately</li>
                      <li>• Ask open-ended discovery questions</li>
                      <li>• Tie your value prop to their specific pain points</li>
                      <li>• When you get an objection, acknowledge before reframing</li>
                      <li>• Always propose a clear next step</li>
                      <li className="pt-2 border-t text-xs">
                        Have 4-6 exchanges, then click <strong>"End & Score"</strong> for AI feedback.
                      </li>
                    </ul>
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
