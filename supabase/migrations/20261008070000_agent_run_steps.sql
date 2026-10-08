/*
 * What the agent actually did, written down as it happens.
 *
 * A turn is a loop of up to eight model steps, each of which may call several
 * tools. None of it was recorded. agent_chat_threads knows a run is "running"
 * and agent_chat_messages holds what the user sees, but between those two
 * there was nothing: no record of which tools were called, with what, what
 * came back, how long it took or what it cost.
 *
 * Three things follow from that gap, and all three have cost real money.
 *
 * Nothing could be diagnosed from the system itself. Every fault in this
 * product for the last week was reconstructed from screenshots the user sent,
 * because that was the only surviving evidence of what the agent had done.
 *
 * A turn that died lost everything. Eight steps of tool calls — searches,
 * enrichments, drafts — evaporate on a worker restart or an unhandled error,
 * and the user starts again from their original sentence.
 *
 * And the guard against repeating a mutation lived in a Set in memory. It is
 * exactly right for one request and worth nothing across a restart: the same
 * send, after a resume, has nothing telling it the first one already went.
 *
 * So: one row per step, carrying the working message array, so a resumed turn
 * continues instead of restarting; and one row per completed mutation, so an
 * action that already happened cannot happen twice.
 */

-- ─── The step log ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id   UUID NOT NULL REFERENCES public.agent_chat_threads(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- A turn can span several passes when work overruns one invocation.
  run_pass    INTEGER NOT NULL DEFAULT 0,
  step_index  INTEGER NOT NULL,

  /*
   * The agent's working state after this step.
   *
   * This is what makes a resume a continuation rather than a restart: reload
   * it and the loop picks up with everything the model already knows. Stored
   * whole because a diff would have to be replayed, and a replay that is
   * subtly wrong is worse than the restart it replaces.
   */
  messages    JSONB NOT NULL,

  -- What was called and what came back, trimmed for reading rather than replay.
  tool_calls   JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Prompt and completion tokens, so a turn's cost is a fact rather than a guess.
  usage        JSONB,

  status      TEXT NOT NULL DEFAULT 'done'
                CHECK (status IN ('running', 'done', 'failed')),
  error       TEXT,
  started_at  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finished_at TIMESTAMP WITH TIME ZONE,

  -- One row per step of a pass. A retry of the same step overwrites it.
  CONSTRAINT agent_run_steps_unique_step UNIQUE (thread_id, run_pass, step_index)
);

-- Resume reads the newest step of a pass; the unique index above serves it.
-- This one serves pruning, which this table will need: a busy account writes
-- a row per step of every turn.
CREATE INDEX IF NOT EXISTS agent_run_steps_started_idx
  ON public.agent_run_steps (started_at);

ALTER TABLE public.agent_run_steps ENABLE ROW LEVEL SECURITY;

-- Readable by the person whose agent ran, and written only by the worker.
-- There is no INSERT or UPDATE policy on purpose: a client that could forge a
-- step could forge a resume, and a resume decides what the agent believes it
-- has already done.
CREATE POLICY "Users can view their own agent run steps"
  ON public.agent_run_steps FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.agent_run_steps TO authenticated;
GRANT ALL ON public.agent_run_steps TO service_role;

-- ─── Mutations that have already happened ───────────────────────────────────

/*
 * The in-memory Set, made to survive a restart.
 *
 * Scoped to the thread rather than the pass: a resume is the same turn as far
 * as the user is concerned, and "this send already went" has to hold across
 * the restart that caused the resume. Cleared when the turn goes idle, which
 * is what keeps it from blocking the same action in a later conversation.
 */
CREATE TABLE IF NOT EXISTS public.agent_run_mutations (
  thread_id    UUID NOT NULL REFERENCES public.agent_chat_threads(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mutation_key TEXT NOT NULL,
  tool_name    TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, mutation_key)
);

ALTER TABLE public.agent_run_mutations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own agent run mutations"
  ON public.agent_run_mutations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT ON public.agent_run_mutations TO authenticated;
GRANT ALL ON public.agent_run_mutations TO service_role;
