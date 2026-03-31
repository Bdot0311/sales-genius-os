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

      <div className="min-h-screen bg-[#030409] text-foreground overflow-hidden">
        <Navbar />
        <main className="relative isolate">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1500px] h-[860px] rounded-full blur-3xl bg-primary/14 animate-[pulse_12s_ease-in-out_infinite]" />
            <div className="absolute top-[16%] right-[5%] w-[460px] h-[460px] rounded-full blur-3xl bg-accent/8 animate-[pulse_14s_ease-in-out_infinite]" />
            <div className="absolute top-[50%] left-[3%] w-[520px] h-[520px] rounded-full blur-3xl bg-primary/9 animate-[pulse_16s_ease-in-out_infinite]" />
            <div className="absolute bottom-[6%] left-1/2 -translate-x-1/2 w-[1080px] h-[420px] rounded-full blur-3xl bg-white/[0.025] animate-[pulse_18s_ease-in-out_infinite]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.045),transparent_38%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.018)_34%,rgba(255,255,255,0.014)_56%,transparent_86%)]" />
            <div className="absolute inset-0 opacity-15 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.03)_49%,transparent_100%)] bg-[length:100%_220px] animate-[pulse_10s_ease-in-out_infinite]" />
          </div>

          <section className="relative min-h-screen flex items-center pt-20 pb-6">
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-6xl mx-auto text-center">
                <div className="relative">
                  <div className="absolute inset-x-0 -top-10 h-20 bg-gradient-to-b from-primary/10 to-transparent blur-3xl" />
                  <h1 className="relative text-5xl md:text-7xl lg:text-[6.2rem] font-semibold tracking-tight leading-[0.9] mb-6 text-white">
                    Tell SalesOS who you want.
                    <span className="block bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent">
                      Watch everything sharpen.
                    </span>
                  </h1>
                </div>

                <p className="text-lg md:text-2xl text-white/58 max-w-3xl mx-auto leading-relaxed mb-10">
                  Search in plain English. Surface better-fit leads. Turn context into outreach. Move the pipeline from one system.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
                  <Button size="lg" className="group h-14 px-8 text-base shadow-[0_0_45px_rgba(120,76,255,0.26)]" onClick={() => navigate('/pricing')}>
                    View plans
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-14 px-8 text-base border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.05] hover:text-white"
                    onClick={() => document.getElementById('experience')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Start the demo
                  </Button>
                </div>

                <div className="relative flex justify-center">
                  <div className="absolute inset-x-1/2 top-0 -translate-x-1/2 w-16 h-16 rounded-full bg-primary/12 blur-3xl animate-[pulse_8s_ease-in-out_infinite]" />
                  <div className="w-px h-28 bg-gradient-to-b from-primary/60 via-white/20 to-transparent" />
                </div>
              </div>
            </div>
          </section>

          <section id="experience" className="relative pb-28 md:pb-40">
            <div className="container relative z-10 mx-auto px-4 sm:px-6">
              <div className="max-w-6xl mx-auto">
                <div className="relative group">
                  <div className="absolute -inset-14 rounded-[52px] bg-[radial-gradient(circle_at_center,rgba(120,76,255,0.22),transparent_58%)] blur-3xl opacity-90" />
                  <div className="absolute -inset-8 rounded-[44px] bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.06),transparent_45%)] blur-2xl opacity-70" />
                  <div className="absolute -inset-4 rounded-[40px] border border-primary/14 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.045),rgba(255,255,255,0.015))] backdrop-blur-2xl" />
                  <div className="absolute inset-x-[10%] -inset-y-12 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04),transparent_62%)] blur-3xl opacity-70 animate-[pulse_12s_ease-in-out_infinite]" />

                  <div className="relative rounded-[38px] border border-primary/18 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.05),rgba(255,255,255,0.012))] backdrop-blur-2xl p-3 sm:p-4 shadow-[0_0_150px_rgba(120,76,255,0.18)] transition-all duration-700 md:group-hover:-translate-y-1 md:group-hover:shadow-[0_0_170px_rgba(120,76,255,0.22)]">
                    <div className="absolute inset-0 rounded-[38px] bg-[linear-gradient(140deg,rgba(255,255,255,0.055),transparent_22%,transparent_80%,rgba(255,255,255,0.03))] opacity-90 pointer-events-none" />
                    <div className="relative rounded-[32px] border border-white/10 bg-[#06070b]/96 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
                  <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/8 to-transparent blur-3xl" />
                  <h2 className="relative text-5xl md:text-7xl font-semibold tracking-tight leading-[0.94] text-white mb-6">
                    Less wasted motion.
                    <span className="block bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent">
                      More pipeline movement.
                    </span>
                  </h2>
                </div>
                <p className="text-lg md:text-2xl text-white/54 max-w-3xl mx-auto leading-relaxed mb-10">
                  SalesOS is built for founder-led sales teams, outbound agencies, and B2B operators who want prospecting, outreach, and pipeline movement to work together.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button size="lg" className="group h-14 px-8 text-base shadow-[0_0_45px_rgba(120,76,255,0.26)]" onClick={() => navigate('/pricing')}>
                    View pricing
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-14 px-8 text-base border-white/10 bg-white/[0.025] text-white hover:bg-white/[0.05] hover:text-white"
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
