const DELETED_KEY = "salesos_deleted_email_ids";

export const getDeletedEmailIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(DELETED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

export const persistDeletedEmailIds = (ids: Set<string>) => {
  localStorage.setItem(DELETED_KEY, JSON.stringify(Array.from(ids)));
};
