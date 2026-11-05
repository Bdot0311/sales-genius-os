import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Loader2, CalendarCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";
import { HONEYPOT_FIELD } from "../../../supabase/functions/_shared/bot-signals";
import { loadCalendly } from "@/lib/calendly-embed";

/*
 * Apply, then book, without leaving the page.
 *
 * The two steps are one act and the order matters. Booking first is what
 * produces a calendar invite from a stranger with no indication of what the
 * meeting is for. Asking first means the call is already qualified when it
 * lands, and the answers are attached to it.
 *
 * The join is the request row id, handed to Calendly as utmContent.
 * `calendly-webhook` reads `tracking.utm_content`, finds the row and marks it
 * booked, so no new backend work was needed for that half.
 *
 * The questions are not arbitrary. They are the day-zero baseline the
 * delivery runbook says cannot be reconstructed later, plus the deal-cycle
 * check that decides whether a prospect can produce proof inside a 90-day
 * term at all. Asked here, every applicant arrives already qualified.
 */

export const CALENDLY_URL = "https://calendly.com/bdotindustries/30min";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: z.string().trim().email("Enter a valid work email").max(200),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  website: z.string().trim().max(300).optional().or(z.literal("")),
  sells: z.string().trim().min(3, "Tell us what you sell and who you sell it to").max(1000),
});

type FormValues = z.infer<typeof schema>;

const initial: FormValues = { name: "", email: "", company: "", website: "", sells: "" };

