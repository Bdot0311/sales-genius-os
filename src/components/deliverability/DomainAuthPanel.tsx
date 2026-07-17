import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldX, ShieldQuestion, Loader2, Plus, RefreshCw, Trash2, Copy, Ban, Check } from "lucide-react";
import { toast } from "sonner";
import { checkDomainAuth, checkBlacklists, type DomainAuthResult, type BlacklistResult, type AuthStatus } from "@/lib/deliverability-api";
import { useSendingDomains, useAddDomain, useDeleteDomain, useUserId } from "@/hooks/use-deliverability";
import type { SendingDomain } from "@/lib/deliverability-db";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;

const AuthBadge = ({ label, status }: { label: string; status: AuthStatus }) => {
  const map = {
    pass: { icon: <ShieldCheck className="h-3.5 w-3.5" />, cls: "border-green-500/40 text-green-500" },
    fail: { icon: <ShieldX className="h-3.5 w-3.5" />, cls: "border-destructive/40 text-destructive" },
    unknown: { icon: <ShieldQuestion className="h-3.5 w-3.5" />, cls: "border-border text-muted-foreground" },
  }[status];
  return (
    <Badge variant="outline" className={`gap-1 ${map.cls}`}>
      {map.icon}{label} {status === "unknown" ? "unknown" : status}
    </Badge>
  );
};

export const DomainAuthPanel = () => {
  const userId = useUserId();
  const { data: domains = [], isLoading } = useSendingDomains();
  const addDomain = useAddDomain();
  const [input, setInput] = useState("");

  const handleAdd = async () => {
    const domain = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!DOMAIN_RE.test(domain)) { toast.error("Enter a valid domain, e.g. yourcompany.com"); return; }
    if (!userId) { toast.error("Not signed in"); return; }
    try {
      await addDomain.mutateAsync({ userId, domain });
      setInput("");
      toast.success(`Added ${domain}. Run a check to validate SPF, DKIM, and DMARC.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add domain");
    }
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Domain authentication &amp; blacklists</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="yourcompany.com"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button onClick={handleAdd} disabled={addDomain.isPending}>
            {addDomain.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            <span className="ml-1 hidden sm:inline">Add domain</span>
          </Button>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading domains…</p>
        ) : domains.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add your sending domain to validate SPF/DKIM/DMARC and monitor blacklists. All checks
            are live DNS lookups.
          </p>
        ) : (
          <div className="space-y-3">
            {domains.map((d) => <DomainRow key={d.id} domain={d} />)}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const DomainRow = ({ domain }: { domain: SendingDomain }) => {
  const deleteDomain = useDeleteDomain();
  const [auth, setAuth] = useState<DomainAuthResult | null>(null);
  const [blacklist, setBlacklist] = useState<BlacklistResult | null>(null);
  const [checking, setChecking] = useState(false);

  const runChecks = async () => {
    setChecking(true);
    try {
      const [a, b] = await Promise.all([checkDomainAuth(domain.domain), checkBlacklists(domain.domain)]);
      setAuth(a);
      setBlacklist(b);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setChecking(false);
    }
  };

  const spf = auth?.spf.status ?? domain.spf_status;
  const dkim = auth?.dkim.status ?? domain.dkim_status;
  const dmarc = auth?.dmarc.status ?? domain.dmarc_status;
  const recommended = auth?.recommended ?? domain.recommended_records ?? [];

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-sm">{domain.domain}</span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={runChecks} disabled={checking}>
            {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            <span className="ml-1">Check</span>
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteDomain.mutate(domain.id)} aria-label="Remove domain">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <AuthBadge label="SPF" status={spf} />
        <AuthBadge label="DKIM" status={dkim} />
        <AuthBadge label="DMARC" status={dmarc} />
      </div>

      {/* Blacklist results */}
      {blacklist && (
        <div className="mt-3 flex flex-wrap gap-2">
          {blacklist.results.map((r) => (
            <Badge
              key={r.rbl_name}
              variant="outline"
              className={
                r.status === "listed"
                  ? "gap-1 border-destructive/40 text-destructive"
                  : r.status === "clean"
                    ? "gap-1 border-green-500/40 text-green-500"
                    : "gap-1 border-border text-muted-foreground"
              }
              title={r.detail}
            >
              {r.status === "listed" ? <Ban className="h-3 w-3" /> : r.status === "clean" ? <Check className="h-3 w-3" /> : null}
              {r.rbl_name}: {r.status}
            </Badge>
          ))}
        </div>
      )}

      {/* Recommended records */}
      {recommended.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Records to add:</p>
          {recommended.map((rec, i) => (
            <div key={i} className="rounded-md bg-muted/40 p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <code className="truncate">
                  <span className="text-muted-foreground">{rec.type}</span> {rec.host}
                </code>
                <Button
                  size="icon" variant="ghost" className="h-6 w-6 shrink-0"
                  onClick={() => { navigator.clipboard.writeText(rec.value); toast.success("Copied record value"); }}
                  aria-label="Copy record value"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <code className="mt-1 block break-all text-muted-foreground">{rec.value}</code>
              {rec.note && <p className="mt-1 text-muted-foreground/80">{rec.note}</p>}
            </div>
          ))}
        </div>
      )}

      {domain.last_checked_at && !auth && (
        <p className="mt-2 text-xs text-muted-foreground">
          Last checked {new Date(domain.last_checked_at).toLocaleDateString()}. Run a fresh check for current status.
        </p>
      )}
    </div>
  );
};
