/**
 * The agent's own record of what it did, and what it already did.
 *
 * A turn is up to eight model steps, each able to call several tools, and none
 * of it was written down. agent_chat_threads knew a run was "running" and
 * agent_chat_messages held what the user sees; between them there was nothing.
 *
 * So a turn that died lost eight steps of searches, enrichments and drafts and
 * the user started again from their first sentence. A fault could only be
 * diagnosed from screenshots, because no other evidence survived. And the
 * guard against repeating a mutation was a Set in memory — exactly right for
 * one request, worth nothing across the restart that caused the resume.
 *
 * The decisions live here as plain functions over plain data so they can be
 * tested without standing up PostgREST. Everything that touches the database
 * goes through TraceStore, and supabaseTraceStore is the only adapter.
 */

// ─── What a step is ─────────────────────────────────────────────────────────

export interface TraceToolCall {
  name: string;
  args: unknown;
}

export interface TraceToolResult {
  name: string;
  ok: boolean;
  detail: string;
}

export interface StepRecord {
  threadId: string;
  userId: string;
  runPass: number;
  stepIndex: number;
  messages: unknown[];
  toolCalls: TraceToolCall[];
  toolResults: TraceToolResult[];
  usage?: unknown;
  status?: "running" | "done" | "failed";
  error?: string | null;
}

export interface StoredStep {
  step_index: number;
  messages: unknown;
}

export interface TraceStore {
  latestStep(threadId: string, runPass: number): Promise<StoredStep | null>;
  saveStep(row: StepRecord): Promise<void>;
  listMutations(threadId: string): Promise<string[]>;
  saveMutation(threadId: string, userId: string, key: string, toolName: string): Promise<void>;
  clearMutations(threadId: string): Promise<void>;
}

// ─── Size limits ────────────────────────────────────────────────────────────

/*
 * A trace that costs more than it saves is not worth keeping.
 *
 * Tool results here are lead lists and research briefs; one unbounded result
 * can be megabytes, and a row per step of every turn adds up fast. The trace
 * is for reading, so results are truncated to something a person can scan.
 *
 * The message array is different: it is the resume, so truncating it would
 * mean resuming into a conversation the model half-remembers, which is worse
 * than not resuming at all. It is stored whole or not stored, and a turn too
 * large to store simply does not get a resume point.
 */
export const MAX_RESULT_CHARS = 2_000;
export const MAX_RESULTS_PER_STEP = 24;
export const MAX_MESSAGES_BYTES = 256_000;

/** One tool result, trimmed to something worth reading later. */
export function trimResult(name: string, ok: boolean, detail: unknown): TraceToolResult {
  const text = typeof detail === "string" ? detail : JSON.stringify(detail ?? null) ?? "";
  return {
    name,
    ok,
    detail: text.length > MAX_RESULT_CHARS
      ? `${text.slice(0, MAX_RESULT_CHARS)}… (${text.length} chars)`
      : text,
  };
}

/**
 * Whether a tool reply was a success, for the trace's own column.
 *
 * Tool results come back as a JSON string, and every refusal in this codebase
 * carries an `error` key — the scope gate, the argument check, a tool that
 * could not find the lead. Anything unparseable is counted as a success
 * rather than a failure: the trace should not invent faults, and the detail
 * is stored beside it either way.
 */
export function resultOk(content: unknown): boolean {
  if (content === null || content === undefined) return false;
  if (typeof content !== "string") {
    return !(typeof content === "object" && content !== null && "error" in content);
  }
  try {
    const parsed = JSON.parse(content);
    return !(typeof parsed === "object" && parsed !== null && "error" in parsed);
  } catch {
    return true;
  }
}

/** True when this step's working state is small enough to be worth storing. */
export function messagesFitInTrace(messages: unknown[]): boolean {
  try {
    return JSON.stringify(messages ?? []).length <= MAX_MESSAGES_BYTES;
  } catch {
    // Circular or otherwise unserialisable: it cannot be stored, so it is not.
    return false;
  }
}

// ─── Resuming ───────────────────────────────────────────────────────────────

export interface Resume {
  messages: unknown[];
  nextStep: number;
}

/**
 * Where a turn should pick up, given the last step it managed to write.
 *
 * Returns null — meaning start from the beginning — whenever the stored state
 * cannot be trusted: no row, an empty array, a negative index, or a step index
 * at or past the loop's ceiling. Restarting is a cost; resuming into a broken
 * message array is a turn that behaves strangely and cannot be explained.
 */
