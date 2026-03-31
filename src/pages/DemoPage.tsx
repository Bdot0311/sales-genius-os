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

      <div className="min-h-screen bg-[#04050a] text-foreground overflow-hidden">
        <Navbar />
        <main className="relative isolate">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-[-6%] left-1/2 -translate-x-1/2 w-[1320px] h-[760px] rounded-full blur-3xl bg-primary/14 animate-pulse" />
            <div className="absolute top-[18%] right-[6%] w-[460px] h-[460px] rounded-full blur-3xl bg-accent/10 animate-[pulse_9s_ease-in-out_infinite]" />
            <div className="absolute top-[46%] left-[4%] w-[500px] h-[500px] rounded-full blur-3xl bg-primary/10 animate-[pulse_10s_ease-in-out_infinite]" />
            <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[980px] h-[380px] rounded-full blur-3xl bg-white/[0.03] animate-[pulse_12s_ease-in-out_infinite]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_40%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.02)_35%,rgba(255,255,255,0.015)_55%,transparent_85%)]" />
            <div className="absolute inset-0 opacity-25 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.03)_49%,transparent_100%)] bg-[length:100%_220px] animate-[pulse_8s_ease-in-out_infinite]" />
          </div>

          <section className="relative min-h-screen flex items-center pt-20 pb-10">
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-6xl mx-auto text-center">
                <div className="relative">
                  <div className="absolute inset-x-0 -top-8 h-16 bg-gradient-to-b from-primary/10 to-transparent blur-2xl" />
                  <h1 className="relative text-5xl md:text-7xl lg:text-[6rem] font-bold tracking-tight leading-[0.9] mb-6 text-white">
                    Tell SalesOS who you want.
                    <span className="block bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent">
                      Watch everything sharpen.
                    </span>
                  </h1>
                </div>

                <p className="text-lg md:text-2xl text-white/62 max-w-3xl mx-auto leading-relaxed mb-10">
                  Search in plain English. Surface better-fit leads. Turn context into outreach. Move the pipeline from one system.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
                  <Button size="lg" className="group h-14 px-8 text-base shadow-[0_0_40px_rgba(120,76,255,0.25)]" onClick={() => navigate('/pricing')}>
                    View plans
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-14 px-8 text-base border-white/12 bg-white/[0.03] text-white hover:bg-white/[0.06] hover:text-white"
                    onClick={() => document.getElementById('experience')?.scrollIntoView({ behavior: 'smooth' })}
                  >
                    Start the demo
                  </Button>
                </div>

                <div className="relative flex justify-center">
                  <div className="absolute inset-x-1/2 top-0 -translate-x-1/2 w-14 h-14 rounded-full bg-primary/12 blur-2xl animate-pulse" />
                  <div className="w-px h-24 bg-gradient-to-b from-primary/60 via-white/20 to-transparent" />
                </div>
              </div>
            </div>
          </section>

          <section id="experience" className="relative pb-28 md:pb-36">
            <div className="container relative z-10 mx-auto px-4 sm:px-6">
              <div className="max-w-6xl mx-auto">
                <div className="relative group">
                  <div className="absolute -inset-10 rounded-[44px] bg-[radial-gradient(circle_at_center,rgba(120,76,255,0.22),transparent_55%)] blur-3xl opacity-90" />
                  <div className="absolute -inset-4 rounded-[38px] border border-primary/15 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] backdrop-blur-2xl" />
                  <div className="absolute -inset-y-12 left-1/2 -translate-x-1/2 w-[82%] bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05),transparent_60%)] blur-3xl opacity-70 animate-[pulse_10s_ease-in-out_infinite]" />

                  <div className="relative rounded-[36px] border border-primary/20 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] backdrop-blur-2xl p-3 sm:p-4 shadow-[0_0_140px_rgba(120,76,255,0.18)] transition-transform duration-700 md:group-hover:-translate-y-1">
                    <div className="absolute inset-0 rounded-[36px] bg-[linear-gradient(135deg,rgba(255,255,255,0.06),transparent_22%,transparent_78%,rgba(255,255,255,0.04))] opacity-80 pointer-events-none" />
                    <div className="rounded-[30px] border border-white/10 bg-[#06070b]/94 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <Demo />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative pb-28 md:pb-36">
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-4xl mx-auto text-center">
                <div className="relative">
                  <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-primary/8 to-transparent blur-2xl" />
                  <h2 className="relative text-5xl md:text-7xl font-bold tracking-tight leading-[0.94] text-white mb-6">
                    Less wasted motion.
                    <span className="block bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent">
                      More pipeline movement.
                    </span>
                  </h2>
                </div>
                <p className="text-lg md:text-2xl text-white/58 max-w-3xl mx-auto leading-relaxed mb-10">
                  SalesOS is built for founder-led sales teams, outbound agencies, and B2B operators who want prospecting, outreach, and pipeline movement to work together.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button size="lg" className="group h-14 px-8 text-base shadow-[0_0_40px_rgba(120,76,255,0.25)]" onClick={() => navigate('/pricing')}>
                    View pricing
                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-14 px-8 text-base border-white/12 bg-white/[0.03] text-white hover:bg-white/[0.06] hover:text-white"
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
