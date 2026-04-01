import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, Send, CheckCircle } from "lucide-react";

interface AILeadCommandProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
  resultsCount?: number;
  showResults?: boolean;
}

const allExampleCommands = [
  "Founders in financial services in the United States",
  "VP of Sales at healthcare companies in California",
  "CTOs at ecommerce companies in New York",
  "Directors of Marketing at technology companies in London",
  "C-suite executives at manufacturing companies in Germany",
  "Engineering managers at software companies in San Francisco",
  "Heads of Business Development in United Kingdom",
  "CFOs at retail companies in Canada",
  "VP of Product at media companies in Australia",
  "Marketing directors at pharmaceutical companies in Boston",
  "CEOs at consulting firms in Chicago",
  "Directors of Engineering at telecommunications companies",
];

// Show 4 random examples each time
const getRandomExamples = () => {
  const shuffled = [...allExampleCommands].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, 4);
};

export const AILeadCommand = ({ 
  onSearch, 
  isSearching, 
  resultsCount = 0,
  showResults = false 
}: AILeadCommandProps) => {
  const [command, setCommand] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [showSteps, setShowSteps] = useState([false, false, false]);
  const [exampleCommands] = useState(() => getRandomExamples());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showResults && resultsCount > 0) {
      const timers = [
        setTimeout(() => setShowSteps([true, false, false]), 300),
        setTimeout(() => setShowSteps([true, true, false]), 600),
        setTimeout(() => setShowSteps([true, true, true]), 900),
      ];
      return () => timers.forEach(clearTimeout);
    } else {
      setShowSteps([false, false, false]);
    }
  }, [showResults, resultsCount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (command.trim() && !isSearching) {
      onSearch(command.trim());
    }
  };

  const handleExampleClick = (example: string) => {
    setCommand(example);
    inputRef.current?.focus();
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 overflow-hidden">
      <CardContent className="p-6">
        {/* Terminal Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-2 text-xs text-muted-foreground font-mono">ai-lead-generator</span>
          <Badge variant="secondary" className="ml-auto text-xs">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered
          </Badge>
        </div>

        {/* Command Input */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div 
            className={`relative flex items-center gap-2 p-3 bg-background/50 border rounded-lg transition-all duration-200 ${
              isFocused ? 'border-primary ring-2 ring-primary/20' : 'border-border/50'
            }`}
          >
            <span className="text-primary font-mono shrink-0">→</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Describe the leads you're looking for..."
              className="flex-1 bg-transparent border-none outline-none font-mono text-sm text-foreground placeholder:text-muted-foreground"
              disabled={isSearching}
            />
            <Button 
              type="submit" 
              size="sm" 
              variant="hero"
              disabled={!command.trim() || isSearching}
              className="shrink-0"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Example Commands */}
          {!showResults && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Try these examples:</p>
              <div className="flex flex-wrap gap-2">
                {exampleCommands.map((example, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleExampleClick(example)}
                    className="px-2.5 py-1 text-xs bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md transition-colors border border-transparent hover:border-border"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
        </form>

        {/* Results Animation */}
        {(isSearching || showResults) && (
          <div className="mt-4 pt-4 border-t border-border/50 space-y-2 font-mono text-sm">
            {isSearching && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Searching B2B data sources...</span>
              </div>
            )}
            
            {showResults && !isSearching && (
              <>
                <div 
                  className={`flex items-center gap-2 transition-all duration-300 ${showSteps[0] ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                >
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-muted-foreground">
                    Found <span className="text-primary font-semibold">{resultsCount}</span> qualified leads
                  </span>
                </div>
                <div 
                  className={`flex items-center gap-2 transition-all duration-300 ${showSteps[1] ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                >
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-muted-foreground">ICP scores calculated</span>
                </div>
                <div 
                  className={`flex items-center gap-2 transition-all duration-300 ${showSteps[2] ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}
                >
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-muted-foreground">Ready to activate</span>
                </div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
