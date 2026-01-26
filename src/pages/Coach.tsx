import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Send, TrendingUp, Target, Lightbulb, Loader2, Sparkles, BookOpen, Radio, MessageSquare, Plus, Trash2, History } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";

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
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
      const { data: leads } = await supabase.from("leads").select("*");
      const { data: deals } = await supabase.from("deals").select("*");
      const { data: activities } = await supabase
        .from("activities")
        .select("*")
        .eq("type", "meeting")
        .gte("due_date", new Date().toISOString());

      const totalLeads = leads?.length || 0;
      const activeDeals = deals?.length || 0;
      const pipelineValue = deals?.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0) || 0;
      const avgDealSize = activeDeals > 0 ? Math.round(pipelineValue / activeDeals) : 0;
      const closedDeals = deals?.filter(d => d.stage === 'closed-won').length || 0;
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

  const loadConversations = async () => {
    try {
      const { data, error } = await supabase
        .from("coaching_conversations")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      setConversations(data || []);
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
    loadConversations();
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

    const userMessage = input.trim();
    setInput("");
    setLoading(true);

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
      
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // Process complete lines
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") continue;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              setMessages(prev => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
                  updated[lastIdx] = { ...updated[lastIdx], content: fullContent };
                }
                return updated;
              });
            }
          } catch {
            // Incomplete JSON, put back
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

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
  };

  const handleCustomPlaybooks = () => {
    if (!hasCustomPlaybooks) {
      triggerGate('customPlaybooks');
      return;
    }
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Sales Coach</h1>
            <p className="text-muted-foreground">
              Get personalized coaching and insights to improve your sales performance
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowHistory(!showHistory)}>
              <History className="w-4 h-4 mr-2" />
              History
              {conversations.length > 0 && <Badge variant="secondary" className="ml-2">{conversations.length}</Badge>}
            </Button>
            <Button variant="outline" onClick={handleLiveCoaching}>
              <Radio className="w-4 h-4 mr-2" />
              Live Coaching
              {!hasLiveCoaching && <Sparkles className="w-3 h-3 ml-2 text-primary" />}
            </Button>
            <Button variant="outline" onClick={handleCustomPlaybooks}>
              <BookOpen className="w-4 h-4 mr-2" />
              Playbooks
              {!hasCustomPlaybooks && <Sparkles className="w-3 h-3 ml-2 text-primary" />}
            </Button>
          </div>
        </div>

        {showHistory && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Conversation History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {conversations.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No previous conversations</p>
              ) : (
                <div className="space-y-2">
                  {conversations.map(conv => (
                    <div 
                      key={conv.id} 
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-accent/50 transition-colors ${currentConversationId === conv.id ? 'bg-accent' : ''}`}
                      onClick={() => loadConversationMessages(conv.id)}
                    >
                      <div>
                        <p className="font-medium">{conv.title || "Untitled"}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(conv.updated_at).toLocaleDateString()} at {new Date(conv.updated_at).toLocaleTimeString()}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                      >
                        <Trash2 className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Performance
              </CardTitle>
              <CardDescription>Your recent sales metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Close Rate</span>
                  <Badge variant="outline">{stats.closeRate}%</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg Deal Size</span>
                  <Badge variant="outline">${stats.avgDealSize.toLocaleString()}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Upcoming Meetings</span>
                  <Badge variant="outline">{stats.upcomingMeetings}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Goals
              </CardTitle>
              <CardDescription>Your current objectives</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Leads</span>
                  <Badge className="bg-green-500">{stats.totalLeads}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Active Deals</span>
                  <Badge className="bg-blue-500">{stats.activeDeals}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Pipeline Value</span>
                  <Badge className="bg-purple-500">${stats.pipelineValue.toLocaleString()}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-primary" />
                Recommendations
              </CardTitle>
              <CardDescription>AI-powered insights</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.totalLeads > 0 ? (
                <div className="space-y-2 text-sm">
                  {stats.upcomingMeetings > 0 && (
                    <p>• Prepare for {stats.upcomingMeetings} upcoming meeting{stats.upcomingMeetings > 1 ? 's' : ''}</p>
                  )}
                  {stats.activeDeals > 0 && (
                    <p>• Focus on closing ${stats.pipelineValue.toLocaleString()} in pipeline</p>
                  )}
                  {stats.closeRate > 0 && stats.closeRate < 25 && (
                    <p>• Work on improving your {stats.closeRate}% close rate</p>
                  )}
                  {stats.totalLeads > 0 && stats.activeDeals === 0 && (
                    <p>• Convert some of your {stats.totalLeads} leads into deals</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Add leads to get AI-powered insights</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Ask Your AI Coach</CardTitle>
                <CardDescription>
                  Get personalized advice, practice objection handling, or analyze your sales calls
                </CardDescription>
              </div>
              {messages.length > 0 && (
                <Button variant="outline" size="sm" onClick={startNewSession}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Session
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {messages.length === 0 && (
              <div className="flex gap-2 flex-wrap">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleQuickQuestion("How can I improve my close rate?")}
                >
                  Improve close rate
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleQuickQuestion("What should I focus on this week?")}
                >
                  Weekly priorities
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleQuickQuestion("How do I handle price objections?")}
                >
                  Handle objections
                </Button>
              </div>
            )}

            {messages.length > 0 && (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-4">
                  {messages.map((msg, idx) => (
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
                            <Lightbulb className="w-4 h-4 text-primary" />
                            <span className="text-sm font-medium">Coach</span>
                          </div>
                        )}
                        <p className="text-sm whitespace-pre-wrap">
                          {msg.content || (loading && msg.role === 'assistant' ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Thinking...
                            </span>
                          ) : '')}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>
            )}

            <div className="space-y-2">
              <Textarea
                placeholder="Type your question or describe a sales scenario you need help with..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                className="min-h-[80px]"
              />

              <div className="flex gap-2">
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !input.trim()}
                  className="flex-1"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Thinking...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Send
                    </>
                  )}
                </Button>
              </div>
            </div>

            {messages.length === 0 && (
              <div className="mt-6 p-4 bg-accent/50 rounded-lg">
                <h4 className="font-semibold mb-2">Example Questions:</h4>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  <li>• "How do I handle price objections for enterprise deals?"</li>
                  <li>• "What's the best way to follow up after a demo?"</li>
                  <li>• "Help me prepare for a call with a CFO"</li>
                  <li>• "Review my email template for cold outreach"</li>
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Coach;