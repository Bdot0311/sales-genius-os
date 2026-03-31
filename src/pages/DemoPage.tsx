import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Demo } from "@/components/Demo";
import { SEOHead } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { ArrowRight, PlayCircle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

const DemoPage = () => {
  const navigate = useNavigate();

  return (
    <>
      <SEOHead
        title="SalesOS Demo - Motion-Driven Product Story"
        description="Experience SalesOS as a motion-driven product story: plain-English search, qualified leads, outreach, and pipeline movement in one cinematic flow."
        keywords="SalesOS demo, cinematic product demo, B2B lead discovery demo, sales workflow demo"
      />

      <div className="min-h-screen bg-[#04050a] text-foreground overflow-hidden">
        <Navbar />
        <main className="relative">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1200px] h-[680px] rounded-full blur-3xl bg-primary/12 animate-pulse" />
            <div className="absolute top-[22%] right-[8%] w-[380px] h-[380px] rounded-full blur-3xl bg-accent/10" />
            <div className="absolute top-[48%] left-[6%] w-[420px] h-[420px] rounded-full blur-3xl bg-primary/10" />
            <div className="absolute bottom-[8%] left-1/2 -translate-x-1/2 w-[900px] h-[360px] rounded-full blur-3xl bg-white/[0.03]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_42%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.02)_45%,transparent_85%)]" />
          </div>

          <section className="relative min-h-screen flex items-center pt-20 pb-10">
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-6xl mx-auto text-center">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/20 bg-primary/8 text-xs font-medium text-primary mb-6 backdrop-blur-sm">
                  <PlayCircle className="w-3.5 h-3.5" />
                  Motion-driven product story
                </div>

                <h1 className="text-5xl md:text-7xl lg:text-[5.8rem] font-bold tracking-tight leading-[0.92] mb-6 text-white">
                  Type the target.
                  <span className="block bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent">
                    Watch the pipeline wake up.
                  </span>
                </h1>

                <p className="text-lg md:text-2xl text-white/62 max-w-3xl mx-auto leading-relaxed mb-10">
                  A rough idea goes in. Better-fit leads, sharper outreach, and cleaner momentum come out. This is the shortest path from intention to motion.
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
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
                    Enter the experience
                  </Button>
                </div>

                <div className="mt-12 flex justify-center">
                  <div className="w-px h-20 bg-gradient-to-b from-primary/60 via-white/20 to-transparent" />
                </div>
              </div>
            </div>
          </section>

          <section id="experience" className="relative pb-24 md:pb-32">
            <div className="container relative z-10 mx-auto px-4 sm:px-6">
              <div className="max-w-6xl mx-auto">
                <div className="mb-8 text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-xs font-medium text-white/70 mb-5 backdrop-blur-sm">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    Hook → experience → buy
                  </div>
                  <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
                    One continuous reveal.
                  </h2>
                  <p className="text-base md:text-lg text-white/52 max-w-2xl mx-auto leading-relaxed">
                    No extra scenes to explain the scenes. Just the product motion itself, pushed to the center where it belongs.
                  </p>
                </div>

                <div className="relative">
                  <div className="absolute -inset-4 rounded-[36px] bg-gradient-to-b from-primary/14 via-transparent to-white/[0.03] blur-2xl" />
                  <div className="relative rounded-[34px] border border-primary/18 bg-[linear-gradient(to_bottom,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] backdrop-blur-2xl p-3 sm:p-4 shadow-[0_0_120px_rgba(120,76,255,0.16)]">
                    <div className="rounded-[28px] border border-white/10 bg-[#06070b]/92 overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                      <Demo />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="relative pb-24 md:pb-32">
            <div className="container relative z-10 mx-auto px-6">
              <div className="max-w-4xl mx-auto text-center">
                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/8 px-3 py-1.5 text-xs font-medium text-primary backdrop-blur-sm">
                  <Sparkles className="w-3.5 h-3.5" />
                  Final beat
                </div>
                <h2 className="text-5xl md:text-7xl font-bold tracking-tight leading-[0.94] text-white mb-6">
                  If this feels cleaner,
                  <span className="block bg-gradient-to-r from-primary via-white to-accent bg-clip-text text-transparent">
                    it probably sells cleaner too.
                  </span>
                </h2>
                <p className="text-lg md:text-2xl text-white/58 max-w-3xl mx-auto leading-relaxed mb-10">
                  SalesOS is for founder-led sales teams, outbound agencies, and B2B operators who want less wasted motion between ICP, outreach, and actual pipeline movement.
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
