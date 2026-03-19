import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { FeatureGateModal } from "@/components/dashboard/FeatureGateModal";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Inbox as InboxIcon, Send, Archive, Mail, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { classifyReply, Classification, CLASSIFICATION_CONFIG } from "@/lib/reply-classifier";
import { toast } from "sonner";

const TABS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "interested", label: "🔥 Interested" },
  { value: "meeting", label: "📅 Meeting" },
  { value: "question", label: "❓ Question" },
  { value: "not_now", label: "⏰ Not Now" },
  { value: "not_interested", label: "❌ Not Interested" },
  { value: "ooo", label: "🤖 OOO" },
];

interface ReplyThread {
  id: string;
  user_id: string;
  lead_id: string | null;
  subject: string;
  original_email_body: string | null;
  reply_body: string | null;
  sender_email: string;
  classification: string | null;
  read: boolean | null;
  created_at: string;
  replied_at: string | null;
  leads?: { contact_name: string; company_name: string } | null;
}

function generateDraftReply(classification: string): string {
  switch (classification) {
    case "interested": return "Thanks for getting back to me! I'd love to share more details.\n\nHere's a link to book 15 minutes on my calendar: [Calendly Link]\n\nLooking forward to it!";
    case "meeting": return "Great — let's get something on the calendar.\n\nHere's my availability: [Calendly Link]\n\nLet me know what works best!";
    case "question": return "Great question! Here's some more detail:\n\n[Answer their question here]\n\nHappy to jump on a quick call if it'd be easier to discuss.";
    case "not_now": return "Completely understand — timing is everything.\n\nI'll circle back in about 30 days. In the meantime, feel free to reach out if anything changes.\n\nBest of luck!";
    case "ooo": return "[Auto-detected: Out of Office]\n\nNote to self: Follow up after their return date.";
    case "not_interested": return "Understood — appreciate you letting me know.\n\nIf anything changes down the road, don't hesitate to reach out. Wishing you all the best!";
    default: return "Thanks for your reply! Let me take a closer look and get back to you shortly.";
  }
}

