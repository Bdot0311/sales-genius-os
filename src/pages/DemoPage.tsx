import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Demo } from "@/components/Demo";
import { SEOHead } from "@/components/seo";
import { Button } from "@/components/ui/button";
import { ArrowRight, Search, Users, Mail } from "lucide-react";
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

      <div className="min-h-screen bg-background text-foreground">
        <Navbar />
        <main>
          <section className="pt-24 pb-10 container mx-auto px-6 text-center">
            <div className="max-w-3xl mx-auto">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                See how SalesOS works
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed mb-8">
                This page is here to show the workflow, not bury you in marketing. Start with the product story, then choose the plan that fits your outbound motion.
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
              <div className="grid sm:grid-cols-3 gap-4 text-left">
                <div className="rounded-xl border border-border/30 bg-card/40 p-4">
                  <Search className="w-5 h-5 text-primary mb-3" />
                  <p className="font-medium mb-1">1. Describe your target</p>
                  <p className="text-sm text-muted-foreground">Use plain-English search instead of wrestling with filters and boolean logic.</p>
                </div>
                <div className="rounded-xl border border-border/30 bg-card/40 p-4">
                  <Users className="w-5 h-5 text-primary mb-3" />
                  <p className="font-medium mb-1">2. Review matched leads</p>
                  <p className="text-sm text-muted-foreground">See better-fit prospects with company and contact context that helps you prioritize faster.</p>
                </div>
                <div className="rounded-xl border border-border/30 bg-card/40 p-4">
                  <Mail className="w-5 h-5 text-primary mb-3" />
                  <p className="font-medium mb-1">3. Launch outreach</p>
                  <p className="text-sm text-muted-foreground">Turn lead context into more relevant outbound without juggling a fragmented sales stack.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="py-6 container mx-auto px-6">
            <div className="max-w-6xl mx-auto">
              <Demo />
            </div>
          </section>

          <section className="py-16 container mx-auto px-6 text-center">
            <div className="max-w-2xl mx-auto rounded-2xl border border-border/30 bg-muted/20 p-8">
              <h2 className="text-3xl font-bold tracking-tight mb-4">If the workflow fits, pick a plan and run it live</h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                SalesOS is built for founder-led sales teams, outbound agencies, and B2B teams that want a faster path from ICP to outreach.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button size="lg" className="group" onClick={() => navigate('/pricing')}>
                  View pricing
                  <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-0.5" />
                </Button>
                <Button variant="outline" size="lg" onClick={() => navigate('/')}>
                  Back to homepage
                </Button>
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
