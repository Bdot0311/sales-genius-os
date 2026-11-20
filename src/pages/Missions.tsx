import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { EmptyState, Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
// Mission tables are not in generated types until their migration is applied.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const missionsDb = supabase as any;
import { useAgentMissions } from "@/hooks/use-agent-missions";
import { AgentStepList } from "@/components/agent/AgentStepList";
import type { StepEvent } from "../../supabase/functions/_shared/agent-step-present";
import { nextRunAt, normalizeDays } from "../../supabase/functions/_shared/agent-mission-logic";

interface MissionRow {
  id: string;
  name: string;
  goal: string;
  mode: string;
  status: string;
  pause_reason: string | null;
  timezone: string;
  days_of_week: number[];
  run_hour: number;
  run_minute: number;
  send_window_start: string;
  send_window_end: string;
  daily_lead_cap: number;
  daily_send_cap: number;
  daily_spend_cap_usd: number;
  next_run_at: string | null;
  agent_config_id: string;
  icp_profile_id: string | null;
  sequence_id: string | null;
}

interface RunRow {
  id: string;
  mission_id: string;
  status: string;
  report: { summary?: string; steps?: StepEvent[] } | null;
  leads_found: number;
  drafts_written: number;
  sends_queued: number;
  skip_reason: string | null;
  created_at: string;
  finished_at: string | null;
}

interface Named { id: string; name: string }

const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const blank = {
  name: "",
  goal: "",
  mode: "approval",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  days: [1, 2, 3, 4, 5],
  run_hour: 7,
  send_window_start: "08:00",
  send_window_end: "17:00",
  daily_lead_cap: 10,
  daily_send_cap: 10,
  daily_spend_cap_usd: 5,
  agent_config_id: "",
  icp_profile_id: "",
  sequence_id: "",
};

const Missions = () => {
  const { enabled, loading } = useAgentMissions();
  const [missions, setMissions] = useState<MissionRow[] | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [agents, setAgents] = useState<Named[]>([]);
  const [icps, setIcps] = useState<Named[]>([]);
  const [sequences, setSequences] = useState<Named[]>([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [openRun, setOpenRun] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [missionRes, runRes, agentRes, icpRes, sequenceRes] = await Promise.all([
      missionsDb.from("agent_missions").select("id, name, goal, mode, status, pause_reason, timezone, days_of_week, run_hour, run_minute, send_window_start, send_window_end, daily_lead_cap, daily_send_cap, daily_spend_cap_usd, next_run_at, agent_config_id, icp_profile_id, sequence_id").order("updated_at", { ascending: false }),
      missionsDb.from("agent_mission_runs").select("id, mission_id, status, report, leads_found, drafts_written, sends_queued, skip_reason, created_at, finished_at").order("created_at", { ascending: false }).limit(40),
      supabase.from("agent_configs").select("id, agent_name").order("created_at", { ascending: false }),
      supabase.from("icp_profiles").select("id, name").order("updated_at", { ascending: false }),
      supabase.from("email_sequences").select("id, name").order("updated_at", { ascending: false }),
    ]);
    if (missionRes.error) setError(missionRes.error.message);
    setMissions(missionRes.data ?? []);
    setRuns((runRes.data ?? []) as RunRow[]);
    setAgents((agentRes.data ?? []).map((row) => ({ id: row.id, name: row.agent_name || "Agent" })));
    setIcps(icpRes.data ?? []);
    setSequences(sequenceRes.data ?? []);
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    const { data: session } = await supabase.auth.getUser();
    const userId = session.user?.id;
    if (!userId) {
      setError("Sign in again to save a mission.");
      setSaving(false);
      return;
    }
    const days = normalizeDays(form.days);
    const next = nextRunAt({
      from: new Date(),
      timeZone: form.timezone,
      daysOfWeek: days,
      hour: form.run_hour,
      minute: 0,
    }).toISOString();
    const row = {
      user_id: userId,
      name: form.name.trim(),
      goal: form.goal.trim(),
      mode: form.mode,
      timezone: form.timezone || "UTC",
      days_of_week: days,
      run_hour: form.run_hour,
      run_minute: 0,
      send_window_start: form.send_window_start,
      send_window_end: form.send_window_end,
      daily_lead_cap: form.daily_lead_cap,
      daily_send_cap: form.daily_send_cap,
      daily_spend_cap_usd: form.daily_spend_cap_usd,
      agent_config_id: form.agent_config_id,
      icp_profile_id: form.icp_profile_id || null,
      sequence_id: form.sequence_id || null,
      next_run_at: next,
    };
    const write = editing
      ? missionsDb.from("agent_missions").update(row).eq("id", editing)
      : missionsDb.from("agent_missions").insert(row);
    const { error: writeError } = await write;
    setError(writeError?.message ?? null);
    setSaving(false);
    if (!writeError) {
      setForm(blank);
      setEditing(null);
      await load();
    }
  };

  const setStatus = async (mission: MissionRow, status: "active" | "paused" | "stopped") => {
    const next = status === "active"
      ? nextRunAt({
          from: new Date(),
          timeZone: mission.timezone,
          daysOfWeek: mission.days_of_week,
          hour: mission.run_hour,
          minute: mission.run_minute,
        }).toISOString()
      : mission.next_run_at;
    const { error: writeError } = await missionsDb.from("agent_missions").update({
      status,
      pause_reason: status === "active" ? null : status === "paused" ? "Paused by you." : "Stopped.",
      next_run_at: next,
    }).eq("id", mission.id);
    if (writeError) setError(writeError.message);
    await load();
  };

  const edit = (mission: MissionRow) => {
    setEditing(mission.id);
    setForm({
      name: mission.name,
      goal: mission.goal,
      mode: mission.mode,
      timezone: mission.timezone,
      days: mission.days_of_week,
      run_hour: mission.run_hour,
      send_window_start: mission.send_window_start,
      send_window_end: mission.send_window_end,
      daily_lead_cap: mission.daily_lead_cap,
      daily_send_cap: mission.daily_send_cap,
      daily_spend_cap_usd: Number(mission.daily_spend_cap_usd),
      agent_config_id: mission.agent_config_id,
      icp_profile_id: mission.icp_profile_id ?? "",
      sequence_id: mission.sequence_id ?? "",
    });
  };

  return (
    <DashboardLayout>
      <PageHeader
        title="Missions"
        description="Set a goal once. The agent keeps working on that schedule, including overnight."
      />
      <div className="space-y-6 p-4 md:p-6">
        {loading ? <p className="text-sm text-muted-foreground">Checking access…</p> : null}
        {!loading && !enabled ? (
          <EmptyState
            title="Missions are off for this workspace"
            body="An admin has to turn on the agentMissions flag and grant this workspace. Until then nothing runs on its own."
          />
        ) : null}
        {enabled ? (
          <>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Panel>
              <PanelHeader>
                <PanelTitle>{editing ? "Edit mission" : "New mission"}</PanelTitle>
                <PanelDescription>
                  Approval leaves drafts for you. Autopilot queues them in the outbox, and the usual sender still enforces every cap.
                </PanelDescription>
              </PanelHeader>
              <PanelBody className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mission-name">Name</Label>
                  <Input id="mission-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Find ops leaders" />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="mission-goal">Goal</Label>
                  <Textarea id="mission-goal" value={form.goal} onChange={(event) => setForm({ ...form, goal: event.target.value })} placeholder="Find 10 good-fit leads a day that match the ICP, research them, and draft a first touch." />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mission-agent">Agent</Label>
                  <select id="mission-agent" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.agent_config_id} onChange={(event) => setForm({ ...form, agent_config_id: event.target.value })}>
                    <option value="">Choose an agent</option>
                    {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mission-mode">Mode</Label>
                  <select id="mission-mode" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.mode} onChange={(event) => setForm({ ...form, mode: event.target.value })}>
                    <option value="approval">Approval</option>
                    <option value="autopilot">Autopilot</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mission-icp">ICP</Label>
                  <select id="mission-icp" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.icp_profile_id} onChange={(event) => setForm({ ...form, icp_profile_id: event.target.value })}>
                    <option value="">Use the agent's targeting</option>
                    {icps.map((icp) => <option key={icp.id} value={icp.id}>{icp.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mission-sequence">Follow-up sequence</Label>
                  <select id="mission-sequence" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.sequence_id} onChange={(event) => setForm({ ...form, sequence_id: event.target.value })}>
                    <option value="">None</option>
                    {sequences.map((sequence) => <option key={sequence.id} value={sequence.id}>{sequence.name}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mission-tz">Timezone</Label>
                  <Input id="mission-tz" value={form.timezone} onChange={(event) => setForm({ ...form, timezone: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mission-hour">Run hour</Label>
                  <Input id="mission-hour" type="number" min={0} max={23} value={form.run_hour} onChange={(event) => setForm({ ...form, run_hour: Number(event.target.value) })} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Days</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS.map((day) => {
                      const on = form.days.includes(day.value);
                      return (
                        <Button
                          key={day.value}
                          type="button"
                          variant={on ? "default" : "outline"}
                          size="sm"
                          onClick={() => setForm({
                            ...form,
                            days: on ? form.days.filter((value) => value !== day.value) : [...form.days, day.value],
                          })}
                        >
                          {day.label}
                        </Button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="window-start">Send from</Label>
                  <Input id="window-start" value={form.send_window_start} onChange={(event) => setForm({ ...form, send_window_start: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="window-end">Send until</Label>
                  <Input id="window-end" value={form.send_window_end} onChange={(event) => setForm({ ...form, send_window_end: event.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-cap">Leads per day</Label>
                  <Input id="lead-cap" type="number" min={1} max={500} value={form.daily_lead_cap} onChange={(event) => setForm({ ...form, daily_lead_cap: Number(event.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="send-cap">Sends per day</Label>
                  <Input id="send-cap" type="number" min={1} max={500} value={form.daily_send_cap} onChange={(event) => setForm({ ...form, daily_send_cap: Number(event.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="spend-cap">AI spend cap (USD)</Label>
                  <Input id="spend-cap" type="number" min={1} max={25} step="0.5" value={form.daily_spend_cap_usd} onChange={(event) => setForm({ ...form, daily_spend_cap_usd: Number(event.target.value) })} />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={() => void save()} disabled={saving || !form.name.trim() || !form.goal.trim() || !form.agent_config_id}>
                    {editing ? "Save changes" : "Create mission"}
                  </Button>
                  {editing ? <Button variant="outline" onClick={() => { setEditing(null); setForm(blank); }}>Cancel</Button> : null}
                </div>
              </PanelBody>
            </Panel>

            {missions && missions.length === 0 ? (
              <EmptyState title="No missions yet" body="Create one above. It runs on the schedule you set until you pause it." />
            ) : null}

            {(missions ?? []).map((mission) => {
              const history = runs.filter((run) => run.mission_id === mission.id);
              return (
                <Panel key={mission.id}>
                  <PanelHeader>
                    <PanelTitle>{mission.name}</PanelTitle>
                    <PanelDescription>
                      {mission.status === "active" ? "Running" : mission.status === "paused" ? "Paused" : "Stopped"}
                      {" · "}
                      {mission.mode === "autopilot" ? "Autopilot" : "Approval"}
                      {mission.next_run_at ? ` · Next ${new Date(mission.next_run_at).toLocaleString()}` : ""}
                    </PanelDescription>
                  </PanelHeader>
                  <PanelBody className="space-y-3">
                    <p className="text-sm text-muted-foreground">{mission.goal}</p>
                    {mission.pause_reason ? <p className="text-sm text-amber-500">{mission.pause_reason}</p> : null}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => edit(mission)}>Edit</Button>
                      {mission.status === "active" ? (
                        <Button size="sm" variant="outline" onClick={() => void setStatus(mission, "paused")}>Pause</Button>
                      ) : mission.status !== "stopped" ? (
                        <Button size="sm" variant="outline" onClick={() => void setStatus(mission, "active")}>Resume</Button>
                      ) : null}
                      {mission.status !== "stopped" ? (
                        <Button size="sm" variant="outline" onClick={() => void setStatus(mission, "stopped")}>Stop</Button>
                      ) : null}
                    </div>
                    {history.length === 0 ? <p className="text-sm text-muted-foreground">No runs yet.</p> : null}
                    {history.map((run) => {
                      const steps = run.report?.steps ?? [];
                      const pending = run.status === "queued" || run.status === "running";
                      return (
                        <div key={run.id} className="rounded-md border border-border/70 p-3">
                          <button type="button" className="flex w-full items-center justify-between text-left text-sm" onClick={() => setOpenRun(openRun === run.id ? null : run.id)}>
                            <span>{run.report?.summary || (pending ? "Working through this run" : run.skip_reason || "Run finished")}</span>
                            <span className="text-xs text-muted-foreground">{new Date(run.created_at).toLocaleString()}</span>
                          </button>
                          {openRun === run.id ? (
                            <div className="mt-2">
                              <AgentStepList events={steps} pending={pending} />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </PanelBody>
                </Panel>
              );
            })}
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
};

export default Missions;
