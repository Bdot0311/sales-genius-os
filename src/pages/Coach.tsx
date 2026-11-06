import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  MetricStrip,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  SectionLabel,
} from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Loader2, Sparkles, BookOpen, Radio, Plus, Trash2, History } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { readCoachDeltaStream } from "@/lib/coach-stream";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";

/**
 * The openers.
 *
 * There were two lists of these: four buttons that asked a question when you
 * clicked them, and a second list of four different example questions printed
 * under the composer as plain text you could only read and retype. The second
 * list was the better writing, so it is the one that survives — as buttons.
 */
const STARTER_QUESTIONS = [
  "How do I handle price objections for enterprise deals?",
  "What's the best way to follow up after a demo?",
  "Help me prepare for a call with a CFO",
  "Review my cold outreach template",
  "How can I improve my close rate?",
  "What should I focus on this week?",
];

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
}

interface Conversation {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

const Coach = () => {
  const { 
    currentPlan, 
    features, 
    loading: planLoading,
    gateModalOpen,
    setGateModalOpen,
    gatedFeature,
    triggerGate,
  } = usePlanFeatures();
  
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [stats, setStats] = useState({
    totalLeads: 0,
    activeDeals: 0,
    pipelineValue: 0,
    avgDealSize: 0,
    closeRate: 0,
    upcomingMeetings: 0,
  });
  const [messagesUsed, setMessagesUsed] = useState(0);
  const { toast } = useToast();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const coachLimit = (features as { coachMessagesPerMonth?: number }).coachMessagesPerMonth ?? 5;

  const loadCoachUsage = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const periodStart = new Date();
      periodStart.setUTCDate(1);
      periodStart.setUTCHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("coaching_messages")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("role", "user")
        .gte("created_at", periodStart.toISOString());
      setMessagesUsed(count ?? 0);
    } catch (error) {
      console.error("Error loading coach usage:", error);
    }
  };

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: leads } = await supabase.from("leads").select("*").eq("user_id", user.id);
      const { data: deals } = await supabase.from("deals").select("*").eq("user_id", user.id);
      const { data: activities } = await supabase
        .from("activities")
        .select("*")
        .eq("user_id", user.id)
        .eq("type", "meeting")
        .gte("due_date", new Date().toISOString());

      const totalLeads = leads?.length || 0;
      const activeDeals = deals?.length || 0;
      const pipelineValue = deals?.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0) || 0;
      const avgDealSize = activeDeals > 0 ? Math.round(pipelineValue / activeDeals) : 0;
      const closedDeals = deals?.filter(d => d.stage === 'closed_won').length || 0;
      const closeRate = totalLeads > 0 ? Math.round((closedDeals / totalLeads) * 100) : 0;

      setStats({
        totalLeads,
        activeDeals,
        pipelineValue,
        avgDealSize,
        closeRate,
        upcomingMeetings: activities?.length || 0,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    }
  };

  const loadConversations = async (autoLoadLatest = false) => {
    try {
      const { data, error } = await supabase
        .from("coaching_conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setConversations(data || []);
      
      // Auto-load most recent conversation on initial page load
      if (autoLoadLatest && data && data.length > 0 && !currentConversationId) {
        await loadConversationMessages(data[0].id);
      }
    } catch (error) {
      console.error("Error loading conversations:", error);
    }
  };

  const loadConversationMessages = async (conversationId: string) => {
    try {
      const { data, error } = await supabase
        .from("coaching_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(data?.map(m => ({ 
        id: m.id, 
        role: m.role as 'user' | 'assistant', 
        content: m.content,
        created_at: m.created_at 
      })) || []);
      setCurrentConversationId(conversationId);
      setShowHistory(false);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  };

  const createNewConversation = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const { data, error } = await supabase
        .from("coaching_conversations")
        .insert({ user_id: user.id, title: "New Coaching Session" })
        .select()
        .single();

      if (error) throw error;
      await loadConversations();
      return data.id;
    } catch (error) {
      console.error("Error creating conversation:", error);
      return null;
    }
  };

  const saveMessage = async (conversationId: string, role: 'user' | 'assistant', content: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from("coaching_messages")
        .insert({ conversation_id: conversationId, user_id: user.id, role, content });

      // Update conversation title if it's the first user message
      if (role === 'user') {
        const title = content.length > 50 ? content.substring(0, 50) + "..." : content;
        await supabase
          .from("coaching_conversations")
          .update({ title, updated_at: new Date().toISOString() })
          .eq("id", conversationId);
      }
    } catch (error) {
      console.error("Error saving message:", error);
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      await supabase
        .from("coaching_conversations")
        .delete()
        .eq("id", conversationId);

      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
        setMessages([]);
      }
      await loadConversations();
      toast({ title: "Conversation deleted" });
    } catch (error) {
      console.error("Error deleting conversation:", error);
    }
  };

  useEffect(() => {
    loadStats();
    loadCoachUsage();
    loadConversations(true); // auto-load latest conversation
  }, []);

  if (planLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-12 h-12 text-muted-foreground animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  const hasLiveCoaching = features.liveCoaching;
  const hasCustomPlaybooks = features.customPlaybooks;

  const handleSubmit = async () => {
    if (!input.trim()) return;

    if (coachLimit !== -1 && messagesUsed >= coachLimit) {
      toast({
        title: "Monthly coaching limit reached",
        description: `Your ${currentPlan} plan includes ${coachLimit} AI Sales Coach messages per month. Upgrade for a higher limit.`,
        variant: "destructive",
      });
      return;
    }

    const userMessage = input.trim();
    setInput("");
    setLoading(true);
    setMessagesUsed(prev => prev + 1);

    // Add user message to UI immediately
    const newUserMessage: Message = { role: 'user', content: userMessage };
    setMessages(prev => [...prev, newUserMessage]);

    // Create or use existing conversation
    let convId = currentConversationId;
    if (!convId) {
      convId = await createNewConversation();
      if (!convId) {
        toast({ title: "Error", description: "Failed to create conversation", variant: "destructive" });
        setLoading(false);
        return;
      }
      setCurrentConversationId(convId);
    }

    // Save user message
    await saveMessage(convId, 'user', userMessage);

    // Add empty assistant message for streaming
    setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error("Authentication required. Please sign in to use the AI Coach.");
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          question: userMessage,
          userData: stats,
          conversationId: convId,
          conversationHistory: messages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to get response");
      }

      if (!response.body) throw new Error("No response body");

      const fullContent = await readCoachDeltaStream(response.body, (content) => {
        setMessages(prev => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
            updated[lastIdx] = { ...updated[lastIdx], content };
          }
          return updated;
        });
      });

      // Save assistant response
      if (fullContent) {
        await saveMessage(convId, 'assistant', fullContent);
        await loadConversations();
      }
    } catch (error: any) {
      console.error("Streaming error:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to get coaching response",
        variant: "destructive",
      });
      // Remove empty assistant message on error
      setMessages(prev => prev.filter(m => m.content !== ''));
    } finally {
      setLoading(false);
    }
  };

  const handleQuickQuestion = (question: string) => {
    setInput(question);
  };

  const startNewSession = () => {
    setCurrentConversationId(null);
    setMessages([]);
  };

  const handleLiveCoaching = () => {
    if (!hasLiveCoaching) {
      triggerGate('liveCoaching');
      return;
    }
    navigate('/dashboard/coach/live');
  };

  /**
   * What this workspace's own numbers suggest doing next.
   *
   * These were paragraphs, each starting with a literal bullet character,
   * inside a card titled "Recommendations" and described as "AI-powered
   * insights" — which they are not: they are four if-statements reading the
   * counts above them. The card is gone; when there is nothing to say, so is
   * the panel.
   */
  const focusPoints = [
    stats.upcomingMeetings > 0 &&
      `Prepare for ${stats.upcomingMeetings} upcoming meeting${stats.upcomingMeetings > 1 ? "s" : ""}.`,
    stats.activeDeals > 0 &&
      `Focus on closing $${stats.pipelineValue.toLocaleString()} sitting in your pipeline.`,
    stats.closeRate > 0 && stats.closeRate < 25 &&
      `Your close rate is ${stats.closeRate}%. Ask what is losing the deals you work.`,
    stats.totalLeads > 0 && stats.activeDeals === 0 &&
      `You have ${stats.totalLeads} leads and no open deals. Convert the best of them.`,
  ].filter(Boolean) as string[];

  const handleCustomPlaybooks = () => {
    if (!hasCustomPlaybooks) {
      triggerGate('customPlaybooks');
      return;
    }
    navigate('/dashboard/coach/playbooks');
  };

  return (
    <DashboardLayout>
      <FeatureGateModal 
        open={gateModalOpen} 
        onOpenChange={setGateModalOpen}
        feature={gatedFeature || 'liveCoaching'}
        currentPlan={currentPlan}
      />
      
      <PageHeader
        title="AI Sales Coach"
        description="Ask for advice on a deal, rehearse an objection, or have a call reviewed."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setShowHistory(!showHistory)}>
              <History className="mr-1.5 h-3.5 w-3.5" />
              History
              {conversations.length > 0 && (
                <span className="ml-1.5 tabular-nums text-muted-foreground">{conversations.length}</span>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleLiveCoaching}>
              <Radio className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Live coaching</span>
              <span className="sm:hidden">Live</span>
              {!hasLiveCoaching && <Sparkles className="ml-1.5 h-3 w-3 text-primary" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCustomPlaybooks}>
              <BookOpen className="mr-1.5 h-3.5 w-3.5" />
              Playbooks
              {!hasCustomPlaybooks && <Sparkles className="ml-1.5 h-3 w-3 text-primary" />}
            </Button>
          </>
        }
      />

      <div className="space-y-4 pt-4">
        {showHistory && (
          <Panel>
            <PanelHeader
              title="Past conversations"
              meta={conversations.length > 0 ? `${conversations.length} saved` : undefined}
              actions={
                <button
                  onClick={() => setShowHistory(false)}
                  className="text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Hide
                </button>
              }
            />
            {conversations.length === 0 ? (
              <PanelBody className="py-8 text-center text-[0.6875rem] text-muted-foreground">
                Nothing saved yet. A conversation is kept once you send your first question.
              </PanelBody>
            ) : (
              <div>
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`flex items-center justify-between gap-3 border-b border-border/30 px-4 py-2.5 transition-colors last:border-b-0 hover:bg-muted/20 sm:px-5 ${
                      currentConversationId === conv.id ? "bg-muted/40" : ""
                    }`}
                  >
                    <button
                      onClick={() => loadConversationMessages(conv.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="block truncate text-[0.8125rem] text-foreground">
                        {conv.title || "Untitled"}
                      </span>
                      <span className="mt-0.5 block text-[0.625rem] text-muted-foreground">
                        {new Date(conv.updated_at).toLocaleDateString()} ·{" "}
                        {new Date(conv.updated_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </span>
                    </button>
                    <button
                      onClick={() => deleteConversation(conv.id)}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        )}

        {/*
          Six numbers, one strip.

          These were three cards in a row, each with an icon, a title, a
          description and three label-and-badge rows — and the two neighbours
          disagreed about how to draw the same thing, one using outlined badges
          and the other solid green, blue and purple ones, which made the three
          loudest marks on the page a set of colours that meant nothing. The
          middle card was also titled "Goals" and described as "your current
          objectives" while listing how many leads and deals exist, which are
          counts and not objectives.
        */}
        <MetricStrip
          columns={3}
          metrics={[
            { label: "Close rate", value: `${stats.closeRate}%`, note: "Deals won against deals worked" },
            { label: "Average deal", value: `$${stats.avgDealSize.toLocaleString()}`, note: "Across your closed deals" },
            { label: "Meetings ahead", value: stats.upcomingMeetings, note: "Booked and still to happen" },
            { label: "Leads", value: stats.totalLeads, note: "Saved to your workspace" },
            { label: "Open deals", value: stats.activeDeals, note: "In the pipeline right now" },
            { label: "Pipeline", value: `$${stats.pipelineValue.toLocaleString()}`, note: "Total value of open deals" },
          ]}
        />

        {focusPoints.length > 0 && (
          <Panel>
            <PanelHeader title="Worth your attention" />
            <PanelBody>
              {/* A real list. These were paragraphs each beginning with a
                  literal bullet character, which is a list drawn by hand. */}
              <ul className="space-y-1.5">
                {focusPoints.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-foreground/85"
                  >
                    <span className="mt-[0.4375rem] h-1 w-1 shrink-0 rounded-full bg-primary" />
                    {point}
                  </li>
                ))}
              </ul>
            </PanelBody>
          </Panel>
        )}

        <Panel>
          <PanelHeader
            title="Ask your coach"
            actions={
              messages.length > 0 ? (
                <Button variant="outline" size="sm" onClick={startNewSession}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  New session
                </Button>
              ) : undefined
            }
          />

          {messages.length > 0 ? (
            <ScrollArea className="h-[400px]">
              <div className="space-y-4 p-4 sm:p-5">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-lg px-3.5 py-3 ${
                        msg.role === "user"
                          ? "bg-primary/15 text-foreground"
                          : "border border-border/40 bg-muted/25"
                      }`}
                    >
                      {msg.role === "assistant" && (
                        <p className="mb-1.5 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">
                          Coach
                        </p>
                      )}
                      {msg.role === "assistant" ? (
                        /* prose-invert, not prose: the light-mode prose colours
                           set body text to a near-black grey, and this page has
                           only ever rendered on a dark ground. */
                        <div className="prose prose-sm prose-invert max-w-none text-[0.8125rem]">
                          {msg.content ? (
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          ) : loading ? (
                            <span className="flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Thinking…
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-[0.8125rem] leading-relaxed">{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          ) : (
            /* One list of openers, and every one of them is clickable.
               There were two: four buttons that asked a question, and below
               the composer a second list of four different example questions
               rendered as plain text you could only read and retype. */
            <PanelBody className="space-y-2.5">
              <SectionLabel>Start with one of these</SectionLabel>
              <div className="grid gap-2 sm:grid-cols-2">
                {STARTER_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleQuickQuestion(q)}
                    className="rounded-lg border border-border/40 px-3 py-2.5 text-left text-[0.8125rem] leading-relaxed text-foreground/85 transition-colors hover:border-primary/40 hover:bg-primary/5"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </PanelBody>
          )}

          <div className="border-t border-border/40 p-4 sm:p-5">
            <Textarea
              placeholder="Ask anything, or describe the situation you need help with…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              /* 16px on mobile: below that, focusing the field makes iOS Safari
                 zoom the page and never zoom back out. */
              className="min-h-[72px] resize-none border-border/50 bg-background text-base sm:text-[0.8125rem]"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-[0.625rem] text-muted-foreground">
                Enter to send, Shift and Enter for a new line.
              </p>
              <Button size="sm" onClick={handleSubmit} disabled={loading || !input.trim()}>
                {loading ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Thinking…
                  </>
                ) : (
                  <>
                    <Send className="mr-1.5 h-3.5 w-3.5" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* The allowance belongs to the thing that spends it. It was a badge
              in the page header, which is where a page says what it is. */}
          <PanelFooter>
            {coachLimit === -1
              ? "Unlimited coaching messages on your plan"
              : `${Math.min(messagesUsed, coachLimit)} of ${coachLimit} coaching messages used this month`}
          </PanelFooter>
        </Panel>
      </div>
    </DashboardLayout>
  );
};

export default Coach;
