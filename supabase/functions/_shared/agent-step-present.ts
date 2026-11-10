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
