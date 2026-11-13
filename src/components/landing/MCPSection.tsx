import { Link } from "react-router-dom";
import { ArrowRight, Bot, Search, MailCheck, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";

const CAPABILITIES = [
  { icon: Search, title: "Find prospects", text: "Search people and companies that match your ICP from your assistant." },
  { icon: MailCheck, title: "Verify emails", text: "Check deliverability before anything reaches a prospect." },
  { icon: PenLine, title: "Research and draft", text: "Pull account research and draft outreach saved to your Unified Inbox." },
  { icon: Bot, title: "Your limits apply", text: "Same sign-in, plan limits and credits as the app. Nothing sends without your action." },
];

export const MCPSection = () => (
  <section id="mcp" aria-labelledby="mcp-heading" className="relative py-20 md:py-28">
    <div className="container mx-auto px-6 max-w-5xl">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <p className="text-xs uppercase tracking-[0.2em] text-primary mb-4">MCP server</p>
        <h2 id="mcp-heading" className="font-display text-3xl md:text-5xl leading-tight mb-5">
          Run OutReign from ChatGPT, Claude or Cursor
        </h2>
        <p className="text-muted-foreground text-base md:text-lg">
          OutReign ships an MCP (Model Context Protocol) server. Connect it to any MCP-compatible AI assistant and prospect, verify and draft outreach without opening the dashboard.
        </p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        {CAPABILITIES.map(({ icon: Icon, title, text }) => (
          <li key={title} className="rounded-xl border border-border bg-card/40 p-5">
            <Icon className="h-5 w-5 text-primary mb-3" aria-hidden="true" />
            <h3 className="font-medium mb-1.5">{title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
          </li>
        ))}
      </ul>
      <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
        <Button asChild size="lg">
          <Link to="/connect">Connect your AI assistant <ArrowRight className="ml-1 h-4 w-4" /></Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="https://docs.outreign.io" target="_blank" rel="noopener noreferrer">Read the MCP docs</a>
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground mt-4">API and MCP access are included on Starter, Growth and Pro plans.</p>
    </div>
  </section>
);
