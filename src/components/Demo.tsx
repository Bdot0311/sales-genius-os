import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { 
  ChevronLeft, 
  ChevronRight, 
  Sparkles, 
  Building2, 
  Kanban, 
  Mail, 
  BarChart3, 
  MessageSquare,
  Play,
  Pause,
  Search,
  User,
  Phone,
  Linkedin,
  Globe,
  TrendingUp,
  ArrowRight
} from "lucide-react";

const demoSteps = [
  {
    id: 1,
    title: "AI Lead Discovery",
    description: "Find your ideal customers with natural language. Just describe who you're looking for.",
    icon: Sparkles,
  },
  {
    id: 2,
    title: "Smart Enrichment",
    description: "Automatically enrich leads with company data, contact info, and social profiles.",
    icon: Building2,
  },
  {
    id: 3,
    title: "Pipeline Management",
    description: "Visualize your deals across stages with drag-and-drop kanban boards.",
    icon: Kanban,
  },
  {
    id: 4,
    title: "AI Outreach Studio",
    description: "Generate personalized emails that convert using AI-powered content.",
    icon: Mail,
  },
  {
    id: 5,
    title: "Analytics Dashboard",
    description: "Track performance with real-time metrics and actionable insights.",
    icon: BarChart3,
  },
  {
    id: 6,
    title: "AI Sales Coach",
    description: "Get intelligent recommendations to close more deals faster.",
    icon: MessageSquare,
  },
];

