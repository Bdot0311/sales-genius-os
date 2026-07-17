import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check, ArrowLeft, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const MCP_URL = "https://mcp.outreign.io/mcp";

function StepList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((step, i) => (
        <li key={i} className="flex gap-3 text-sm text-muted-foreground leading-relaxed">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/15 text-primary font-medium text-xs flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-foreground/90">{step}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Connect() {
  const [copied, setCopied] = useState(false);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(MCP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to dashboard
        </Link>

        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Connect OutReign to an AI assistant
          </h1>
        </div>
        <p className="text-muted-foreground mb-8 max-w-2xl">
          Paste the URL below into ChatGPT or Claude to let your assistant read and manage your
          leads, sequences, pipeline, and inbox on your behalf. You'll sign in with your OutReign
          account, and the assistant only sees your data.
        </p>

        {/* MCP URL */}
        <Card className="p-5 mb-8 border-primary/30 bg-primary/5">
          <div className="text-xs uppercase tracking-wide text-primary font-medium mb-2">
            Your MCP server URL
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-sm font-mono bg-background border border-border rounded-md px-3 py-2 truncate">
              {MCP_URL}
            </code>
            <Button
              onClick={copyUrl}
              variant="secondary"
              size="sm"
              className="flex-shrink-0"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-1" /> Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-1" /> Copy
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Connect */}
        <h2 className="text-xl font-semibold mb-4">Connect</h2>
        <div className="grid md:grid-cols-2 gap-4 mb-10">
          <Card className="p-5">
            <div className="font-medium mb-3">ChatGPT</div>
            <StepList
              items={[
                <>
                  Open{" "}
                  <a
                    href="https://chatgpt.com/#settings/Connectors/Advanced"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    ChatGPT Connectors settings
                  </a>{" "}
                  and enable Developer mode.
                </>,
                <>In the chat composer's "+" menu, turn on Developer mode.</>,
                <>Click "Add sources", then "Connect more".</>,
                <>Name the connector "OutReign" and paste the URL above.</>,
                <>Sign in with your OutReign account and approve access.</>,
                <>Ask ChatGPT to use OutReign — e.g. "List my recent replies."</>,
              ]}
            />
          </Card>

          <Card className="p-5">
            <div className="font-medium mb-3">Claude</div>
            <StepList
              items={[
                <>
                  Open{" "}
                  <a
                    href="https://claude.ai/customize/connectors?modal=add-custom-connector"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Claude custom connectors
                  </a>
                  .
                </>,
                <>Name the connector "OutReign" and paste the URL above.</>,
                <>Sign in with your OutReign account and approve access.</>,
                <>Enable the connector from the chat composer.</>,
                <>Ask Claude to use OutReign — e.g. "Show my pipeline deals."</>,
              ]}
            />
          </Card>
        </div>

        {/* Refresh */}
        <h2 className="text-xl font-semibold mb-2">Refresh after OutReign changes</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
          Assistants cache the tool list when you first connect. If we ship new tools or update
          existing ones, refresh the connector so your assistant sees the latest.
        </p>
        <div className="grid md:grid-cols-2 gap-4 mb-10">
          <Card className="p-5">
            <div className="font-medium mb-3">ChatGPT</div>
            <StepList
              items={[
                <>Open ChatGPT's app preferences and select OutReign under Enabled apps.</>,
                <>Next to "Information", click "Refresh".</>,
                <>If the URL above has changed, paste the latest one.</>,
                <>Start a new chat and ask ChatGPT to use OutReign.</>,
              ]}
            />
          </Card>

          <Card className="p-5">
            <div className="font-medium mb-3">Claude</div>
            <StepList
              items={[
                <>Open your Connectors page and select OutReign.</>,
                <>Refresh or update the connector's tools.</>,
                <>If the URL above has changed, paste the latest one.</>,
                <>Ask Claude to use OutReign in a new conversation.</>,
              ]}
            />
          </Card>
        </div>

        <Card className="p-5 bg-muted/30">
          <div className="text-sm text-muted-foreground">
            Once connected, your assistant can read your leads, sequences, deals, ICP profiles,
            sent emails, inbox replies, and agent stats — and, with your approval, create leads,
            enroll them in sequences, queue replies, and update your pipeline and AI SDR
            configuration. Everything runs as you: your row-level security rules apply.
          </div>
        </Card>
      </div>
    </div>
  );
}
