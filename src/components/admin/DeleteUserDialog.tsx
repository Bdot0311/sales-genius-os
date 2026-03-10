import { supabase } from "@/integrations/supabase/client";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import type { UserSubscription } from "@/pages/admin/Users";

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserSubscription | null;
  onDeleted: () => void;
}

export const DeleteUserDialog = ({ open, onOpenChange, user, onDeleted }: DeleteUserDialogProps) => {
  const deleteUser = async () => {
    if (!user) return;
    try {
      const { error } = await supabase.rpc('admin_delete_user', { _user_id: user.user_id });
      if (error) throw error;
      toast.success('User deleted');
      onOpenChange(false);
      onDeleted();
    } catch (error) {
      toast.error('Failed to delete user');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete User</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete <strong>{user?.email}</strong>. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={deleteUser} className="bg-destructive hover:bg-destructive/90">Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
