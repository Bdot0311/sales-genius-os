import { Button } from "@/components/ui/button";
import { ArrowRight, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

export const Hero = () => {
  const navigate = useNavigate();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <section className="relative min-h-[90vh] flex items-center justify-center overflow-hidden pt-20">
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-background" />
      
      {/* Refined gradient orbs */}
      <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] bg-accent/6 rounded-full blur-[100px] pointer-events-none" />

      <div className="container relative z-10 mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <div 
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 transition-all duration-700 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            <span className="text-sm font-medium text-primary">Now in Beta — Join 500+ early adopters</span>
          </div>

          {/* Main headline */}
          <h1 
            className={`text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 transition-all duration-700 delay-100 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            The sales platform{" "}
            <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-primary via-purple-400 to-accent bg-clip-text text-transparent">
              that closes deals
            </span>
          </h1>

          {/* Subheadline */}
          <p 
            className={`text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed transition-all duration-700 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            AI-powered lead discovery, personalized outreach, and intelligent pipeline management. 
            Everything you need to scale your sales in one unified platform.
          </p>

          {/* CTA Buttons */}
          <div 
            className={`flex flex-col sm:flex-row gap-4 justify-center items-center mb-16 transition-all duration-700 delay-300 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            <Button 
              size="lg" 
              className="h-14 px-8 text-base font-semibold bg-foreground text-background hover:bg-foreground/90 rounded-xl group"
              onClick={() => navigate('/pricing')}
            >
              Start free trial
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              variant="ghost" 
              size="lg"
              className="h-14 px-8 text-base font-medium text-muted-foreground hover:text-foreground rounded-xl group"
              onClick={() => document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })}
            >
              <Play className="w-4 h-4 mr-2 fill-current" />
              Watch demo
            </Button>
          </div>

          {/* Stats row */}
          <div 
            className={`flex flex-wrap justify-center gap-8 sm:gap-16 transition-all duration-700 delay-500 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            }`}
          >
            {[
              { value: "500+", label: "Companies" },
              { value: "2M+", label: "Leads enriched" },
              { value: "94%", label: "Satisfaction" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Product preview card */}
        <div 
          className={`mt-20 max-w-5xl mx-auto transition-all duration-1000 delay-700 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}
        >
          <div className="relative rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-1.5 shadow-2xl shadow-primary/5">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1.5 rounded-lg bg-muted/50 text-xs text-muted-foreground font-mono">
                  app.salesos.io/dashboard
                </div>
              </div>
            </div>
            
            {/* Dashboard preview content */}
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-4 gap-4">
                {[
                  { label: "Active leads", value: "1,284", change: "+12%" },
                  { label: "Meetings booked", value: "47", change: "+8%" },
                  { label: "Emails sent", value: "2,341", change: "+23%" },
                  { label: "Pipeline value", value: "$847K", change: "+15%" },
                ].map((metric, i) => (
                  <div key={i} className="p-4 rounded-xl bg-background/50 border border-border/30">
                    <div className="text-xs text-muted-foreground mb-1">{metric.label}</div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-semibold">{metric.value}</span>
                      <span className="text-xs text-green-500">{metric.change}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Skeleton content */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2 h-32 rounded-xl bg-muted/30 animate-pulse" />
                <div className="h-32 rounded-xl bg-muted/30 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
