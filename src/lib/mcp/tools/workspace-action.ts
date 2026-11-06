import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { callAppAction } from "../app-actions";
export default defineTool({
  name: "workspace_action", title: "Manage sales workspace",
  description: "Use the app's existing account tools for ICPs, signals, sequence enrollment/status, reply classification, mailbox health/settings, deliverability alerts, email templates, objections, campaign briefs and outbound statistics. Read actions return data. Every edit returns a confirmation preview unless confirmed=true after explicit user approval. Optional agent_id preserves that build's role scope. Does not compose or directly send email.",
  inputSchema: {
    action: z.enum(["list_icp_profiles", "update_icp_profile", "list_signals", "refresh_signals", "list_sequence_enrollments", "update_enrollment", "update_sequence_status", "classify_reply", "list_sending_accounts", "update_sending_account", "list_deliverability_alerts", "resolve_deliverability_alert", "list_email_templates", "save_email_template", "list_objections", "save_objection", "list_campaign_briefs", "save_campaign_brief", "get_outbound_stats"]),
    args: z.record(z.unknown()).optional().describe("Action-specific fields from the workspace-actions documentation; ownership fields are never accepted."),
    agent_id: z.string().uuid().optional(), confirmed: z.boolean().optional().describe("True only after the user approved the exact previewed changes."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: (input, ctx) => callAppAction(ctx, "workspace_action", "workspace-action", input),
});