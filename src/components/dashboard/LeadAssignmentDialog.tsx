import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface LeadAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedLeads: string[];
}

export const LeadAssignmentDialog = ({ open, onOpenChange, selectedLeads }: LeadAssignmentDialogProps) => {
  const [selectedMember, setSelectedMember] = useState("");
  const queryClient = useQueryClient();

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ["team-members"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("team_owner_id", user.id)
        .eq("status", "active");

      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create activity records for each lead
      const activities = selectedLeads.map(leadId => ({
        user_id: user.id,
        lead_id: leadId,
        type: "assignment",
        subject: "Lead assigned to team member",
        description: `Assigned to team member: ${selectedMember}`,
      }));

      const { error: activitiesError } = await supabase
        .from("activities")
        .insert(activities);

      if (activitiesError) throw activitiesError;

      // Send notification via edge function
      const { error: notifyError } = await supabase.functions.invoke("send-email", {
        body: {
          to: teamMembers?.find(m => m.member_user_id === selectedMember)?.member_email,
          subject: `You've been assigned ${selectedLeads.length} new lead(s)`,
          html: `<p>You have been assigned ${selectedLeads.length} new lead(s) in SalesOS. Please check your dashboard to review them.</p>`,
        },
      });

      if (notifyError) console.error("Notification error:", notifyError);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-activities"] });
      toast.success(`Assigned ${selectedLeads.length} lead(s) successfully`);
      onOpenChange(false);
      setSelectedMember("");
    },
    onError: (error) => {
      toast.error("Failed to assign leads");
      console.error("Assignment error:", error);
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Leads to Team Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Team Member</label>
            <Select value={selectedMember} onValueChange={setSelectedMember}>
              <SelectTrigger>
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {isLoading ? (
                  <div className="flex items-center justify-center p-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : teamMembers && teamMembers.length > 0 ? (
                  teamMembers
                    .filter((member) => member.member_user_id)
                    .map((member) => (
                      <SelectItem key={member.id} value={member.member_user_id!}>
                        {member.member_email}
                      </SelectItem>
                    ))
                ) : (
                  <div className="p-2 text-sm text-muted-foreground">
                    No team members available. Add team members in Settings.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Assigning {selectedLeads.length} lead(s)
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => assignMutation.mutate()}
              disabled={!selectedMember || assignMutation.isPending}
            >
              {assignMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Assign Leads
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
