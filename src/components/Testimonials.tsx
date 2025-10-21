import { Card } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Star } from "lucide-react";

const testimonials = [
  {
    name: "Sarah Chen",
    role: "VP of Sales, TechFlow",
    image: "SC",
    rating: 5,
    text: "SalesOS increased our qualified meetings by 3.2x in the first month. The AI outreach is incredibly effective - our response rates jumped from 8% to 24%."
  },
  {
    name: "Marcus Rodriguez",
    role: "Founder, GrowthLabs",
    image: "MR",
    rating: 5,
    text: "The automation workflows alone save us 15+ hours per week. We closed our first $100K deal using insights from the AI sales coach."
  },
  {
    name: "Emily Watson",
    role: "Sales Director, CloudScale",
    image: "EW",
    rating: 5,
    text: "Best sales tool we've ever used. The lead scoring is scary accurate - we're now focusing on leads that actually convert. ROI was positive within 3 weeks."
  },
  {
    name: "David Kim",
    role: "CEO, DataPeak",
    image: "DK",
    rating: 5,
    text: "SalesOS transformed how we sell. The analytics dashboard gives us insights we never had before. Our team's productivity has doubled."
  }
];

const stats = [
  { value: "3.2x", label: "Increase in qualified meetings" },
  { value: "24%", label: "Average email response rate" },
  { value: "15+", label: "Hours saved per week" },
  { value: "500+", label: "Companies using SalesOS" }
];

export const Testimonials = () => {
  return (
    <section id="testimonials" className="py-24 bg-background relative">
      <div className="container mx-auto px-6">
        {/* Stats Section */}
        <div className="mb-24">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">
              Proven Results Across
              <span className="bg-gradient-primary bg-clip-text text-transparent"> 500+ Companies</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Real metrics from real sales teams
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-5xl md:text-6xl font-bold bg-gradient-primary bg-clip-text text-transparent mb-2">
                  {stat.value}
                </div>
                <p className="text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials Section */}
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            What Sales Leaders
            <span className="bg-gradient-primary bg-clip-text text-transparent"> Are Saying</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Join hundreds of sales teams closing more deals with SalesOS
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {testimonials.map((testimonial, index) => (
            <Card 
              key={index}
              className="p-8 bg-card border-border hover:border-primary/50 transition-all duration-300 hover:shadow-glow"
            >
              <div className="flex items-center gap-4 mb-4">
                <Avatar className="w-12 h-12 bg-gradient-primary flex items-center justify-center text-white font-semibold">
                  {testimonial.image}
                </Avatar>
                <div className="flex-1">
                  <div className="font-semibold">{testimonial.name}</div>
                  <div className="text-sm text-muted-foreground">{testimonial.role}</div>
                </div>
                <div className="flex gap-1">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                  ))}
                </div>
              </div>
              <p className="text-muted-foreground">{testimonial.text}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};
