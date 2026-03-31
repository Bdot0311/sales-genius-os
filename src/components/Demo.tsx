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
  Search,
  User,
  Phone,
  Linkedin,
  Globe,
  TrendingUp,
  Zap,
  Rocket,
  ArrowRight,
  CheckCircle2,
  Play,
  Pause,
} from "lucide-react";

const demoSteps = [
  {
    id: 0,
    title: "Search naturally",
    description: "Describe your target customer in plain English instead of fighting filters and boolean logic.",
    icon: Search,
  },
  {
    id: 1,
    title: "Enrich the lead",
    description: "Pull in company and contact context that makes the lead easier to qualify and use.",
    icon: Building2,
  },
  {
    id: 2,
    title: "Move through pipeline",
    description: "Keep deals organized visually so it is obvious what is moving and what is stuck.",
    icon: Kanban,
  },
  {
    id: 3,
    title: "Draft outreach",
    description: "Turn lead context into more relevant outbound messaging without starting from a blank page.",
    icon: Mail,
  },
  {
    id: 4,
    title: "Track performance",
    description: "Review a simple set of metrics that show whether prospecting and outreach are actually working.",
    icon: BarChart3,
  },
  {
    id: 5,
    title: "Get guidance",
    description: "Use AI suggestions as workflow support, not as a replacement for judgment.",
    icon: MessageSquare,
  },
  {
    id: 6,
    title: "Run it live",
    description: "If the workflow fits your team, choose a plan and move from demo mode into real prospecting.",
    icon: Rocket,
  },
];

