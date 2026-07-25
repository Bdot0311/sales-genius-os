import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Target, Zap, Layers, MessageSquare } from "lucide-react";

const BANNED = [
  "hope this finds you well", "just checking in", "just reaching out", "touching base",
  "circling back", "bumping this", "quick question (in body)", "I noticed", "I came across",
  "leverage", "optimize", "streamline", "synergy", "cutting-edge", "industry-leading",
  "best-in-class", "revolutionary", "next-gen", "game-changing", "innovative solution",
];

const APPROVED_CTAS = [
  "worth a look?",
  "open to a quick look?",
  "should I send the 90-sec breakdown?",
  "worth comparing to your current process?",
  "should I send [teammate] the walkthrough?",
];

const STRUCTURES = [
  {
    name: "Problem-First",
    steps: [
      "S1 · Notice specific problem or situation",
      "S2 · Quantify pain or limitation",
      "S3 · Solution + named proof (company + metric + timeframe)",
      "S4 · Soft CTA question",
    ],
  },
  {
    name: "Question-Led",
    steps: [
      "S1 · Personalized observation",
      "S2 · Direct question about pain point",
      "S3 · Brief solution + metric",
      "S4 · Curiosity-driven ask",
    ],
  },
  {
    name: "Ultra-Short",
    steps: [
      "S1 · Their situation",
      "S2 · Problem → Solution → Result",
      "S3 · Yes/no question",
    ],
  },
];

const SIGNALS = [
  { layer: "Layer 1 · Fundamentals", tags: ["ICP fit", "revenue band", "geo", "vertical"] },
  {
    layer: "Layer 2 · Decision-maker readiness",
    tags: ["long CEO tenure", "new hire in seat", "prior exit", "recent recap"],
  },
  {
    layer: "Layer 3 · Timing triggers (highest value)",
    tags: [
      "new VP/Director",
      "tech migration",
      "SEO traffic drop",
      "increased ad spend",
      "leadership departure",
      "geographic expansion",
      "closed-lost re-engagement",
    ],
  },
];

const SELF_CHECK = [
  "Would you actually send this to a colleague?",
  "Can you read it in under 10 seconds?",
  "Is value clear without jargon?",
  "Does it sound like a real person?",
  "One clear, low-friction next step?",
  "Named company + metric + timeframe as proof?",
  "Real numbers, not vague claims?",
];

const CopyPlaybook = () => {
  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-16">
        <PageHeader
          title="Cold Email Playbook"
          description="The house rules OutReign's AI follows for every draft. Use them yourself when you edit."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> Hard limits</CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-2 text-muted-foreground">
              <p><span className="text-foreground font-medium">50–75 words</span> · 90 word ceiling.</p>
              <p><span className="text-foreground font-medium">3–4 sentences</span> · 8th-grade reading level.</p>
              <p>Exactly <span className="text-foreground font-medium">one CTA</span>, in question form. Never ask for a meeting on touch 1.</p>
              <p>Named proof only: <span className="text-foreground font-medium">company + metric + timeframe</span>. No invented numbers.</p>
              <p>No em-dashes, emojis, links, bullets, or markdown in cold sends.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2"><MessageSquare className="w-4 h-4 text-primary" /> Approved CTAs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {APPROVED_CTAS.map((c) => (
                <div key={c} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span>{c}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Layers className="w-4 h-4 text-primary" /> Three structures — pick one per email</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            {STRUCTURES.map((s) => (
              <div key={s.name} className="rounded-md border border-border/60 p-3 space-y-2">
                <div className="text-sm font-semibold">{s.name}</div>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {s.steps.map((step) => <li key={step}>{step}</li>)}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-primary" /> Signal framework · targeting</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {SIGNALS.map((row) => (
              <div key={row.layer} className="space-y-1.5">
                <div className="text-xs font-medium text-foreground">{row.layer}</div>
                <div className="flex flex-wrap gap-1.5">
                  {row.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                </div>
              </div>
            ))}
            <p className="text-xs text-muted-foreground pt-2">Best prospects have 3+ overlapping signals. Sort by signal score in the leads table to work them first.</p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Banned language</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {BANNED.map((w) => (
                  <Badge key={w} variant="outline" className="text-[10px] border-destructive/30 text-destructive">
                    <XCircle className="w-3 h-3 mr-1" />
                    {w}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Self-check before sending</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {SELF_CHECK.map((q) => (
                <div key={q} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{q}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">4-touch cadence</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4 text-sm">
            {[
              { d: "Day 0", t: "Signal-based opener" },
              { d: "Day 3–5", t: "Market / industry context" },
              { d: "Day 7–10", t: "Timing + easy-out" },
              { d: "Day 14", t: "Polite breakup" },
            ].map((x) => (
              <div key={x.d} className="rounded-md border border-border/60 p-3">
                <div className="text-xs text-muted-foreground">{x.d}</div>
                <div className="font-medium">{x.t}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CopyPlaybook;
