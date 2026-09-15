import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelHeader, EmptyState } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TAG_LABELS, type ChangelogItem, type ChangelogTag, type RoadmapItem } from "@/lib/changelog";

/**
 * Where a merged pull request becomes something customers read.
 *
 * Merges draft themselves into the day's entry through the draft-changelog
 * function; nothing here writes the copy from scratch. This screen exists to be
 * the gate: the previous changelog was generated from PRs with nothing between
 * the model and the customer, and it read exactly like that.
 *
 * So the default action is a skim. Everything is editable, but the common case
 * is reading four lines and pressing Publish.
 */

interface EntryRow {
  id: string;
  entry_date: string;
  title: string;
  summary: string | null;
  items: ChangelogItem[] | null;
  status: "draft" | "published" | "archived";
  source: { prs?: { pr?: number | null; title?: string }[] } | null;
}

interface RoadmapRow {
  id: string;
  title: string;
  description: string | null;
  status: RoadmapItem["status"];
  position: number;
  visible: boolean;
}

const TAGS: ChangelogTag[] = ["billing", "new", "improved", "fixed"];

export const ChangelogTab = () => {
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [roadmap, setRoadmap] = useState<RoadmapRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [e, r] = await Promise.all([
      supabase
        .from("changelog_entries" as any)
        .select("id, entry_date, title, summary, items, status, source")
        .order("entry_date", { ascending: false })
        .limit(50),
      supabase
        .from("changelog_roadmap" as any)
        .select("id, title, description, status, position, visible")
        .order("position", { ascending: true }),
    ]);
    if (e.error) {
      // Before the migration is applied this is the expected answer, and a red
      // toast on every load would train whoever reads it to ignore toasts.
      console.warn("[changelog] entries unavailable:", e.error.message);
    }
    setEntries((e.data ?? []) as unknown as EntryRow[]);
    setRoadmap((r.data ?? []) as unknown as RoadmapRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchEntry = (id: string, patch: Partial<EntryRow>) =>
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  const saveEntry = async (entry: EntryRow, status?: EntryRow["status"]) => {
    setBusy(entry.id);
    const { error } = await supabase
      .from("changelog_entries" as any)
      .update({
        title: entry.title,
        summary: entry.summary ?? "",
        items: entry.items ?? [],
        ...(status ? { status } : {}),
      })
      .eq("id", entry.id);
    setBusy(null);
    if (error) {
      toast.error(`Could not save: ${error.message}`);
      return;
    }
    toast.success(
      status === "published" ? "Published — it's live for customers now" : status === "archived" ? "Withdrawn" : "Saved",
    );
    void load();
  };

  const patchItem = (entry: EntryRow, index: number, patch: Partial<ChangelogItem>) => {
    const items = [...(entry.items ?? [])];
    items[index] = { ...items[index], ...patch };
    patchEntry(entry.id, { items });
  };

  const removeItem = (entry: EntryRow, index: number) =>
    patchEntry(entry.id, { items: (entry.items ?? []).filter((_, i) => i !== index) });

  const addItem = (entry: EntryRow) =>
    patchEntry(entry.id, {
      items: [...(entry.items ?? []), { tag: "improved", title: "", description: "" }],
    });

  const saveRoadmap = async (row: RoadmapRow) => {
    setBusy(row.id);
    const { error } = await supabase
      .from("changelog_roadmap" as any)
      .update({
        title: row.title,
        description: row.description ?? "",
        status: row.status,
        visible: row.visible,
      })
      .eq("id", row.id);
    setBusy(null);
    if (error) toast.error(`Could not save: ${error.message}`);
    else {
      toast.success("Roadmap updated");
      void load();
    }
  };

  const addRoadmapItem = async () => {
    const { error } = await supabase.from("changelog_roadmap" as any).insert({
      title: "New item",
      description: "",
      status: "exploring",
      position: roadmap.length,
    });
    if (error) toast.error(`Could not add: ${error.message}`);
    else void load();
  };

  const deleteRoadmapItem = async (id: string) => {
    const { error } = await supabase.from("changelog_roadmap" as any).delete().eq("id", id);
    if (error) toast.error(`Could not remove: ${error.message}`);
    else void load();
  };

  if (loading) {
    return (
      <Panel>
        <div className="flex items-center gap-2 px-5 py-6 text-[0.8125rem] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading the changelog…
        </div>
      </Panel>
    );
  }

  const drafts = entries.filter((e) => e.status === "draft");
  const live = entries.filter((e) => e.status !== "draft");

  const renderEntry = (entry: EntryRow) => (
    <Panel key={entry.id} className="mb-3">
      <PanelHeader
        title={entry.entry_date}
        meta={
          entry.source?.prs?.length
            ? `from ${entry.source.prs.map((p) => `#${p.pr ?? "?"}`).join(", ")}`
            : "written by hand"
        }
        actions={
          <div className="flex items-center gap-2">
            {entry.status === "draft" ? (
              <>
                <Button size="sm" variant="outline" disabled={busy === entry.id} onClick={() => saveEntry(entry)}>
                  Save
                </Button>
                <Button size="sm" disabled={busy === entry.id} onClick={() => saveEntry(entry, "published")}>
                  {busy === entry.id ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                  Publish
                </Button>
              </>
            ) : (
              <>
                <span className="text-[0.625rem] uppercase tracking-[0.1em] text-emerald-400">
                  {entry.status}
                </span>
                <Button size="sm" variant="outline" disabled={busy === entry.id} onClick={() => saveEntry(entry)}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === entry.id}
                  onClick={() => saveEntry(entry, entry.status === "published" ? "archived" : "published")}
                >
                  {entry.status === "published" ? "Withdraw" : "Republish"}
                </Button>
              </>
            )}
          </div>
        }
      />
      <div className="space-y-3 px-4 py-3 sm:px-5">
        <div className="space-y-1.5">
          <Label className="text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground/60">Title</Label>
          <Input value={entry.title} onChange={(ev) => patchEntry(entry.id, { title: ev.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-[0.625rem] uppercase tracking-[0.1em] text-muted-foreground/60">Summary</Label>
          <Textarea
            rows={2}
            value={entry.summary ?? ""}
            onChange={(ev) => patchEntry(entry.id, { summary: ev.target.value })}
          />
        </div>

        {(entry.items ?? []).map((item, i) => (
          <div
            key={i}
            className={cn(
              "space-y-2 rounded-lg border p-3",
              // Billing is the one thing that must not be published carelessly.
              item.tag === "billing" ? "border-amber-400/40 bg-amber-400/5" : "border-border/40",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Select value={item.tag} onValueChange={(v) => patchItem(entry, i, { tag: v as ChangelogTag })}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAGS.map((t) => (
                    <SelectItem key={t} value={t}>{TAG_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-8 min-w-0 flex-1 text-xs"
                placeholder="What changed, in one line"
                value={item.title}
                onChange={(ev) => patchItem(entry, i, { title: ev.target.value })}
              />
              <Button size="sm" variant="ghost" onClick={() => removeItem(entry, i)} aria-label="Remove item">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <Textarea
              rows={2}
              className="text-xs"
              placeholder="One or two sentences. What can they do now, or what was going wrong."
              value={item.description}
              onChange={(ev) => patchItem(entry, i, { description: ev.target.value })}
            />
            <Input
              className="h-8 text-xs"
              placeholder="/dashboard/… (optional — where to go to use it)"
              value={item.href ?? ""}
              onChange={(ev) => patchItem(entry, i, { href: ev.target.value || undefined })}
            />
            {item.tag === "billing" && (
              <p className="text-[0.625rem] leading-relaxed text-amber-400/90">
                Billing items lead the entry. Say what now costs something and what stays free — a customer
                should not have to infer a charge.
              </p>
            )}
          </div>
        ))}

        <Button size="sm" variant="outline" onClick={() => addItem(entry)}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />Add an item
        </Button>
      </div>
    </Panel>
  );

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">
          Waiting to publish
        </h2>
        {drafts.length === 0 ? (
          <EmptyState
            title="Nothing waiting"
            body="Merged pull requests draft themselves into today's entry. Anything a customer would notice shows up here to review."
          />
        ) : (
          drafts.map(renderEntry)
        )}
      </section>

      <section>
        <h2 className="mb-2 text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/60">
          Published
        </h2>
        {live.length === 0 ? (
          <EmptyState title="Nothing published yet" body="Publish a draft above and it appears for customers immediately." />
        ) : (
          live.map(renderEntry)
        )}
      </section>

      <section>
        <Panel>
          <PanelHeader
            title="Coming next"
            meta="shown above the history on the customer page"
            actions={
              <Button size="sm" variant="outline" onClick={addRoadmapItem}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />Add
              </Button>
            }
          />
          <div>
            {roadmap.length === 0 ? (
              <p className="px-4 py-4 text-[0.6875rem] text-muted-foreground sm:px-5">
                Nothing here yet. Until something is added, the customer page shows the list compiled into the build.
              </p>
            ) : (
              roadmap.map((row, i) => (
                <div key={row.id} className={cn("space-y-2 px-4 py-3 sm:px-5", i > 0 && "border-t border-border/30")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={row.status}
                      onValueChange={(v) =>
                        setRoadmap((prev) =>
                          prev.map((x) => (x.id === row.id ? { ...x, status: v as RoadmapRow["status"] } : x)),
                        )
                      }
                    >
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="building">Building now</SelectItem>
                        <SelectItem value="next">Up next</SelectItem>
                        <SelectItem value="exploring">Exploring</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="h-8 min-w-0 flex-1 text-xs"
                      value={row.title}
                      onChange={(ev) =>
                        setRoadmap((prev) => prev.map((x) => (x.id === row.id ? { ...x, title: ev.target.value } : x)))
                      }
                    />
                    <Button size="sm" variant="outline" disabled={busy === row.id} onClick={() => saveRoadmap(row)}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteRoadmapItem(row.id)} aria-label="Remove">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <Textarea
                    rows={2}
                    className="text-xs"
                    placeholder="What it will do, in the customer's words. No dates."
                    value={row.description ?? ""}
                    onChange={(ev) =>
                      setRoadmap((prev) =>
                        prev.map((x) => (x.id === row.id ? { ...x, description: ev.target.value } : x)),
                      )
                    }
                  />
                </div>
              ))
            )}
          </div>
        </Panel>
      </section>
    </div>
  );
};