const SearchMockup = ({ isActive }: { isActive: boolean }) => {
  const [typedText, setTypedText] = useState("");
  const [showResults, setShowResults] = useState(false);
  const fullText = "Find heads of sales at NYC B2B SaaS companies with 10-100 employees hiring SDRs";

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
        setTimeout(() => setShowResults(true), 350);
      }
    }, 22);

    return () => clearInterval(typingInterval);
  }, [isActive]);

  return (
    <div className="space-y-4">
      <div className="bg-background/60 backdrop-blur-sm rounded-xl p-4 border border-border/50">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-primary-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">Plain-English query</p>
            <p className="text-xs text-muted-foreground">Type who you want to reach</p>
          </div>
        </div>
        <div className="bg-muted/40 rounded-lg p-3 min-h-[52px] flex items-center">
          <Search className="w-4 h-4 text-muted-foreground mr-2 flex-shrink-0" />
          <span className="text-sm text-foreground break-words">{typedText}</span>
          <span className={`w-0.5 h-4 bg-primary ml-1 ${isActive ? 'animate-pulse' : 'opacity-0'}`} />
        </div>
      </div>

      <div className={`space-y-2 transition-all duration-500 ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {[
          { name: "Jordan Park", company: "Northline", role: "Head of Sales", fit: "High fit" },
          { name: "Rina Shah", company: "SignalFox", role: "VP Revenue", fit: "Good fit" },
          { name: "Alex Müller", company: "GraphiteIQ", role: "Director of Sales", fit: "Good fit" },
        ].map((lead, i) => (
          <div key={i} className="bg-background/40 backdrop-blur-sm rounded-xl p-3 border border-border/30 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
              <User className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm truncate">{lead.name}</div>
              <div className="text-xs text-muted-foreground truncate">{lead.role} · {lead.company}</div>
            </div>
            <div className="px-2 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
              {lead.fit}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

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
    }, 350);

    return () => clearInterval(interval);
  }, [isActive]);

  const enrichFields = [
    { icon: Building2, label: "Company Size", value: "45 employees", stage: 1 },
    { icon: Globe, label: "Website", value: "northline.io", stage: 2 },
    { icon: Phone, label: "Phone", value: "+1 (555) 123-4567", stage: 3 },
    { icon: Linkedin, label: "LinkedIn", value: "linkedin.com/in/jordan-park", stage: 4 },
  ];

  return (
    <div className="bg-background/60 backdrop-blur-sm rounded-xl p-5 border border-border/50">
      <div className="flex items-center gap-4 mb-4 pb-4 border-b border-border/30">
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
          <User className="w-7 h-7 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-lg truncate">Jordan Park</div>
          <div className="text-sm text-muted-foreground truncate">Head of Sales at Northline</div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 ${
          enrichStage >= 4 ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary animate-pulse'
        }`}>
          {enrichStage >= 4 ? 'Ready' : 'Enriching'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {enrichFields.map((field, i) => (
          <div
            key={i}
            className={`p-3 rounded-xl border transition-all duration-500 ${
              enrichStage >= field.stage ? 'bg-primary/5 border-primary/30' : 'bg-muted/30 border-border/30'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <field.icon className={`w-4 h-4 ${enrichStage >= field.stage ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-xs text-muted-foreground truncate">{field.label}</span>
            </div>
            <div className={`text-sm font-medium transition-all duration-300 ${enrichStage >= field.stage ? 'opacity-100' : 'opacity-0'}`}>
              {field.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const PipelineMockup = ({ isActive }: { isActive: boolean }) => {
  const [dealPosition, setDealPosition] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setDealPosition(0);
      return;
    }

    const timeout = setTimeout(() => setDealPosition(1), 900);
    return () => clearTimeout(timeout);
  }, [isActive]);

  const stages = [
    { name: "Qualified", deals: [{ id: 1, name: "Northline", value: "$25,000" }], color: "bg-blue-500" },
    { name: "Meeting", deals: [{ id: 2, name: "SignalFox", value: "$18,000" }], color: "bg-yellow-500" },
    { name: "Proposal", deals: [], color: "bg-purple-500" },
    { name: "Closed", deals: [{ id: 3, name: "GraphiteIQ", value: "$42,000" }], color: "bg-green-500" },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {stages.map((stage, stageIndex) => (
        <div key={stageIndex}>
          <div className="flex items-center gap-1 mb-2">
            <div className={`w-2 h-2 rounded-full ${stage.color}`} />
            <span className="text-xs font-medium truncate">{stage.name}</span>
          </div>
          <div className="bg-muted/30 rounded-lg p-2 min-h-[110px] border border-border/30 space-y-2">
            {stage.deals.map((deal) => {
              if (deal.id === 1 && stageIndex === 0 && dealPosition === 1) return null;
              if (deal.id === 1 && stageIndex === 1 && dealPosition === 0) return null;

              return (
                <div key={deal.id} className="bg-background/80 rounded-md p-2 border border-border/50 transition-all duration-500">
                  <div className="font-medium text-xs truncate">{deal.name}</div>
                  <div className="text-xs text-primary">{deal.value}</div>
                </div>
              );
            })}
            {stageIndex === 1 && dealPosition === 1 && (
              <div className="bg-background/80 rounded-md p-2 border border-primary/50 shadow-lg shadow-primary/20 animate-fade-in">
                <div className="font-medium text-xs truncate">Northline</div>
                <div className="text-xs text-primary">$25,000</div>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

const OutreachMockup = ({ isActive }: { isActive: boolean }) => {
  const [emailLines, setEmailLines] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setEmailLines(0);
      return;
    }

    const lineInterval = setInterval(() => {
      setEmailLines((prev) => {
        if (prev >= 4) {
          clearInterval(lineInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 300);

    return () => clearInterval(lineInterval);
  }, [isActive]);

  const emailContent = [
    "Hey Jordan — noticed Northline is hiring SDRs and growing the sales team in NYC.",
    "That usually means more pressure to build a repeatable prospecting workflow fast.",
    "SalesOS helps teams describe their ICP in plain English, find better-fit leads, and move into outreach faster.",
    "If helpful, I can show you what that workflow could look like for a team like yours.",
  ];

  return (
    <div className="bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
        <Mail className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">Outreach draft</span>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-primary">
          <Sparkles className="w-3 h-3" />
          Personalized
        </div>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">To:</span>
          <span className="text-foreground truncate">jordan@northline.io</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground flex-shrink-0">Subject:</span>
          <span className="text-foreground truncate">Quick idea for Northline's outbound hiring push</span>
        </div>
        <div className="pt-3 border-t border-border/30 space-y-2">
          {emailContent.map((line, i) => (
            <p key={i} className={`text-sm transition-all duration-300 ${i < emailLines ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              {line}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
};

const AnalyticsMockup = ({ isActive }: { isActive: boolean }) => {
  const [animatedValues, setAnimatedValues] = useState({ leads: 0, meetings: 0, revenue: 0, rate: 0 });

  useEffect(() => {
    if (!isActive) {
      setAnimatedValues({ leads: 0, meetings: 0, revenue: 0, rate: 0 });
      return;
    }

    const targets = { leads: 247, meetings: 34, revenue: 89, rate: 32 };
    const duration = 1200;
    const steps = 24;
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats.map((stat, i) => (
          <div key={i} className="bg-background/60 backdrop-blur-sm rounded-lg p-3 border border-border/50 text-center">
            <div className={`text-lg font-bold ${stat.color}`}>{stat.prefix}{stat.value}{stat.suffix}</div>
            <div className="text-xs text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="bg-background/60 backdrop-blur-sm rounded-lg p-4 border border-border/50">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium">Monthly growth</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {[40, 55, 45, 65, 50, 80, 70, 95].map((height, i) => (
            <div
              key={i}
              className="flex-1 bg-gradient-to-t from-primary/80 to-primary/20 rounded-t transition-all duration-500"
              style={{ height: isActive ? `${height}%` : '10%', transitionDelay: `${i * 70}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const CoachMockup = ({ isActive }: { isActive: boolean }) => {
  const [messages, setMessages] = useState<number[]>([]);

  useEffect(() => {
    if (!isActive) {
      setMessages([]);
      return;
    }

    const delays = [250, 800, 1350];
    const timeouts = delays.map((delay, i) => setTimeout(() => setMessages((prev) => [...prev, i]), delay));
    return () => timeouts.forEach(clearTimeout);
  }, [isActive]);

  const chatMessages = [
    { type: "user", text: "Where are deals slowing down?" },
    { type: "ai", text: "Most friction is between first reply and booked meeting. Teams usually improve this by tightening follow-up timing and CTA clarity." },
    { type: "ai", text: "Your best-fit leads also mention concrete ROI earlier. Consider pushing that higher in the outreach sequence." },
  ];

  return (
    <div className="bg-background/60 backdrop-blur-sm rounded-xl border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/30 bg-muted/30">
        <MessageSquare className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">AI workflow guidance</span>
      </div>
      <div className="p-4 space-y-3 min-h-[180px]">
        {chatMessages.map((msg, i) => (
          <div key={i} className={`flex transition-all duration-500 ${messages.includes(i) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'} ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.type === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted/50 border border-border/50'}`}>
              {msg.type === 'ai' && (
                <div className="flex items-center gap-1.5 mb-1">
                  <Sparkles className="w-3 h-3 text-primary" />
                  <span className="text-xs text-primary font-medium">AI guidance</span>
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

const EndScreenMockup = ({ isActive }: { isActive: boolean }) => {
  const [showElements, setShowElements] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setShowElements(0);
      return;
    }

    const timers = [
      setTimeout(() => setShowElements(1), 180),
      setTimeout(() => setShowElements(2), 420),
      setTimeout(() => setShowElements(3), 680),
    ];

    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  const benefits = [
    "Plain-English lead discovery",
    "Lead enrichment and prioritization",
    "Personalized outreach workflow",
    "Clearer pipeline visibility",
  ];

  return (
    <div className="space-y-6 text-center py-4">
      <div className={`transition-all duration-500 ${showElements >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <img src="/salesos-logo-small.webp" alt="SalesOS" width="64" height="64" className="h-16 w-auto mx-auto mb-4" />
        <h3 className="text-2xl md:text-3xl font-bold mb-2">Ready to run the workflow live?</h3>
        <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
          If the product motion makes sense, pick the SalesOS plan that matches your prospecting volume and team size.
        </p>
      </div>

      <div className={`flex flex-wrap justify-center gap-3 transition-all duration-500 ${showElements >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {benefits.map((benefit, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            <span className="text-sm font-medium">{benefit}</span>
          </div>
        ))}
      </div>

      <div className={`flex items-center justify-center pt-2 transition-all duration-500 ${showElements >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <a href="/pricing" className="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-accent text-primary-foreground font-semibold px-8 py-3 rounded-xl hover:opacity-90 transition-opacity shadow-lg shadow-primary/25">
          View plans
          <ArrowRight className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
};

const mockupComponents = [
  SearchMockup,
  EnrichmentMockup,
  PipelineMockup,
  OutreachMockup,
  AnalyticsMockup,
  CoachMockup,
  EndScreenMockup,
];

export const Demo = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [stepProgress, setStepProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepDuration = 4200;

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setIsVisible(true);
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isPlaying || !isVisible) {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
      return;
    }

    setStepProgress(0);
    const startTime = Date.now();

    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / stepDuration) * 100, 100);
      setStepProgress(progress);
    }, 40);

    autoAdvanceRef.current = setTimeout(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep((prev) => (prev + 1) % demoSteps.length);
        setIsTransitioning(false);
      }, 220);
    }, stepDuration);

    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [currentStep, isPlaying, isVisible]);

  const goToStep = (index: number) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(index);
      setIsTransitioning(false);
    }, 220);
  };

  const nextStep = () => goToStep((currentStep + 1) % demoSteps.length);
  const prevStep = () => goToStep((currentStep - 1 + demoSteps.length) % demoSteps.length);

  const CurrentMockup = mockupComponents[currentStep];
  const currentStepData = demoSteps[currentStep];

  return (
    <section ref={sectionRef} id="demo" className="py-10 sm:py-14 md:py-20 bg-background relative overflow-hidden transition-all duration-500">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-primary/3 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-primary/2 rounded-full blur-[100px]" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative">
        <div className="mx-auto max-w-5xl">
          <Card className={`overflow-hidden bg-card border-border relative transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'} rounded-2xl sm:rounded-3xl`}>
            <div className="h-1 bg-muted/30 relative overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-100 ease-linear" style={{ width: `${stepProgress}%` }} />
            </div>

            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border/50 bg-muted/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                  <currentStepData.icon className="w-5 h-5 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-base truncate">{currentStepData.title}</div>
                  <div className="text-sm text-muted-foreground">Step {currentStep + 1} of {demoSteps.length}</div>
                </div>
              </div>

              <Button variant="ghost" size="sm" onClick={() => setIsPlaying((prev) => !prev)} className="flex items-center gap-2">
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                <span className="hidden sm:inline">{isPlaying ? 'Pause' : 'Auto-play'}</span>
              </Button>
            </div>

            <div className="p-4 sm:p-6 md:p-8 bg-gradient-to-b from-background to-muted/20 relative overflow-hidden min-h-[360px] sm:min-h-[420px] md:min-h-[460px]">
              <div className="mb-5 sm:mb-6">
                <p className="text-sm sm:text-base text-muted-foreground max-w-2xl">{currentStepData.description}</p>
              </div>
              <div className={`transition-all duration-300 ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                <CurrentMockup isActive={isVisible && !isTransitioning} />
              </div>
            </div>

            <div className="border-t border-border/50 bg-muted/30">
              <div className="px-3 sm:px-4 pt-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  {demoSteps.map((step, index) => (
                    <button
                      key={step.id}
                      onClick={() => goToStep(index)}
                      className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-300 ${
                        index === currentStep ? 'bg-primary/15 scale-[1.02]' : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors ${
                        index === currentStep
                          ? 'bg-primary text-primary-foreground'
                          : index < currentStep
                          ? 'bg-primary/30 text-primary'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        <step.icon className="w-4 h-4" />
                      </div>
                      <span className={`text-[10px] sm:text-xs font-medium text-center leading-tight ${index === currentStep ? 'text-primary' : 'text-muted-foreground'}`}>
                        {step.title}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4">
                <Button variant="ghost" size="sm" onClick={prevStep} className="flex items-center gap-1.5">
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Previous</span>
                </Button>

                <span className="text-xs sm:text-sm text-muted-foreground">{currentStep + 1} / {demoSteps.length}</span>

                <Button variant="ghost" size="sm" onClick={nextStep} className="flex items-center gap-1.5">
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
};
