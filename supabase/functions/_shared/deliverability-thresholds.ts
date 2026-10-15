/**
 * The lines at which a deliverability number stops being fine.
 *
 * These existed twice, in two places that could not see each other, and they
 * disagreed about the thing that matters most: when to tell the user.
 *
 * The dashboard tile called a 3.4% bounce rate "At risk" and said, in its own
 * words, "over the 2% line where reputation starts to erode". The alert scan
 * marked the same number `warning`, because its critical threshold was 5%. And
 * only critical alerts are ever emailed. So the product showed a red tile for
 * thirty days and sent nothing, and the operator found out by opening the page.
 *
 * 5% is not where you want to first hear about it. That is the point at which
 * providers are already throttling the sender — the damage is done and the
 * recovery is slow. 3% is the line where accepted practice is to pause
 * production sends, which is a "stop what you are doing" event, and that is
 * what an email is for.
 *
 * So the numbers live here, once, and both sides import them. A tile that says
 * "at risk" and an alert that says "not worth an email" cannot both be right
 * about the same figure.
 */

/** Below this many sends, a rate is noise: one bad address out of twelve is 8%. */
export const MIN_SENDS_FOR_RATE = 50;

/** Bounce rate at or above which reputation starts to erode. */
export const BOUNCE_AT_RISK = 0.02;
/**
 * Bounce rate at or above which sending should stop until the list is fixed.
 *
 * This is the email threshold, not the throttling threshold. By the time
 * providers throttle you at 5% the recovery takes weeks; 3% is where there is
 * still something to save.
 */
export const BOUNCE_CRITICAL = 0.03;
/** Bounce rate at which providers throttle the sender outright. */
export const BOUNCE_FAILING = 0.05;

/** Complaint rate, as a share of sends, at which providers act on it. */
export const COMPLAINT_CRITICAL = 0.003;

/**
 * Severity for a bounce rate, shared by the alert scan and anything that
 * reports one.
 *
 * `rate` is a fraction (0.034), not a percentage.
 */
export function bounceSeverity(rate: number): "critical" | "warning" {
  return rate >= BOUNCE_CRITICAL ? "critical" : "warning";
}

/** Severity for a complaint rate, as a fraction of sends. */
export function complaintSeverity(rate: number): "critical" | "warning" {
  return rate >= COMPLAINT_CRITICAL ? "critical" : "warning";
}
