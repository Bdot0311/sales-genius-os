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
  AudioLines
} from "lucide-react";
import { toast } from "sonner";

// Voiceover scripts for each step
const voiceoverScripts = [
  "Just type what you're looking for. Find fifty SaaS founders in Europe, and watch the AI do the rest. No more complex filters. Just natural language.",
  "Every lead gets enriched automatically. Company size, contact details, social profiles. All the intel you need, in seconds.",
  "Drag and drop your deals across stages. See your entire pipeline at a glance. Never lose track of an opportunity again.",
  "Generate personalized emails that convert. Our AI crafts messages based on each lead's profile, company news, and your winning templates.",
  "Track every metric that matters. Real-time insights into leads, meetings, revenue, and conversion rates. Data-driven decisions, made easy.",
  "Get intelligent recommendations from your AI coach. Actionable insights to help you close more deals, faster."
];

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
  const [audioLoading, setAudioLoading] = useState(false);
  const [stepProgress, setStepProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicUrlRef = useRef<string | null>(null);
  const audioCache = useRef<Map<number, string>>(new Map());
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const BACKGROUND_MUSIC_VOLUME = 0.15; // Soft background volume
  
  const STEP_DURATION = 10000; // 10 seconds per step

  // Fetch voiceover audio for a step
  const fetchAudio = useCallback(async (stepIndex: number): Promise<string | null> => {
    if (audioCache.current.has(stepIndex)) {
      return audioCache.current.get(stepIndex) || null;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-demo-tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text: voiceoverScripts[stepIndex] }),
        }
      );

      if (!response.ok) {
        console.error("TTS request failed:", response.status);
        return null;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      audioCache.current.set(stepIndex, audioUrl);
      return audioUrl;
    } catch (error) {
      // Silently fail - demo works without voiceover
      return null;
    }
  }, []);

  // Play audio for current step
  const playStepAudio = useCallback(async (stepIndex: number) => {
    if (isMuted) return;

    // Stop current audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    setAudioLoading(true);
    const audioUrl = await fetchAudio(stepIndex);
    setAudioLoading(false);

    if (audioUrl && !isMuted) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      
      audio.onplay = () => setIsAudioPlaying(true);
      audio.onended = () => setIsAudioPlaying(false);
      audio.onerror = () => setIsAudioPlaying(false);
      
      try {
        await audio.play();
      } catch (error) {
        console.error("Audio playback failed:", error);
      }
    }
  }, [isMuted, fetchAudio]);

  // Pre-fetch next step audio
  useEffect(() => {
    if (isVisible && !isMuted) {
      const nextStep = (currentStep + 1) % demoSteps.length;
      fetchAudio(nextStep);
    }
  }, [currentStep, isVisible, isMuted, fetchAudio]);

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

    setStepProgress(0);
    const startTime = Date.now();

    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min((elapsed / STEP_DURATION) * 100, 100);
      setStepProgress(progress);
    }, 50);

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, [currentStep, isPlaying, isVisible]);

  // Auto-play with transitions
  useEffect(() => {
    if (!isPlaying || !isVisible) return;

    // Play audio for current step
    playStepAudio(currentStep);

    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentStep((prev) => (prev + 1) % demoSteps.length);
        setIsTransitioning(false);
      }, 300);
    }, STEP_DURATION);

    return () => clearInterval(interval);
  }, [isPlaying, isVisible, currentStep, playStepAudio]);

  // Fetch and play background music
  const fetchAndPlayBgMusic = useCallback(async () => {
    if (bgMusicUrlRef.current) {
      // Already have music, just play it
      if (bgMusicRef.current) {
        bgMusicRef.current.volume = BACKGROUND_MUSIC_VOLUME;
        bgMusicRef.current.loop = true;
        try {
          await bgMusicRef.current.play();
        } catch (e) {
          console.error("Failed to play background music:", e);
        }
      }
      return;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-demo-music`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ 
            prompt: "Soft ambient corporate background music, modern technology feel, subtle and unobtrusive, smooth electronic, minimal beats, professional atmosphere",
            duration: 60 
          }),
        }
      );

      if (!response.ok) {
        console.error("Background music request failed:", response.status);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      bgMusicUrlRef.current = audioUrl;
      
      const audio = new Audio(audioUrl);
      audio.volume = BACKGROUND_MUSIC_VOLUME;
      audio.loop = true;
      bgMusicRef.current = audio;
      
      if (!isMuted && isPlaying) {
        await audio.play();
      }
    } catch (error) {
      // Silently fail - demo works without background music
    }
  }, [isMuted, isPlaying]);

  // Start/stop background music based on play state
  useEffect(() => {
    if (isPlaying && isVisible && !isMuted) {
      fetchAndPlayBgMusic();
    } else if (bgMusicRef.current) {
      bgMusicRef.current.pause();
    }
  }, [isPlaying, isVisible, isMuted, fetchAndPlayBgMusic]);

  // Handle mute toggle
  useEffect(() => {
    if (isMuted) {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsAudioPlaying(false);
      }
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
      }
    } else if (isPlaying && bgMusicRef.current) {
      bgMusicRef.current.play().catch(() => {});
    }
  }, [isMuted, isPlaying]);

  // Cleanup background music on unmount
  useEffect(() => {
    return () => {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
        bgMusicRef.current = null;
      }
      if (bgMusicUrlRef.current) {
        URL.revokeObjectURL(bgMusicUrlRef.current);
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        document.exitFullscreen();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
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
  }, [isFullscreen]);

  const goToStep = (index: number) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(index);
      setIsTransitioning(false);
      setIsPlaying(false);
      playStepAudio(index);
    }, 300);
  };

  const nextStep = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep((prev) => (prev + 1) % demoSteps.length);
      setIsTransitioning(false);
      setIsPlaying(false);
    }, 300);
  };

  const prevStep = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep((prev) => (prev - 1 + demoSteps.length) % demoSteps.length);
      setIsTransitioning(false);
      setIsPlaying(false);
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
                {(isAudioPlaying || audioLoading) && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-primary/10 rounded-full mr-1">
                    <AudioLines className={`w-3 h-3 text-primary ${audioLoading ? 'animate-pulse' : ''}`} />
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
                  onClick={() => setIsPlaying(!isPlaying)}
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
            <div className={`p-4 sm:p-6 bg-gradient-to-b from-background to-muted/20 ${
              isFullscreen ? 'min-h-[400px] sm:min-h-[500px]' : 'min-h-[280px] sm:min-h-[300px] md:min-h-[320px]'
            }`}>
              <div className="mb-3 sm:mb-4">
                <p className="text-sm sm:text-base text-muted-foreground">{currentStepData.description}</p>
              </div>
              <div className={`transition-all duration-300 ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                <CurrentMockup isActive={isVisible && !isTransitioning} />
              </div>
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