// Step 1: AI Lead Discovery Mockup
const AILeadDiscoveryMockup = ({ isActive }: { isActive: boolean }) => {
  const [typedText, setTypedText] = useState("");
  const [showResults, setShowResults] = useState(false);
  const fullText = "Find 50 SaaS founders in Europe with 10-50 employees";

  useEffect(() => {
    if (!isActive) {
      setTypedText("");
      setShowResults(false);
      return;
    }

    let index = 0;
    const typingInterval = setInterval(() => {
      if (index < fullText.length) {
        setTypedText(fullText.slice(0, index + 1));
        index++;
      } else {
        clearInterval(typingInterval);
        setTimeout(() => setShowResults(true), 500);
      }
    }, 40);

    return () => clearInterval(typingInterval);
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div className="bg-background/50 backdrop-blur-sm rounded-xl p-4 border border-border/50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="text-sm text-muted-foreground">AI Command</span>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 min-h-[48px] flex items-center">
          <Search className="w-4 h-4 text-muted-foreground mr-2 flex-shrink-0" />
          <span className="text-foreground">{typedText}</span>
          <span className={`w-0.5 h-5 bg-primary ml-1 ${isActive ? 'animate-pulse' : 'opacity-0'}`} />
        </div>
      </div>

      <div className={`space-y-2 transition-all duration-500 ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {[
          { name: "Sarah Johnson", company: "TechFlow", role: "Founder & CEO" },
          { name: "Marcus Chen", company: "DataSync", role: "Co-founder" },
          { name: "Emma Schmidt", company: "CloudBase", role: "CEO" },
        ].map((lead, i) => (
          <div 
            key={i} 
            className="bg-background/30 backdrop-blur-sm rounded-lg p-3 border border-border/30 flex items-center gap-3 transition-all duration-300"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">{lead.name}</div>
              <div className="text-xs text-muted-foreground">{lead.role} at {lead.company}</div>
            </div>
            <div className="flex gap-1">
              <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
                <Linkedin className="w-3 h-3 text-primary" />
              </div>
              <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
                <Mail className="w-3 h-3 text-primary" />
              </div>
            </div>
          </div>
        ))}
        <div className="text-center text-xs text-muted-foreground pt-2">
          Found 47 more matching leads...
        </div>
      </div>
    </div>
  );
};

// Step 2: Smart Enrichment Mockup
const EnrichmentMockup = ({ isActive }: { isActive: boolean }) => {
  const [enrichStage, setEnrichStage] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setEnrichStage(0);
      return;
    }

    const stages = [1, 2, 3, 4];
    let currentIndex = 0;

    const interval = setInterval(() => {
      if (currentIndex < stages.length) {
        setEnrichStage(stages[currentIndex]);
        currentIndex++;
      } else {
        clearInterval(interval);
      }
    }, 600);

    return () => clearInterval(interval);
  }, [isActive]);

  const enrichFields = [
    { icon: Building2, label: "Company Size", value: "25 employees", stage: 1 },
    { icon: Globe, label: "Website", value: "techflow.io", stage: 2 },
    { icon: Phone, label: "Phone", value: "+1 (555) 123-4567", stage: 3 },
    { icon: Linkedin, label: "LinkedIn", value: "linkedin.com/in/sarah-j", stage: 4 },
  ];

  return (
    <div className="bg-background/50 backdrop-blur-sm rounded-xl p-5 border border-border/50">
      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-border/30">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center">
          <User className="w-7 h-7 text-primary" />
        </div>
        <div>
          <div className="font-semibold text-lg">Sarah Johnson</div>
          <div className="text-sm text-muted-foreground">Founder & CEO at TechFlow</div>
        </div>
        <div className="ml-auto">
          <div className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
            enrichStage >= 4 ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary animate-pulse'
          }`}>
            {enrichStage >= 4 ? '✓ Enriched' : 'Enriching...'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {enrichFields.map((field, i) => (
          <div 
            key={i}
            className={`p-3 rounded-lg border transition-all duration-500 ${
              enrichStage >= field.stage 
                ? 'bg-primary/5 border-primary/30' 
                : 'bg-muted/30 border-border/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <field.icon className={`w-4 h-4 transition-colors ${
                enrichStage >= field.stage ? 'text-primary' : 'text-muted-foreground'
              }`} />
              <span className="text-xs text-muted-foreground">{field.label}</span>
            </div>
            <div className={`text-sm font-medium transition-all duration-300 ${
              enrichStage >= field.stage ? 'opacity-100' : 'opacity-0'
            }`}>
              {field.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Step 3: Pipeline Management Mockup
const PipelineMockup = ({ isActive }: { isActive: boolean }) => {
  const [movingDeal, setMovingDeal] = useState<number | null>(null);
  const [dealPosition, setDealPosition] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setMovingDeal(null);
      setDealPosition(0);
      return;
    }

    const timeout = setTimeout(() => {
      setMovingDeal(1);
      setTimeout(() => {
        setDealPosition(1);
        setTimeout(() => setMovingDeal(null), 500);
      }, 800);
    }, 800);

    return () => clearTimeout(timeout);
  }, [isActive]);

  const stages = [
    { name: "Qualified", deals: [{ id: 1, name: "TechFlow", value: "$25,000" }], color: "bg-blue-500" },
    { name: "Meeting", deals: [{ id: 2, name: "DataSync", value: "$18,000" }], color: "bg-yellow-500" },
    { name: "Proposal", deals: [], color: "bg-purple-500" },
    { name: "Closed", deals: [{ id: 3, name: "CloudBase", value: "$42,000" }], color: "bg-green-500" },
  ];

  return (
    <div className="flex gap-2 overflow-hidden">
      {stages.map((stage, stageIndex) => (
        <div key={stageIndex} className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${stage.color}`} />
            <span className="text-xs font-medium truncate">{stage.name}</span>
          </div>
          <div className="bg-muted/30 rounded-lg p-2 min-h-[120px] border border-border/30 space-y-2">
            {stage.deals.map((deal) => {
              const isMoving = movingDeal === deal.id;
              const shouldShow = deal.id !== 1 || (deal.id === 1 && (stageIndex === 0 && dealPosition === 0) || (stageIndex === 1 && dealPosition === 1));
              
              if (deal.id === 1 && stageIndex === 0 && dealPosition === 1) return null;
              if (deal.id === 1 && stageIndex === 1 && dealPosition === 0) return null;

              return (
                <div 
                  key={deal.id}
                  className={`bg-background/80 rounded-lg p-2 border border-border/50 transition-all duration-500 ${
                    isMoving ? 'scale-105 shadow-lg shadow-primary/20 border-primary/50' : ''
                  }`}
                >
                  <div className="font-medium text-xs">{deal.name}</div>
                  <div className="text-xs text-primary">{deal.value}</div>
                </div>
              );
            })}
            {stages[1].deals.length === 1 && stageIndex === 1 && dealPosition === 1 && (
              <div 
                className="bg-background/80 rounded-lg p-2 border border-primary/50 shadow-lg shadow-primary/20 animate-fade-in"
              >
                <div className="font-medium text-xs">TechFlow</div>
                <div className="text-xs text-primary">$25,000</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

// Step 4: AI Outreach Mockup
const OutreachMockup = ({ isActive }: { isActive: boolean }) => {
  const [showEmail, setShowEmail] = useState(false);
  const [emailLines, setEmailLines] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setShowEmail(false);
      setEmailLines(0);
      return;
    }

    setTimeout(() => setShowEmail(true), 400);

    const lineInterval = setInterval(() => {
      setEmailLines(prev => {
        if (prev >= 4) {
          clearInterval(lineInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 400);

    return () => clearInterval(lineInterval);
  }, [isActive]);

  const emailContent = [
    "Hi Sarah,",
    "I noticed TechFlow just raised Series A - congratulations!",
    "Many fast-growing SaaS companies like yours use SalesOS to",
    "scale their outreach. Would you be open to a quick chat?",
  ];

  return (
    <div className="bg-background/50 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
        <Mail className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">AI-Generated Email</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-primary animate-pulse" />
          <span className="text-xs text-muted-foreground">Personalized</span>
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">To:</span>
          <span className="text-foreground">sarah@techflow.io</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Subject:</span>
          <span className="text-foreground">Quick question about TechFlow's growth</span>
        </div>
        <div className={`pt-3 border-t border-border/30 space-y-2 transition-opacity duration-300 ${showEmail ? 'opacity-100' : 'opacity-0'}`}>
          {emailContent.map((line, i) => (
            <p 
              key={i}
              className={`text-sm transition-all duration-300 ${
                i < emailLines ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
              }`}
            >
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

// Step 5: Analytics Mockup
const AnalyticsMockup = ({ isActive }: { isActive: boolean }) => {
  const [animatedValues, setAnimatedValues] = useState({ leads: 0, meetings: 0, revenue: 0, rate: 0 });

  useEffect(() => {
    if (!isActive) {
      setAnimatedValues({ leads: 0, meetings: 0, revenue: 0, rate: 0 });
      return;
    }

    const targets = { leads: 247, meetings: 34, revenue: 89, rate: 32 };
    const duration = 1500;
    const steps = 30;
    const interval = duration / steps;

    let step = 0;
    const timer = setInterval(() => {
      step++;
      const progress = step / steps;
      setAnimatedValues({
        leads: Math.round(targets.leads * progress),
        meetings: Math.round(targets.meetings * progress),
        revenue: Math.round(targets.revenue * progress),
        rate: Math.round(targets.rate * progress),
      });
      if (step >= steps) clearInterval(timer);
    }, interval);

    return () => clearInterval(timer);
  }, [isActive]);

  const stats = [
    { label: "Leads", value: animatedValues.leads, suffix: "", color: "text-primary" },
    { label: "Meetings", value: animatedValues.meetings, suffix: "", color: "text-green-400" },
    { label: "Revenue", value: animatedValues.revenue, suffix: "K", prefix: "$", color: "text-yellow-400" },
    { label: "Conv. Rate", value: animatedValues.rate, suffix: "%", color: "text-purple-400" },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        {stats.map((stat, i) => (
          <div key={i} className="bg-background/50 backdrop-blur-sm rounded-lg p-3 border border-border/50 text-center">
            <div className={`text-lg font-bold ${stat.color}`}>
              {stat.prefix}{stat.value}{stat.suffix}
            </div>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="bg-background/50 backdrop-blur-sm rounded-lg p-4 border border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium">Monthly Growth</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {[40, 55, 45, 65, 50, 80, 70, 95].map((height, i) => (
            <div 
              key={i} 
              className="flex-1 bg-gradient-to-t from-primary/80 to-primary/20 rounded-t transition-all duration-500"
              style={{ 
                height: isActive ? `${height}%` : '10%',
                transitionDelay: `${i * 80}ms`
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// Step 6: AI Coach Mockup
const CoachMockup = ({ isActive }: { isActive: boolean }) => {
  const [messages, setMessages] = useState<number[]>([]);

  useEffect(() => {
    if (!isActive) {
      setMessages([]);
      return;
    }

    const delays = [400, 1200, 2000];
    const timeouts = delays.map((delay, i) => 
      setTimeout(() => setMessages(prev => [...prev, i]), delay)
    );

    return () => timeouts.forEach(clearTimeout);
  }, [isActive]);

  const chatMessages = [
    { type: "user", text: "How can I improve my close rate?" },
    { type: "ai", text: "Based on your data, deals with 3+ touchpoints close 40% more often. I recommend adding a discovery call before proposals." },
    { type: "ai", text: "Also, your fastest-closing deals mention ROI within the first email. Consider leading with value metrics." },
  ];

  return (
    <div className="bg-background/50 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">AI Sales Coach</span>
      </div>
      <div className="p-4 space-y-3 min-h-[160px]">
        {chatMessages.map((msg, i) => (
          <div 
            key={i}
            className={`flex transition-all duration-500 ${
              messages.includes(i) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            } ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              msg.type === 'user' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted/50 border border-border/50'
            }`}>
              {msg.type === 'ai' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="text-xs text-primary font-medium">AI Coach</span>
                </div>
              )}
              {msg.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const mockupComponents = [
  AILeadDiscoveryMockup,
  EnrichmentMockup,
  PipelineMockup,
  OutreachMockup,
  AnalyticsMockup,
  CoachMockup,
];

export const Demo = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isVisible, setIsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  // Auto-play functionality
  useEffect(() => {
    if (!isPlaying || !isVisible) return;

    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % demoSteps.length);
    }, 5000);

    return () => clearInterval(interval);
  }, [isPlaying, isVisible]);

  const goToStep = (index: number) => {
    setCurrentStep(index);
    setIsPlaying(false);
  };

  const nextStep = () => {
    setCurrentStep((prev) => (prev + 1) % demoSteps.length);
    setIsPlaying(false);
  };

  const prevStep = () => {
    setCurrentStep((prev) => (prev - 1 + demoSteps.length) % demoSteps.length);
    setIsPlaying(false);
  };

  const CurrentMockup = mockupComponents[currentStep];
  const currentStepData = demoSteps[currentStep];

  return (
    <section ref={sectionRef} id="demo" className="py-24 bg-background relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-6 relative">
        <div className={`text-center mb-12 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            See SalesOS
            <span className="text-gradient-animated"> In Action</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Explore how top sales teams are using SalesOS to close more deals
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Card 
            className={`overflow-hidden bg-card border-border relative transition-all duration-700 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
            }`}
          >
            {/* Header with step info */}
            <div className="flex items-center justify-between p-4 border-b border-border/50 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center">
                  <currentStepData.icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <div>
                  <div className="font-semibold">{currentStepData.title}</div>
                  <div className="text-sm text-muted-foreground">Step {currentStep + 1} of {demoSteps.length}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsPlaying(!isPlaying)}
                className="text-muted-foreground hover:text-foreground"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
            </div>

            {/* Main demo area */}
            <div className="p-6 min-h-[320px] bg-gradient-to-b from-background to-muted/20">
              <div className="mb-4">
                <p className="text-muted-foreground">{currentStepData.description}</p>
              </div>
              <CurrentMockup isActive={isVisible} />
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between p-4 border-t border-border/50 bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={prevStep}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </Button>

              {/* Step indicators */}
              <div className="flex items-center gap-2">
                {demoSteps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToStep(index)}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      index === currentStep
                        ? 'w-6 bg-primary'
                        : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    }`}
                  />
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={nextStep}
                className="flex items-center gap-1"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </Card>

          {/* Feature quick links */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-8">
            {demoSteps.map((step, index) => (
              <button
                key={step.id}
                onClick={() => goToStep(index)}
                className={`p-3 rounded-xl border text-center transition-all duration-300 ${
                  index === currentStep
                    ? 'bg-primary/10 border-primary/50 scale-105'
                    : 'bg-card border-border hover:border-primary/30 hover:bg-muted/50'
                }`}
              >
                <step.icon className={`w-5 h-5 mx-auto mb-1.5 ${
                  index === currentStep ? 'text-primary' : 'text-muted-foreground'
                }`} />
                <div className={`text-xs font-medium truncate ${
                  index === currentStep ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {step.title.split(' ')[0]}
                </div>
              </button>
            ))}
          </div>

          {/* CTA */}
          <div className={`text-center mt-12 transition-all duration-700 delay-500 ${
            isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          }`}>
            <Button size="lg" className="magnetic-btn group">
              Start Free Trial
              <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
            </Button>
            <p className="text-sm text-muted-foreground mt-3">
              No credit card required • 14-day free trial
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
