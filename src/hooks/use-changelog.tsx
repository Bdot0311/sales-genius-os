import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CHANGELOG,
  ROADMAP,
  type ChangelogEntry,
  type ChangelogItem,
  type RoadmapItem,
} from "@/lib/changelog";

/**
 * The changelog, read from the database, falling back to the file it used to
 * live in.
 *
 * The fallback is not defensive padding. This ships before the migration has
 * been applied and before anything has been published, and a What's New page
 * that renders nothing in either of those windows is worse than one showing the
 * entries that were true yesterday. The file is the floor; the database is the
 * thing that moves.
 *
 * Publishing reaches open tabs over realtime, which is the half of "real time"
 * a static file could never do: a customer reading the page when an entry goes
 * live sees it appear.
 */

interface EntryRow {
  id: string;
  entry_date: string;
  title: string;
  summary: string | null;
  items: ChangelogItem[] | null;
}

interface RoadmapRow {
  id: string;
  title: string;
  description: string | null;
  status: RoadmapItem["status"];
}

export interface ChangelogData {
  entries: ChangelogEntry[];
  roadmap: RoadmapItem[];
  /** True while the database answer is still outstanding on first load. */
  loading: boolean;
  /** True when what is on screen is the checked-in file, not the database. */
  usingFallback: boolean;
  latestDate: string;
  refresh: () => void;
}

const rowToEntry = (row: EntryRow): ChangelogEntry => ({
  id: row.id,
  date: row.entry_date,
  title: row.title,
  summary: row.summary ?? "",
  items: Array.isArray(row.items) ? row.items : [],
});

export const useChangelog = (): ChangelogData => {
  const [entries, setEntries] = useState<ChangelogEntry[]>(CHANGELOG);
  const [roadmap, setRoadmap] = useState<RoadmapItem[]>(ROADMAP);
  const [loading, setLoading] = useState(true);
  const [usingFallback, setUsingFallback] = useState(true);

  const load = useCallback(async () => {
    try {
      const [entriesRes, roadmapRes] = await Promise.all([
        supabase
          .from("changelog_entries" as any)
          .select("id, entry_date, title, summary, items")
          .eq("status", "published")
          .order("entry_date", { ascending: false })
          .limit(100),
        supabase
          .from("changelog_roadmap" as any)
          .select("id, title, description, status")
          .eq("visible", true)
          .order("position", { ascending: true })
          .limit(20),
      ]);

      // An error here is the table not existing yet, or RLS saying no. Either
      // way the file is still true, so it stays on screen rather than the page
      // going blank.
      const rows = (entriesRes.data ?? []) as unknown as EntryRow[];
      if (!entriesRes.error && rows.length > 0) {
        setEntries(rows.map(rowToEntry));
        setUsingFallback(false);
      }

      const road = (roadmapRes.data ?? []) as unknown as RoadmapRow[];
      if (!roadmapRes.error && road.length > 0) {
        setRoadmap(
          road.map((r) => ({
            title: r.title,
            description: r.description ?? "",
            status: r.status,
          })),
        );
      }
    } catch {
      /* keep the fallback */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Unique per mount: the header badge and the page both read this, and two
    // channels sharing a name step on each other.
    const channel = supabase
      .channel(`changelog-live-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "changelog_entries" }, () => {
        void load();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "changelog_roadmap" }, () => {
        void load();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const latestDate = entries.reduce((latest, e) => (e.date > latest ? e.date : latest), "");

  return { entries, roadmap, loading, usingFallback, latestDate, refresh: load };
};
