/**
 * Self-reported acquisition: what new users answer to "Where did you find
 * OutReign?" in the signup questionnaire. Unlike the visitor log this survives
 * referrer stripping, so it's the only honest read on word-of-mouth channels.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { DISCOVERY_OPTIONS } from "@/lib/onboarding-questions";

type ChannelRow = { channel: string; signups: number; last_signup: string | null };
type ResponseRow = {
  id: string;
  user_id: string;
  email: string;
  full_name: string;
  role: string;
  company_type: string;
  team_size: string;
  goals: unknown;
  current_tooling: string;
  monthly_prospect_volume: string;
  discovery_channel: string;
  discovery_channel_other: string;
  channel: string;
  created_at: string;
  completed_at: string;
};

const text = (value: string | null | undefined) => value?.trim() || "—";

const goalsLabel = (goals: unknown) => {
  if (Array.isArray(goals)) return goals.filter((goal): goal is string => typeof goal === "string").join(", ") || "—";
  return typeof goals === "string" && goals.trim() ? goals : "—";
};

export const SignupChannelsCard = () => {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string | null>(null);
  const [editing, setEditing] = useState<ResponseRow | null>(null);
  const [deleting, setDeleting] = useState<ResponseRow | null>(null);
  const [editChannel, setEditChannel] = useState("");
  const [editOther, setEditOther] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [channelsResult, responsesResult] = await Promise.all([
      supabase.rpc("admin_get_signup_channels"),
      supabase.rpc("admin_list_signup_responses", { _limit: 2000 }),
    ]);
    if (channelsResult.error || responsesResult.error) {
      toast.error(`Could not load signup responses: ${(channelsResult.error ?? responsesResult.error)?.message}`);
      setRows([]);
      setResponses([]);
    } else {
      setRows((channelsResult.data ?? []) as ChannelRow[]);
      setResponses((responsesResult.data ?? []) as ResponseRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const total = rows.reduce((sum, r) => sum + Number(r.signups), 0);
  const filteredResponses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return responses.filter((response) => {
      if (channelFilter && response.channel !== channelFilter) return false;
      if (!query) return true;
      return [
        response.full_name,
        response.email,
        response.role,
        response.company_type,
        response.team_size,
        response.channel,
        response.current_tooling,
        response.monthly_prospect_volume,
        goalsLabel(response.goals),
      ].some((value) => value?.toLowerCase().includes(query));
    });
  }, [channelFilter, responses, search]);

  const startEdit = (response: ResponseRow) => {
    setEditing(response);
    setEditChannel(response.discovery_channel || "Other");
    setEditOther(response.discovery_channel_other || "");
  };

  const saveEdit = async () => {
    if (!editing) return;
    if (editChannel === "Other" && !editOther.trim()) {
      toast.error("Enter the channel name");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("admin_update_signup_response", {
      _id: editing.id,
      _discovery_channel: editChannel,
      _discovery_channel_other: editChannel === "Other" ? editOther.trim() : "",
    });
    setSaving(false);
    if (error) {
      toast.error(`Could not update response: ${error.message}`);
      return;
    }
    setEditing(null);
    toast.success("Signup response updated");
    await load();
  };

  const deleteResponse = async () => {
    if (!deleting) return;
    setSaving(true);
    const { error } = await supabase.rpc("admin_delete_signup_response", { _id: deleting.id });
    setSaving(false);
    if (error) {
      toast.error(`Could not delete response: ${error.message}`);
      return;
    }
    setDeleting(null);
    toast.success("Signup response deleted");
    await load();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Signup channels</CardTitle>
            <CardDescription>Answers to "Where did you find OutReign?" — {total} answered so far.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Channel</TableHead><TableHead className="text-right">Signups</TableHead><TableHead className="text-right">Share</TableHead><TableHead>Most recent</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{loading ? "Loading…" : "No answers yet."}</TableCell></TableRow>}
              {rows.map((row) => (
                <TableRow key={row.channel} className="cursor-pointer" onClick={() => setChannelFilter(channelFilter === row.channel ? null : row.channel)}>
                  <TableCell className="font-medium">{row.channel}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.signups}</TableCell>
                  <TableCell className="text-right tabular-nums">{total ? Math.round((Number(row.signups) / total) * 100) : 0}%</TableCell>
                  <TableCell className="text-muted-foreground">{row.last_signup ? new Date(row.last_signup).toLocaleDateString() : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Questionnaire responses</CardTitle>
          <CardDescription>Every completed signup questionnaire and the answers used to personalize activation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, role, goal, or tool" className="pl-9" />
            </div>
            {channelFilter && <Button variant="secondary" size="sm" onClick={() => setChannelFilter(null)}><X className="mr-2 h-4 w-4" />{channelFilter}</Button>}
            <span className="text-sm text-muted-foreground">{filteredResponses.length} responses</span>
          </div>
          <div className="overflow-x-auto">
            <Table className="min-w-[1180px]">
              <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Channel</TableHead><TableHead>Role</TableHead><TableHead>Company</TableHead><TableHead>Team</TableHead><TableHead>Goals</TableHead><TableHead>Current tool</TableHead><TableHead>Monthly volume</TableHead><TableHead>Completed</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
              <TableBody>
                {filteredResponses.length === 0 && <TableRow><TableCell colSpan={10} className="py-10 text-center text-muted-foreground">{loading ? "Loading responses…" : "No matching responses."}</TableCell></TableRow>}
                {filteredResponses.map((response) => (
                  <TableRow key={response.id}>
                    <TableCell><div className="font-medium">{text(response.full_name)}</div><div className="text-xs text-muted-foreground">{text(response.email)}</div></TableCell>
                    <TableCell><Badge variant="secondary">{text(response.channel)}</Badge></TableCell>
                    <TableCell>{text(response.role)}</TableCell>
                    <TableCell>{text(response.company_type)}</TableCell>
                    <TableCell>{text(response.team_size)}</TableCell>
                    <TableCell className="max-w-56 whitespace-normal">{goalsLabel(response.goals)}</TableCell>
                    <TableCell>{text(response.current_tooling)}</TableCell>
                    <TableCell>{text(response.monthly_prospect_volume)}</TableCell>
                    <TableCell className="text-muted-foreground">{response.completed_at ? new Date(response.completed_at).toLocaleDateString() : "—"}</TableCell>
                    <TableCell><div className="flex justify-end gap-1"><Button variant="ghost" size="icon" onClick={() => startEdit(response)} aria-label={`Edit ${response.full_name || response.email}`}><Pencil className="h-4 w-4" /></Button><Button variant="ghost" size="icon" onClick={() => setDeleting(response)} aria-label={`Delete ${response.full_name || response.email}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit signup channel</DialogTitle><DialogDescription>Correct the acquisition channel for {editing?.full_name || editing?.email}.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Channel</Label><Select value={editChannel} onValueChange={setEditChannel}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{DISCOVERY_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent></Select></div>
            {editChannel === "Other" && <div className="space-y-2"><Label htmlFor="other-channel">Channel name</Label><Input id="other-channel" value={editOther} onChange={(event) => setEditOther(event.target.value)} /></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => void saveEdit()} disabled={saving}>Save changes</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete this questionnaire response?</AlertDialogTitle><AlertDialogDescription>This removes {deleting?.full_name || deleting?.email || "this signup"}'s questionnaire answer from reporting. This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void deleteResponse()} disabled={saving} className="bg-destructive hover:bg-destructive/90">Delete response</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
