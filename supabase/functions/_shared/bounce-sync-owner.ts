/** Only trusted scheduled callers may choose the mailbox owner. */
export function bounceSyncOwner(internal: boolean, authenticatedId: string | null, requestedId: unknown): string | null {
  if (!internal) return authenticatedId;
  return typeof requestedId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedId)
    ? requestedId : null;
}