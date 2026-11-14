import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { FileText, Trash2, Edit, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EmailDraft {
  id: string;
  subject: string | null;
  body: string | null;
  tone: string | null;
  trigger_context: string | null;
  opener_word: string | null;
  lead_id: string | null;
  updated_at: string;
  leads?: { contact_name: string; company_name: string } | null;
}

interface EmailDraftsTableProps {
  onLoadDraft: (draft: EmailDraft) => void;
}

export const EmailDraftsTable = ({ onLoadDraft }: EmailDraftsTableProps) => {
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [draftToDelete, setDraftToDelete] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadDrafts();
  }, []);

  const loadDrafts = async () => {
    try {
      const { data, error } = await supabase
        .from('email_drafts')
        .select(`
          id,
          subject,
          body,
          tone,
          trigger_context,
          opener_word,
          lead_id,
          updated_at,
          leads (
            contact_name,
            company_name
          )
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      const nextDrafts = data || [];
      setDrafts(nextDrafts);
      setSelectedIds((current) => {
        const availableIds = new Set(nextDrafts.map((draft) => draft.id));
        return new Set([...current].filter((id) => availableIds.has(id)));
      });
    } catch (error) {
      console.error('Error loading drafts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDraft = async () => {
    const idsToDelete = draftToDelete ? [draftToDelete] : [...selectedIds];
    if (idsToDelete.length === 0) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('email_drafts')
        .delete()
        .in('id', idsToDelete);

      if (error) throw error;
      
      setDrafts((current) => current.filter((draft) => !idsToDelete.includes(draft.id)));
      setSelectedIds((current) => {
        const next = new Set(current);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });
      toast.success(idsToDelete.length === 1 ? 'Draft deleted' : `${idsToDelete.length} drafts deleted`);
    } catch (error) {
      console.error('Error deleting draft:', error);
      toast.error('Failed to delete draft');
    } finally {
      setIsDeleting(false);
      setDeleteDialogOpen(false);
      setDraftToDelete(null);
    }
  };

  const confirmDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraftToDelete(id);
    setDeleteDialogOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((current) =>
      current.size === drafts.length ? new Set() : new Set(drafts.map((draft) => draft.id)),
    );
  };

  const confirmBulkDelete = () => {
    setDraftToDelete(null);
    setDeleteDialogOpen(true);
  };

  const deleteCount = draftToDelete ? 1 : selectedIds.size;

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No drafts saved</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Your email drafts will appear here
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">{drafts.length} draft{drafts.length !== 1 ? 's' : ''}</p>
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={confirmBulkDelete} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.size} selected
            </Button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={loadDrafts}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  aria-label="Select all drafts"
                  checked={selectedIds.size === drafts.length && drafts.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Last Updated</TableHead>
              <TableHead className="w-[120px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drafts.map((draft) => (
              <TableRow
                key={draft.id}
                className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(draft.id) ? "bg-muted/30" : ""}`}
                onClick={() => onLoadDraft(draft)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    aria-label={`Select draft for ${draft.leads?.contact_name || 'no lead'}`}
                    checked={selectedIds.has(draft.id)}
                    onCheckedChange={() => toggleSelect(draft.id)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium truncate max-w-[200px]">
                      {draft.leads?.contact_name || 'No lead selected'}
                    </span>
                    {draft.leads?.company_name && (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {draft.leads.company_name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="truncate max-w-[250px] block text-muted-foreground">
                    {draft.subject || 'No subject'}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(new Date(draft.updated_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onLoadDraft(draft);
                      }}
                      aria-label={`Edit draft ${draft.subject || 'with no subject'}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={(e) => confirmDelete(draft.id, e)}
                      aria-label={`Delete draft ${draft.subject || 'with no subject'}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={(open) => {
        setDeleteDialogOpen(open);
        if (!open) setDraftToDelete(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteCount === 1 ? 'draft' : `${deleteCount} drafts`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. {deleteCount === 1 ? 'The draft' : 'These drafts'} will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDraft}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
