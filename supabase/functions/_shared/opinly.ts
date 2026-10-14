/**
 * Opinly content -> OutReign blog posts.
 *
 * The blog is already built: `blog_posts` rows render at /blog and /blog/:slug,
 * feed the sitemap snapshot, and carry their own SEO. So Opinly is wired in as
 * a *source* for that table rather than as a second blog with its own pages —
 * anything Opinly publishes shows up in the existing blog section, styled the
 * same, indexed the same, with no parallel route tree to keep in sync.
 *
 * Opinly stores bodies as ProseMirror JSON. `blog_posts.content` is markdown
 * (that is what BlogPost.tsx renders), so the conversion happens here, once,
 * at ingest time — not in the browser on every read.
 */

const API_BASE = "https://sdk.opinly.ai/v1";
const CDN_BASE = "https://cdn.opinly.ai/RP1roF9Mh0t-Ho8PKNtZU";

export interface OpinlyImage {
  fileKey?: string | null;
  alt?: string | null;
  altText?: string | null;
  title?: string | null;
  caption?: string | null;
}

export interface OpinlyPostSummary {
  slug: string;
  title: string;
  description: string;
  firstPublishedAt: string;
  lastPublishedAt: string;
  image?: OpinlyImage | null;
  category?: { slug: string; name: string; description?: string } | null;
  author?: { name: string; slug: string } | null;
  tags?: Array<{ slug: string; name: string }>;
}

export interface OpinlyNode {
  type?: string;
  attrs?: Record<string, unknown> | null;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> | null }>;
  text?: string;
  content?: OpinlyNode[];
}

export interface OpinlyFullPost {
  slug: string;
  title: string;
  description: string;
  metaTitle?: string | null;
  metaDescription?: string | null;
  content: OpinlyNode;
  titleFile?: OpinlyImage | null;
  firstPublishedAt: string;
  modifiedAt: string;
  images?: OpinlyImage[];
  author?: { name: string; slug: string; bio?: string | null } | null;
  faqs?: Array<{ question: string; answer: string }> | null;
  category?: { slug: string; name: string; description?: string } | null;
  tags?: Array<{ slug: string; name: string }>;
}

/** Images are referenced by fileKey; the CDN prefix is fixed per workspace. */
export function opinlyImageUrl(fileKey?: string | null): string | null {
  if (!fileKey) return null;
  if (/^https?:\/\//i.test(fileKey)) return fileKey;
  return `${CDN_BASE}/${String(fileKey).replace(/^\/+/, "")}`;
}

export class OpinlyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function get<T>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpinlyError(`Opinly ${path} -> ${res.status} ${body.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

export function listPosts(
  apiKey: string,
  opts: { limit?: number; cursor?: string | null } = {},
): Promise<{ data: OpinlyPostSummary[]; has_more: boolean; next_cursor: string | null }> {
  const params = new URLSearchParams({ limit: String(opts.limit ?? 50), sort: "newest" });
  if (opts.cursor) params.set("cursor", opts.cursor);
  return get(`/content/posts?${params}`, apiKey);
}

export function getPost(apiKey: string, slug: string): Promise<OpinlyFullPost> {
  return get(`/content/post?slug=${encodeURIComponent(slug)}`, apiKey);
}

// ---------------------------------------------------------------------------
// ProseMirror -> markdown
// ---------------------------------------------------------------------------

function inline(node: OpinlyNode): string {
  if (node.type === "hardBreak") return "\n";
  if (node.type === "image") {
    const attrs = node.attrs ?? {};
    const src = opinlyImageUrl((attrs.fileKey as string) ?? (attrs.src as string)) ?? "";
    const alt = String(attrs.alt ?? attrs.altText ?? "");
    return src ? `![${alt}](${src})` : "";
  }

  let text = node.text ?? (node.content ?? []).map(inline).join("");
  for (const mark of node.marks ?? []) {
    const attrs = mark.attrs ?? {};
    if (mark.type === "bold" || mark.type === "strong") text = `**${text}**`;
    else if (mark.type === "italic" || mark.type === "em") text = `*${text}*`;
    else if (mark.type === "code") text = `\`${text}\``;
    else if (mark.type === "strike") text = `~~${text}~~`;
    else if (mark.type === "link" && attrs.href) text = `[${text}](${attrs.href})`;
  }
  return text;
}

