import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Bot, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { HONEYPOT_FIELD } from "../../supabase/functions/_shared/bot-signals";
import type { CampaignSetupFormRequest } from "@/lib/campaign-setup";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  website: z.string().trim().max(300).optional().or(z.literal("")),
  audience: z.string().trim().min(3, "Tell us who your ideal customer is").max(1000),
  goal: z.string().trim().min(3, "Tell us your goal for outbound").max(1000),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which CTA opened this, and the click row to attach the answers to. */
  request?: CampaignSetupFormRequest | null;
  /** The signed-in account. The address is shown, never edited — the server
   *  reads it from the session, so a typed one would be ignored anyway. */
  account?: { email: string | null; name: string | null };
}

const initial: FormValues = { name: "", company: "", website: "", audience: "", goal: "" };

export function CampaignSetupDialog({ open, onOpenChange, request, account }: Props) {
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  // Filled by scripts, never by people — see _shared/bot-signals.ts.
  const [honeypot, setHoneypot] = useState("");
  const openedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!open) return;
    openedAt.current = Date.now();
    if (account?.name) setValues((v) => (v.name ? v : { ...v, name: account.name! }));
  }, [open, account?.name]);

  const update = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const handleClose = (next: boolean) => {
    if (submitting) return;
    onOpenChange(next);
    if (!next) {
      // Reset after close animation
      setTimeout(() => { setValues(initial); setErrors({}); setSent(false); setHoneypot(""); }, 200);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof FormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const k = issue.path[0] as keyof FormValues;
        if (!fieldErrors[k]) fieldErrors[k] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-campaign-setup", {
        body: {
          ...parsed.data,
          source: request?.source ?? "campaign_setup_form",
          requestId: request?.requestId ?? null,
          [HONEYPOT_FIELD]: honeypot,
          elapsedMs: Date.now() - openedAt.current,
        },
      });
      // The function answers a rejection with a 4xx and a reason in the body,
      // which the client surfaces as an error with the body still attached.
      // Reading the body first is what shows "Please sign in" instead of
      // "Edge Function returned a non-2xx status code".
      const reason = (data as { error?: string } | null)?.error;
      if (error || reason) {
        toast.error(reason || error?.message || "Something went wrong. Try again in a moment.");
        return;
      }
      setSent(true);
      toast.success("Request sent — check your inbox for confirmation.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                We've got it — check your inbox
              </DialogTitle>
              <DialogDescription>
                A real human on our team will review what you shared and reply within one business day. We just sent a confirmation to <span className="font-medium text-foreground">{account?.email}</span>.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => handleClose(false)} className="w-full sm:w-auto">Close</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-primary" />
                We'll set up your first campaigns
              </DialogTitle>
              <DialogDescription>
                Tell us a bit about your business and we'll build your first ICP, lead list, and opening sequence — free. A real human will reply within one business day.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cs-name">Your name</Label>
                <Input id="cs-name" value={values.name} onChange={update("name")} placeholder="Jane Doe" maxLength={120} autoComplete="name" />
                {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-email">Email</Label>
                <Input id="cs-email" type="email" value={account?.email ?? ""} readOnly disabled aria-describedby="cs-email-note" />
                <p id="cs-email-note" className="text-xs text-muted-foreground">We'll reply to your account address.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-company">Company <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="cs-company" value={values.company} onChange={update("company")} placeholder="Acme Inc." maxLength={200} autoComplete="organization" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cs-website">Website <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="cs-website" value={values.website} onChange={update("website")} placeholder="acme.com" maxLength={300} autoComplete="url" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cs-audience">Who is your ideal customer?</Label>
              <Textarea id="cs-audience" value={values.audience} onChange={update("audience")} placeholder="e.g. Heads of RevOps at 20–200 person B2B SaaS in North America" maxLength={1000} rows={3} />
              {errors.audience && <p className="text-xs text-destructive">{errors.audience}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cs-goal">What's your goal for outbound?</Label>
              <Textarea id="cs-goal" value={values.goal} onChange={update("goal")} placeholder="e.g. Book 5 discovery calls this month, test a new offer, hit $10k MRR" maxLength={1000} rows={3} />
              {errors.goal && <p className="text-xs text-destructive">{errors.goal}</p>}
            </div>

            {/* Not a real field. Hidden from people and from screen readers;
                anything in it came from a script filling every input it found. */}
            <div aria-hidden="true" className="absolute h-0 w-0 overflow-hidden opacity-0">
              <label htmlFor={HONEYPOT_FIELD}>Fax</label>
              <input
                id={HONEYPOT_FIELD}
                name={HONEYPOT_FIELD}
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => handleClose(false)} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting} className="min-w-[140px]">
                {submitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Sending…</>) : "Send request"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
