import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useState, useEffect, useRef } from "react";

export const Demo = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [cardsVisible, setCardsVisible] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setIsVisible(true);
          setTimeout(() => setCardsVisible(true), 500);
        }
      },
      { threshold: 0.2 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} id="demo" className="py-24 bg-background relative overflow-hidden">
      {/* Background accent */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-6 relative">
        <div className={`text-center mb-16 transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            See SalesOS
            <span className="text-gradient-animated"> In Action</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Watch how top sales teams are using SalesOS to close more deals
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Card 
            className={`overflow-hidden bg-card border-border relative group card-interactive transition-all duration-700 delay-200 ${
              isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'
            }`}
          >
            {!isPlaying ? (
              <div 
                className="relative aspect-video bg-gradient-hero cursor-pointer overflow-hidden"
                onClick={() => setIsPlaying(true)}
              >
                {/* Animated gradient background */}
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 animate-gradient-shift" />
                
                {/* Shimmer effect */}
                <div className="absolute inset-0 animate-shimmer" />
                
                {/* Play button */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    {/* Pulse rings */}
                    <div className="absolute inset-0 w-20 h-20 rounded-full bg-white/20 animate-ping" style={{ animationDuration: '2s' }} />
                    <div className="relative w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 group-hover:bg-white/20 transition-all duration-300">
                      <Play className="w-10 h-10 text-white ml-1" fill="white" />
                    </div>
                  </div>
                </div>

                {/* Fake UI elements with animations */}
                <div className="absolute inset-0 p-8">
                  <div className={`bg-white/10 backdrop-blur-sm rounded-lg p-4 max-w-md transition-all duration-700 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'}`} style={{ transitionDelay: '400ms' }}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-primary animate-pulse" />
                      <div>
                        <div className="h-3 bg-white/20 rounded w-32 mb-1" />
                        <div className="h-2 bg-white/20 rounded w-24" />
                      </div>
                    </div>
                    <div className="h-2 bg-white/20 rounded w-full mb-2" />
                    <div className="h-2 bg-white/20 rounded w-3/4" />
                  </div>

                  <div className={`absolute bottom-8 right-8 bg-white/10 backdrop-blur-sm rounded-lg p-4 max-w-xs transition-all duration-700 ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'}`} style={{ transitionDelay: '600ms' }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="h-3 bg-white/20 rounded w-24" />
                      <div className="h-6 w-16 bg-gradient-primary rounded animate-pulse" />
                    </div>
                    <div className="h-2 bg-white/20 rounded w-full mb-1" />
                    <div className="h-2 bg-white/20 rounded w-2/3" />
                  </div>
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-black flex items-center justify-center">
                <div className="text-center text-white">
                  <div className="w-16 h-16 rounded-full bg-gradient-primary mx-auto mb-4 animate-pulse" />
                  <p className="text-lg">Demo video would play here</p>
                  <p className="text-sm text-white/60 mt-2">Integration with your video hosting service</p>
                  <Button 
                    variant="ghost" 
                    className="mt-4 text-white magnetic-btn"
                    onClick={() => setIsPlaying(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {[
              { value: "2:30", label: "Quick overview of key features" },
              { value: "Live", label: "Real customer workflows" },
              { value: "+ROI", label: "See the revenue impact" }
            ].map((item, index) => (
              <Card 
                key={index}
                className={`p-6 bg-card border-border text-center card-interactive transition-all duration-500 ${
                  cardsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
                }`}
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <div className="text-3xl font-bold text-gradient-animated mb-2">{item.value}</div>
                <p className="text-sm text-muted-foreground">{item.label}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
