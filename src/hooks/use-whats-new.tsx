import { useCallback, useEffect, useState } from "react";
import { LATEST_CHANGELOG_DATE } from "@/lib/changelog";

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

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, LATEST_CHANGELOG_DATE);
    } catch {
      /* private browsing — badge simply reappears next visit */
    }
    setSeenDate(LATEST_CHANGELOG_DATE);
  }, []);

  return {
    hasUnread: Boolean(LATEST_CHANGELOG_DATE) && seenDate < LATEST_CHANGELOG_DATE,
    latestDate: LATEST_CHANGELOG_DATE,
    markSeen,
  };
};
