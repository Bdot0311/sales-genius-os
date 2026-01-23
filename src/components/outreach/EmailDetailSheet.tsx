import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { Mail, Building2, User, Clock, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

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

interface EmailDetailSheetProps {
  email: SentEmail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const EmailDetailSheet = ({ email, open, onOpenChange }: EmailDetailSheetProps) => {
  if (!email) return null;

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Email Details
          </SheetTitle>
          <SheetDescription>
            Sent {format(new Date(email.sent_at), 'PPP p')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status and meta info */}
          <div className="flex items-center gap-4">
            {getStatusBadge(email.status)}
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              {format(new Date(email.sent_at), 'h:mm a')}
            </div>
          </div>

          <Separator />

          {/* Recipient info */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">To:</span>
              <span className="text-sm">{email.to_email}</span>
            </div>
            
            {email.leads && (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">
                  {email.leads.contact_name} at {email.leads.company_name}
                </span>
              </div>
            )}
          </div>

          <Separator />

          {/* Subject */}
          <div>
            <h4 className="text-sm font-medium mb-2">Subject</h4>
            <p className="text-sm bg-muted p-3 rounded-md">{email.subject}</p>
          </div>

          {/* Email body */}
          <div>
            <h4 className="text-sm font-medium mb-2">Message</h4>
            <div className="bg-muted p-4 rounded-md max-h-[400px] overflow-y-auto">
              {email.body_html ? (
                <div 
                  className="prose prose-sm dark:prose-invert max-w-none"
                  dangerouslySetInnerHTML={{ __html: email.body_html }}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{email.body_text}</p>
              )}
            </div>
          </div>

          {/* Gmail link */}
          {email.gmail_message_id && (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.open(`https://mail.google.com/mail/u/0/#sent/${email.gmail_message_id}`, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View in Gmail
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
