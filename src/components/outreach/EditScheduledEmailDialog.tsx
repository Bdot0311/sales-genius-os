import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Loader2, Clock, Save, Trash2, CalendarIcon } from "lucide-react";

interface ScheduledEmail {
  id: string;
  to_email: string;
  subject: string;
  body_html: string | null;
  body_text: string | null;
  scheduled_at: string | null;
  lead_id: string | null;
}

interface EditScheduledEmailDialogProps {
  email: ScheduledEmail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export const EditScheduledEmailDialog = ({ email, open, onOpenChange, onSaved }: EditScheduledEmailDialogProps) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [isSaving, setIsSaving] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize form when email changes
  if (email && open && !initialized) {
    setSubject(email.subject || "");
    setBodyText(email.body_text || "");
    if (email.scheduled_at) {
      const d = new Date(email.scheduled_at);
      setScheduleDate(d);
      setScheduleTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    }
    setInitialized(true);
  }

  const handleOpenChange = (v: boolean) => {
    if (!v) setInitialized(false);
    onOpenChange(v);
  };

  const handleSave = async () => {
    if (!email) return;
    setIsSaving(true);
    try {
      let scheduledAt: string | undefined;
      if (scheduleDate) {
        const [hours, minutes] = scheduleTime.split(":").map(Number);
        const d = new Date(scheduleDate);
        d.setHours(hours, minutes, 0, 0);
        if (d <= new Date()) {
          toast({ title: "Invalid time", description: "Please select a future date and time", variant: "destructive" });
          setIsSaving(false);
          return;
        }
        scheduledAt = d.toISOString();
      }

      // Format body as HTML
      const isHtml = bodyText.trim().startsWith('<');
      const htmlBody = isHtml ? bodyText : `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}p{margin:0 0 16px}</style></head><body>
${bodyText.split('\n').map((line: string) => line.trim() ? `<p>${line}</p>` : '').join('\n')}
</body></html>`;

      const { error } = await supabase
        .from("sent_emails")
        .update({
          subject,
          body_text: bodyText,
          body_html: htmlBody,
          ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
        })
        .eq("id", email.id)
        .eq("status", "scheduled");

      if (error) throw error;

      toast({ title: "Email updated", description: "Your scheduled email has been updated" });
      handleOpenChange(false);
      onSaved();
    } catch (error: any) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!email) return;
    setIsCancelling(true);
    try {
      const { error } = await supabase
        .from("sent_emails")
        .update({ status: "cancelled" })
        .eq("id", email.id)
        .eq("status", "scheduled");

      if (error) throw error;

      toast({ title: "Email cancelled", description: "The scheduled email has been cancelled" });
      handleOpenChange(false);
      onSaved();
    } catch (error: any) {
      toast({ title: "Error cancelling", description: error.message, variant: "destructive" });
    } finally {
      setIsCancelling(false);
    }
  };

  if (!email) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Edit Scheduled Email
          </DialogTitle>
          <DialogDescription>
            To: {email.to_email}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>

          <div>
            <Label>Body</Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              className="min-h-[200px]"
            />
          </div>

          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Label className="text-xs">Scheduled Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !scheduleDate && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {scheduleDate ? format(scheduleDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={scheduleDate}
                    onSelect={setScheduleDate}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">Time</Label>
              <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={isSaving || isCancelling} className="flex-1">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save Changes
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isSaving || isCancelling}>
              {isCancelling ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Cancel Email
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
