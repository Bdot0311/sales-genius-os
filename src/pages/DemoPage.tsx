import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Demo } from "@/components/Demo";
import { SEOHead } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DemoPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="SalesOS Demo - Product Launch Experience"
        description="See SalesOS in motion: plain-English search, qualified leads, personalized outreach, and pipeline movement in one product experience."
        keywords="SalesOS demo, product launch demo, B2B lead discovery demo, sales workflow demo"
      />

      <div className="min-h-screen bg-[linear-gradient(to_bottom,#fbfbff_0%,#f6f5ff_35%,#ffffff_100%)] text-foreground overflow-hidden">
        <Navbar />
        <main className="relative isolate">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-[-8%] left-1/2 -translate-x-1/2 w-[1200px] h-[720px] rounded-full blur-3xl bg-primary/10 animate-[pulse_14s_ease-in-out_infinite]" />
            <div className="absolute top-[22%] right-[8%] w-[360px] h-[360px] rounded-full blur-3xl bg-accent/10 animate-[pulse_18s_ease-in-out_infinite]" />
            <div className="absolute top-[50%] left-[4%] w-[420px] h-[420px] rounded-full blur-3xl bg-primary/8 animate-[pulse_20s_ease-in-out_infinite]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.85),transparent_35%)]" />
            <div className="absolute inset-0 opacity-60 bg-[linear-gradient(to_bottom,transparent,rgba(121,91,255,0.03)_38%,transparent_80%)]" />
            <div className="absolute inset-0 opacity-40 bg-[linear-gradient(rgba(121,91,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(121,91,255,0.035)_1px,transparent_1px)] bg-[size:90px_90px]" />
          </div>

          <section className="relative min-h-screen flex items-center pt-20 pb-12">
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-6xl mx-auto text-center">
                <div className="relative">
                  <div className="absolute inset-x-0 -top-8 h-20 bg-gradient-to-b from-primary/8 to-transparent blur-3xl" />
                  <h1 className="relative text-5xl md:text-7xl lg:text-[6rem] font-semibold tracking-tight leading-[0.9] mb-6 text-foreground">
                    Tell SalesOS who you want.
                    <span className="block bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                      Watch everything sharpen.
                    </span>
                  </h1>
                </div>

                <p className="text-lg md:text-2xl text-foreground/60 max-w-3xl mx-auto leading-relaxed mb-10">
                  Search in plain English. Surface better-fit leads. Turn context into outreach. Move the pipeline from one system.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
                  <Button size="lg" className="group h-14 px-8 text-base shadow-[0_20px_60px_rgba(121,91,255,0.18)]" onClick={() => navigate('/pricing')}>
                    View plans
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-14 px-8 text-base border-primary/15 bg-white/70 backdrop-blur-sm text-foreground hover:bg-white hover:text-foreground"
                    onClick={() => document.getElementById('experience')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Start the demo
                  </Button>
                </div>

                <div className="relative flex justify-center">
                  <div className="absolute inset-x-1/2 top-0 -translate-x-1/2 w-16 h-16 rounded-full bg-primary/10 blur-3xl animate-[pulse_8s_ease-in-out_infinite]" />
                  <div className="w-px h-28 bg-gradient-to-b from-primary/50 via-primary/15 to-transparent" />
                </div>
              </div>
            </div>
          </section>

          <section id="experience" className="relative pb-28 md:pb-40">
            <div className="container relative z-10 mx-auto px-4 sm:px-6">
              <div className="max-w-6xl mx-auto">
                <div className="relative group">
                  <div className="absolute -inset-12 rounded-[52px] bg-[radial-gradient(circle_at_center,rgba(121,91,255,0.16),transparent_58%)] blur-3xl opacity-80" />
                  <div className="absolute -inset-6 rounded-[44px] bg-white/40 backdrop-blur-2xl border border-white/60 shadow-[0_30px_120px_rgba(121,91,255,0.08)]" />
                  <div className="absolute -inset-y-10 left-1/2 -translate-x-1/2 w-[82%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.8),transparent_62%)] blur-3xl opacity-80 animate-[pulse_14s_ease-in-out_infinite]" />

                  <div className="relative rounded-[38px] border border-white/60 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.75),rgba(255,255,255,0.5))] backdrop-blur-2xl p-3 sm:p-4 shadow-[0_32px_120px_rgba(121,91,255,0.10)] transition-all duration-700 md:group-hover:-translate-y-1">
                    <div className="absolute inset-0 rounded-[38px] bg-[linear-gradient(140deg,rgba(255,255,255,0.8),transparent_28%,transparent_80%,rgba(255,255,255,0.55))] opacity-90 pointer-events-none" />
                    <div className="relative rounded-[32px] border border-white/70 bg-white/82 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                      <Demo />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative pb-28 md:pb-40">
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-4xl mx-auto text-center">
                <div className="relative">
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/6 to-transparent blur-3xl" />
                  <h2 className="relative text-5xl md:text-7xl font-semibold tracking-tight leading-[0.94] text-foreground mb-6">
                    Less wasted motion.
                    <span className="block bg-gradient-to-r from-primary via-primary/80 to-accent bg-clip-text text-transparent">
                      More pipeline movement.
                    </span>
                  </h2>
                </div>
                <p className="text-lg md:text-2xl text-foreground/58 max-w-3xl mx-auto leading-relaxed mb-10">
                  SalesOS is built for founder-led sales teams, outbound agencies, and B2B operators who want prospecting, outreach, and pipeline movement to work together.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button size="lg" className="group h-14 px-8 text-base shadow-[0_20px_60px_rgba(121,91,255,0.18)]" onClick={() => navigate('/pricing')}>
                    View plans
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-14 px-8 text-base border-primary/15 bg-white/70 backdrop-blur-sm text-foreground hover:bg-white hover:text-foreground"
                    onClick={() => navigate('/')}
                  >
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
