import { describe, expect, it } from "vitest";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { articleText, buildNewsletter, deliverNewsletter, type MailchimpClient } from "../../supabase/functions/send-blog-newsletter/newsletter";
import { blogEmailTemplate } from "../../supabase/functions/send-blog-newsletter/template";

const post = {
  title: "Research before outreach",
  description: "A practical field guide.",
  content: "![Research](https://example.com/research.png)\n\nKeep the original source.\n\n## Check the facts\n\n- Verify one fact before drafting.\n- Review the recipient.\n\nFinal paragraph: approve only factual outreach.",
  slug: "research-before-outreach",
  published_at: "2026-11-22T00:48:00+00:00",
};
const html = sanitizeHtml(marked.parse(post.content) as string, { allowedTags: sanitizeHtml.defaults.allowedTags.concat("img"), allowedAttributes: { img: ["src", "alt"], a: ["href"] } });
const newsletter = buildNewsletter(post, blogEmailTemplate, html, "https://outreign.io");

describe("published blog Mailchimp delivery", () => {
  it("includes the same full published article, including its final paragraph and images", () => {
    expect(articleText(newsletter.html)).toContain(articleText(html));
    expect(newsletter.plain_text).toContain(post.content);
    expect(newsletter.html).toContain("https://example.com/research.png");
    expect(newsletter.expectedArticleText).toContain("Final paragraph: approve only factual outreach.");
  });
  it("uses an actual action from the featured article for the tip", () => {
    const tip = newsletter.html.split('id="d45"')[1]?.split("</div>")[0];
    expect(tip).toContain("Verify one fact before drafting.");
    expect(tip).not.toContain("Keep the original source.");
  });

  function client(mode: "complete" | "blank" | "not_ready" | "send_unknown") {
    const calls: Array<{ path: string; method: string; body: unknown }> = [];
    const states: string[] = [];
    const mailchimp: MailchimpClient = async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
      calls.push({ path, method, body });
      if (path === "campaigns") return { id: "campaign-one" } as T;
      if (method === "GET" && path.endsWith("/content")) return (mode === "blank" ? { html: "footer", plain_text: "footer" } : newsletter) as T;
      if (path.endsWith("/send-checklist")) return { is_ready: mode !== "not_ready" } as T;
      if (path.endsWith("/actions/send")) {
        expect(states.at(-1)).toBe("sending");
        if (mode === "send_unknown") throw new Error("Provider response lost");
      }
      return undefined as T;
    };
    const run = () => deliverNewsletter({ post, newsletter, audienceId: "approved-blog-audience", fromEmail: "info@bdotindustries.org", mailchimp, save: async (status) => { states.push(status); } });
    return { calls, states, run };
  }
  it("targets the approved subscribed audience and the specified sender without rebinding a template", async () => {
    const result = client("complete");
    await result.run();
    expect(result.calls[0].body).toMatchObject({ type: "regular", recipients: { list_id: "approved-blog-audience" }, settings: { reply_to: "info@bdotindustries.org" } });
    expect(JSON.stringify(result.calls[0].body)).not.toContain("template_id");
    expect(result.states).toEqual(["processing", "sending", "accepted"]);
    expect(result.calls.filter((c) => c.path.endsWith("/actions/send"))).toHaveLength(1);
  });
  it("never sends a blank or incomplete saved Mailchimp article", async () => {
    const result = client("blank");
    await expect(result.run()).rejects.toThrow("missing the full article");
    expect(result.calls.filter((c) => c.path.endsWith("/actions/send"))).toHaveLength(0);
  });
  it("does not send if Mailchimp reports the campaign is not ready", async () => {
    const result = client("not_ready");
    await expect(result.run()).rejects.toThrow("not ready");
    expect(result.states).toEqual(["processing"]);
  });
  it("does not replay an uncertain send", async () => {
    const result = client("send_unknown");
    await expect(result.run()).rejects.toThrow("Provider response lost");
    expect(result.calls.filter((c) => c.path.endsWith("/actions/send"))).toHaveLength(1);
    expect(result.states).toEqual(["processing", "sending"]);
  });
});