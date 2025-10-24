import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Mic, Send, TrendingUp, Target, Lightbulb } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const Coach = () => {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!input.trim()) return;

    setLoading(true);
    try {
      // Placeholder for AI coaching functionality
      toast({
        title: "AI Coach",
        description: "AI coaching functionality coming soon!",
      });
      setInput("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">AI Sales Coach</h1>
          <p className="text-muted-foreground">
            Get personalized coaching and insights to improve your sales performance
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary" />
                Performance
              </CardTitle>
              <CardDescription>Your recent sales metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Close Rate</span>
                  <Badge variant="outline">32%</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Avg Deal Size</span>
                  <Badge variant="outline">$45K</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Response Time</span>
                  <Badge variant="outline">2.3h</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" />
                Goals
              </CardTitle>
              <CardDescription>Your current objectives</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Monthly Quota</span>
                  <Badge className="bg-green-500">75%</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">New Leads</span>
                  <Badge className="bg-yellow-500">60%</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Follow-ups</span>
                  <Badge className="bg-green-500">90%</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-primary" />
                Recommendations
              </CardTitle>
              <CardDescription>AI-powered insights</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p>• Focus on enterprise leads this week</p>
                <p>• Follow up with 3 high-value prospects</p>
                <p>• Schedule demos for Tuesday afternoon</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Ask Your AI Coach</CardTitle>
            <CardDescription>
              Get personalized advice, practice objection handling, or analyze your sales calls
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Practice objection handling
                </Button>
                <Button variant="outline" size="sm">
                  Analyze my last call
                </Button>
                <Button variant="outline" size="sm">
                  Improve my pitch
                </Button>
              </div>

              <Textarea
                placeholder="Type your question or describe a sales scenario you need help with..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="min-h-[120px]"
              />

              <div className="flex gap-2">
                <Button
                  onClick={handleSubmit}
                  disabled={loading || !input.trim()}
                  className="flex-1"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Get Coaching
                </Button>
                <Button variant="outline" size="icon">
                  <Mic className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="mt-6 p-4 bg-accent/50 rounded-lg">
              <h4 className="font-semibold mb-2">Example Questions:</h4>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• "How do I handle price objections for enterprise deals?"</li>
                <li>• "What's the best way to follow up after a demo?"</li>
                <li>• "Help me prepare for a call with a CFO"</li>
                <li>• "Review my email template for cold outreach"</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Coach;
