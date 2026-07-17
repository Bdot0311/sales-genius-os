import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listLeadsTool from "./tools/list-leads";
import searchLeadsTool from "./tools/search-leads";
import listSequencesTool from "./tools/list-sequences";
import listRecentRepliesTool from "./tools/list-recent-replies";
import listRecentSentEmailsTool from "./tools/list-recent-sent-emails";

// Build the OAuth issuer from the Supabase project ref, inlined by Vite at
// build time so no runtime env read happens at module load.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "outreign-mcp",
  title: "OutReign",
  version: "0.1.0",
  instructions:
    "Tools for OutReign — an AI sales outreach and lead intelligence platform. " +
    "Use these tools to read the signed-in user's leads, email sequences, sent emails, and inbox replies. " +
    "All results are scoped to the authenticated user by row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listLeadsTool,
    searchLeadsTool,
    listSequencesTool,
    listRecentRepliesTool,
    listRecentSentEmailsTool,
  ],
});
