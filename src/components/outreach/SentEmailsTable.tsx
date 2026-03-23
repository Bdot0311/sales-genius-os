import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatDistanceToNow } from "date-fns";
import { Mail, Eye, RefreshCw, Pencil, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { EmailDetailSheet } from "./EmailDetailSheet";
import { EditScheduledEmailDialog } from "./EditScheduledEmailDialog";
import { useToast } from "@/hooks/use-toast";

interface SentEmail {
  id: string;
  to_email: string;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  status: string;
  sent_at: string;
  scheduled_at: string | null;
  lead_id: string | null;
  gmail_message_id: string | null;
  leads?: { contact_name: string; company_name: string } | null;
}

type SortField = "recipient" | "subject" | "status" | "sent_at";
type SortDir = "asc" | "desc";

const DELETED_KEY = "salesos_deleted_email_ids";

const getDeletedIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

const persistDeletedIds = (ids: Set<string>) => {
  localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(ids)));
};

export const SentEmailsTable = () => {
  const { toast } = useToast();
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<SentEmail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editEmail, setEditEmail] = useState<SentEmail | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Sort state
  const [sortField, setSortField] = useState<SortField>("sent_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<"single" | "bulk" | null>(null);
  const [deleteSingleId, setDeleteSingleId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadSentEmails();

    const channel = supabase
      .channel("sent_emails_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "sent_emails" }, () => {
        loadSentEmails();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadSentEmails = async () => {
    try {
      const { data, error } = await supabase
        .from("sent_emails")
        .select(`
          id, to_email, subject, body_html, body_text, status, sent_at,
          scheduled_at, lead_id, gmail_message_id,
          leads ( contact_name, company_name )
        `)
        .order("sent_at", { ascending: false })
        .limit(200);

      if (error) throw error;
      const deleted = getDeletedIds();
      setEmails((data || []).filter((e) => !deleted.has(e.id)));
    } catch (error) {
      console.error("Error loading sent emails:", error);
    } finally {
      setLoading(false);
    }
  };

  // ── Sorting ──────────────────────────────────────────────────────────────
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const getRecipientLabel = (email: SentEmail) =>
    email.leads?.contact_name || email.to_email;

  const sortedEmails = [...emails].sort((a, b) => {
    let aVal = "";
    let bVal = "";

    if (sortField === "recipient") {
      aVal = getRecipientLabel(a).toLowerCase();
      bVal = getRecipientLabel(b).toLowerCase();
    } else if (sortField === "subject") {
      aVal = a.subject.toLowerCase();
      bVal = b.subject.toLowerCase();
    } else if (sortField === "status") {
      aVal = a.status;
      bVal = b.status;
    } else {
      aVal = a.sent_at;
      bVal = b.sent_at;
    }

    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === "asc" ? cmp : -cmp;
  });

  // ── Selection ─────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === sortedEmails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(sortedEmails.map((e) => e.id)));
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const confirmDeleteSingle = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteSingleId(id);
    setDeleteTarget("single");
  };

  const confirmDeleteBulk = () => {
    setDeleteTarget("bulk");
  };

  const executeDelete = async () => {
    const idsToDelete =
      deleteTarget === "single" && deleteSingleId
        ? [deleteSingleId]
        : Array.from(selectedIds);

    if (idsToDelete.length === 0) return;
    setIsDeleting(true);

    try {
      // Persist deletion in localStorage so it survives page refreshes
      const deleted = getDeletedIds();
      idsToDelete.forEach((id) => deleted.add(id));
      persistDeletedIds(deleted);

      setEmails((prev) => prev.filter((e) => !idsToDelete.includes(e.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        idsToDelete.forEach((id) => next.delete(id));
        return next;
      });

      toast({
        title: idsToDelete.length === 1 ? "Email deleted" : `${idsToDelete.length} emails deleted`,
        description: "Removed from your sent history.",
      });
    } catch (err: any) {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
      setDeleteSingleId(null);
    }
  };

  // ── Column header with sort indicator ────────────────────────────────────
  const SortableHead = ({ field, children }: { field: SortField; children: React.ReactNode }) => {
    const active = sortField === field;
    const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <TableHead
        className="cursor-pointer select-none hover:text-foreground transition-colors"
        onClick={() => handleSort(field)}
      >
        <span className="flex items-center gap-1">
          {children}
          <Icon className={`w-3.5 h-3.5 ${active ? "text-primary" : "text-muted-foreground/50"}`} />
        </span>
      </TableHead>
    );
  };

  // ── Status badge ──────────────────────────────────────────────────────────
  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      sent: { variant: "default", label: "Sent" },
      delivered: { variant: "secondary", label: "Delivered" },
      opened: { variant: "outline", label: "Opened" },
      bounced: { variant: "destructive", label: "Bounced" },
      failed: { variant: "destructive", label: "Failed" },
      scheduled: { variant: "secondary", label: "Scheduled" },
      cancelled: { variant: "destructive", label: "Cancelled" },
    };
    const info = variants[status] || { variant: "default", label: status };
    return <Badge variant={info.variant}>{info.label}</Badge>;
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Mail className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No emails sent yet</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Compose and send your first email to see it here
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <p className="text-sm text-muted-foreground">{emails.length} emails sent</p>
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={confirmDeleteBulk}
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selectedIds.size} selected
            </Button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={loadSentEmails}>
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
                  checked={selectedIds.size === sortedEmails.length && sortedEmails.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <SortableHead field="recipient">Recipient</SortableHead>
              <SortableHead field="subject">Subject</SortableHead>
              <SortableHead field="status">Status</SortableHead>
              <SortableHead field="sent_at">Sent</SortableHead>
              <TableHead className="w-[110px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEmails.map((email) => (
              <TableRow
                key={email.id}
                className={`cursor-pointer hover:bg-muted/50 ${selectedIds.has(email.id) ? "bg-muted/30" : ""}`}
                onClick={() => { setSelectedEmail(email); setSheetOpen(true); }}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(email.id)}
                    onCheckedChange={() => toggleSelect(email.id)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium truncate max-w-[180px]">
                      {email.leads?.contact_name || email.to_email}
                    </span>
                    {email.leads?.company_name && (
                      <span className="text-xs text-muted-foreground truncate max-w-[180px]">
                        {email.leads.company_name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="truncate max-w-[220px] block">{email.subject}</span>
                </TableCell>
                <TableCell>{getStatusBadge(email.status)}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatDistanceToNow(new Date(email.sent_at), { addSuffix: true })}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {email.status === "scheduled" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setEditEmail(email); setEditOpen(true); }}
                        title="Edit scheduled email"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setSelectedEmail(email); setSheetOpen(true); }}
                      title="View email"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => confirmDeleteSingle(email.id, e)}
                      title="Delete email"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) { setDeleteTarget(null); setDeleteSingleId(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget === "bulk"
                ? `Delete ${selectedIds.size} email${selectedIds.size !== 1 ? "s" : ""}?`
                : "Delete this email?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes the record from your sent history. It does not unsend the email — the recipient has already received it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EmailDetailSheet
        email={selectedEmail}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />

      <EditScheduledEmailDialog
        email={editEmail}
        open={editOpen}
        onOpenChange={setEditOpen}
        onSaved={loadSentEmails}
      />
    </>
  );
};
