/**
 * Telling a click apart from an actual enquiry.
 *
 * Two different things land in `campaign_setup_requests` and the admin table
 * showed them identically. Pressing a "book a campaign setup" button logs a
 * row immediately, through `log-campaign-setup-request`, with
 * `status: "new"` and whatever identity the page happened to know — which for
 * a logged-out visitor on a landing page is nothing. Only if they then fill
 * the form does `submit-campaign-setup` come back and set the name, the email,
 * the answers and `status: "submitted"`.
 *
 * So most rows are people who clicked and left. Rendered with no status and no
 * contact they all read "Anonymous visitor", which looks like a lead whose
 * details were lost rather than someone who never gave any — thirty-five rows
 * of apparently unreachable enquiries, when the real number of enquiries was a
 * couple.
 *
 * Here rather than in the page so the distinction can be tested as behaviour,
 * and because "is this worth acting on" is a question more than one surface
 * will eventually want to ask.
 */

export interface SetupRequestRow {
  status: string | null;
  contact_email: string | null;
  contact_name: string | null;
  user_id: string | null;
}

export interface RequestState {
  /** Short label for the status column. */
  label: string;
  /** Whether there is somebody here to reply to. */
  actionable: boolean;
  /** Longer form, for a tooltip or empty-state copy. */
  detail: string;
}

/** Whether this row carries anyone we could contact. */
export function hasIdentity(r: SetupRequestRow): boolean {
  return Boolean(r.user_id || r.contact_email?.trim() || r.contact_name?.trim());
}

export function describeRequest(r: SetupRequestRow): RequestState {
  const status = (r.status ?? "").trim().toLowerCase();

  if (status === "submitted") {
    return {
      label: "Submitted",
      actionable: true,
      detail: "Filled in the setup form. Their answers are under Details.",
    };
  }

  /*
   * A click from somebody we can name is still only a click — they opened the
   * form and did not send it — but it is worth something, because we can
   * follow up. A click from a logged-out visitor is not: there is no address.
   */
  if (status === "new") {
    return hasIdentity(r)
      ? {
          label: "Opened, not sent",
          actionable: true,
          detail: "Opened the setup form and did not submit it. We know who they are, so this one can be followed up.",
        }
      : {
          label: "Clicked only",
          actionable: false,
          detail: "Pressed the button on a public page and never submitted the form, so no contact details were ever given.",
        };
  }

  // Anything a later flow introduces shows its own value rather than being
  // quietly folded into one of the two above.
  return {
    label: status ? status.replace(/_/g, " ") : "Unknown",
    actionable: hasIdentity(r),
    detail: "",
  };
}

/** How many of these are worth somebody's time. */
export function countActionable(rows: SetupRequestRow[]): { actionable: number; total: number } {
  return { actionable: rows.filter((r) => describeRequest(r).actionable).length, total: rows.length };
}