function block(node: OpinlyNode, depth = 0): string {
  const kids = node.content ?? [];
  const pad = "  ".repeat(depth);

  switch (node.type) {
    case "doc":
      return kids.map((n) => block(n, depth)).filter(Boolean).join("\n\n");
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 2), 1), 6);
      return `${"#".repeat(level)} ${kids.map(inline).join("")}`;
    }
    case "paragraph":
      return kids.map(inline).join("");
    case "bulletList":
      return kids.map((li) => `${pad}- ${listItemText(li, depth)}`).join("\n");
    case "orderedList":
      return kids.map((li, i) => `${pad}${i + 1}. ${listItemText(li, depth)}`).join("\n");
    case "blockquote":
      return kids
        .map((n) => block(n, depth))
        .join("\n\n")
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "codeBlock":
      return `\`\`\`${node.attrs?.language ?? ""}\n${kids.map(inline).join("")}\n\`\`\``;
    case "horizontalRule":
      return "---";
    case "image":
      return inline(node);
    case "table":
      return table(node);
    default:
      if (kids.length) return kids.map((n) => block(n, depth)).filter(Boolean).join("\n\n");
      return inline(node);
  }
}

function listItemText(li: OpinlyNode, depth: number): string {
  const parts = (li.content ?? []).map((n) =>
    n.type === "bulletList" || n.type === "orderedList" ? `\n${block(n, depth + 1)}` : block(n, depth)
  );
  return parts.join(" ").replace(/\n{2,}/g, "\n").trim();
}

function table(node: OpinlyNode): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => (cell.content ?? []).map(inline).join(" ").trim())
  );
  if (!rows.length) return "";
  const [head, ...body] = rows;
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...body.map(line)].join("\n");
}

export function contentToMarkdown(doc: OpinlyNode | null | undefined): string {
  if (!doc) return "";
  return block(doc)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function readingTime(markdown: string): string {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return `${Math.max(1, Math.round(words / 225))} min read`;
}

export interface BlogPostRow {
  slug: string;
  title: string;
  description: string;
  content: string;
  category: string;
  keywords: string[];
  reading_time: string;
  published_at: string;
  source: string;
  updated_at: string;
}

/** Shapes one Opinly post into a `blog_posts` row. */
export function toBlogPostRow(post: OpinlyFullPost): BlogPostRow {
  let markdown = contentToMarkdown(post.content);

  const hero = opinlyImageUrl(post.titleFile?.fileKey);
  if (hero) {
    const alt = post.titleFile?.altText ?? post.titleFile?.alt ?? post.title;
    markdown = `![${alt}](${hero})\n\n${markdown}`;
  }

  // FAQs are a first-class field in Opinly but plain markdown here, so they
  // stay visible in the rendered article instead of being silently dropped.
  if (post.faqs?.length) {
    const faq = post.faqs
      .map((f) => `### ${f.question}\n\n${f.answer}`)
      .join("\n\n");
    markdown = `${markdown}\n\n## Frequently asked questions\n\n${faq}`;
  }

  const description = (post.metaDescription || post.description || "").slice(0, 320);

  return {
    slug: post.slug,
    title: post.metaTitle || post.title,
    description,
    content: markdown,
    category: post.category?.name || "Outbound",
    keywords: (post.tags ?? []).map((t) => t.name).filter(Boolean),
    reading_time: readingTime(markdown),
    published_at: new Date(post.firstPublishedAt).toISOString(),
    source: "opinly",
    updated_at: new Date(post.modifiedAt || post.firstPublishedAt).toISOString(),
  };
}
