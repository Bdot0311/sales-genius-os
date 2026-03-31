import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Demo } from "@/components/Demo";
import { SEOHead } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Users, Mail, BarChart3, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const SceneLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-5">
    {children}
  </div>
);

const DemoPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="SalesOS Demo - Cinematic Product Walkthrough"
        description="Watch SalesOS move from plain-English search to qualified leads, outreach, and pipeline motion in a cinematic product walkthrough."
        keywords="SalesOS demo, B2B lead discovery demo, outbound sales workflow demo, sales prospecting demo"
      />

      <div className="min-h-screen bg-background text-foreground overflow-hidden">
        <Navbar />
        <main>
          <section className="relative min-h-screen flex items-center overflow-hidden pt-20">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-24 left-1/2 -translate-x-1/2 w-[1200px] h-[700px] rounded-full blur-3xl bg-primary/12" />
              <div className="absolute top-40 right-[8%] w-[420px] h-[420px] rounded-full blur-3xl bg-accent/10" />
              <div className="absolute bottom-0 left-[6%] w-[520px] h-[520px] rounded-full blur-3xl bg-primary/10" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.04),transparent_45%)]" />
            </div>

            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-6xl mx-auto text-center">
                <SceneLabel>
                  <Sparkles className="w-3.5 h-3.5" />
                  Product story
                </SceneLabel>

                <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[0.95] mb-6">
                  Tell SalesOS who you want.
                  <span className="block bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent">
                    Watch the workflow move.
                  </span>
                </h1>

                <p className="text-lg md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed mb-10">
                  No pitch deck. No fake proof. Just the product motion that turns a rough target idea into qualified leads, relevant outreach, and pipeline momentum.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
                  <Button size="lg" className="group h-14 px-8 text-base" onClick={() => navigate('/pricing')}>
                    View plans
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button variant="outline" size="lg" className="h-14 px-8 text-base" onClick={() => document.getElementById('demo-core')?.scrollIntoView({ behavior: 'smooth' })}>
                    Start the walkthrough
                  </Button>
                </div>

                <div className="max-w-6xl mx-auto">
                  <div className="rounded-[32px] border border-primary/20 bg-gradient-to-b from-card/80 to-background/80 backdrop-blur-2xl p-3 sm:p-4 shadow-[0_0_100px_hsl(261_75%_65%/0.12)]">
                    <div className="rounded-[26px] border border-border/30 bg-background/90 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                      <Demo />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative py-24 md:py-32 overflow-hidden">
            <div className="container mx-auto px-6">
              <div className="max-w-6xl mx-auto grid lg:grid-cols-[0.9fr_1.1fr] gap-8 items-center">
                <div>
                  <SceneLabel>
                    <Search className="w-3.5 h-3.5" />
                    Scene 01
                  </SceneLabel>
                  <h2 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight mb-5">
                    Start with a sentence.
                    <span className="block text-primary">Not a spreadsheet.</span>
                  </h2>
                  <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
                    The magic is not “AI” as a buzzword. It is the speed of moving from “who should we target?” to “these are the people worth contacting.”
                  </p>
                </div>
                <div className="rounded-3xl border border-border/30 bg-card/40 backdrop-blur-sm p-8 min-h-[320px] flex items-center shadow-[0_0_50px_hsl(261_75%_65%/0.08)]">
                  <div className="w-full space-y-4">
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm text-primary font-medium">
                      Find heads of sales at NYC B2B SaaS companies with 10–100 employees hiring SDRs
                    </div>
                    <div className="grid gap-3">
                      {[
                        ["Jordan Park", "Head of Sales · Northline", "High fit"],
                        ["Rina Shah", "VP Revenue · SignalFox", "Good fit"],
                        ["Alex Müller", "Director of Sales · GraphiteIQ", "Good fit"],
                      ].map(([name, meta, fit]) => (
                        <div key={name} className="rounded-2xl border border-border/20 bg-background/60 p-4 flex items-center justify-between gap-4">
                          <div>
                            <p className="font-semibold">{name}</p>
                            <p className="text-sm text-muted-foreground">{meta}</p>
                          </div>
                          <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium whitespace-nowrap">{fit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative py-24 md:py-32 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(120,119,198,0.08),transparent_55%)]" />
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-8 items-center">
                <div className="rounded-3xl border border-border/30 bg-card/40 backdrop-blur-sm p-8 min-h-[340px] flex items-center shadow-[0_0_50px_hsl(261_75%_65%/0.08)]">
                  <div className="w-full rounded-2xl border border-border/20 bg-background/70 overflow-hidden">
                    <div className="px-5 py-4 border-b border-border/20 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Outreach draft</p>
                        <p className="text-xs text-muted-foreground">Built from lead and company context</p>
                      </div>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">Personalized</span>
                    </div>
                    <div className="p-5 space-y-4 text-sm leading-relaxed">
                      <p><span className="text-muted-foreground">Subject:</span> Quick idea for Northline&apos;s outbound hiring push</p>
                      <div className="space-y-3 text-muted-foreground">
                        <p>Hey Jordan — noticed Northline is hiring SDRs and growing the sales team in NYC.</p>
                        <p>That usually means more pressure to build a repeatable prospecting workflow fast.</p>
                        <p>SalesOS helps teams describe their ICP in plain English, find better-fit leads, and move into outreach faster without spending hours building lists manually.</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <SceneLabel>
                    <Mail className="w-3.5 h-3.5" />
                    Scene 02
                  </SceneLabel>
                  <h2 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight mb-5">
                    Turn context into
                    <span className="block text-primary">outbound that feels human.</span>
                  </h2>
                  <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
                    Better outbound does not come from more templates. It comes from having enough context to say something specific, fast.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section id="demo-core" className="relative py-24 md:py-32 overflow-hidden">
            <div className="container mx-auto px-6">
              <div className="max-w-6xl mx-auto text-center mb-12">
                <SceneLabel>
                  <Users className="w-3.5 h-3.5" />
                  Scene 03
                </SceneLabel>
                <h2 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight mb-5">
                  See the whole motion.
                </h2>
                <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                  Search. enrich. prioritize. draft. move. This is the core product flow, stripped down to the parts that matter.
                </p>
              </div>

              <div className="rounded-[32px] border border-primary/20 bg-gradient-to-b from-card/80 to-background/80 backdrop-blur-2xl p-3 sm:p-4 shadow-[0_0_100px_hsl(261_75%_65%/0.12)]">
                <div className="rounded-[26px] border border-border/30 bg-background/90 overflow-hidden">
                  <Demo />
                </div>
              </div>
            </div>
          </section>

          <section className="relative py-24 md:py-32 overflow-hidden">
            <div className="container mx-auto px-6">
              <div className="max-w-6xl mx-auto grid lg:grid-cols-[0.95fr_1.05fr] gap-8 items-center">
                <div>
                  <SceneLabel>
                    <BarChart3 className="w-3.5 h-3.5" />
                    Scene 04
                  </SceneLabel>
                  <h2 className="text-4xl md:text-6xl font-bold tracking-tight leading-tight mb-5">
                    One system.
                    <span className="block text-primary">Less wasted motion.</span>
                  </h2>
                  <p className="text-lg text-muted-foreground leading-relaxed max-w-xl">
                    The appeal is not just finding leads. It is reducing the drag between prospecting, outreach, and pipeline movement so your team actually ships work.
                  </p>
                </div>
                <div className="rounded-3xl border border-border/30 bg-card/40 backdrop-blur-sm p-8 min-h-[320px] flex items-center shadow-[0_0_50px_hsl(261_75%_65%/0.08)]">
                  <div className="grid grid-cols-2 gap-4 w-full">
                    {[
                      ["Leads", "247", "text-primary"],
                      ["Meetings", "34", "text-green-400"],
                      ["Revenue", "$89K", "text-yellow-400"],
                      ["Conv. Rate", "32%", "text-purple-400"],
                    ].map(([label, value, color]) => (
                      <div key={label} className="rounded-2xl border border-border/20 bg-background/60 p-5 text-center">
                        <p className={`text-2xl md:text-3xl font-bold ${color}`}>{value}</p>
                        <p className="text-sm text-muted-foreground mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative py-24 md:py-32 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(120,119,198,0.12),transparent_55%)]" />
            </div>
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-4xl mx-auto text-center">
                <SceneLabel>
                  <Sparkles className="w-3.5 h-3.5" />
                  Final scene
                </SceneLabel>
                <h2 className="text-5xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6">
                  If this feels faster,
                  <span className="block bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent">
                    it probably is.
                  </span>
                </h2>
                <p className="text-lg md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed mb-10">
                  SalesOS is for founder-led sales teams, outbound agencies, and B2B operators who want less tool sprawl, less manual prospecting, and more real pipeline movement.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button size="lg" className="group h-14 px-8 text-base" onClick={() => navigate('/pricing')}>
                    View pricing
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button variant="outline" size="lg" className="h-14 px-8 text-base" onClick={() => navigate('/')}>
                    Back to homepage
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
};

export default DemoPage;
