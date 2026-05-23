/**
 * Brand-accurate SVG glyphs for integration partners.
 *
 * Rendered monochrome by default (respects the landing page's muted palette)
 * and transition to their signature brand colors on hover / focus. Each glyph
 * is pure SVG so it scales crisply and ships zero external assets.
 */

interface LogoProps {
  className?: string;
}

const GmailLogo = ({ className = "" }: LogoProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
  </svg>
);

const HubSpotLogo = ({ className = "" }: LogoProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M18.164 7.93V5.084a2.198 2.198 0 0 0 1.27-1.982v-.065A2.2 2.2 0 0 0 17.238.837h-.066a2.2 2.2 0 0 0-2.199 2.2v.065a2.2 2.2 0 0 0 1.27 1.982v2.846a6.24 6.24 0 0 0-2.968 1.307L5.514 3.196a2.47 2.47 0 1 0-1.159 1.554l7.609 5.924a6.255 6.255 0 0 0 .093 7.059l-2.315 2.317a2.026 2.026 0 0 0-.582-.093 2.033 2.033 0 1 0 2.032 2.033c0-.199-.034-.393-.093-.58l2.29-2.292a6.26 6.26 0 1 0 4.775-11.188zm-1.038 9.338a3.211 3.211 0 1 1 0-6.423 3.211 3.211 0 0 1 0 6.423z" />
  </svg>
);

const SalesforceLogo = ({ className = "" }: LogoProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M9.998 5.688a4.19 4.19 0 0 1 3.037-1.309c1.57 0 2.94.875 3.67 2.173a5.078 5.078 0 0 1 2.08-.445 5.164 5.164 0 0 1 5.18 5.15 5.164 5.164 0 0 1-5.18 5.15c-.23 0-.455-.015-.676-.046a3.76 3.76 0 0 1-3.28 1.923 3.74 3.74 0 0 1-1.643-.376A4.28 4.28 0 0 1 9.21 20.53a4.28 4.28 0 0 1-4.007-2.783 3.975 3.975 0 0 1-.819.085 4.064 4.064 0 0 1-4.07-4.057 4.08 4.08 0 0 1 2.015-3.505A4.68 4.68 0 0 1 6.264 3.5c1.55 0 2.92.751 3.734 1.917z" />
  </svg>
);

const SlackLogo = ({ className = "" }: LogoProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.527 2.527 0 0 1 2.521 2.521 2.527 2.527 0 0 1-2.521 2.521H2.522A2.527 2.527 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.268 0a2.527 2.527 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
  </svg>
);

const CalendlyLogo = ({ className = "" }: LogoProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M19.655 14.262c.281.122.557.261.822.418l.033.019a9.51 9.51 0 0 1 1.673 1.234c1.095.997 1.648 2.055 1.648 3.147 0 .656-.132 1.274-.393 1.85a4.66 4.66 0 0 1-1.086 1.513c-.932.885-2.174 1.373-3.497 1.373H4.945a4.95 4.95 0 0 1-3.497-1.45A4.95 4.95 0 0 1 0 18.867V5.12a4.95 4.95 0 0 1 1.448-3.5A4.95 4.95 0 0 1 4.945.175h13.91c1.323 0 2.565.488 3.498 1.373.452.428.82.935 1.086 1.513.26.576.392 1.194.392 1.85 0 1.092-.553 2.15-1.648 3.147a9.512 9.512 0 0 1-1.672 1.234l-.034.019a7.95 7.95 0 0 1-.822.418.7.7 0 0 0-.413.662.7.7 0 0 0 .413.663 7.97 7.97 0 0 0 .822.418l.034.019a9.513 9.513 0 0 1 1.672 1.234c1.095.997 1.648 2.055 1.648 3.147 0 .656-.132 1.274-.392 1.85zm-7.666-1.6a5.162 5.162 0 1 1 0-10.324 5.162 5.162 0 0 1 0 10.324zm0-8.26a3.1 3.1 0 1 0 0 6.196 3.1 3.1 0 0 0 0-6.196z" />
  </svg>
);

const ZapierLogo = ({ className = "" }: LogoProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M15 12a5.2 5.2 0 0 1-.35 1.88 5.2 5.2 0 0 1-1.88.35H11.24a5.2 5.2 0 0 1-1.88-.35A5.2 5.2 0 0 1 9 12a5.2 5.2 0 0 1 .35-1.88A5.23 5.23 0 0 1 11.23 9.77h1.53a5.2 5.2 0 0 1 1.88.35A5.2 5.2 0 0 1 15 12zm8.72-1.28H17l4.76-4.76a11.88 11.88 0 0 0-2.72-2.72L14.28 7H13.28V.28a11.9 11.9 0 0 0-1.28-.07c-.43 0-.86.03-1.28.07V7h-1L5 2.24A11.88 11.88 0 0 0 3.5 3.5a11.88 11.88 0 0 0-1.26 1.5L7 9.76v1H.28a11.95 11.95 0 0 0-.07 1.28c0 .43.02.86.07 1.28H7v1l-4.76 4.76a11.88 11.88 0 0 0 2.72 2.72l4.76-4.76h1V24a11.88 11.88 0 0 0 2.56 0v-6.72h1l4.76 4.76a11.91 11.91 0 0 0 1.5-1.26 11.91 11.91 0 0 0 1.26-1.5l-4.76-4.76v-1h6.72A11.96 11.96 0 0 0 24 12a11.95 11.95 0 0 0-.07-1.28h-.21z" />
  </svg>
);

export interface Integration {
  name: string;
  Logo: React.ComponentType<LogoProps>;
  /** Official brand color applied on hover */
  color: string;
}

export const INTEGRATIONS: Integration[] = [
  { name: "Gmail", Logo: GmailLogo, color: "#EA4335" },
  { name: "HubSpot", Logo: HubSpotLogo, color: "#FF7A59" },
  { name: "Salesforce", Logo: SalesforceLogo, color: "#00A1E0" },
  { name: "Slack", Logo: SlackLogo, color: "#E01E5A" },
  { name: "Calendly", Logo: CalendlyLogo, color: "#006BFF" },
  { name: "Zapier", Logo: ZapierLogo, color: "#FF4F00" },
];

interface IntegrationStripProps {
  id?: string;
  label?: string;
  className?: string;
}

export const IntegrationStrip = ({
  id,
  label = "Connects with the tools you already use",
  className = "",
}: IntegrationStripProps) => {
  return (
    <div
      id={id}
      className={`flex flex-col items-center gap-5 ${className}`}
      aria-labelledby={id ? `${id}-label` : undefined}
    >
      <p
        id={id ? `${id}-label` : undefined}
        className="text-[10px] uppercase tracking-[0.22em] font-medium"
        style={{ color: "hsl(0 0% 100% / 0.25)" }}
      >
        {label}
      </p>
      <ul
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-5 sm:gap-x-12"
        role="list"
      >
        {INTEGRATIONS.map(({ name, Logo, color }) => (
          <li key={name}>
            <div
              className="group inline-flex items-center gap-2.5 transition-colors duration-300"
              style={
                {
                  "--brand-color": color,
                  color: "hsl(0 0% 100% / 0.7)",
                } as React.CSSProperties
              }
              onMouseEnter={(e) => {
                e.currentTarget.style.color = color;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "hsl(0 0% 100% / 0.7)";
              }}
            >
              <Logo className="h-5 w-5 sm:h-6 sm:w-6 transition-transform duration-300 group-hover:scale-110" />
              <span className="text-sm font-medium tracking-wide">{name}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};
