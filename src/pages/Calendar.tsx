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
import { Calendar as CalendarIcon, Plus, Clock, ExternalLink, Edit, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

const Calendar = () => {
  const { toast } = useToast();
  const [activities, setActivities] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasGoogleCalendar, setHasGoogleCalendar] = useState(false);
  const [editingActivity, setEditingActivity] = useState<any>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [activityToDelete, setActivityToDelete] = useState<any>(null);
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('integrations')
        .select('config, is_active')
        .eq('user_id', user.id)
        .eq('integration_id', 'google')
        .eq('is_active', true)
        .maybeSingle();

      if (data?.config) {
        setHasGoogleCalendar(true);
        loadGoogleCalendarEvents(data.config);
      }
    } catch (error) {
      console.error('Error checking Google Calendar:', error);
    }
  };

  const loadGoogleCalendarEvents = async (config: any) => {
    try {
      let accessToken = config.accessToken;

      // Check if token is expired and refresh if needed
      if (config.expiresAt && Date.now() >= config.expiresAt && config.refreshToken) {
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: config.refreshToken,
            grant_type: 'refresh_token',
          }),
        });

        if (tokenResponse.ok) {
          const tokens = await tokenResponse.json();
          accessToken = tokens.access_token;
          
          // Update tokens in database
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('integrations')
              .update({
                config: {
                  ...config,
                  accessToken: tokens.access_token,
                  expiresAt: Date.now() + tokens.expires_in * 1000,
                },
              })
              .eq('user_id', user.id)
              .eq('integration_id', 'google');
          }
        }
      }

      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime&maxResults=10`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Failed to fetch calendar');
      }

      const data = await response.json();
      setGoogleEvents(data.items || []);
    } catch (error: any) {
      console.error('Google Calendar error:', error);
      toast({
        title: "Google Calendar Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadActivities = async () => {
    const { data } = await supabase
      .from("activities")
      .select("*, leads(contact_name, company_name)")
      .eq("type", "meeting")
      .order("due_date", { ascending: true });
    if (data) setActivities(data);
  };

  const loadLeads = async () => {
    const { data } = await supabase.from("leads").select("*");
    if (data) setLeads(data);
  };

  const handleCreateActivity = async () => {
    try {
      // Check authentication first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Validate inputs
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

      // Sync to Google Calendar if connected
      if (hasGoogleCalendar && newActivity.due_date) {
        try {
          await supabase.functions.invoke('sync-to-google-calendar', {
            body: { eventData: newActivity }
          });
          
          toast({
            title: "Meeting scheduled",
            description: "Your meeting has been added to both calendars",
          });
        } catch (syncError) {
          console.error('Google Calendar sync error:', syncError);
          toast({
            title: "Meeting scheduled",
            description: "Added to SalesOS. Google Calendar sync failed.",
          });
        }
      } else {
        toast({
          title: "Meeting scheduled",
          description: "Your meeting has been added to the calendar",
        });
      }

      setIsDialogOpen(false);
      setNewActivity({
        subject: "",
        type: "meeting",
        lead_id: "",
        due_date: "",
        description: "",
      });
      loadActivities();
      if (hasGoogleCalendar) {
        checkGoogleCalendarConnection();
      }
    } catch (error: any) {
      toast({
        title: "Error creating meeting",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEditActivity = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      if (!newActivity.subject.trim() || newActivity.subject.length > 200) {
        throw new Error("Meeting title is required and must be less than 200 characters");
      }
      if (newActivity.description && newActivity.description.length > 1000) {
        throw new Error("Description must be less than 1000 characters");
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

      toast({
        title: "Meeting updated",
        description: "Your meeting has been updated successfully",
      });

      setIsDialogOpen(false);
      setEditingActivity(null);
      setNewActivity({
        subject: "",
        type: "meeting",
        lead_id: "",
        due_date: "",
        description: "",
      });
      loadActivities();
    } catch (error: any) {
      toast({
        title: "Error updating meeting",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteActivity = async () => {
    try {
      const { error } = await supabase
        .from("activities")
        .delete()
        .eq("id", activityToDelete.id);

      if (error) throw error;

      toast({
        title: "Meeting deleted",
        description: "Your meeting has been removed from the calendar",
      });

      setDeleteConfirmOpen(false);
      setActivityToDelete(null);
      loadActivities();
    } catch (error: any) {
      toast({
        title: "Error deleting meeting",
        description: error.message,
        variant: "destructive",
      });
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Calendar</h1>
            <p className="text-muted-foreground">Manage your meetings and schedule</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setEditingActivity(null);
              setNewActivity({
                subject: "",
                type: "meeting",
                lead_id: "",
                due_date: "",
                description: "",
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button>
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
                  <Input
                    value={newActivity.subject}
                    onChange={(e) =>
                      setNewActivity({ ...newActivity, subject: e.target.value })
                    }
                    placeholder="Enter meeting title"
                  />
                </div>
                <div>
                  <Label>Lead</Label>
                  <Select
                    value={newActivity.lead_id}
                    onValueChange={(value) =>
                      setNewActivity({ ...newActivity, lead_id: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a lead" />
                    </SelectTrigger>
                    <SelectContent>
                      {leads.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.contact_name} - {lead.company_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Date & Time</Label>
                  <Input
                    type="datetime-local"
                    value={newActivity.due_date}
                    onChange={(e) =>
                      setNewActivity({ ...newActivity, due_date: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input
                    value={newActivity.description}
                    onChange={(e) =>
                      setNewActivity({ ...newActivity, description: e.target.value })
                    }
                    placeholder="Meeting notes"
                  />
                </div>
                <Button onClick={editingActivity ? handleEditActivity : handleCreateActivity} className="w-full">
                  {editingActivity ? "Update Meeting" : "Schedule Meeting"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>


        {hasGoogleCalendar && googleEvents.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              Google Calendar Events
              <Badge variant="secondary">Connected</Badge>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {googleEvents.map((event) => (
                <Card key={event.id} className="p-4 bg-gradient-to-br from-blue-500/5 to-purple-500/5 border-blue-200">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <CalendarIcon className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{event.summary || 'Untitled Event'}</h3>
                      {event.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {event.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                        <Clock className="w-4 h-4" />
                        {event.start?.dateTime 
                          ? format(new Date(event.start.dateTime), "PPp")
                          : event.start?.date 
                          ? format(new Date(event.start.date), "PP")
                          : "No date"}
                      </div>
                      {event.htmlLink && (
                        <a 
                          href={event.htmlLink} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
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

        <h2 className="text-xl font-semibold mb-4">SalesOS Meetings</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activities.map((activity) => (
            <Card key={activity.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <CalendarIcon className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">{activity.subject}</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {activity.leads?.contact_name} - {activity.leads?.company_name}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                    <Clock className="w-4 h-4" />
                    {activity.due_date
                      ? format(new Date(activity.due_date), "PPp")
                      : "No date set"}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openEditDialog(activity)}
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => openDeleteDialog(activity)}
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Meeting</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete this meeting? This action cannot be undone.
              </AlertDialogDescription>
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
