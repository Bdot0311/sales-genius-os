import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import { Mail, ExternalLink, Eye, RefreshCw } from "lucide-react";
import { EmailDetailSheet } from "./EmailDetailSheet";

interface SentEmail {
  id: string;
  to_email: string;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  status: string;
  sent_at: string;
  lead_id: string | null;
  gmail_message_id: string | null;
  leads?: { contact_name: string; company_name: string } | null;
}

export const SentEmailsTable = () => {
  const [emails, setEmails] = useState<SentEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState<SentEmail | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    loadSentEmails();
    
    // Subscribe to realtime updates
    const channel = supabase
      .channel('sent_emails_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'sent_emails',
        },
        (payload) => {
          console.log('Sent emails change:', payload);
          loadSentEmails();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadSentEmails = async () => {
    try {
      const { data, error } = await supabase
        .from('sent_emails')
        .select(`
          id,
          to_email,
          subject,
          body_html,
          body_text,
          status,
          sent_at,
          lead_id,
          gmail_message_id,
          leads (
            contact_name,
            company_name
          )
        `)
        .order('sent_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setEmails(data || []);
    } catch (error) {
      console.error('Error loading sent emails:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      sent: { variant: "default", label: "Sent" },
      delivered: { variant: "secondary", label: "Delivered" },
      opened: { variant: "outline", label: "Opened" },
      bounced: { variant: "destructive", label: "Bounced" },
      failed: { variant: "destructive", label: "Failed" },
    };
    
    const statusInfo = variants[status] || { variant: "default", label: status };
    return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
  };

  const handleViewEmail = (email: SentEmail) => {
    setSelectedEmail(email);
    setSheetOpen(true);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
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
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{emails.length} emails sent</p>
        <Button variant="ghost" size="sm" onClick={loadSentEmails}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>
      
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recipient</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {emails.map((email) => (
              <TableRow key={email.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleViewEmail(email)}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium truncate max-w-[200px]">
                      {email.leads?.contact_name || email.to_email}
                    </span>
                    {email.leads?.company_name && (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">
                        {email.leads.company_name}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className="truncate max-w-[250px] block">{email.subject}</span>
                </TableCell>
                <TableCell>{getStatusBadge(email.status)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDistanceToNow(new Date(email.sent_at), { addSuffix: true })}
                </TableCell>
                <TableCell>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewEmail(email);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <EmailDetailSheet 
        email={selectedEmail}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
};
