import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  email: string;
};

export function ChangePasswordCard({ email }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const handleUpdatePassword = async () => {
    if (!email) {
      toast.error("Missing account email. Please refresh and try again.");
      return;
    }

    if (!currentPassword) {
      toast.error("Please enter your current password");
      return;
    }

    if (!newPassword) {
      toast.error("Please enter a new password");
      return;
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }

    setSaving(true);
    try {
      // Re-auth to avoid "requires recent login" failures.
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (reauthError) throw reauthError;

      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (updateError) throw updateError;

      toast.success("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e: any) {
      console.error("Password update error:", e);
      toast.error(e?.message || "Failed to update password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-4 bg-muted/30 rounded-lg border border-border/50">
      <h4 className="font-medium text-sm">Change Password</h4>

      <div className="space-y-2">
        <Label htmlFor="current_password">Current Password</Label>
        <Input
          id="current_password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Enter current password"
          autoComplete="current-password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new_password">New Password</Label>
        <Input
          id="new_password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="Enter new password"
          minLength={8}
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">Minimum 8 characters required</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm_password">Confirm Password</Label>
        <Input
          id="confirm_password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
          minLength={8}
          autoComplete="new-password"
        />
      </div>

      <Button
        onClick={handleUpdatePassword}
        disabled={saving || !currentPassword || !newPassword || !confirmPassword}
        variant="outline"
        className="gap-2"
      >
        {saving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Updating...
          </>
        ) : (
          "Update Password"
        )}
      </Button>
    </div>
  );
}
