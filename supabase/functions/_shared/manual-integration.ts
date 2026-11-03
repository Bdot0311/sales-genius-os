import { z } from "https://esm.sh/zod@3.25.76";

const providerUrl = (host: string, path: string) => z.string().trim().url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === host && url.pathname.startsWith(path) && !url.username && !url.password;
}, "Enter the HTTPS webhook URL supplied by this provider.");

export const ManualIntegrationSchema = z.discriminatedUnion("integrationId", [
  z.object({ integrationId: z.literal("zapier"), config: z.object({ webhookUrl: providerUrl("hooks.zapier.com", "/hooks/catch/") }).strict() }).strict(),
  z.object({ integrationId: z.literal("slack"), config: z.object({ webhookUrl: providerUrl("hooks.slack.com", "/services/") }).strict() }).strict(),
  z.object({ integrationId: z.literal("salesforce"), config: z.object({
    instanceUrl: z.string().trim().url().refine(value => {
      const url = new URL(value);
      return url.protocol === "https:" && (url.hostname.endsWith(".salesforce.com") || url.hostname.endsWith(".force.com")) && !url.username && !url.password;
    }, "Enter your HTTPS Salesforce instance URL."),
    clientId: z.string().trim().min(1).max(1024), clientSecret: z.string().trim().min(1).max(4096),
  }).strict() }).strict(),
]);

export const MANUAL_INTEGRATION_NAMES = { zapier: "Zapier", slack: "Slack", salesforce: "Salesforce" };