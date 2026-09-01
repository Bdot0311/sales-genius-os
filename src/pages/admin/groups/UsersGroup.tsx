import { AdminTabGroup } from "@/components/admin/AdminTabGroup";
import AdminUsers from "../Users";
import AdminActivation from "../Activation";
import AdminSignupLogs from "../SignupLogs";
import AdminCampaignSetup from "../CampaignSetup";

export default function UsersGroup() {
  return (
    <AdminTabGroup
      tabs={[
        { value: "users", label: "All Users", element: <AdminUsers /> },
        { value: "activation", label: "Activation", element: <AdminActivation /> },
        { value: "signup-logs", label: "Signup Logs", element: <AdminSignupLogs /> },
        { value: "campaign-setup", label: "Campaign Setup", element: <AdminCampaignSetup /> },
      ]}
    />
  );
}
