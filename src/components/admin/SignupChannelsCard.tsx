/**
 * Self-reported acquisition: what new users answer to "Where did you find
 * OutReign?" in the signup questionnaire. Unlike the visitor log this survives
 * referrer stripping, so it's the only honest read on word-of-mouth channels.
 *
 * Shows the channel roll-up plus every individual respondent, with the ability
 * to correct a mis-tagged channel or drop a junk/bot answer.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DISCOVERY_OPTIONS } from "@/lib/onboarding-questions";

type ChannelRow = { channel: string; signups: number; last_signup: string | null };

type ResponseRow = {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  channel: string;
  discovery_channel: string | null;
  discovery_channel_other: string | null;
  role: string | null;
  company_type: string | null;
  team_size: string | null;
  goals: string[] | null;
  current_tooling: string | null;
  monthly_prospect_volume: string | null;
  completed_at: string | null;
  created_at: string;
};

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

export const SignupChannelsCard = () => {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [editing, setEditing] = useState<ResponseRow | null>(null);
  const [editChannel, setEditChannel] = useState<string>("");
  const [editOther, setEditOther] = useState("");
  const [deleting, setDeleting] = useState<ResponseRow | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [summary, detail] = await Promise.all([
      supabase.rpc("admin_get_signup_channels"),
      (supabase as any).rpc("admin_list_signup_responses", { _limit: 500 }),
    ]);
    if (summary.error) {
      toast.error(`Could not load signup channels: ${summary.error.message}`);
      setRows([]);
    } else {
      setRows((summary.data ?? []) as ChannelRow[]);
    }
    if (detail.error) {
      toast.error(`Could not load respondents: ${detail.error.message}`);
      setResponses([]);
    } else {
      setResponses((detail.data ?? []) as ResponseRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const total = rows.reduce((sum, r) => sum + Number(r.signups), 0);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return responses.filter((r) => {
      if (channelFilter !== "all" && r.channel !== channelFilter) return false;
      if (!q) return true;
      return [r.email, r.full_name, r.channel, r.role, r.company_type, r.current_tooling]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [responses, search, channelFilter]);

  const openEdit = (r: ResponseRow) => {
    setEditing(r);
    const known = r.discovery_channel && DISCOVERY_OPTIONS.includes(r.discovery_channel as any);
    setEditChannel(known ? (r.discovery_channel as string) : "Other");
    setEditOther(known ? "" : r.discovery_channel_other ?? r.discovery_channel ?? "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editChannel === "Other" && !editOther.trim()) {
      toast.error("Type where they found OutReign.");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).rpc("admin_update_signup_response", {
      _id: editing.id,
      _discovery_channel: editChannel,
      _discovery_channel_other: editChannel === "Other" ? editOther.trim() : null,
    });
    setSaving(false);
    if (error) {
      toast.error(`Could not save: ${error.message}`);
      return;
    }
    toast.success("Channel updated");
    setEditing(null);
    void load();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await (supabase as any).rpc("admin_delete_signup_response", {
      _id: deleting.id,
    });
    setSaving(false);
    if (error) {
      toast.error(`Could not delete: ${error.message}`);
      return;
    }
    toast.success("Answer deleted");
    setDeleting(null);
    void load();
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Signup channels</CardTitle>
            <CardDescription>
              Answers to "Where did you find OutReign?" — {total} answered so far.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Signups</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead>Most recent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {loading ? "Loading…" : "No answers yet."}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => (
                <TableRow
                  key={r.channel}
                  className={`cursor-pointer ${channelFilter === r.channel ? "bg-muted/50" : ""}`}
                  onClick={() => setChannelFilter(channelFilter === r.channel ? "all" : r.channel)}
                >
                  <TableCell className="font-medium">{r.channel}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.signups}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {total ? Math.round((Number(r.signups) / total) * 100) : 0}%
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(r.last_signup)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Who answered ({filtered.length})</CardTitle>
              <CardDescription>
                Every questionnaire answer, newest first. Fix a mis-tagged channel or remove a junk answer.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search name, email, channel"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-56"
              />
              {channelFilter !== "all" && (
                <Button variant="outline" size="sm" onClick={() => setChannelFilter("all")}>
                  Clear filter
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Sells to</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Goals</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Answered</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {loading ? "Loading…" : "No answers match."}
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="font-medium">{r.full_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{r.email || r.user_id}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{r.channel}</Badge>
                      {!r.completed_at && (
                        <div className="text-[10px] text-amber-400 mt-1">Not finished</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{r.role || "—"}</TableCell>
                    <TableCell className="text-sm">{r.company_type || "—"}</TableCell>
                    <TableCell className="text-sm">{r.team_size || "—"}</TableCell>
                    <TableCell className="text-xs max-w-[220px]">
                      {Array.isArray(r.goals) && r.goals.length ? r.goals.join(", ") : "—"}
                    </TableCell>
                    <TableCell className="text-sm">{r.monthly_prospect_volume || "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {fmtDate(r.completed_at ?? r.created_at)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)} aria-label="Edit channel">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleting(r)}
                        aria-label="Delete answer"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit channel</DialogTitle>
            <DialogDescription>
              {editing?.email || editing?.full_name || "This signup"} — where they found OutReign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={editChannel} onValueChange={setEditChannel}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a channel" />
              </SelectTrigger>
              <SelectContent>
                {DISCOVERY_OPTIONS.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {editChannel === "Other" && (
              <Input
                placeholder="Where exactly?"
                value={editOther}
                onChange={(e) => setEditOther(e.target.value)}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveEdit()} disabled={saving}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this answer?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the questionnaire answers for{" "}
              {deleting?.email || deleting?.full_name || "this signup"}. The account itself stays.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()} disabled={saving}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
