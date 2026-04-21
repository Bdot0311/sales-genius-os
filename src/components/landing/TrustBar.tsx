import { ShieldCheck, MailCheck, Globe, Server, RotateCcw, XCircle } from "lucide-react";

const items = [
  { Icon: ShieldCheck, label: "256-bit TLS encrypted" },
  { Icon: MailCheck,   label: "SMTP-verified emails" },
  { Icon: Globe,       label: "GDPR-ready" },
  { Icon: Server,      label: "SOC 2 infrastructure" },
  { Icon: RotateCcw,   label: "30-day money-back" },
  { Icon: XCircle,     label: "Cancel anytime" },
];

export const TrustBar = () => (
  <section
    className="py-14"
    style={{
      background: "hsl(34 25% 93%)",
      borderTop: "1px solid hsl(28 10% 86%)",
      borderBottom: "1px solid hsl(28 10% 86%)",
    }}
    aria-label="Trust and security signals"
  >
    <div className="mx-auto max-w-[1120px] px-6 sm:px-8">
      <div className="mb-8 flex items-center justify-center gap-3">
        <span className="hairline w-10" />
        <span className="eyebrow-muted">Built with honesty & security</span>
        <span className="hairline w-10" />
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
        {items.map(({ Icon, label }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon
              className="h-3.5 w-3.5 shrink-0"
              style={{ color: "hsl(14 59% 52%)" }}
            />
            <span
              className="text-sm font-medium"
              style={{ color: "hsl(28 8% 28%)" }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  </section>
);