const Inbox = () => {
  const queryClient = useQueryClient();
  const { hasFeature, gateModalOpen, setGateModalOpen, gatedFeature, currentPlan } = usePlanFeatures();
  const inboxGated = !hasFeature('unifiedInbox');
  const [activeTab, setActiveTab] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftReply, setDraftReply] = useState("");

  const { data: threads, isLoading } = useQuery({
    queryKey: ["reply-threads"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("reply_threads")
        .select("*, leads(contact_name, company_name)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ReplyThread[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("reply_threads").update({ read: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reply-threads"] }),
  });

  const updateClassification = useMutation({
    mutationFn: async ({ id, classification }: { id: string; classification: string }) => {
      await supabase.from("reply_threads").update({ classification }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reply-threads"] }),
  });

  const dismissThread = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("reply_threads").delete().eq("id", id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reply-threads"] });
      setSelectedId(null);
      toast.success("Thread archived");
    },
  });

  const filtered = (threads || []).filter((t) => activeTab === "all" || t.classification === activeTab);
  const selected = (threads || []).find((t) => t.id === selectedId);

  const handleSelect = (thread: ReplyThread) => {
    setSelectedId(thread.id);
    if (!thread.read) markRead.mutate(thread.id);
    setDraftReply(generateDraftReply(thread.classification || "question"));
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="text-muted-foreground">Unified reply inbox for all your outreach</p>
        </div>

        {inboxGated ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Lock className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Unified Reply Inbox</h3>
              <p className="text-muted-foreground text-center mb-4">Auto-classify replies, draft AI responses, and manage all prospect communication in one place. Available on Growth and above.</p>
              <Button onClick={() => { if (!hasFeature('unifiedInbox')) { const { gatedAction } = usePlanFeatures(); } setGateModalOpen(true); }}>
                Upgrade to Unlock
              </Button>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : (threads || []).length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <InboxIcon className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No replies yet</h3>
              <p className="text-muted-foreground text-center">When leads reply to your outreach, their responses will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex gap-4 h-[calc(100vh-220px)]">
            {/* Left: Thread List */}
            <div className="w-80 flex-shrink-0 flex flex-col border rounded-lg">
              <div className="flex gap-1 p-2 overflow-x-auto border-b">
                {TABS.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setActiveTab(tab.value)}
                    className={`px-2 py-1 text-xs rounded whitespace-nowrap transition-colors ${activeTab === tab.value ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <ScrollArea className="flex-1">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">No threads in this filter</p>
                ) : (
                  filtered.map((thread) => {
                    const config = CLASSIFICATION_CONFIG[(thread.classification as Classification) || "question"];
                    return (
                      <button
                        key={thread.id}
                        onClick={() => handleSelect(thread)}
                        className={`w-full text-left p-3 border-b transition-colors hover:bg-muted/50 ${selectedId === thread.id ? "bg-muted" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm truncate ${!thread.read ? "font-semibold" : ""}`}>
                              {thread.leads?.contact_name || thread.sender_email}
                            </p>
                            {thread.leads?.company_name && (
                              <p className="text-xs text-muted-foreground truncate">{thread.leads.company_name}</p>
                            )}
                          </div>
                          <Badge variant="outline" className={`text-[10px] flex-shrink-0 ${config.color}`}>
                            {config.emoji}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-1">{thread.subject}</p>
                        <p className="text-xs text-muted-foreground/60 truncate">{(thread.reply_body || "").slice(0, 80)}</p>
                        <p className="text-[10px] text-muted-foreground/40 mt-1">{formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}</p>
                      </button>
                    );
                  })
                )}
              </ScrollArea>
            </div>

            {/* Right: Thread Detail */}
            <div className="flex-1 border rounded-lg overflow-hidden">
              {selected ? (
                <div className="flex flex-col h-full">
                  <div className="p-4 border-b space-y-2">
                    <div className="flex items-center justify-between">
                      <h2 className="font-semibold truncate">{selected.subject}</h2>
                      <div className="flex items-center gap-2">
                        <Select
                          value={selected.classification || "question"}
                          onValueChange={(v) => updateClassification.mutate({ id: selected.id, classification: v })}
                        >
                          <SelectTrigger className="w-36 h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CLASSIFICATION_CONFIG).map(([key, config]) => (
                              <SelectItem key={key} value={key} className="text-xs">{config.emoji} {config.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">From: {selected.sender_email}</p>
                  </div>

                  <ScrollArea className="flex-1 p-4 space-y-4">
                    {selected.original_email_body && (
                      <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Your original email</p>
                        <p className="text-sm whitespace-pre-wrap">{selected.original_email_body}</p>
                      </div>
                    )}
                    <Separator className="my-4" />
                    <div className="p-3 rounded-lg border">
                      <p className="text-xs font-medium mb-1 flex items-center gap-1">
                        <Mail className="w-3 h-3" /> Lead's reply
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{selected.reply_body || "No reply content"}</p>
                    </div>
                  </ScrollArea>

                  <div className="p-4 border-t space-y-3">
                    <p className="text-xs font-medium">AI Draft Response</p>
                    <Textarea
                      value={draftReply}
                      onChange={(e) => setDraftReply(e.target.value)}
                      className="min-h-[100px] text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1" onClick={() => toast.success("Reply sent (demo)")}>
                        <Send className="w-3.5 h-3.5 mr-2" />Send Draft
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => dismissThread.mutate(selected.id)}>
                        <Archive className="w-3.5 h-3.5 mr-2" />Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">Select a thread to view</p>
                </div>
              )}
            </div>
          </div>
        )}
        )}
      </div>

      {gatedFeature && (
        <FeatureGateModal
          open={gateModalOpen}
          onOpenChange={setGateModalOpen}
          feature={gatedFeature}
          currentPlan={currentPlan}
        />
      )}
    </DashboardLayout>
  );
};

export default Inbox;
