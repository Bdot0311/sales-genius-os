import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeadsTool from "./tools/list-leads";
import searchLeadsTool from "./tools/search-leads";
import listSequencesTool from "./tools/list-sequences";
import listRecentRepliesTool from "./tools/list-recent-replies";
import listRecentSentEmailsTool from "./tools/list-recent-sent-emails";
import createLeadTool from "./tools/create-lead";
import updateLeadTool from "./tools/update-lead";
import enrollLeadTool from "./tools/enroll-lead";
import sendReplyTool from "./tools/send-reply";
import listDealsTool from "./tools/list-deals";
import updateDealTool from "./tools/update-deal";
import listIcpProfilesTool from "./tools/list-icp-profiles";
import updateIcpProfileTool from "./tools/update-icp-profile";
import getAgentStatsTool from "./tools/get-agent-stats";
import updateAgentConfigTool from "./tools/update-agent-config";

// Build the OAuth issuer from the Supabase project ref, inlined by Vite at
// build time so no runtime env read happens at module load.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "outreign-mcp",
  title: "OutReign",
  version: "0.2.0",
  instructions:
    "Tools for OutReign — an AI sales outreach and lead intelligence platform. " +
    "Read and manage the signed-in user's leads, sequences, deals, ICP profiles, AI agent, sent emails, and inbox replies. " +
    "All operations are scoped to the authenticated user by row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    // Read
    listLeadsTool,
    searchLeadsTool,
    listSequencesTool,
    listRecentRepliesTool,
    listRecentSentEmailsTool,
    listDealsTool,
    listIcpProfilesTool,
    getAgentStatsTool,
    // Write / edit
    createLeadTool,
    updateLeadTool,
    enrollLeadTool,
    sendReplyTool,
    updateDealTool,
    updateIcpProfileTool,
    updateAgentConfigTool,
  ],
});
