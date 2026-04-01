import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { UserSubscription } from "@/pages/admin/Users";

interface TrialDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserSubscription | null;
  onSet: () => void;
}

export const TrialDialog = ({ open, onOpenChange, user, onSet }: TrialDialogProps) => {
  const [trialDays, setTrialDays] = useState(30);

  const setTrial = async () => {
    if (!user) return;
    try {
      const { error } = await supabase.rpc('admin_set_trial', {
        _user_id: user.user_id,
        _trial_days: trialDays,
      });
      if (error) throw error;
      toast.success(`Trial set for ${trialDays} days`);
      onOpenChange(false);
      onSet();
    } catch (error) {
      toast.error('Failed to set trial');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set Trial Period</DialogTitle>
          <DialogDescription>Set trial for {user?.email}</DialogDescription>
        </DialogHeader>
        <div>
          <Label>Trial Days</Label>
          <Input type="number" value={trialDays} onChange={(e) => setTrialDays(parseInt(e.target.value) || 0)} min="0" max="365" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={setTrial}>Set Trial</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
