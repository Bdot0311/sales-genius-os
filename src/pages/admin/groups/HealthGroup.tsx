import { AdminTabGroup } from "@/components/admin/AdminTabGroup";
import AdminSystemHealth from "../SystemHealth";
import AdminRealtimeHealth from "../RealtimeHealth";
import AdminActivity from "../Activity";
import AdminAlerts from "../Alerts";

export default function HealthGroup() {
  return (
    <AdminTabGroup
      tabs={[
        { value: "system", label: "System Health", element: <AdminSystemHealth /> },
        { value: "realtime", label: "Realtime", element: <AdminRealtimeHealth /> },
        { value: "activity", label: "Activity Logs", element: <AdminActivity /> },
        { value: "alerts", label: "Alerts", element: <AdminAlerts /> },
      ]}
    />
  );
}
