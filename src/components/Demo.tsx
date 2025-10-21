import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useState } from "react";

export const Demo = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <section id="demo" className="py-24 bg-background relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            See SalesOS
            <span className="bg-gradient-primary bg-clip-text text-transparent"> In Action</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Watch how top sales teams are using SalesOS to close more deals
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <Card className="overflow-hidden bg-card border-border relative group">
            {!isPlaying ? (
              <div 
                className="relative aspect-video bg-gradient-hero cursor-pointer"
                onClick={() => setIsPlaying(true)}
              >
                {/* Simulated video thumbnail */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20" />
                  <div className="relative">
                    <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                      <Play className="w-10 h-10 text-white ml-1" fill="white" />
                    </div>
                  </div>
                </div>

                {/* Fake UI elements */}
                <div className="absolute inset-0 p-8">
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 max-w-md">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-primary" />
                      <div>
                        <div className="h-3 bg-white/20 rounded w-32 mb-1" />
                        <div className="h-2 bg-white/20 rounded w-24" />
                      </div>
                    </div>
                    <div className="h-2 bg-white/20 rounded w-full mb-2" />
                    <div className="h-2 bg-white/20 rounded w-3/4" />
                  </div>

                  <div className="absolute bottom-8 right-8 bg-white/10 backdrop-blur-sm rounded-lg p-4 max-w-xs">
                    <div className="flex items-center justify-between mb-2">
                      <div className="h-3 bg-white/20 rounded w-24" />
                      <div className="h-6 w-16 bg-gradient-primary rounded" />
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
                    className="mt-4 text-white"
                    onClick={() => setIsPlaying(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            )}
          </Card>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <Card className="p-6 bg-card border-border text-center">
              <div className="text-3xl font-bold text-primary mb-2">2:30</div>
              <p className="text-sm text-muted-foreground">Quick overview of key features</p>
            </Card>
            <Card className="p-6 bg-card border-border text-center">
              <div className="text-3xl font-bold text-primary mb-2">Live</div>
              <p className="text-sm text-muted-foreground">Real customer workflows</p>
            </Card>
            <Card className="p-6 bg-card border-border text-center">
              <div className="text-3xl font-bold text-primary mb-2">+ROI</div>
              <p className="text-sm text-muted-foreground">See the revenue impact</p>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
};
