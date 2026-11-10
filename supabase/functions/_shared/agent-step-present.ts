/**
 * What the agent chat shows for one finished tool, in plain language.
 *
 * The edge function used to store the same sentence the model was given —
 * counts, queue mechanics, "the whole set is accounted for". That sentence
 * was also the line in the chat. This module is the user-facing version.
 * Failures stay visible: a zero research result is a warning, not a quiet row.
 */

export interface StepEvent {
  name: string;
  label: string;
  status: "ok" | "error" | "queued";
  detail?: string | null;
}

export interface PresentedStep {
  key: string;
  name: string;
  title: string;
  detail: string;
  status: "ok" | "error" | "queued";
  /** How many identical neighbours were folded into this row. */
  count: number;
}

export function researchStepCopy(input: {
  ok: number;
  total: number;
  thin: number;
  reason?: string | null;
}): { label: string; detail: string; status: "ok" | "error" } {
  if (input.total > 0 && input.ok === 0) {
    const why = input.reason?.trim();
    return {
      label: input.total === 1
        ? "Couldn't research this company"
        : `Couldn't research these companies (0 of ${input.total})`,
      status: "error",
      detail: why
        ? `0 of ${input.total} came back with website research. ${why}`
        : `0 of ${input.total} came back with website research.`,
    };
  }
  const thin = input.thin > 0
    ? ` ${input.thin} didn't have enough to personalize safely.`
    : "";
  return {
    label: `Researched ${input.ok} ${input.ok === 1 ? "company" : "companies"}`,
    status: "ok",
    detail: `Read ${input.ok} of ${input.total}.${thin}`.trim(),
  };
}

export function listLeadsCopy(matched: number, needingDraft: number | null): { label: string; detail: string } {
  const noun = matched === 1 ? "lead" : "leads";
  return {
    label: `Found ${matched} ${noun}`,
    detail: needingDraft === null
      ? `These are the ${noun} that matched.`
      : `${needingDraft} still need a draft.`,
  };
}

export function backgroundDraftCopy(count: number): { label: string; detail: string } {
  const noun = count === 1 ? "draft" : "drafts";
  return {
    label: "Writing them in the background",
    detail: `There isn't time to finish ${count === 1 ? "this draft" : `these ${count} ${noun}`} in this chat, so ${count === 1 ? "it's" : "they're"} being written in the background and will show up in Drafts as they finish.`,
  };
}

/**
 * The sweep line. The numbers have to stay honest: leads added after the
 * model finished, and any remainder past the cap, are said out loud.
 */
export function sweepCopy(input: {
  queued: number;
  pool: number;
  beyondLimit: number;
  cap: number;
}): { label: string; detail: string } {
  const added = `${input.queued} of ${input.pool} were picked up at the end so none of that request was missed.`;
  const rest = input.beyondLimit > 0
    ? ` ${input.beyondLimit} are still waiting — say keep going for the next ${input.cap}.`
    : " Nothing from that set is still waiting.";
  return {
    label: "Added the rest to the queue",
    detail: added + rest,
  };
}

export function formatDraftTurnSummary(input: {
  written: number;
  queued: number;
  skipped: number;
  failed: number;
  folder: number;
  swept: number;
  stillWaiting: number;
}): string {
  const sentences: string[] = [];
  if (input.queued > 0 && input.written === 0 && input.failed === 0 && input.skipped === 0) {
    sentences.push(
      `${input.queued} ${input.queued === 1 ? "draft is" : "drafts are"} being written — they'll appear in Drafts as they finish.`,
    );
  } else {
    if (input.written > 0) {
      sentences.push(`Wrote ${input.written} ${input.written === 1 ? "draft" : "drafts"}.`);
    }
    if (input.queued > 0) {
      sentences.push(
        `${input.queued} more ${input.queued === 1 ? "is" : "are"} being written and will show up in Drafts as they finish.`,
      );
    }
    if (input.skipped > 0) {
      sentences.push(
        `${input.skipped} already had a draft, so ${input.skipped === 1 ? "that one was" : "those were"} left as ${input.skipped === 1 ? "it is" : "they are"}.`,
      );
    }
    if (input.failed > 0) {
      sentences.push(`${input.failed} couldn't be written.`);
    }
  }
  if (input.swept > 0) {
    sentences.push(
      input.stillWaiting > 0
        ? `${input.swept} of those were added at the end. ${input.stillWaiting} are still waiting — say keep going for the next batch.`
        : `${input.swept} of those were added at the end so nothing from that set is still waiting. Any smaller number below was from before these were queued.`,
    );
  } else if (input.stillWaiting > 0) {
    sentences.push(`${input.stillWaiting} are still waiting — say keep going for the next batch.`);
  }
  sentences.push(`Drafts holds ${input.folder} right now.`);
  return sentences.join(" ");
}

