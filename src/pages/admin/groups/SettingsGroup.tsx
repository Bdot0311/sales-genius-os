import { AdminTabGroup } from "@/components/admin/AdminTabGroup";
import AdminSettings from "../Settings";
import AdminWebhooks from "../Webhooks";

export default function SettingsGroup() {
  return (
    <AdminTabGroup
      tabs={[
        { value: "general", label: "General", element: <AdminSettings /> },
        { value: "webhooks", label: "Webhooks", element: <AdminWebhooks /> },
      ]}
    />
  );
}
