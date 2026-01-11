import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef, useCallback } from "react";
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
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AudioLines,
  Zap
} from "lucide-react";


// Audio timestamps (in seconds) - synced to podcast script
const SLIDE_TIMESTAMPS = [
  0,      // Slide 0: Intro - "The sales industry is undergoing a significant transformation..."
  22.31,  // Slide 1: AI Lead Discovery - "AI lead discovery is changing the game..."
  55,     // Slide 2: Smart Enrichment - "Once leads are identified, smart enrichment takes over..."
  88,     // Slide 3: Pipeline Management - "Pipeline management has been reimagined..."
  126,    // Slide 4: AI Outreach Studio - "The AI Outreach Stud is perhaps one of the most exciting..."
  170,    // Slide 5: Analytics Dashboard - "To keep track of performance..."
  205,    // Slide 6: AI Sales Coach - "The AI sales coach offers intelligent recommendations..."
];

// Captions matching the podcast script
const SLIDE_CAPTIONS = [
  "The sales industry is undergoing a significant transformation, thanks to the integration of artificial intelligence. These innovations are streamlining processes and providing sales teams with powerful tools to improve their performance.",
  "AI lead discovery is changing the game. Gone are the days of complex filters. Now, sales professionals can simply type what they're looking for using natural language, and the AI does the rest.",
  "Once leads are identified, smart enrichment takes over. This feature automatically enhances each lead with crucial data—company size, contact details, and social profiles—providing a 360-degree view of prospects.",
  "Pipeline management has been reimagined for maximum visibility and control. The drag-and-drop interface allows sales teams to easily move deals across different stages, making it easier to identify bottlenecks and prioritize opportunities.",
  "The AI Outreach Studio leverages artificial intelligence to generate personalized emails designed to convert. The AI analyzes each lead's profile and recent company news to craft messages that resonate.",
  "The analytics dashboard provides real-time insights into key metrics. Sales teams can monitor leads, meetings, revenue, and conversion rates all in one place for more informed decision-making.",
  "The AI sales coach offers intelligent recommendations to help close more deals faster. This virtual mentor provides actionable insights based on historical data, market trends, and best practices.",
];

const demoSteps = [
  {
    id: 0,
    title: "AI-Powered Sales",
    description: "Revolutionizing how sales teams work with intelligent automation.",
    icon: Zap,
    audioStart: SLIDE_TIMESTAMPS[0],
    caption: SLIDE_CAPTIONS[0],
  },
  {
    id: 1,
    title: "AI Lead Discovery",
    description: "Find your ideal customers with natural language. Just describe who you're looking for.",
    icon: Sparkles,
    audioStart: SLIDE_TIMESTAMPS[1],
    caption: SLIDE_CAPTIONS[1],
  },
  {
    id: 2,
    title: "Smart Enrichment",
    description: "Automatically enrich leads with company data, contact info, and social profiles.",
    icon: Building2,
    audioStart: SLIDE_TIMESTAMPS[2],
    caption: SLIDE_CAPTIONS[2],
  },
  {
    id: 3,
    title: "Pipeline Management",
    description: "Visualize your deals across stages with drag-and-drop kanban boards.",
    icon: Kanban,
    audioStart: SLIDE_TIMESTAMPS[3],
    caption: SLIDE_CAPTIONS[3],
  },
  {
    id: 4,
    title: "AI Outreach Studio",
    description: "Generate personalized emails that convert using AI-powered content.",
    icon: Mail,
    audioStart: SLIDE_TIMESTAMPS[4],
    caption: SLIDE_CAPTIONS[4],
  },
  {
    id: 5,
    title: "Analytics Dashboard",
    description: "Track performance with real-time metrics and actionable insights.",
    icon: BarChart3,
    audioStart: SLIDE_TIMESTAMPS[5],
    caption: SLIDE_CAPTIONS[5],
  },
  {
    id: 6,
    title: "AI Sales Coach",
    description: "Get intelligent recommendations to close more deals faster.",
    icon: MessageSquare,
    audioStart: SLIDE_TIMESTAMPS[6],
    caption: SLIDE_CAPTIONS[6],
  },
];

