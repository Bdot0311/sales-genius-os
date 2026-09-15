import { MetricStrip } from "@/components/dashboard/Panel";

interface Stats {
  total: number;
  admins: number;
  trials: number;
  locked: number;
  paid: number;
  free: number;
  conversionRate: number;
  planBreakdown: { free: number; starter: number; growth: number; pro: number; agency: number };
}

/**
 * The six numbers at the top of the users screen.
 *
 * They were six tiles, three across then two, each with its own icon in its own
 * tinted square — primary, emerald, blue, amber, red, primary again — so six
 * unrelated counts opened the page as a colour legend and the brightest marks
 * on it meant nothing. The room the icons took goes to saying what each number
 * is, which none of them did.
 */
export const UserStatsCards = ({ stats }: { stats: Stats }) => (
  <MetricStrip
    columns={3}
    metrics={[
      { label: "Total users", value: stats.total, note: "Every account ever created" },
      { label: "Paid", value: stats.paid, note: "On a plan right now" },
      { label: "Conversion", value: `${stats.conversionRate}%`, note: "Of all users, on a paid plan" },
      { label: "Active trials", value: stats.trials, note: "Neither converted nor expired" },
      { label: "Locked", value: stats.locked, note: "Usually an expired trial" },
      { label: "Admins", value: stats.admins, note: "Accounts with elevated access" },
    ]}
  />
);
