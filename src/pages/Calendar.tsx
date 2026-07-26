import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Calendar as CalendarIcon, Plus, Clock, ExternalLink, Edit, Trash2, Link2, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { usePlanFeatures } from "@/hooks/use-plan-features";



const Calendar = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { currentPlan } = usePlanFeatures();
  const isFreeTier = currentPlan === "free";

  const [activities, setActivities] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasGoogleCalendar, setHasGoogleCalendar] = useState(false);
  const [calendarStatus, setCalendarStatus] = useState<
    "loading" | "connected" | "disconnected" | "needs_reconnect" | "error"
  >("loading");
  const [calendarStatusMessage, setCalendarStatusMessage] = useState<string>("");
  const [refreshing, setRefreshing] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resyncing, setResyncing] = useState(false);
  const [newActivity, setNewActivity] = useState({
    subject: "",
    type: "meeting",
    lead_id: "",
    due_date: "",
    description: "",
  });

  useEffect(() => {
    loadActivities();
    loadLeads();
    checkGoogleCalendarConnection();
  }, []);

  const checkGoogleCalendarConnection = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-calendar-events');
      if (error) {
        console.error('Error fetching Google Calendar events:', error);
        setHasGoogleCalendar(false);
        setCalendarStatus("error");
        setCalendarStatusMessage(
          "We couldn't reach Google Calendar. Check your connection and try again."
        );
        return;
      }
      if (data?.connected) {
        setHasGoogleCalendar(true);
        setGoogleEvents(data.events || []);
        setGoogleEmail(data.email || null);
        if (data.error) {
          setCalendarStatus("error");
          setCalendarStatusMessage(
            `Connected, but Google returned an error while fetching events: ${data.error}`
          );
        } else {
          setCalendarStatus("connected");
          setCalendarStatusMessage("");
        }
      } else {
        setHasGoogleCalendar(false);
        setGoogleEvents([]);
        if (data?.needsReconnect) {
          setCalendarStatus("needs_reconnect");
          setCalendarStatusMessage(
            "Your Google Calendar access has expired or was revoked. Reconnect your Google account to resume syncing."
          );
        } else if (data?.error) {
          setCalendarStatus("error");
          setCalendarStatusMessage(`Google Calendar error: ${data.error}`);
        } else {
          setCalendarStatus("disconnected");
          setCalendarStatusMessage("");
        }
      }
    } catch (error: any) {
      console.error('Error checking Google Calendar:', error);
      setHasGoogleCalendar(false);
      setCalendarStatus("error");
      setCalendarStatusMessage(
        error?.message || "Unexpected error while checking Google Calendar."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleResync = async () => {
    setResyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-calendar-events', {
        body: { forceRefresh: true },
      });
      if (error) throw error;

      if (data?.connected) {
        setHasGoogleCalendar(true);
        setGoogleEvents(data.events || []);
        await loadActivities();
        toast({
          title: "Calendar re-synced",
          description: `Refreshed ${data.events?.length ?? 0} upcoming event${data.events?.length === 1 ? '' : 's'} from Google.`,
        });
      } else if (data?.needsReconnect) {
        setHasGoogleCalendar(false);
        toast({
          title: "Google access expired",
          description: "Reconnect your Google account in Integrations to resume syncing.",
          variant: "destructive",
        });
      } else {
        setHasGoogleCalendar(false);
        toast({
          title: "Google Calendar not connected",
          description: "Connect Google in Integrations to sync events.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Re-sync failed",
        description: err?.message || "Could not refresh Google Calendar. See Sync history for details.",
        variant: "destructive",
      });
    } finally {
      setResyncing(false);
    }
  };

  const loadActivities = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("activities")
      .select("*, leads(contact_name, company_name)")
      .eq("user_id", user.id)
      .eq("type", "meeting")
      .order("due_date", { ascending: true });
    if (data) setActivities(data);
  };

  const loadLeads = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("leads").select("*").eq("user_id", user.id);
    if (data) setLeads(data);
  };

  const handleCreateActivity = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (!newActivity.subject.trim() || newActivity.subject.length > 200) {
        throw new Error("Meeting title is required and must be less than 200 characters");
      }
      if (newActivity.description && newActivity.description.length > 1000) {
        throw new Error("Description must be less than 1000 characters");
      }

      const { error } = await supabase.from("activities").insert({
        ...newActivity,
        user_id: user.id,
      });
      if (error) throw error;

      if (hasGoogleCalendar && newActivity.due_date) {
        try {
          const { data: syncData, error: syncError } = await supabase.functions.invoke('sync-to-google-calendar', {
            body: { eventData: newActivity }
          });
          if (syncError || syncData?.error) {
            const msg = syncData?.error || syncError?.message || "Unknown error";
            const needsReconnect = /invalid_grant|not connected|reconnect/i.test(msg);
            toast({
              title: "Saved locally — Google sync failed",
              description: needsReconnect
                ? "Your Google Calendar access expired. Reconnect Google in Integrations to resume syncing."
                : `Google Calendar rejected the event: ${msg}`,
              variant: "destructive",
            });
            if (needsReconnect) {
              setCalendarStatus("needs_reconnect");
              setCalendarStatusMessage(
                "Your Google Calendar access has expired or was revoked. Reconnect your Google account to resume syncing."
              );
              setHasGoogleCalendar(false);
            }
          } else {
            toast({ title: "Meeting scheduled", description: "Added to OutReign and Google Calendar" });
          }
        } catch (err: any) {
          toast({
            title: "Saved locally — Google sync failed",
            description: err?.message || "We couldn't reach Google Calendar. Your meeting is saved in OutReign.",
            variant: "destructive",
          });
        }
      } else {
        toast({ title: "Meeting scheduled", description: "Your meeting has been added" });
      }

      setIsDialogOpen(false);
      setNewActivity({ subject: "", type: "meeting", lead_id: "", due_date: "", description: "" });
      loadActivities();
      if (hasGoogleCalendar) checkGoogleCalendarConnection();
    } catch (error: any) {
      toast({ title: "Error creating meeting", description: error.message, variant: "destructive" });
    }
  };

  const handleEditActivity = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      if (!newActivity.subject.trim() || newActivity.subject.length > 200) {
        throw new Error("Meeting title is required and must be less than 200 characters");
      }

      const { error } = await supabase
        .from("activities")
        .update({
          subject: newActivity.subject,
          lead_id: newActivity.lead_id,
          due_date: newActivity.due_date,
          description: newActivity.description,
        })
        .eq("id", editingActivity.id);
      if (error) throw error;

      toast({ title: "Meeting updated", description: "Your meeting has been updated" });
      setIsDialogOpen(false);
      setEditingActivity(null);
      setNewActivity({ subject: "", type: "meeting", lead_id: "", due_date: "", description: "" });
      loadActivities();
    } catch (error: any) {
      toast({ title: "Error updating meeting", description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteActivity = async () => {
    try {
      const { error } = await supabase.from("activities").delete().eq("id", activityToDelete.id);
      if (error) throw error;
      toast({ title: "Meeting deleted", description: "Your meeting has been removed" });
      setDeleteConfirmOpen(false);
      setActivityToDelete(null);
      loadActivities();
    } catch (error: any) {
      toast({ title: "Error deleting meeting", description: error.message, variant: "destructive" });
    }
  };

  const openEditDialog = (activity: any) => {
    setEditingActivity(activity);
    setNewActivity({
      subject: activity.subject,
      type: activity.type,
      lead_id: activity.lead_id || "",
      due_date: activity.due_date || "",
      description: activity.description || "",
    });
    setIsDialogOpen(true);
  };

  const openDeleteDialog = (activity: any) => {
    setActivityToDelete(activity);
    setDeleteConfirmOpen(true);
  };

  const displayMeetings = activities;
  const hasNoMeetings = !loading && activities.length === 0 && googleEvents.length === 0 && !hasGoogleCalendar;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Calendar</h1>
            <p className="text-muted-foreground text-sm sm:text-base">Manage your meetings and schedule</p>
          </div>
          <div className="flex items-center gap-2">
            {!isFreeTier && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleResync}
                disabled={resyncing}
                title="Refresh tokens and pull the latest events from Google"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${resyncing ? "animate-spin" : ""}`} />
                {resyncing ? "Re-syncing..." : "Re-sync calendar"}
              </Button>
            )}
            <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingActivity(null);
              setNewActivity({ subject: "", type: "meeting", lead_id: "", due_date: "", description: "" });
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-2" />
                Schedule Meeting
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingActivity ? "Edit Meeting" : "Schedule New Meeting"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Meeting Title</Label>
                  <Input value={newActivity.subject} onChange={(e) => setNewActivity({ ...newActivity, subject: e.target.value })} placeholder="Enter meeting title" />
                </div>
                <div>
                  <Label>Lead</Label>
                  <Select value={newActivity.lead_id} onValueChange={(value) => setNewActivity({ ...newActivity, lead_id: value })}>
                    <SelectTrigger><SelectValue placeholder="Select a lead" /></SelectTrigger>
                    <SelectContent>
                      {leads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>{lead.contact_name} - {lead.company_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date & Time</Label>
                  <Input type="datetime-local" value={newActivity.due_date} onChange={(e) => setNewActivity({ ...newActivity, due_date: e.target.value })} />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={newActivity.description} onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })} placeholder="Meeting notes" />
                </div>
                <Button onClick={editingActivity ? handleEditActivity : handleCreateActivity} className="w-full">
                  {editingActivity ? "Update Meeting" : "Schedule Meeting"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        </div>

        {/* Google Calendar connection status */}
        {!isFreeTier && (
          <Card
            className={`p-4 border ${
              calendarStatus === "connected"
                ? "border-emerald-500/30 bg-emerald-500/5"
                : calendarStatus === "needs_reconnect"
                ? "border-amber-500/40 bg-amber-500/5"
                : calendarStatus === "error"
                ? "border-destructive/40 bg-destructive/5"
                : "border-border bg-muted/30"
            }`}
            role="status"
            aria-live="polite"
          >
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
                <div className="shrink-0">
                  {calendarStatus === "loading" ? (
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  ) : calendarStatus === "connected" ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  ) : calendarStatus === "needs_reconnect" ? (
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  ) : calendarStatus === "error" ? (
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                  ) : (
                    <Link2 className="w-5 h-5 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">
                    {calendarStatus === "loading" && "Checking Google Calendar..."}
                    {calendarStatus === "connected" && "Google Calendar connected"}
                    {calendarStatus === "needs_reconnect" && "Reconnect Google Calendar"}
                    {calendarStatus === "disconnected" && "Google Calendar not connected"}
                    {calendarStatus === "error" && "Google Calendar sync issue"}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">
                    {calendarStatus === "connected" &&
                      (calendarStatusMessage ||
                        "New meetings you schedule here will sync to Google automatically.")}
                    {calendarStatus === "needs_reconnect" && calendarStatusMessage}
                    {calendarStatus === "disconnected" &&
                      "Connect Google in Integrations to sync events both ways."}
                    {calendarStatus === "error" && calendarStatusMessage}
                    {calendarStatus === "loading" && "Verifying access to your Google account."}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkGoogleCalendarConnection()}
                  disabled={refreshing || calendarStatus === "loading"}
                >
                  <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                {(calendarStatus === "needs_reconnect" ||
                  calendarStatus === "disconnected" ||
                  calendarStatus === "error") && (
                  <Button size="sm" onClick={() => navigate("/integrations")}>
                    {calendarStatus === "needs_reconnect" ? "Reconnect Google" : "Connect Google"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        )}


        {/* Google Calendar events for connected paid users */}
        {!isFreeTier && hasGoogleCalendar && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                Your Google Calendar
                <Badge variant="secondary">Live</Badge>
              </h2>
              <a
                href={googleEmail ? `https://calendar.google.com/calendar/u/0/r?authuser=${encodeURIComponent(googleEmail)}` : "https://calendar.google.com"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Open in Google <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            {googleEvents.length === 0 ? (
              <Card className="p-6 text-center text-sm text-muted-foreground">
                No upcoming events on {googleEmail || "your calendar"}.
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {googleEvents.map((ev: any) => {
                  const start = ev.start?.dateTime || ev.start?.date || ev.start;
                  const end = ev.end?.dateTime || ev.end?.date || ev.end;
                  const startDate = start ? new Date(start) : null;
                  const endDate = end ? new Date(end) : null;
                  return (
                    <Card key={ev.id || `${ev.summary}-${start}`} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-md bg-primary/10 flex-shrink-0">
                          <CalendarIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{ev.summary || "(No title)"}</div>
                          {startDate && (
                            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {format(startDate, "MMM d, h:mm a")}
                              {endDate && ` – ${format(endDate, "h:mm a")}`}
                            </div>
                          )}
                          {ev.location && (
                            <div className="text-xs text-muted-foreground mt-1 truncate">{ev.location}</div>
                          )}
                          {ev.htmlLink && (
                            <a
                              href={ev.htmlLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-2"
                            >
                              Open <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}



        {/* Empty state — no calendar connected and no meetings */}
        {hasNoMeetings && (
          <Card className="p-8 flex flex-col items-center text-center gap-4">
            <div className="p-4 rounded-full bg-muted">
              <Link2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">No meetings yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Connect your Google Calendar in Integrations to see your booked meetings here, or schedule one manually.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate("/integrations")}>
                Connect Calendar
              </Button>
              <Button onClick={() => setIsDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Schedule Meeting
              </Button>
            </div>
          </Card>
        )}

        {/* Booked Meetings section */}
        {displayMeetings.length > 0 && (
          <>
            <h2 className="text-xl font-semibold mb-4">Your Booked Meetings</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayMeetings.map((activity: any) => (
                <Card key={activity.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <CalendarIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{activity.subject}</h3>
                      {activity.leads && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {activity.leads.contact_name} – {activity.leads.company_name}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                        <Clock className="w-4 h-4" />
                        {activity.due_date ? format(new Date(activity.due_date), "PPp") : "No date set"}
                      </div>
                      {!isFreeTier && (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditDialog(activity)}>
                            <Edit className="w-3 h-3 mr-1" /> Edit
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openDeleteDialog(activity)}>
                            <Trash2 className="w-3 h-3 mr-1" /> Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
              <AlertDialogDescription>Are you sure you want to delete this meeting? This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteActivity}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Calendar;