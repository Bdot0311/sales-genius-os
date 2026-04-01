import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

export const CreateUserDialog = ({ open, onOpenChange, onCreated }: CreateUserDialogProps) => {
  const [newUser, setNewUser] = useState({
    email: '', password: '', full_name: '',
    plan: 'pro' as 'free' | 'starter' | 'growth' | 'pro',
    is_admin: true
  });

  const createUser = async () => {
    try {
      const { error } = await supabase.functions.invoke('admin-create-user', { body: newUser });
      if (error) throw error;
      toast.success(newUser.is_admin ? 'Admin team member created' : 'User created');
      onOpenChange(false);
      setNewUser({ email: '', password: '', full_name: '', plan: 'pro', is_admin: true });
      onCreated();
    } catch (error) {
      toast.error('Failed to create user');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Team Member</DialogTitle>
          <DialogDescription>
            Create a new user account. Admin team members get full access without requiring payment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/50 bg-muted/30">
            <div className="space-y-0.5">
              <Label htmlFor="is_admin" className="text-base">Admin Access</Label>
              <p className="text-sm text-muted-foreground">Full platform access without paying</p>
            </div>
            <Switch id="is_admin" checked={newUser.is_admin} onCheckedChange={(c) => setNewUser({ ...newUser, is_admin: c })} />
          </div>
          <div><Label>Email</Label><Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} placeholder="teammate@company.com" /></div>
          <div><Label>Password</Label><Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} placeholder="Minimum 8 characters" /></div>
          <div><Label>Full Name</Label><Input value={newUser.full_name} onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })} placeholder="John Doe" /></div>
          <div>
            <Label>Plan</Label>
            <Select value={newUser.plan} onValueChange={(v) => setNewUser({ ...newUser, plan: v as any })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="growth">Growth</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={createUser}>{newUser.is_admin ? 'Add Admin' : 'Create User'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
