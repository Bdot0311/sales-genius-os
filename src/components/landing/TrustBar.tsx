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
    className="py-10"
    style={{
      background: "hsl(261 75% 2%)",
      borderTop: "1px solid hsl(261 75% 50% / 0.18)",
      borderBottom: "1px solid hsl(261 75% 50% / 0.18)",
    }}
    aria-label="Trust and security signals"
  >
    <div className="container mx-auto px-6">
      <p
        className="text-center mb-6 text-[10px] uppercase tracking-[0.25em] font-medium"
        style={{ color: "hsl(261 75% 60% / 0.5)" }}
      >
        Built with security and honesty in mind
      </p>
      <div className="flex flex-wrap justify-center items-center gap-x-8 gap-y-3">
        {items.map(({ Icon, label }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon
              className="w-3.5 h-3.5 shrink-0"
              style={{ color: "hsl(261 75% 62%)" }}
            />
            <span
              className="text-xs font-medium"
              style={{ color: "hsl(0 0% 100% / 0.65)" }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  </section>
);
