export interface PublishedArticle {
  title: string;
  description: string;
  content: string;
  slug: string;
  published_at: string;
}

const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function articleText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, " ").trim();
}

export function buildNewsletter(post: PublishedArticle, template: string, html: string, siteUrl: string) {
  const date = new Date(post.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  // The tip quotes an actual action/paragraph from this article, never invented advice or metrics.
  const firstParagraph = [...html.matchAll(/<p[^>]*>(.*?)<\/p>/gs)].find((match) => articleText(match[1]).length > 0)?.[1];
  const excerpt = html.match(/<li[^>]*>(.*?)<\/li>/s)?.[1] ?? firstParagraph ?? escape(post.description);
  const tip = `<h3>Tip of the week</h3><h4 style="padding-top:20px">From this article:</h4><p style="padding-top:16px">${excerpt}</p>`;
  const styled = html
    .replace(/<p>/g, '<p style="color:#f8f5ee;font-size:16px;line-height:1.8;padding-bottom:22px">')
    .replace(/<h2>/g, '<h2 style="color:#925cf0;font-size:28px;line-height:1.3;padding-top:28px;padding-bottom:18px">')
    .replace(/<h3>/g, '<h3 style="color:#925cf0;font-size:24px;line-height:1.4;padding-top:22px;padding-bottom:16px">')
    .replace(/<li>/g, '<li style="color:#f8f5ee;line-height:1.8;padding-bottom:12px">')
    .replace(/<blockquote>/g, '<blockquote style="background:#e9dffb;color:#25143f;padding:24px;border-radius:8px">')
    .replace(/<a /g, '<a style="color:#b79aef" ')
    .replace(/<img /g, '<img style="display:block;max-width:100%;height:auto;margin:24px 0" ')
    .replace(/<table>/g, '<table style="width:100%;color:#f8f5ee;border-collapse:collapse">')
    .replace(/<t([dh])>/g, '<t$1 style="padding:10px;border:1px solid #252525;text-align:left">')
    .replace(/<p style="[^"]*">/, '<p style="background:#e9dffb;color:#25143f;padding:24px;border-radius:8px;font-size:16px;line-height:1.8">');
  const values: Record<string, string> = {
    ISSUE: `<p style="color:#000000">OUTREIGN FIELD NOTES | ${escape(date.toUpperCase())}</p>`,
    TITLE: `<h2 style="color:#000000">${escape(post.title)}</h2>`,
    DESCRIPTION: `<p style="color:#000000">${escape(post.description)}</p><p style="color:#000000;padding-top:12px">${escape(date)}</p>`,
    SUBTITLE: `<h3 style="color:#925cf0">${escape(post.title)}</h3>`,
    ARTICLE: styled,
    TIP: tip,
    BLOG_URL: escape(new URL(`/blog/${encodeURIComponent(post.slug)}`, siteUrl).href),
  };
  return {
    html: template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key: string) => values[key] ?? ""),
    plain_text: `${post.title}\n${post.description}\n${date}\n\n${post.content}\n\nTip of the week\n${articleText(excerpt)}\n\nView email: *|ARCHIVE|*\nPreferences: *|UPDATE_PROFILE|*\nUnsubscribe: *|UNSUB|*\n*|LIST:ADDRESSLINE|*`,
    expectedArticleText: articleText(html),
  };
}

export interface MailchimpClient {
  <T>(path: string, method?: string, body?: unknown): Promise<T>;
}

export async function deliverNewsletter(options: {
  post: PublishedArticle;
  newsletter: ReturnType<typeof buildNewsletter>;
  audienceId: string;
  fromEmail: string;
  mailchimp: MailchimpClient;
  save: (status: string, campaignId: string) => Promise<void>;
}) {
  const { post, newsletter, audienceId, fromEmail, mailchimp, save } = options;
  // Do not set template_id: Mailchimp's multichannel template erased the approved content previously.
  const campaign = await mailchimp<{ id: string }>("campaigns", "POST", {
    type: "regular",
    recipients: { list_id: audienceId }, // Mailchimp regular campaigns target subscribed contacts only.
    settings: { subject_line: post.title, preview_text: post.description, title: `OutReign blog — ${post.slug}`, from_name: "OutReign", reply_to: fromEmail, inline_css: true, auto_footer: false },
  });
  if (!campaign.id) throw new Error("Mailchimp did not return a campaign ID");
  await save("processing", campaign.id);
  await mailchimp(`campaigns/${campaign.id}/content`, "PUT", { html: newsletter.html, plain_text: newsletter.plain_text });
  const content = await mailchimp<{ html?: string; plain_text?: string }>(`campaigns/${campaign.id}/content`);
  if (!content.html || !content.plain_text || !articleText(content.html).includes(newsletter.expectedArticleText)) {
    throw new Error("Mailchimp saved content is missing the full article; send stopped");
  }
  const checklist = await mailchimp<{ is_ready: boolean; items?: unknown[] }>(`campaigns/${campaign.id}/send-checklist`);
  if (!checklist.is_ready) throw new Error(`Mailchimp campaign not ready: ${JSON.stringify(checklist.items ?? [])}`);
  // Persist the irreversible-send boundary BEFORE calling Mailchimp. Never automatically replay it.
  await save("sending", campaign.id);
  await mailchimp(`campaigns/${campaign.id}/actions/send`, "POST");
  await save("accepted", campaign.id);
  return campaign.id;
}