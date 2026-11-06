export type InboxFolder = "all" | "unread" | "replied" | "awaiting" | "sent" | "drafts" | "scheduled" | "failed";

export function mailState(status: string | null, sentAt?: string | null): string {
  const state = (status || "pending").toLowerCase();
  if (["draft", "scheduled", "queued", "pending", "sending", "failed", "bounced", "cancelled"].includes(state)) return state;
  if (sentAt) return "sent";
  if (["sent", "opened", "replied", "delivered"].includes(state)) return "sent";
  return state;
}

export function matchesMailFolder(folder: InboxFolder, c: {
  unread: boolean; hasReply: boolean; messages: { direction: "in" | "out"; state?: string }[];
}): boolean {
  const hasSent = c.messages.some(m => m.direction === "out" && m.state === "sent");
  switch (folder) {
    case "unread": return c.unread;
    case "replied": return c.hasReply;
    case "awaiting": return hasSent && !c.hasReply;
    case "sent": return hasSent;
    case "drafts": return c.messages.some(m => m.state === "draft");
    case "scheduled": return c.messages.some(m => ["scheduled", "queued", "pending", "sending"].includes(m.state || ""));
    case "failed": return c.messages.some(m => ["failed", "bounced", "cancelled"].includes(m.state || ""));
    default: return true;
  }
}

/** Exhaust every server page; no date cutoff or silent fixed-row truncation. */
export async function readAllMail<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  const size = 500;
  for (let from = 0; ; from += size) {
    const { data, error } = await read(from, from + size - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < size) return rows;
  }
}