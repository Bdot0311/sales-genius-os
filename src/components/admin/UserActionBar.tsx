import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Shield, Clock, Lock, Unlock, Trash2, KeyRound, Pencil, X } from "lucide-react";
import type { UserSubscription } from "@/pages/admin/Users";

type Plan = 'free' | 'starter' | 'growth' | 'pro' | 'agency';

interface UserActionBarProps {
  selected: UserSubscription[];
  allAdmin: boolean;
  onClear: () => void;
  onUpdatePlan: (plan: Plan) => void;
  onLock: () => void;
  onUnlock: () => void;
  onToggleAdmin: () => void;
  onSetTrial: () => void;
  onResetPassword: () => void;
  onDelete: () => void;
  onEdit: () => void;
}

/**
 * Action strip shown above the user table once one or more users are selected.
 * Single-user-only actions are disabled while multiple rows are selected.
 */
export const UserActionBar = ({
  selected, allAdmin, onClear, onUpdatePlan, onLock, onUnlock,
  onToggleAdmin, onSetTrial, onResetPassword, onDelete, onEdit,
}: UserActionBarProps) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const count = selected.length;
  const single = count === 1;
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <Badge className="bg-primary/20 text-primary border border-primary/30">
        {count} selected
      </Badge>

      <Select onValueChange={(v) => onUpdatePlan(v as Plan)}>
        <SelectTrigger className="h-8 w-36 text-xs bg-background/60 border-border/50">
          <SelectValue placeholder="Change plan" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="free">Free</SelectItem>
          <SelectItem value="starter">Starter</SelectItem>
          <SelectItem value="growth">Growth</SelectItem>
          <SelectItem value="pro">Pro</SelectItem>
          <SelectItem value="agency">Agency</SelectItem>
        </SelectContent>
      </Select>

      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onEdit} disabled={!single}>
        <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
      </Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onSetTrial} disabled={!single}>
        <Clock className="h-3.5 w-3.5 mr-1.5" /> Set trial
      </Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onToggleAdmin}>
        <Shield className="h-3.5 w-3.5 mr-1.5" /> {allAdmin ? 'Remove admin' : 'Make admin'}
      </Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onResetPassword}>
        <KeyRound className="h-3.5 w-3.5 mr-1.5" /> Reset password
      </Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onLock}>
        <Lock className="h-3.5 w-3.5 mr-1.5" /> Lock
      </Button>
      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onUnlock}>
        <Unlock className="h-3.5 w-3.5 mr-1.5" /> Unlock
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 text-xs text-destructive hover:text-destructive"
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
      </Button>

      <Button size="sm" variant="ghost" className="h-8 text-xs ml-auto" onClick={onClear}>
        <X className="h-3.5 w-3.5 mr-1.5" /> Clear
      </Button>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {count === 1 ? 'user' : `${count} users`}</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {selected.map((s) => s.email).join(', ')}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmDelete(false); onDelete(); }}
              className="bg-destructive hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
