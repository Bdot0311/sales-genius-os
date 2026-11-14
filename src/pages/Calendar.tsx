import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import {
  EmptyState,
  Panel,
  PanelBody,
  PanelFooter,
  PanelHeader,
  SectionLabel,
} from "@/components/dashboard/Panel";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, ExternalLink, Edit, Trash2, Link2, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format, isToday, isTomorrow, isYesterday } from "date-fns";
import { useNavigate } from "react-router-dom";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { posthog } from "@/lib/posthog";


/** One row of the agenda, whichever calendar it came from. */
interface AgendaEntry {
  id: string;
  title: string;
  start: Date | null;
  end: Date | null;
  source: "outreign" | "google";
  /** Who the meeting is with, when we know. */
  who: string | null;
  where: string | null;
  /** A link out to the source calendar, for entries we do not own. */
  link: string | null;
  /** The underlying activity row, for the entries this app can edit. */
  activity: any | null;
}

/**
 * The heading above a day.
 *
 * "Today" and "Tomorrow" are what the reader is actually checking for, and a
 * date they have to convert in their head is not an answer.
 */
const dayLabel = (d: Date) => {
  if (isToday(d)) return `Today · ${format(d, "EEE d MMM")}`;
  if (isTomorrow(d)) return `Tomorrow · ${format(d, "EEE d MMM")}`;
  if (isYesterday(d)) return `Yesterday · ${format(d, "EEE d MMM")}`;
  return format(d, "EEEE d MMMM");
};

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

      posthog.capture('meeting_scheduled', {
        has_lead: Boolean(newActivity.lead_id),
        has_due_date: Boolean(newActivity.due_date),
        google_calendar_connected: hasGoogleCalendar,
      });

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

  /**
   * One agenda, both sources.
   *
   * This page listed Google's events in one grid of cards and OutReign's in
   * another, under separate headings, with the two never sorted against each
   * other. A meeting at 2pm and a meeting at 3pm therefore appeared in
   * different halves of the page, which is the one thing a calendar exists not
   * to do. Both go into a single list ordered by time; where an entry came
   * from is a word on the row.
   */
  const agenda = useMemo<AgendaEntry[]>(() => {
    const rows: AgendaEntry[] = [];

    for (const a of activities) {
      const start = a.due_date ? new Date(a.due_date) : null;
      rows.push({
        id: `activity:${a.id}`,
        title: a.subject || "(untitled)",
        start,
        end: null,
        source: "outreign",
        who: a.leads ? [a.leads.contact_name, a.leads.company_name].filter(Boolean).join(" · ") : null,
        where: null,
        link: null,
        activity: a,
      });
    }

    for (const ev of googleEvents as any[]) {
      const rawStart = ev.start?.dateTime || ev.start?.date || ev.start;
      const rawEnd = ev.end?.dateTime || ev.end?.date || ev.end;
      rows.push({
        id: `google:${ev.id || `${ev.summary}-${rawStart}`}`,
        title: ev.summary || "(no title)",
        start: rawStart ? new Date(rawStart) : null,
        end: rawEnd ? new Date(rawEnd) : null,
        source: "google",
        who: null,
        where: ev.location || null,
        link: ev.htmlLink || null,
        activity: null,
      });
    }

    return rows.sort((a, b) => {
      // Anything without a time sinks: an entry you cannot place is not part of
      // the run of the day.
      if (!a.start) return 1;
      if (!b.start) return -1;
      return a.start.getTime() - b.start.getTime();
    });
  }, [activities, googleEvents]);

  /**
   * Grouped by day, because a flat list of timestamps is a log.
   *
   * The heading answers the question the page is open to answer — is this
   * today — rather than restating the date the row already carries.
   */
  const days = useMemo(() => {
    const groups: { key: string; label: string; entries: AgendaEntry[] }[] = [];
    const undated: AgendaEntry[] = [];

    for (const entry of agenda) {
      if (!entry.start) {
        undated.push(entry);
        continue;
      }
      const key = format(entry.start, "yyyy-MM-dd");
      const existing = groups.find((g) => g.key === key);
      if (existing) existing.entries.push(entry);
      else groups.push({ key, label: dayLabel(entry.start), entries: [entry] });
    }

    if (undated.length) groups.push({ key: "undated", label: "No date set", entries: undated });
    return groups;
  }, [agenda]);

  const upcoming = agenda.filter((e) => e.start && e.start.getTime() >= Date.now()).length;
  const hasNoMeetings = !loading && agenda.length === 0 && !hasGoogleCalendar;

  const scheduleButton = (
    <Button size="sm" onClick={() => setIsDialogOpen(true)}>
      <Plus className="mr-1.5 h-3.5 w-3.5" />
      Schedule meeting
    </Button>
  );

  return (
    <DashboardLayout>
      <PageHeader
        title="Calendar"
        description="Every meeting you have booked, from OutReign and from Google, on one timeline."
        actions={
          <>
            {!isFreeTier && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleResync}
                disabled={resyncing}
                title="Refresh tokens and pull the latest events from Google"
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${resyncing ? "animate-spin" : ""}`} />
                {resyncing ? "Re-syncing…" : "Re-sync"}
              </Button>
            )}
            {scheduleButton}
          </>
        }
      />

      <div className="space-y-4 pt-4">
        {/* The connection state, sized to how much it matters.
            Connected, this was a green-bordered green-tinted slab saying
            everything is fine — the loudest surface on the page reporting the
            absence of news. It is now one line, and only grows a button when
            there is something to do about it. */}
        {!isFreeTier && calendarStatus !== "connected" && calendarStatus !== "loading" && (
          <Panel role="status" aria-live="polite">
            <PanelBody className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-2.5">
                {calendarStatus === "needs_reconnect" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                ) : calendarStatus === "error" ? (
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                ) : (
                  <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0">
                  <p className="text-[0.8125rem] font-medium text-foreground">
                    {calendarStatus === "needs_reconnect" && "Google Calendar needs reconnecting"}
                    {calendarStatus === "disconnected" && "Google Calendar is not connected"}
                    {calendarStatus === "error" && "Google Calendar is not syncing"}
                  </p>
                  <p className="mt-1 break-words text-[0.6875rem] leading-relaxed text-muted-foreground">
                    {calendarStatus === "disconnected"
                      ? "Connect it in Integrations to see your booked meetings here and push new ones back."
                      : calendarStatusMessage}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => checkGoogleCalendarConnection()}
                  disabled={refreshing}
                >
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                  Check again
                </Button>
                <Button size="sm" onClick={() => navigate("/integrations")}>
                  {calendarStatus === "needs_reconnect" ? "Reconnect" : "Connect Google"}
                </Button>
              </div>
            </PanelBody>
          </Panel>
        )}

        {hasNoMeetings ? (
          <EmptyState
            title="No meetings yet"
            body="Connect Google Calendar to see your booked meetings here, or schedule one by hand."
            action={
              <>
                {/* This carried a dashboard-prefixed path that is not a route,
                    so the button landed on the not-found page. */}
                <Button variant="outline" size="sm" onClick={() => navigate("/integrations")}>
                  Connect calendar
                </Button>
                {scheduleButton}
              </>
            }
          />
        ) : loading ? (
          <Panel>
            <PanelBody className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted/40" />
              ))}
            </PanelBody>
          </Panel>
        ) : agenda.length === 0 ? (
          <EmptyState
            title="Nothing on the calendar"
            body={
              hasGoogleCalendar
                ? `No upcoming events on ${googleEmail || "your calendar"}, and nothing booked in OutReign.`
                : "Nothing booked yet."
            }
            action={scheduleButton}
          />
        ) : (
          <Panel>
            <PanelHeader
              title="Agenda"
              meta={`${upcoming} upcoming`}
              actions={
                hasGoogleCalendar ? (
                  <a
                    href={
                      googleEmail
                        ? `https://calendar.google.com/calendar/u/0/r?authuser=${encodeURIComponent(googleEmail)}`
                        : "https://calendar.google.com"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Open in Google <ExternalLink className="h-3 w-3" />
                  </a>
                ) : undefined
              }
            />

            <div>
              {days.map((day) => (
                <div key={day.key}>
                  <div className="sticky top-0 z-[1] border-b border-border/30 bg-card/95 px-4 py-1.5 backdrop-blur-sm sm:px-5">
                    <SectionLabel>{day.label}</SectionLabel>
                  </div>
                  {day.entries.map((entry) => (
                    <div
                      key={entry.id}
                      className="group flex gap-3 border-b border-border/25 px-4 py-3 last:border-b-0 sm:gap-4 sm:px-5"
                    >
                      {/* The time as the row's index, in a fixed column, so a
                          day reads down the left edge. The icon tile that used
                          to sit here said "calendar" on a calendar page. */}
                      <div className="w-[4.25rem] shrink-0 pt-0.5">
                        <p className="text-[0.8125rem] font-medium tabular-nums text-foreground">
                          {entry.start ? format(entry.start, "h:mm a") : "—"}
                        </p>
                        {entry.end && entry.start ? (
                          <p className="mt-0.5 text-[0.625rem] tabular-nums text-muted-foreground/70">
                            to {format(entry.end, "h:mm a")}
                          </p>
                        ) : null}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <p className="min-w-0 break-words text-[0.8125rem] text-foreground">{entry.title}</p>
                          <span className="shrink-0 text-[0.625rem] uppercase tracking-[0.08em] text-muted-foreground/60">
                            {entry.source === "google" ? "Google" : "OutReign"}
                          </span>
                        </div>
                        {entry.who ? (
                          <p className="mt-1 truncate text-[0.6875rem] text-muted-foreground">{entry.who}</p>
                        ) : null}
                        {entry.where ? (
                          <p className="mt-1 truncate text-[0.6875rem] text-muted-foreground">{entry.where}</p>
                        ) : null}
                      </div>

                      {/* Row actions, quiet until the row is under the cursor.
                          Two outlined buttons on every card put twenty buttons
                          on a twenty-meeting page. They stay reachable on touch,
                          where there is no hover to reveal them. */}
                      <div className="flex shrink-0 items-start gap-1 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
                        {entry.link ? (
                          <a
                            href={entry.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                            title="Open in Google Calendar"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                        {entry.activity && !isFreeTier ? (
                          <>
                            <button
                              onClick={() => openEditDialog(entry.activity)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                              title="Edit meeting"
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openDeleteDialog(entry.activity)}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                              title="Delete meeting"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {!isFreeTier && (
              <PanelFooter>
                {calendarStatus === "loading" ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Checking Google Calendar
                  </span>
                ) : calendarStatus === "connected" ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                      Google Calendar connected{googleEmail ? ` · ${googleEmail}` : ""}
                    </span>
                    <span className="text-muted-foreground/60">
                      Meetings scheduled here sync to Google automatically.
                    </span>
                  </>
                ) : null}
              </PanelFooter>
            )}
          </Panel>
        )}

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingActivity(null);
              setNewActivity({ subject: "", type: "meeting", lead_id: "", due_date: "", description: "" });
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingActivity ? "Edit meeting" : "Schedule a meeting"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input
                  value={newActivity.subject}
                  onChange={(e) => setNewActivity({ ...newActivity, subject: e.target.value })}
                  placeholder="Intro call"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Lead</Label>
                <Select
                  value={newActivity.lead_id}
                  onValueChange={(value) => setNewActivity({ ...newActivity, lead_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a lead" />
                  </SelectTrigger>
                  <SelectContent>
                    {leads.map((lead) => (
                      <SelectItem key={lead.id} value={lead.id}>
                        {[lead.contact_name, lead.company_name].filter(Boolean).join(" — ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Date and time</Label>
                <Input
                  type="datetime-local"
                  value={newActivity.due_date}
                  onChange={(e) => setNewActivity({ ...newActivity, due_date: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input
                  value={newActivity.description}
                  onChange={(e) => setNewActivity({ ...newActivity, description: e.target.value })}
                  placeholder="Anything to remember going in"
                />
              </div>
              <Button onClick={editingActivity ? handleEditActivity : handleCreateActivity} className="w-full">
                {editingActivity ? "Update meeting" : "Schedule meeting"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this meeting?</AlertDialogTitle>
              <AlertDialogDescription>
                {activityToDelete?.subject ? `"${activityToDelete.subject}" ` : "This meeting "}
                will be removed from OutReign. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteActivity} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
};

export default Calendar;
