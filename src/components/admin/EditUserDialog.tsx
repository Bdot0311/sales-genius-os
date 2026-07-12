import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { UserSubscription } from "@/pages/admin/Users";

interface EditUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserSubscription | null;
  onSaved: () => void;
}

export const EditUserDialog = ({ open, onOpenChange, user, onSaved }: EditUserDialogProps) => {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || "");
      setEmail(user.email || "");
    }
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = { user_id: user.user_id };
      if (fullName.trim() !== (user.full_name || "")) payload.full_name = fullName.trim();
      if (email.trim().toLowerCase() !== (user.email || "").toLowerCase()) {
        payload.email = email.trim();
      }
      if (Object.keys(payload).length === 1) {
        toast.info("No changes");
        onOpenChange(false);
        return;
      }
      const { data, error } = await supabase.functions.invoke("admin-update-user", { body: payload });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("User updated");
      onOpenChange(false);
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update this user's name and email address.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="user@company.com" />
            <p className="text-xs text-muted-foreground mt-1">Changing email updates the login identity immediately.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
