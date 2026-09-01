import { AdminTabGroup } from "@/components/admin/AdminTabGroup";
import AdminAnalytics from "../Analytics";
import AdminTraffic from "../Traffic";
import AdminReEngagement from "../ReEngagement";

export default function GrowthGroup() {
  return (
    <AdminTabGroup
      tabs={[
        { value: "analytics", label: "Analytics", element: <AdminAnalytics /> },
        { value: "traffic", label: "Traffic Sources", element: <AdminTraffic /> },
        { value: "re-engagement", label: "Re-engagement", element: <AdminReEngagement /> },
      ]}
    />
  );
}