// Intro Slide Mockup
const IntroMockup = ({ isActive }: { isActive: boolean }) => {
  const [showElements, setShowElements] = useState(0);

  useEffect(() => {
    if (!isActive) {
      setShowElements(0);
      return;
    }

    const intervals = [500, 1000, 1500, 2000];
    const timers = intervals.map((delay, i) => 
      setTimeout(() => setShowElements(i + 1), delay)
    );

    return () => timers.forEach(clearTimeout);
  }, [isActive]);

  const features = [
    { icon: Sparkles, label: "AI Lead Discovery" },
    { icon: Building2, label: "Smart Enrichment" },
    { icon: Kanban, label: "Pipeline Management" },
    { icon: Mail, label: "AI Outreach" },
  ];

  return (
    <div className="flex flex-col items-center justify-center h-full space-y-4 sm:space-y-6 py-4">
      <div className={`transition-all duration-700 ${showElements >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center mx-auto mb-3 sm:mb-4 animate-pulse">
          <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-primary-foreground" />
        </div>
        <h3 className="text-lg sm:text-2xl font-bold text-center bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          The Future of Sales
        </h3>
        <p className="text-xs sm:text-sm text-muted-foreground text-center mt-1 sm:mt-2 max-w-xs mx-auto">
          AI-powered tools transforming how teams sell
        </p>
      </div>
      
      <div className={`grid grid-cols-2 gap-2 sm:gap-3 w-full max-w-xs transition-all duration-700 ${showElements >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {features.map((feature, i) => (
          <div 
            key={i}
            className={`bg-background/40 backdrop-blur-sm rounded-lg p-2 sm:p-3 border border-border/40 flex items-center gap-2 transition-all duration-500 ${
              showElements >= 3 + Math.floor(i / 2) ? 'opacity-100 scale-100' : 'opacity-50 scale-95'
            }`}
            style={{ transitionDelay: `${i * 100}ms` }}
          >
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <feature.icon className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
            </div>
            <span className="text-[10px] sm:text-xs font-medium truncate">{feature.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

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
    <div className="space-y-3 sm:space-y-4">
      <div className="bg-background/50 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-4 border border-border/50">
        <div className="flex items-center gap-2 sm:gap-3 mb-2 sm:mb-3">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-primary-foreground" />
          </div>
          <span className="text-xs sm:text-sm text-muted-foreground">AI Command</span>
        </div>
        <div className="bg-muted/50 rounded-lg p-2 sm:p-3 min-h-[40px] sm:min-h-[48px] flex items-center">
          <Search className="w-3 h-3 sm:w-4 sm:h-4 text-muted-foreground mr-2 flex-shrink-0" />
          <span className="text-foreground text-xs sm:text-sm break-words">{typedText}</span>
          <span className={`w-0.5 h-4 sm:h-5 bg-primary ml-1 flex-shrink-0 ${isActive ? 'animate-pulse' : 'opacity-0'}`} />
        </div>
      </div>

      <div className={`space-y-2 transition-all duration-500 ${showResults ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        {[
          { name: "Sarah Johnson", company: "TechFlow", role: "Founder & CEO" },
          { name: "Marcus Chen", company: "DataSync", role: "Co-founder" },
        ].map((lead, i) => (
          <div 
            key={i} 
            className="bg-background/30 backdrop-blur-sm rounded-lg p-2 sm:p-3 border border-border/30 flex items-center gap-2 sm:gap-3 transition-all duration-300"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium text-xs sm:text-sm truncate">{lead.name}</div>
              <div className="text-[10px] sm:text-xs text-muted-foreground truncate">{lead.role} at {lead.company}</div>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-primary/10 flex items-center justify-center">
                <Linkedin className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary" />
              </div>
              <div className="w-5 h-5 sm:w-6 sm:h-6 rounded bg-primary/10 flex items-center justify-center">
                <Mail className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary" />
              </div>
            </div>
          </div>
        ))}
        <div className="text-center text-[10px] sm:text-xs text-muted-foreground pt-1 sm:pt-2">
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
    <div className="bg-background/50 backdrop-blur-sm rounded-lg sm:rounded-xl p-3 sm:p-5 border border-border/50">
      <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-4 pb-3 sm:pb-4 border-b border-border/30">
        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg sm:rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 sm:w-7 sm:h-7 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm sm:text-lg truncate">Sarah Johnson</div>
          <div className="text-xs sm:text-sm text-muted-foreground truncate">Founder & CEO at TechFlow</div>
        </div>
        <div className="flex-shrink-0">
          <div className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-medium transition-all duration-300 ${
            enrichStage >= 4 ? 'bg-green-500/20 text-green-400' : 'bg-primary/20 text-primary animate-pulse'
          }`}>
            {enrichStage >= 4 ? '✓ Enriched' : 'Enriching...'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {enrichFields.map((field, i) => (
          <div 
            key={i}
            className={`p-2 sm:p-3 rounded-lg border transition-all duration-500 ${
              enrichStage >= field.stage 
                ? 'bg-primary/5 border-primary/30' 
                : 'bg-muted/30 border-border/30'
            }`}
          >
            <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
              <field.icon className={`w-3 h-3 sm:w-4 sm:h-4 transition-colors flex-shrink-0 ${
                enrichStage >= field.stage ? 'text-primary' : 'text-muted-foreground'
              }`} />
              <span className="text-[10px] sm:text-xs text-muted-foreground truncate">{field.label}</span>
            </div>
            <div className={`text-xs sm:text-sm font-medium transition-all duration-300 truncate ${
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
    { name: "Qualified", deals: [{ id: 1, name: "TechFl...", value: "$25,000" }], color: "bg-blue-500" },
    { name: "Meeting", deals: [{ id: 2, name: "DataSy...", value: "$18,000" }], color: "bg-yellow-500" },
    { name: "Proposal", deals: [], color: "bg-purple-500" },
    { name: "Closed", deals: [{ id: 3, name: "CloudB...", value: "$42,000" }], color: "bg-green-500" },
  ];

  return (
    <div className="grid grid-cols-4 gap-1 sm:gap-2">
      {stages.map((stage, stageIndex) => (
        <div key={stageIndex} className="min-w-0">
          <div className="flex items-center gap-1 mb-1 sm:mb-2">
            <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full flex-shrink-0 ${stage.color}`} />
            <span className="text-[9px] sm:text-xs font-medium truncate">{stage.name}</span>
          </div>
          <div className="bg-muted/30 rounded-md sm:rounded-lg p-1 sm:p-2 min-h-[60px] sm:min-h-[100px] border border-border/30 space-y-1 sm:space-y-2">
            {stage.deals.map((deal) => {
              const isMoving = movingDeal === deal.id;
              
              if (deal.id === 1 && stageIndex === 0 && dealPosition === 1) return null;
              if (deal.id === 1 && stageIndex === 1 && dealPosition === 0) return null;

              return (
                <div 
                  key={deal.id}
                  className={`bg-background/80 rounded sm:rounded-md p-1 sm:p-2 border border-border/50 transition-all duration-500 ${
                    isMoving ? 'scale-105 shadow-lg shadow-primary/20 border-primary/50' : ''
                  }`}
                >
                  <div className="font-medium text-[8px] sm:text-xs truncate">{deal.name}</div>
                  <div className="text-[8px] sm:text-xs text-primary">{deal.value}</div>
                </div>
              );
            })}
            {stages[1].deals.length === 1 && stageIndex === 1 && dealPosition === 1 && (
              <div 
                className="bg-background/80 rounded sm:rounded-md p-1 sm:p-2 border border-primary/50 shadow-lg shadow-primary/20 animate-fade-in"
              >
                <div className="font-medium text-[8px] sm:text-xs truncate">TechFl...</div>
                <div className="text-[8px] sm:text-xs text-primary">$25,000</div>
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
    <div className="bg-background/50 backdrop-blur-sm rounded-lg sm:rounded-xl border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/30 bg-muted/30">
        <Mail className="w-3 h-3 sm:w-4 sm:h-4 text-primary flex-shrink-0" />
        <span className="text-xs sm:text-sm font-medium">AI-Generated Email</span>
        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary animate-pulse" />
          <span className="text-[10px] sm:text-xs text-muted-foreground">Personalized</span>
        </div>
      </div>
      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <span className="text-muted-foreground">To:</span>
          <span className="text-foreground truncate">sarah@techflow.io</span>
        </div>
        <div className="flex items-center gap-2 text-xs sm:text-sm">
          <span className="text-muted-foreground flex-shrink-0">Subject:</span>
          <span className="text-foreground truncate">Quick question about TechFlow</span>
        </div>
        <div className={`pt-2 sm:pt-3 border-t border-border/30 space-y-1.5 sm:space-y-2 transition-opacity duration-300 ${showEmail ? 'opacity-100' : 'opacity-0'}`}>
          {emailContent.map((line, i) => (
            <p 
              key={i}
              className={`text-xs sm:text-sm transition-all duration-300 ${
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
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
        {stats.map((stat, i) => (
          <div key={i} className="bg-background/50 backdrop-blur-sm rounded-md sm:rounded-lg p-2 sm:p-3 border border-border/50 text-center">
            <div className={`text-sm sm:text-lg font-bold ${stat.color}`}>
              {stat.prefix}{stat.value}{stat.suffix}
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">{stat.label}</div>
          </div>
        ))}
      </div>
      <div className="bg-background/50 backdrop-blur-sm rounded-md sm:rounded-lg p-3 sm:p-4 border border-border/50">
        <div className="flex items-center gap-2 mb-2 sm:mb-3">
          <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-green-400" />
          <span className="text-xs sm:text-sm font-medium">Monthly Growth</span>
        </div>
        <div className="flex items-end gap-0.5 sm:gap-1 h-12 sm:h-16">
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
    <div className="bg-background/50 backdrop-blur-sm rounded-lg sm:rounded-xl border border-border/50 overflow-hidden">
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-3 border-b border-border/30 bg-muted/30">
        <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4 text-primary" />
        <span className="text-xs sm:text-sm font-medium">AI Sales Coach</span>
      </div>
      <div className="p-3 sm:p-4 space-y-2 sm:space-y-3 min-h-[120px] sm:min-h-[160px]">
        {chatMessages.map((msg, i) => (
          <div 
            key={i}
            className={`flex transition-all duration-500 ${
              messages.includes(i) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
            } ${msg.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[90%] sm:max-w-[85%] rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 text-xs sm:text-sm ${
              msg.type === 'user' 
                ? 'bg-primary text-primary-foreground' 
                : 'bg-muted/50 border border-border/50'
            }`}>
              {msg.type === 'ai' && (
                <div className="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                  <Sparkles className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-primary" />
                  <span className="text-[10px] sm:text-xs text-primary font-medium">AI Coach</span>
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
  IntroMockup,
  AILeadDiscoveryMockup,
  EnrichmentMockup,
  PipelineMockup,
  OutreachMockup,
  AnalyticsMockup,
  CoachMockup,
];

// Audio waveform visualization component
const AudioWaveform = ({ isPlaying }: { isPlaying: boolean }) => {
  return (
    <div className="flex items-center gap-0.5 h-4">
      {[0.4, 0.7, 0.5, 0.9, 0.6, 0.8, 0.5].map((height, i) => (
        <div
          key={i}
          className={`w-0.5 bg-primary rounded-full transition-all duration-150 ${
            isPlaying ? 'animate-pulse' : ''
          }`}
          style={{
            height: isPlaying ? `${height * 100}%` : '20%',
            animationDelay: `${i * 100}ms`,
          }}
        />
      ))}
    </div>
  );
};

export const Demo = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [stepProgress, setStepProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Local podcast audio file
  const PODCAST_AUDIO_URL = "/audio/demo-podcast.mp3";
  
  // Duration per slide = time between timestamps (or 15s default)
  const getStepDuration = useCallback((stepIndex: number) => {
    const currentStart = SLIDE_TIMESTAMPS[stepIndex] || 0;
    const nextStart = SLIDE_TIMESTAMPS[stepIndex + 1];
    if (nextStart !== undefined) {
      return (nextStart - currentStart) * 1000; // Convert to ms
    }
    return 15000; // Default 15 seconds for last slide
  }, []);

  // Start/resume audio playback at specific timestamp
  const startAudio = useCallback((seekToStep?: number) => {
    if (isMuted) return;

    if (!audioRef.current) {
      const audio = new Audio(PODCAST_AUDIO_URL);
      audio.loop = false; // Don't loop - we'll handle slide transitions
      audioRef.current = audio;

      audio.onplay = () => setIsAudioPlaying(true);
      audio.onpause = () => setIsAudioPlaying(false);
      audio.onended = () => setIsAudioPlaying(false);
      audio.onerror = () => setIsAudioPlaying(false);
    }

    // Seek to the correct timestamp for the current slide
    if (seekToStep !== undefined) {
      const timestamp = SLIDE_TIMESTAMPS[seekToStep] || 0;
      audioRef.current.currentTime = timestamp;
    }

    audioRef.current.play().catch((error) => {
      console.error("Audio playback failed:", error);
    });
  }, [isMuted]);

  // Pause audio playback
  const pauseAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);


  // Intersection observer
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

  // Progress bar animation
  useEffect(() => {
    if (!isPlaying || !isVisible) {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      return;
    }

    const stepDuration = getStepDuration(currentStep);
    setStepProgress(0);
    const startTime = Date.now();

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / stepDuration) * 100, 100);
      setStepProgress(progress);
    }, 50);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [currentStep, isPlaying, isVisible, getStepDuration]);

  // Auto-advance steps synced with audio timestamps
  useEffect(() => {
    if (!isPlaying || !isVisible) return;

    const stepDuration = getStepDuration(currentStep);

    const timeout = setTimeout(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        const nextStep = (currentStep + 1) % demoSteps.length;
        setCurrentStep(nextStep);
        setIsTransitioning(false);
        // Seek audio to the next slide's timestamp
        if (audioRef.current && !isMuted) {
          audioRef.current.currentTime = SLIDE_TIMESTAMPS[nextStep] || 0;
        }
      }, 300);
    }, stepDuration);

    return () => clearTimeout(timeout);
  }, [isPlaying, isVisible, currentStep, getStepDuration, isMuted]);

  // No longer needed - we use a single podcast audio that plays continuously

  // Handle mute toggle and play state - sync audio to current step
  useEffect(() => {
    if (isMuted || !isPlaying) {
      pauseAudio();
    } else if (isPlaying && !isMuted) {
      startAudio(currentStep);
    }
  }, [isMuted, isPlaying, startAudio, pauseAudio]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Fullscreen handling
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (!isPlaying) {
      setIsPlaying(true);
      if (!isMuted) {
        startAudio(currentStep);
      }
    } else {
      setIsPlaying(false);
      pauseAudio();
    }
  }, [isPlaying, isMuted, startAudio, pauseAudio, currentStep]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        document.exitFullscreen();
      } else if (e.key === ' ') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'm') {
        setIsMuted(prev => !prev);
      } else if (e.key === 'ArrowRight') {
        nextStep();
      } else if (e.key === 'ArrowLeft') {
        prevStep();
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [isFullscreen, handleTogglePlay]);

  const goToStep = (index: number) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(index);
      setIsTransitioning(false);
      // Seek audio to the selected slide's timestamp
      if (audioRef.current) {
        audioRef.current.currentTime = SLIDE_TIMESTAMPS[index] || 0;
      }
      if (isPlaying && !isMuted) {
        startAudio(index);
      }
    }, 300);
  };

  const nextStep = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      const next = (currentStep + 1) % demoSteps.length;
      setCurrentStep(next);
      setIsTransitioning(false);
      // Seek audio to the next slide's timestamp
      if (audioRef.current) {
        audioRef.current.currentTime = SLIDE_TIMESTAMPS[next] || 0;
      }
      if (isPlaying && !isMuted) {
        startAudio(next);
      }
    }, 300);
  };

  const prevStep = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      const prev = (currentStep - 1 + demoSteps.length) % demoSteps.length;
      setCurrentStep(prev);
      setIsTransitioning(false);
      // Seek audio to the previous slide's timestamp
      if (audioRef.current) {
        audioRef.current.currentTime = SLIDE_TIMESTAMPS[prev] || 0;
      }
      if (isPlaying && !isMuted) {
        startAudio(prev);
      }
    }, 300);
  };

  const CurrentMockup = mockupComponents[currentStep];
  const currentStepData = demoSteps[currentStep];

  return (
    <section 
      ref={sectionRef} 
      id="demo" 
      className={`py-12 sm:py-16 md:py-24 bg-background relative overflow-hidden transition-all duration-500 ${
        isFullscreen ? 'fixed inset-0 z-50 py-0 flex items-center justify-center bg-black' : ''
      }`}
    >
      {/* Background accent */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div 
        ref={containerRef}
        className={`container mx-auto px-4 sm:px-6 relative ${
          isFullscreen ? 'max-w-6xl w-full h-full flex flex-col justify-center' : ''
        }`}
      >
        {!isFullscreen && (
          <div className={`text-center mb-8 sm:mb-12 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="inline-flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-full px-4 py-1.5 mb-4">
              <Play className="w-3 h-3 text-primary" />
              <span className="text-xs font-medium text-primary">Watch Demo</span>
            </div>
            <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-3 sm:mb-4">
              See SalesOS
              <span className="text-gradient-animated"> In Action</span>
            </h2>
            <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-2">
              Explore how top sales teams are using SalesOS to close more deals
            </p>
          </div>
        )}

        <div className={`mx-auto ${isFullscreen ? 'w-full max-w-5xl' : 'max-w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl'}`}>
          <Card 
            className={`overflow-hidden bg-card border-border relative transition-all duration-700 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
            } ${isFullscreen ? 'border-0 rounded-none bg-black/95' : ''}`}
          >
            {/* Video-like progress bar */}
            <div className="h-1 bg-muted/30 relative overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-100 ease-linear"
                style={{ width: `${stepProgress}%` }}
              />
              {/* Step markers */}
              <div className="absolute inset-0 flex">
                {demoSteps.map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 border-r border-background/50 last:border-r-0 ${
                      i < currentStep ? 'bg-primary/30' : ''
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Header with step info */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border/50 bg-muted/30">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center flex-shrink-0">
                  <currentStepData.icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm sm:text-base truncate">{currentStepData.title}</div>
                  <div className="text-xs sm:text-sm text-muted-foreground">Step {currentStep + 1} of {demoSteps.length}</div>
                </div>
              </div>
              
              {/* Control buttons */}
              <div className="flex items-center gap-1 sm:gap-2">
                {/* Audio indicator */}
                {isAudioPlaying && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-full mr-1">
                    <AudioLines className="w-3 h-3 text-primary" />
                    <AudioWaveform isPlaying={isAudioPlaying} />
                  </div>
                )}
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsMuted(!isMuted)}
                  className="text-muted-foreground hover:text-foreground h-8 w-8"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleTogglePlay}
                  className="text-muted-foreground hover:text-foreground h-8 w-8"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleFullscreen}
                  className="text-muted-foreground hover:text-foreground h-8 w-8 hidden sm:flex"
                >
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {/* Main demo area */}
            <div className={`p-4 sm:p-6 bg-gradient-to-b from-background to-muted/20 relative ${
              isFullscreen ? 'min-h-[400px] sm:min-h-[500px]' : 'min-h-[280px] sm:min-h-[300px] md:min-h-[320px]'
            }`}>
              <div className="mb-3 sm:mb-4">
                <p className="text-sm sm:text-base text-muted-foreground">{currentStepData.description}</p>
              </div>
              <div className={`transition-all duration-300 ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                <CurrentMockup isActive={isVisible && !isTransitioning} />
              </div>
              
              {/* Synced captions overlay */}
              {isPlaying && !isMuted && currentStepData.caption && (
                <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 sm:right-6">
                  <div className={`bg-black/80 backdrop-blur-sm rounded-lg px-3 py-2 sm:px-4 sm:py-3 transition-all duration-500 ${
                    isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
                  }`}>
                    <p className="text-white text-xs sm:text-sm leading-relaxed text-center">
                      {currentStepData.caption}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-t border-border/50 bg-muted/30">
              <Button
                variant="ghost"
                size="sm"
                onClick={prevStep}
                className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3"
              >
                <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
                <span className="hidden xs:inline">Previous</span>
              </Button>

              {/* Step indicators */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                {demoSteps.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToStep(index)}
                    className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                      index === currentStep
                        ? 'w-6 sm:w-8 bg-primary'
                        : index < currentStep
                        ? 'w-1.5 sm:w-2 bg-primary/50'
                        : 'w-1.5 sm:w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    }`}
                  />
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={nextStep}
                className="flex items-center gap-1 text-xs sm:text-sm px-2 sm:px-3"
              >
                <span className="hidden xs:inline">Next</span>
                <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </Button>
            </div>
          </Card>

          {/* Feature quick links */}
          {!isFullscreen && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 sm:gap-3 mt-6 sm:mt-8">
              {demoSteps.map((step, index) => (
                <button
                  key={step.id}
                  onClick={() => goToStep(index)}
                  className={`p-2 sm:p-3 rounded-lg sm:rounded-xl border text-center transition-all duration-300 ${
                    index === currentStep
                      ? 'bg-primary/10 border-primary/50 scale-105'
                      : 'bg-card border-border hover:border-primary/30 hover:bg-muted/50'
                  }`}
                >
                  <step.icon className={`w-4 h-4 sm:w-5 sm:h-5 mx-auto mb-1 sm:mb-1.5 ${
                    index === currentStep ? 'text-primary' : 'text-muted-foreground'
                  }`} />
                  <div className={`text-[10px] sm:text-xs font-medium truncate ${
                    index === currentStep ? 'text-primary' : 'text-muted-foreground'
                  }`}>
                    {step.title.split(' ')[0]}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Keyboard shortcuts hint */}
          {isFullscreen && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 text-xs text-muted-foreground bg-black/50 rounded-full px-4 py-2">
              <span><kbd className="bg-muted/30 px-1.5 py-0.5 rounded">Space</kbd> Play/Pause</span>
              <span><kbd className="bg-muted/30 px-1.5 py-0.5 rounded">M</kbd> Mute</span>
              <span><kbd className="bg-muted/30 px-1.5 py-0.5 rounded">←</kbd><kbd className="bg-muted/30 px-1.5 py-0.5 rounded ml-0.5">→</kbd> Navigate</span>
              <span><kbd className="bg-muted/30 px-1.5 py-0.5 rounded">Esc</kbd> Exit</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
