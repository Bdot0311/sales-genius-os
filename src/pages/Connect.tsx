import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { FooterSection } from "@/components/landing/FooterSection";
import { SEOHead } from "@/components/seo";
import { Copy, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelHeader, SectionLabel } from "@/components/dashboard/Panel";
import { PUBLIC_API_BASE, PUBLIC_DOCS_URL } from "@/lib/public-api";

const MCP_URL = `${PUBLIC_API_BASE}/mcp`;

/**
 * A numbered sequence.
 *
 * The step number used to sit in a 24px tinted disc, which put a coloured
 * circle beside every line of a page that is almost entirely instructions —
 * twenty of them on one screen. An ordered list already knows how to number
 * itself; the number only has to be readable and aligned.
 */
function StepList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-2.5">
      {items.map((step, i) => (
        <li key={i} className="flex gap-2.5 text-[0.8125rem] leading-relaxed">
          <span className="w-4 shrink-0 pt-px text-right text-[0.6875rem] tabular-nums text-muted-foreground/60">
            {i + 1}
          </span>
          <span className="min-w-0 text-foreground/85">{step}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * The two clients this page walks through, and what to do in each.
 *
 * Held as data rather than written twice in the markup: the setup steps and
 * the refresh steps were four separate hand-built cards, which is how the two
 * halves drifted into different orders and different wording for the same act.
 */
const CLIENTS: { name: string; setup: React.ReactNode[]; refresh: React.ReactNode[] }[] = [
  {
    name: "ChatGPT",
    setup: [
      <>
        Open{" "}
        <a
          href="https://chatgpt.com/#settings/Connectors/Advanced"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Connectors settings
        </a>{" "}
        and enable Developer mode.
      </>,
      <>In the chat composer's "+" menu, turn on Developer mode.</>,
      <>Click "Add sources", then "Connect more".</>,
      <>Name the connector "OutReign" and paste the URL above.</>,
      <>Sign in with your OutReign account and approve access.</>,
      <>Ask it to use OutReign, for example "List my recent replies."</>,
    ],
    refresh: [
      <>Open app preferences and select OutReign under Enabled apps.</>,
      <>Next to "Information", click "Refresh".</>,
      <>If the URL above has changed, paste the latest one.</>,
      <>Start a new chat and ask it to use OutReign.</>,
    ],
  },
  {
    name: "Claude",
    setup: [
      <>
        Open{" "}
        <a
          href="https://claude.ai/customize/connectors?modal=add-custom-connector"
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          custom connectors
        </a>
        .
      </>,
      <>Name the connector "OutReign" and paste the URL above.</>,
      <>Sign in with your OutReign account and approve access.</>,
      <>Enable the connector from the chat composer.</>,
      <>Ask it to use OutReign, for example "Show my pipeline deals."</>,
    ],
    refresh: [
      <>Open your Connectors page and select OutReign.</>,
      <>Refresh or update the connector's tools.</>,
      <>If the URL above has changed, paste the latest one.</>,
      <>Ask it to use OutReign in a new conversation.</>,
    ],
  },
];

export default function Connect() {
  const [copied, setCopied] = useState(false);

  // This page is reachable two ways: from the dashboard sidebar, and from the
  // public footer. It was written for the first audience only — a bare shell
  // with a "Back to dashboard" link — so a visitor arriving from the footer
  // landed somewhere with no navigation and an exit into an authed area they
  // cannot reach. The chrome is now always present; the dashboard link appears
  // only for someone who actually has one.
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (active) setSignedIn(!!session);
    });
    return () => { active = false; };
  }, []);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(MCP_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <SEOHead
        title="Connect OutReign to Claude and other MCP clients"
        description="Add the OutReign MCP server to Claude, Cursor or any MCP client to search prospects and draft outreach from your assistant."
        canonicalUrl="https://outreign.io/connect"
      />
      <div className="min-h-screen bg-background">
        <Navbar />
        <main className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6 sm:pt-28">
          {signedIn && (
            <Link
              to="/dashboard"
              className="mb-6 inline-flex items-center gap-2 text-[0.6875rem] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to dashboard
            </Link>
          )}

          {/* No icon tile beside the heading. A robot in a tinted square next to
              "Connect OutReign to an AI assistant" illustrates the sentence it
              sits beside, which is decoration standing in for an answer. */}
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Connect OutReign to an AI assistant
          </h1>
          <p className="mt-3 max-w-[68ch] text-[0.875rem] leading-relaxed text-muted-foreground">
            Paste the URL below into ChatGPT or Claude to let your assistant read and manage your
            leads, sequences, pipeline and inbox on your behalf. You sign in with your OutReign
            account, and the assistant only ever sees your own data.
          </p>

          {/* The one thing on this page you have to take away with you. */}
          <Panel className="mt-8">
            <PanelHeader title="Your MCP server URL" />
            <PanelBody className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-md border border-border/50 bg-muted/30 px-3 py-2 font-mono text-[0.8125rem] text-foreground">
                {MCP_URL}
              </code>
              <Button onClick={copyUrl} variant="outline" size="sm" className="shrink-0">
                {copied ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                  </>
                )}
              </Button>
            </PanelBody>
          </Panel>

          {/*
            Two clients, two jobs, one surface each.

            This was four free-floating cards in two grids under two bold
            headings, and nothing said which pair was the first thing to do and
            which was the thing to do later. Setting up and refreshing are now
            sections of one panel per client, so a reader follows a column
            rather than hunting across a grid.
          */}
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {CLIENTS.map((client) => (
              <Panel key={client.name} className="flex flex-col">
                <PanelHeader title={client.name} />
                <PanelBody className="space-y-5">
                  <div className="space-y-2.5">
                    <SectionLabel>Set it up</SectionLabel>
                    <StepList items={client.setup} />
                  </div>
                  <div className="space-y-2.5 border-t border-border/30 pt-4">
                    <SectionLabel>Refresh after an update</SectionLabel>
                    <StepList items={client.refresh} />
                  </div>
                </PanelBody>
              </Panel>
            ))}
          </div>

          <p className="mt-4 max-w-[68ch] text-[0.6875rem] leading-relaxed text-muted-foreground">
            Assistants cache the tool list when you first connect, so when we ship new tools or
            change existing ones, refresh the connector to see them.
          </p>
          <a href={`${PUBLIC_DOCS_URL}/developer-docs/mcp/overview`} className="mt-4 inline-flex text-sm text-primary hover:underline">
            MCP documentation and tool reference
          </a>

          <Panel className="mt-10">
            <PanelHeader title="What your assistant can do" />
            <PanelBody className="space-y-3">
              <p className="max-w-[68ch] text-[0.8125rem] leading-relaxed text-foreground/85">
                It can read your leads, sequences, deals, ICP profiles, sent emails, inbox replies
                and agent stats. With your approval it can also create leads, enroll them in
                sequences, queue replies, and update your pipeline and AI SDR configuration.
              </p>
              <p className="max-w-[68ch] text-[0.6875rem] leading-relaxed text-muted-foreground">
                Everything runs as you: the same row-level security rules that apply in the app
                apply here, so your assistant can never reach another account's data.
              </p>
            </PanelBody>
          </Panel>
        </main>
        <FooterSection />
      </div>
    </>
  );
}
