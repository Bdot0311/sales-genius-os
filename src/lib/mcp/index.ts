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
import sendEmailTool from "./tools/send-email";
import listDealsTool from "./tools/list-deals";
import updateDealTool from "./tools/update-deal";
import listIcpProfilesTool from "./tools/list-icp-profiles";
import updateIcpProfileTool from "./tools/update-icp-profile";
import getAgentStatsTool from "./tools/get-agent-stats";
import updateAgentConfigTool from "./tools/update-agent-config";
import searchProspectsTool from "./tools/search-prospects";
import searchCompaniesTool from "./tools/search-companies";
import findPersonTool from "./tools/find-person";
import verifyEmailTool from "./tools/verify-email";
import enrichLeadTool from "./tools/enrich-lead";
import scoreLeadTool from "./tools/score-lead";
import researchLeadTool from "./tools/research-lead";
import generateEmailTool from "./tools/generate-email";
import workspaceActionTool from "./tools/workspace-action";

// Build the OAuth issuer from the Supabase project ref, inlined by Vite at
// build time so no runtime env read happens at module load.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "outreign-mcp",
  title: "OutReign",
  version: "0.3.0",
  instructions:
    "Tools for OutReign — an AI sales outreach and lead intelligence platform. " +
    "Read and manage the signed-in user's leads, sequences, deals, ICP profiles, AI agent, sent emails, and inbox replies. " +
    "Find new B2B prospects with search_prospects (search_leads only searches saved CRM leads), look up people, verify emails, enrich, research, score and draft using the same app handlers and credits. " +
    "All operations are scoped to the authenticated user by row-level security. Do not send, enroll or enable automation without explicit user approval; a verification verdict is not a delivery guarantee.",
  // Clients connect through https://api.outreign.io/mcp and reject a server
  // whose advertised `resource` differs from that URL, so pin both the resource
  // and the metadata document (served by the mcp-oauth-metadata function).
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
    resource: "https://api.outreign.io/mcp",
    protectedResourceMetadataUrl: "https://api.outreign.io/mcp-oauth-metadata",
  }),
  tools: [
    searchProspectsTool,
    searchCompaniesTool,
    findPersonTool,
    verifyEmailTool,
    enrichLeadTool,
    scoreLeadTool,
    researchLeadTool,
    generateEmailTool,
    workspaceActionTool,
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
    sendEmailTool,
    updateDealTool,
    updateIcpProfileTool,
    updateAgentConfigTool,
  ],
});
