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
import { Calendar as CalendarIcon, Plus, Clock } from "lucide-react";
import { format } from "date-fns";

const Calendar = () => {
  const { toast } = useToast();
  const [activities, setActivities] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
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
  }, []);

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

      toast({
        title: "Meeting scheduled",
        description: "Your meeting has been added to the calendar",
      });

      setIsDialogOpen(false);
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
        title: "Error creating meeting",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Calendar</h1>
            <p className="text-muted-foreground">Manage your meetings and schedule</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Schedule Meeting
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Schedule New Meeting</DialogTitle>
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
                <Button onClick={handleCreateActivity} className="w-full">
                  Schedule Meeting
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

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
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="w-4 h-4" />
                    {activity.due_date
                      ? format(new Date(activity.due_date), "PPp")
                      : "No date set"}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Calendar;
