import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { marked } from "npm:marked@18.2.1";
import sanitizeHtml from "npm:sanitize-html@2.18.2";
import { crypto } from "jsr:@std/crypto";
import { encodeHex } from "jsr:@std/encoding/hex";
import { z } from "npm:zod@3";
import { requireServiceRole } from "../_shared/internal-auth.ts";
import { blogEmailTemplate } from "./template.ts";
import { buildNewsletter, deliverNewsletter, type PublishedArticle, type MailchimpClient } from "./newsletter.ts";
import { processSignupImports } from "./signup-import.ts";

const Article = z.object({ title: z.string().min(1), description: z.string(), content: z.string().min(1), slug: z.string().min(1), published_at: z.string().datetime({ offset: true }) });
const Body = z.object({ preview_post_id: z.string().uuid().optional() }).strict();
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const unauthorized = requireServiceRole(req);
  if (unauthorized) return unauthorized;
  if (req.method !== "POST") return json({ error: "POST required" }, 405);
  const input = Body.safeParse(await req.json().catch(() => null));
  if (!input.success) return json({ error: "Invalid request" }, 400);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrl = Deno.env.get("MAILCHIMP_BLOG_SITE_URL");
  const gateway = Deno.env.get("MAILCHIMP_GATEWAY_URL");
  const audienceId = Deno.env.get("MAILCHIMP_BLOG_AUDIENCE_ID");
  const fromEmail = Deno.env.get("MAILCHIMP_BLOG_FROM_EMAIL");
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connectionKey = Deno.env.get("MAILCHIMP_MARKETING_API_KEY");
  if (!url || !key || !siteUrl || !gateway || !audienceId || !fromEmail || !lovableKey || !connectionKey) return json({ success: false, error: "Mailchimp blog delivery configuration missing" });
  const db = createClient(url, key);
  let deliveryId: string | undefined;
  let campaignId: string | undefined;
  let sending = false;
  const mailchimp: MailchimpClient = async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
    const response = await fetch(`${gateway.replace(/\/$/, "")}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": connectionKey, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Mailchimp [${response.status}]: ${await response.text()}`);
    return response.status === 204 ? undefined as T : await response.json() as T;
  };
  try {
    let imports: { synced: number; failed: number } | undefined;
    if (!input.data.preview_post_id) {
      const { error: resetError } = await db.from('mailchimp_signup_imports').update({ status: 'pending' }).eq('status', 'processing').eq('opted_in', true).lt('updated_at', new Date(Date.now() - 30 * 60_000).toISOString());
      if (resetError) throw new Error(resetError.message);
      imports = await processSignupImports({
        audienceId, mailchimp,
        hash: async email => encodeHex(await crypto.subtle.digest('MD5', new TextEncoder().encode(email))),
        claim: async () => {
          const { data, error } = await db.rpc('claim_mailchimp_signup_import');
          if (error) throw new Error(error.message);
          return data?.[0];
        },
        save: async (job, status, memberStatus, errorMessage) => {
          const { error } = await db.from('mailchimp_signup_imports').update({ status, member_status: memberStatus, error: errorMessage, updated_at: new Date().toISOString() }).eq('user_id', job.user_id).eq('updated_at', job.updated_at).eq('opted_in', true).eq('status', 'processing');
          if (error) throw new Error(error.message);
        },
      });
    }
    let post: PublishedArticle;
    if (input.data.preview_post_id) {
      const { data, error } = await db.from("blog_posts").select("title,description,content,slug,published_at").eq("id", input.data.preview_post_id).single();
      if (error) throw new Error(error.message);
      post = Article.parse(data);
    } else {
      // Crashes/ambiguous provider sends stop for review, not a duplicate email.
      const { error: staleError } = await db.from("blog_mailchimp_deliveries").update({ status: "needs_review", error: "Interrupted delivery: inspect saved Mailchimp campaign before retrying", updated_at: new Date().toISOString() }).in("status", ["processing", "sending"]).lt("updated_at", new Date(Date.now() - 30 * 60_000).toISOString());
      if (staleError) throw new Error(staleError.message);
      const { data, error } = await db.rpc("claim_blog_mailchimp_delivery");
      if (error) throw new Error(error.message);
      const job = data?.[0];
      if (!job) return json({ success: true, queued: false, imports });
      deliveryId = job.id;
      post = Article.parse(job.article);
    }
    const markdown = await marked.parse(post.content);
    const html = sanitizeHtml(markdown, {
      allowedTags: ["p", "h1", "h2", "h3", "h4", "ul", "ol", "li", "strong", "em", "a", "img", "blockquote", "table", "thead", "tbody", "tr", "td", "th", "hr", "br", "pre", "code"],
      allowedAttributes: { a: ["href", "title"], img: ["src", "alt"], ol: ["start"] },
      allowedSchemes: ["https", "http", "mailto"],
      allowProtocolRelative: false,
      transformTags: { a: (_tag: string, attrs: Record<string, string>) => ({ tagName: "a", attribs: { ...attrs, href: attrs.href?.startsWith("/") ? new URL(attrs.href, siteUrl).href : attrs.href } }) },
    });
    const newsletter = buildNewsletter(post, blogEmailTemplate, html, siteUrl);
    if (input.data.preview_post_id) return json({ success: true, preview: newsletter, post });
    const save = async (status: string, id: string) => {
      if (!deliveryId) throw new Error("Delivery ID missing");
      campaignId = id;
      if (status === "sending") sending = true;
      const { error } = await db.from("blog_mailchimp_deliveries").update({ status, campaign_id: id, updated_at: new Date().toISOString(), error: null }).eq("id", deliveryId);
      if (error) throw new Error(`Delivery state write failed: ${error.message}`);
    };
    await deliverNewsletter({ post, newsletter, audienceId, fromEmail, mailchimp, save });
    return json({ success: true, status: "accepted", campaign_id: campaignId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (deliveryId) {
      const { error: writeError } = await db.from("blog_mailchimp_deliveries").update({ status: sending ? "needs_review" : "failed", campaign_id: campaignId, error: message.slice(0, 4000), updated_at: new Date().toISOString() }).eq("id", deliveryId);
      if (writeError) console.error("Blog delivery failure could not be recorded:", writeError.message);
    }
    return json({ success: false, error: message });
  }
});