const OUTBOUND_TODAY = [
  { value: "none", label: "Nothing yet" },
  { value: "in_house", label: "In-house, manually" },
  { value: "agency", label: "An agency runs it" },
  { value: "tool", label: "A tool we run ourselves" },
];
const DEAL_SIZE = [
  { value: "under_5k", label: "Under $5k" },
  { value: "5k_25k", label: "$5k to $25k" },
  { value: "25k_100k", label: "$25k to $100k" },
  { value: "over_100k", label: "Over $100k" },
];
const SALES_CYCLE = [
  { value: "under_30d", label: "Under 30 days" },
  { value: "30_90d", label: "30 to 90 days" },
  { value: "90_180d", label: "90 to 180 days" },
  { value: "over_180d", label: "Over 180 days" },
];
const RUNG = [
  { value: "managed", label: "Managed — you run it" },
  { value: "launch", label: "Launch — build it and hand over" },
  { value: "unsure", label: "Not sure yet" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DfyApplicationDialog({ open, onOpenChange }: Props) {
  const [values, setValues] = useState<FormValues>(initial);
  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [outboundToday, setOutboundToday] = useState("");
  const [dealSize, setDealSize] = useState("");
  const [salesCycle, setSalesCycle] = useState("");
  const [rung, setRung] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [calendlyFailed, setCalendlyFailed] = useState(false);
  // Filled by scripts, never by people — see _shared/bot-signals.ts.
  const [honeypot, setHoneypot] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  // Cloudflare's widget could not load. Fail open, matching the server, rather
  // than dead-ending an application with nothing to tick.
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false);
  const openedAt = useRef<number>(Date.now());
  const calendlyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) openedAt.current = Date.now();
  }, [open]);

  // Mount the booking widget once the application has an id to attach it to.
  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    void (async () => {
      const calendly = await loadCalendly();
      const parent = calendlyRef.current;
      if (cancelled) return;
      if (!calendly || !parent) {
        setCalendlyFailed(true);
        return;
      }
      try {
        calendly.initInlineWidget({
          url: CALENDLY_URL,
          parentElement: parent,
          prefill: { name: values.name, email: values.email },
          // Read back by calendly-webhook as tracking.utm_content.
          utm: { utmContent: requestId, utmSource: "dfy_application" },
        });
      } catch {
        setCalendlyFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, values.name, values.email]);

  const update = (k: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [k]: e.target.value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const handleClose = (next: boolean) => {
    if (submitting) return;
    onOpenChange(next);
    if (!next) {
      setTimeout(() => {
        setValues(initial);
        setErrors({});
        setOutboundToday("");
        setDealSize("");
        setSalesCycle("");
        setRung("");
        setRequestId(null);
        setCalendlyFailed(false);
        setHoneypot("");
        setCaptchaToken("");
      }, 200);
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
    if (!captchaToken && !captchaUnavailable) {
      toast.error("Complete the verification below first.");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("submit-dfy-application", {
        body: {
          ...parsed.data,
          outboundToday,
          dealSize,
          salesCycle,
          rung,
          turnstileToken: captchaToken,
          [HONEYPOT_FIELD]: honeypot,
          elapsedMs: Date.now() - openedAt.current,
        },
      });
      // A rejection comes back as a 4xx with the reason in the body, which the
      // client surfaces as an error with the body still attached. Reading the
      // body first is what shows the reason instead of "non-2xx status code".
      const reason = (data as { error?: string } | null)?.error;
      const id = (data as { id?: string } | null)?.id;
      if (error || reason || !id) {
        toast.error(reason || error?.message || "Something went wrong. Try again in a moment.");
        return;
      }
      setRequestId(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong. Try again in a moment.");
    } finally {
      setSubmitting(false);
    }
  };

  const picker = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options: { value: string; label: string }[],
    placeholder: string,
  ) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {requestId ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-primary" />
                Pick a time
              </DialogTitle>
              <DialogDescription>
                Your answers are saved, so we will have read them before the call.
              </DialogDescription>
            </DialogHeader>
            {calendlyFailed ? (
              <div className="rounded-lg border border-border p-4 text-sm">
                <p className="text-muted-foreground">
                  The scheduler could not load here. Your application is saved either way, and
                  this link opens it directly.
                </p>
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex text-sm font-medium text-primary underline"
                >
                  Open the scheduler
                </a>
              </div>
            ) : (
              <div ref={calendlyRef} className="min-h-[640px] w-full" aria-label="Booking calendar" />
            )}
          </>
        ) : (
          <form onSubmit={onSubmit}>
            <DialogHeader>
              <DialogTitle>Apply for a seat</DialogTitle>
              <DialogDescription>
                Five managed seats at a time. A few questions so the call is useful, then
                pick a time without leaving this page.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="dfy-name">Name</Label>
                  <Input id="dfy-name" value={values.name} onChange={update("name")} autoComplete="name" />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dfy-email">Work email</Label>
                  <Input id="dfy-email" type="email" value={values.email} onChange={update("email")} autoComplete="email" />
                  {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="dfy-company">Company</Label>
                  <Input id="dfy-company" value={values.company} onChange={update("company")} autoComplete="organization" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="dfy-website">Website</Label>
                  <Input id="dfy-website" value={values.website} onChange={update("website")} placeholder="acme.com" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="dfy-sells">What do you sell, and who to?</Label>
                <Textarea id="dfy-sells" rows={3} value={values.sells} onChange={update("sells")} />
                {errors.sells && <p className="text-xs text-destructive">{errors.sells}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {picker("Outbound today", outboundToday, setOutboundToday, OUTBOUND_TODAY, "Pick one")}
                {picker("Typical deal size", dealSize, setDealSize, DEAL_SIZE, "Pick one")}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {picker("Typical sales cycle", salesCycle, setSalesCycle, SALES_CYCLE, "Pick one")}
                {picker("Which fits best", rung, setRung, RUNG, "Pick one")}
              </div>

              {/* Hidden from people, reachable by form fillers. */}
              <div className="absolute left-[-9999px]" aria-hidden="true">
                <label htmlFor={HONEYPOT_FIELD}>Fax</label>
                <input
                  id={HONEYPOT_FIELD}
                  name={HONEYPOT_FIELD}
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </div>

              <TurnstileWidget
                onVerify={setCaptchaToken}
                onExpire={() => setCaptchaToken("")}
                onUnavailable={() => setCaptchaUnavailable(true)}
              />

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Continue to booking
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
