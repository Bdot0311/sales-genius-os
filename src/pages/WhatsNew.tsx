import { useEffect } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles, Wrench, Bug, Clock } from "lucide-react";
import { CHANGELOG, TAG_LABELS, type ChangelogTag } from "@/lib/changelog";
import { useWhatsNew } from "@/hooks/use-whats-new";

const tagStyles: Record<ChangelogTag, string> = {
  new: "border-primary/40 bg-primary/10 text-primary",
  improved: "border-sky-500/40 bg-sky-500/10 text-sky-400",
  fixed: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
  coming: "border-amber-500/40 bg-amber-500/10 text-amber-400",
};

const tagIcons: Record<ChangelogTag, typeof Sparkles> = {
  new: Sparkles,
  improved: Wrench,
  fixed: Bug,
  coming: Clock,
};

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

const WhatsNew = () => {
  const { markSeen } = useWhatsNew();

  useEffect(() => {
    markSeen();
  }, [markSeen]);

  return (
    <DashboardLayout>
      <title>What's New | OutReign</title>
      <meta
        name="description"
        content="Everything we've shipped in OutReign recently, plus what's coming next."
      />

      <PageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "What's new" }]}
        title="What's new"
        description="Everything we've shipped recently, and a look at what's coming next."
      />
      <div className="mx-auto w-full max-w-3xl space-y-6 pt-4">

        <div className="space-y-5">
          {CHANGELOG.map((entry) => (
            <Card key={entry.id} id={entry.id}>
              <CardHeader className="space-y-2 pb-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {formatDate(entry.date)}
                </p>
                <CardTitle className="text-lg sm:text-xl">{entry.title}</CardTitle>
                <p className="text-sm text-muted-foreground">{entry.summary}</p>
              </CardHeader>
              <CardContent className="space-y-4">
                {entry.items.map((item) => {
                  const Icon = tagIcons[item.tag];
                  return (
                    <div key={item.title} className="flex gap-3">
                      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{item.title}</p>
                          <Badge variant="outline" className={`text-[10px] ${tagStyles[item.tag]}`}>
                            {TAG_LABELS[item.tag]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default WhatsNew;