export function resumeFrom(stored: StoredStep | null, maxSteps: number): Resume | null {
  if (!stored) return null;
  const messages = stored.messages;
  if (!Array.isArray(messages) || messages.length === 0) return null;

  const index = Number(stored.step_index);
  if (!Number.isInteger(index) || index < 0) return null;

  const nextStep = index + 1;
  // The turn already used its whole budget; there is nothing to resume into.
  if (nextStep >= maxSteps) return null;

  return { messages, nextStep };
}

// ─── Mutations that already happened ────────────────────────────────────────

/*
 * The key is the same one the in-memory guard used, so a resumed turn and a
 * fresh one agree on what "this exact action" means. Kept to a sane length
 * because it is a primary key, and truncating a key can only ever merge two
 * actions that were already nearly identical.
 */
export const MAX_MUTATION_KEY_CHARS = 400;

export function normaliseMutationKey(key: string): string {
  return String(key ?? "").slice(0, MAX_MUTATION_KEY_CHARS);
}

/**
 * The keys a turn should start out believing are already done.
 *
 * The client round-trips its own list across passes, and the database holds
 * what actually completed. Neither is authoritative alone: the client's list
 * survives a worker restart, the database's survives a client that never came
 * back. The union is what the turn uses.
 */
export function mergeCompleted(fromClient: unknown, fromStore: string[]): Set<string> {
  const out = new Set<string>();
  if (Array.isArray(fromClient)) {
    for (const value of fromClient.slice(0, 100)) {
      if (typeof value === "string" && value) out.add(normaliseMutationKey(value));
    }
  }
  for (const value of fromStore) if (value) out.add(normaliseMutationKey(value));
  return out;
}

// ─── The adapter ────────────────────────────────────────────────────────────

/**
 * The only thing here that knows about the database.
 *
 * Every write swallows its error after logging it. A trace that fails to write
 * must never take the turn down with it: the user's work is the email, not the
 * record of how it was made.
 */
export function supabaseTraceStore(admin: any): TraceStore {
  return {
    async latestStep(threadId, runPass) {
      const { data, error } = await admin
        .from("agent_run_steps")
        .select("step_index, messages")
        .eq("thread_id", threadId)
        .eq("run_pass", runPass)
        .eq("status", "done")
        .order("step_index", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn(`[agent-trace] could not read the last step: ${error.message}`);
        return null;
      }
      return (data as StoredStep) ?? null;
    },

    async saveStep(row) {
      if (!messagesFitInTrace(row.messages)) {
        console.warn(
          `[agent-trace] step ${row.stepIndex} is too large to store; no resume point for this step`,
        );
        return;
      }
      const { error } = await admin
        .from("agent_run_steps")
        .upsert({
          thread_id: row.threadId,
          user_id: row.userId,
          run_pass: row.runPass,
          step_index: row.stepIndex,
          messages: row.messages,
          tool_calls: row.toolCalls.slice(0, MAX_RESULTS_PER_STEP),
          tool_results: row.toolResults.slice(0, MAX_RESULTS_PER_STEP),
          usage: row.usage ?? null,
          status: row.status ?? "done",
          error: row.error ?? null,
          finished_at: new Date().toISOString(),
        }, { onConflict: "thread_id,run_pass,step_index" });
      if (error) console.warn(`[agent-trace] could not write step ${row.stepIndex}: ${error.message}`);
    },

    async listMutations(threadId) {
      const { data, error } = await admin
        .from("agent_run_mutations")
        .select("mutation_key")
        .eq("thread_id", threadId);
      if (error) {
        console.warn(`[agent-trace] could not read completed mutations: ${error.message}`);
        return [];
      }
      return ((data ?? []) as Array<{ mutation_key: string }>).map((r) => r.mutation_key);
    },

    async saveMutation(threadId, userId, key, toolName) {
      const { error } = await admin
        .from("agent_run_mutations")
        .upsert({
          thread_id: threadId,
          user_id: userId,
          mutation_key: normaliseMutationKey(key),
          tool_name: toolName,
        }, { onConflict: "thread_id,mutation_key" });
      if (error) console.warn(`[agent-trace] could not record a completed mutation: ${error.message}`);
    },

    async clearMutations(threadId) {
      const { error } = await admin
        .from("agent_run_mutations")
        .delete()
        .eq("thread_id", threadId);
      if (error) console.warn(`[agent-trace] could not clear completed mutations: ${error.message}`);
    },
  };
}