/**
 * The sentence the user actually reads when a turn researched or drafted.
 *
 * The model said "all 63 have been researched and all drafts are queued"
 * after 12 researches and an empty Drafts folder. This line is the counts.
 * It does not say every lead was researched unless that many succeeded, and
 * it does not say a draft was saved when the folder and the job rows disagree.
 */
export function confirmedClose(input: {
  pool: number;
  researchedOk: number;
  researchedFailed: number;
  researchQueued: number;
  researchFailed: number;
  scoreFailed: number;
  queued: number;
  written: number;
  folder: number;
  draftFailed: number;
  draftPending: number;
  jobError?: string | null;
}): string {
  const parts: string[] = [];
  const researched = input.researchedOk;
  const attempted = researched + input.researchedFailed;
  const pool = Math.max(input.pool, attempted);
  if (pool > 0 && attempted > 0) {
    parts.push(`Researched ${researched} of ${pool}.`);
  }
  if (input.researchQueued > 0) {
    parts.push(`Queued ${input.researchQueued} ${input.researchQueued === 1 ? "lead" : "leads"} for research.`);
  }
  if (input.researchFailed > 0) {
    parts.push(`${input.researchFailed} queued research ${input.researchFailed === 1 ? "job" : "jobs"} failed.`);
  }
  if (input.scoreFailed > 0) {
    parts.push(`${input.scoreFailed} queued score ${input.scoreFailed === 1 ? "job" : "jobs"} failed.`);
  }
  if (input.written > 0) {
    parts.push(`Saved ${input.written} ${input.written === 1 ? "draft" : "drafts"}.`);
  }
  if (input.queued > 0) {
    parts.push(`Queued ${input.queued} ${input.queued === 1 ? "draft" : "drafts"}.`);
  }
  parts.push(`Drafts holds ${input.folder}.`);
  if (input.folder === 0 && input.draftFailed > 0) {
    const why = input.jobError ? ` ${input.jobError}` : "";
    parts.push(
      `${input.draftFailed} queued ${input.draftFailed === 1 ? "draft" : "drafts"} failed and ${input.draftFailed === 1 ? "was" : "were"} not saved.${why}`,
    );
  } else if (input.folder === 0 && input.queued > 0) {
    parts.push(
      input.draftPending > 0
        ? "None are saved yet. The queue has not confirmed them."
        : "None are saved yet.",
    );
  }
  return parts.join(" ");
}

const COMPLETION_CLAIM = /\b(?:all \d+|every(?: one of(?: the)?)?)\b[^.!?\n]{0,100}\b(?:researched|queued)\b|\ball drafts are queued\b|\bdrafts are being written\b|\bbackground worker is writing\b/i;

/**
 * Keep the model's findings. Only the sentence that claims the batch is done
 * is replaced by the counted status.
 */
export function withConfirmedClose(reply: string, close: string): string {
  const kept = reply.split(/\n\n/).map((part) => {
    const sentences = part.split(/(?<=[.!?])\s+/).filter((sentence) => {
      const text = sentence.trim();
      return text.length > 0 && !COMPLETION_CLAIM.test(text);
    });
    return sentences.join(" ").trim();
  }).filter(Boolean);
  const body = kept.join("\n\n").trim();
  return body ? `${body}\n\n${close}` : close;
}

/** Fold neighbouring rows that say the same thing. */
export function presentSteps(events: StepEvent[]): PresentedStep[] {
  const out: PresentedStep[] = [];
  events.forEach((event, index) => {
    const title = (event.label || event.name || "Working").trim();
    const detail = (event.detail ?? "").trim();
    const prev = out[out.length - 1];
    if (prev && prev.name === event.name && prev.title === title && prev.status === event.status && prev.detail === detail) {
      prev.count += 1;
      return;
    }
    out.push({
      key: `${event.name}-${index}`,
      name: event.name,
      title,
      detail,
      status: event.status,
      count: 1,
    });
  });
  return out;
}
