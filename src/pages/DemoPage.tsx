import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Demo } from "@/components/Demo";
import { SEOHead } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Users, Mail, Sparkles, PlayCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DemoPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="SalesOS Demo - See the Workflow in Action"
        description="See how SalesOS moves from plain-English ICP search to matched leads and personalized outreach in one workflow."
        keywords="SalesOS demo, sales workflow demo, B2B lead discovery demo, outbound sales software demo"
      />

      <div className="min-h-screen bg-background text-foreground overflow-hidden">
        <Navbar />
        <main>
          <section className="relative pt-24 pb-12 md:pb-16 overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[1100px] h-[700px] rounded-full blur-3xl bg-primary/10" />
              <div className="absolute top-32 right-[10%] w-72 h-72 rounded-full blur-3xl bg-accent/10" />
              <div className="absolute bottom-0 left-[8%] w-80 h-80 rounded-full blur-3xl bg-primary/10" />
            </div>

            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-5xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-xs font-medium text-primary mb-6">
                  <PlayCircle className="w-3.5 h-3.5" />
                  Product walkthrough
                </div>
                <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-5">
                  Watch the workflow.
                  <span className="block bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                    Skip the marketing fog.
                  </span>
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground leading-relaxed max-w-3xl mx-auto mb-8">
                  This page is for seeing the product motion: plain-English search, matched leads, and outreach-ready workflow. If it clicks, go pick a plan and run it live.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10">
                  <Button size="lg" className="group" onClick={() => navigate('/pricing')}>
                    View plans
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => navigate('/auth')}>
                    Explore the workflow
                  </Button>
                </div>

                <div className="grid md:grid-cols-3 gap-4 text-left mb-10">
                  <div className="rounded-2xl border border-border/30 bg-card/40 backdrop-blur-sm p-5 shadow-[0_0_40px_hsl(261_75%_65%/0.06)]">
                    <Search className="w-5 h-5 text-primary mb-3" />
                    <p className="font-semibold mb-1">Describe your target</p>
                    <p className="text-sm text-muted-foreground">Use natural language instead of filters and boolean gymnastics.</p>
                  </div>
                  <div className="rounded-2xl border border-border/30 bg-card/40 backdrop-blur-sm p-5 shadow-[0_0_40px_hsl(261_75%_65%/0.06)]">
                    <Users className="w-5 h-5 text-primary mb-3" />
                    <p className="font-semibold mb-1">Review matched leads</p>
                    <p className="text-sm text-muted-foreground">See better-fit prospects with the context you need to prioritize faster.</p>
                  </div>
                  <div className="rounded-2xl border border-border/30 bg-card/40 backdrop-blur-sm p-5 shadow-[0_0_40px_hsl(261_75%_65%/0.06)]">
                    <Mail className="w-5 h-5 text-primary mb-3" />
                    <p className="font-semibold mb-1">Launch outreach</p>
                    <p className="text-sm text-muted-foreground">Turn lead context into more relevant outbound without bouncing across tools.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative pb-16 md:pb-24">
            <div className="container mx-auto px-4 sm:px-6">
              <div className="max-w-7xl mx-auto">
                <div className="rounded-[28px] border border-primary/20 bg-gradient-to-b from-card/80 to-background/80 backdrop-blur-xl p-3 sm:p-4 shadow-[0_0_80px_hsl(261_75%_65%/0.10)]">
                  <div className="rounded-[22px] border border-border/30 bg-background/90 overflow-hidden">
                    <Demo />
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="pb-20 md:pb-24 container mx-auto px-6">
            <div className="max-w-5xl mx-auto grid md:grid-cols-[1.1fr_0.9fr] gap-6 items-stretch">
              <div className="rounded-3xl border border-border/30 bg-card/40 backdrop-blur-sm p-8">
                <div className="inline-flex items-center gap-2 text-primary text-sm font-medium mb-4">
                  <Sparkles className="w-4 h-4" />
                  What to look for in the demo
                </div>
                <div className="space-y-4 text-muted-foreground leading-relaxed">
                  <p>
                    The goal is not flashy motion for its own sake. The goal is to show whether the workflow feels faster, clearer, and more usable than the stack you would otherwise stitch together.
                  </p>
                  <p>
                    If the product story makes sense, the next step is simple: choose the plan that matches your prospecting volume and outbound motion.
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-primary/20 bg-primary/5 p-8">
                <h2 className="text-2xl font-bold tracking-tight mb-3">If it clicks, go run it live</h2>
                <p className="text-muted-foreground leading-relaxed mb-6">
                  SalesOS is built for founder-led sales teams, outbound agencies, and B2B teams that want a faster path from ICP to outreach.
                </p>
                <div className="flex flex-col gap-3">
                  <Button size="lg" className="group" onClick={() => navigate('/pricing')}>
                    View pricing
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => navigate('/')}>
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
