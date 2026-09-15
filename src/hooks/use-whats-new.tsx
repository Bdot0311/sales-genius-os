import { useCallback, useEffect, useState } from "react";
import { LATEST_CHANGELOG_DATE, unreadCount } from "@/lib/changelog";

const STORAGE_KEY = "outreign:whats-new-seen";

const readSeen = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
};

/**
 * Tracks whether the customer has read the newest changelog entry, so the
 * header only nudges them when there's genuinely something new.
 */
export const useWhatsNew = () => {
  const [seenDate, setSeenDate] = useState<string>(() => readSeen());

  useEffect(() => {
    const sync = () => setSeenDate(readSeen());
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  /**
   * Mark everything up to `date` read.
   *
   * Takes the date rather than assuming the one compiled into the bundle:
   * entries now come from the database, so the newest published entry is not
   * necessarily the newest one in the file, and stamping the file's date would
   * mark an entry read before it existed.
   */
  const markSeen = useCallback((date?: string) => {
    const stamp = date || LATEST_CHANGELOG_DATE;
    if (!stamp) return;
    try {
      localStorage.setItem(STORAGE_KEY, stamp);
    } catch {
      /* private browsing — badge simply reappears next visit */
    }
    setSeenDate((prev) => (stamp > prev ? stamp : prev));
  }, []);

  return {
    hasUnread: Boolean(LATEST_CHANGELOG_DATE) && seenDate < LATEST_CHANGELOG_DATE,
    /** How many entries they have not opened, for a dot that can carry a count. */
    unread: unreadCount(seenDate),
    /** Exposed so the page can mark which entries are new to this reader. */
    seenDate,
    latestDate: LATEST_CHANGELOG_DATE,
    markSeen,
  };
};
