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
import { Calendar as CalendarIcon, Plus, Clock, ExternalLink, Edit, Trash2, Link2 } from "lucide-react";
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
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasGoogleCalendar, setHasGoogleCalendar] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<any>(null);
  const [loading, setLoading] = useState(true);
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

  const checkGoogleCalendarConnection = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-calendar-events');
      if (error) {
        console.error('Error fetching Google Calendar events:', error);
        setLoading(false);
        return;
      }
      if (data?.connected) {
        setHasGoogleCalendar(true);
        setGoogleEvents(data.events || []);
      } else {
        setHasGoogleCalendar(false);
        if (data?.needsReconnect) {
          toast({
            title: "Google Calendar Disconnected",
            description: "Please reconnect your Google account in Integrations.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      console.error('Error checking Google Calendar:', error);
    } finally {
      setLoading(false);
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
          await supabase.functions.invoke('sync-to-google-calendar', {
            body: { eventData: newActivity }
          });
          toast({ title: "Meeting scheduled", description: "Added to both calendars" });
        } catch {
          toast({ title: "Meeting scheduled", description: "Added locally. Google sync failed." });
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

  // Decide which meetings to show
  const displayMeetings = isFreeTier ? SAMPLE_MEETINGS : activities;
  const hasNoMeetings = !isFreeTier && !loading && activities.length === 0 && googleEvents.length === 0 && !hasGoogleCalendar;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Calendar</h1>
            <p className="text-muted-foreground text-sm sm:text-base">Manage your meetings and schedule</p>
          </div>
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
                      {(isFreeTier ? [] : leads).map((lead) => (
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

        {isFreeTier && <SampleDataBanner />}

        {/* Google Calendar events for connected paid users */}
        {!isFreeTier && hasGoogleCalendar && googleEvents.length > 0 && (
          <div>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              Your Upcoming Events
              <Badge variant="secondary">Google Calendar</Badge>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {googleEvents.map((event) => (
                <Card key={event.id} className="p-4 bg-gradient-to-br from-blue-500/5 to-purple-500/5 border-blue-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <CalendarIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{event.summary || "Untitled Event"}</h3>
                      {event.description && <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{event.description}</p>}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Clock className="w-4 h-4" />
                        {event.start?.dateTime ? format(new Date(event.start.dateTime), "PPp") : event.start?.date ? format(new Date(event.start.date), "PP") : "No date"}
                      </div>
                      {event.htmlLink && (
                        <a href={event.htmlLink} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          View in Google Calendar <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
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
