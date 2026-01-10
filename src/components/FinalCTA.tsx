import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export const FinalCTA = () => {
  const navigate = useNavigate();

  return (
    <section className="py-16 sm:py-20 bg-foreground text-background">
      <div className="container mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4">
            Try SalesOS for 14 days
          </h2>
          <p className="text-background/70 mb-8 leading-relaxed">
            Full access to everything. No credit card required. 
            If it doesn't work for you, nothing happens.
          </p>
          <Button 
            size="lg"
            className="bg-background text-foreground hover:bg-background/90 font-medium px-8"
            onClick={() => navigate('/pricing')}
          >
            Start free trial
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </section>
  );
};
