import { useParams, Link, Navigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, ArticleSchema } from "@/components/seo";
import { useBlogPost } from "@/hooks/useBlogPosts";
import { relatedPosts } from "@/lib/related-posts";
import { lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { publicBlogPosts } from "@/data/public-blog-posts";
import { Button } from "@/components/ui/button";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

const headingId = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Minimal markdown renderer: headers, bold, links, lists, paragraphs
function renderMarkdown(content: string): JSX.Element[] {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // Fenced code block: ```
    if (line.startsWith("```")) {
      i++;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      elements.push(
        <pre
          key={key++}
          className="my-6 overflow-x-auto rounded-lg p-4 text-xs sm:text-sm font-mono"
          style={{
            background: "hsl(261 75% 4%)",
            border: "1px solid hsl(261 75% 50% / 0.15)",
            color: "hsl(0 0% 85%)",
            lineHeight: 1.55,
          }}
        >
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} id={headingId(line.slice(3))} className="font-display mt-12 mb-4 text-2xl font-semibold leading-snug scroll-mt-24 text-foreground">
          {line.slice(3)}
        </h2>
      );
      i++; continue;
    }

    // H3
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={key++} className="mt-8 mb-3 text-lg font-semibold" style={{ color: "hsl(0 0% 85%)" }}>
          {line.slice(4)}
        </h3>
      );
      i++; continue;
    }

    // Table
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.filter(l => !l.match(/^\|[\s\-:|]+\|$/));
      elements.push(
        <div key={key++} className="overflow-x-auto my-8">
          <table className="w-full text-sm border-collapse" style={{ tableLayout: "auto" }}>
            <tbody>
              {rows.map((row, ri) => {
                const cells = row.split("|").filter((_, ci) => ci > 0 && ci < row.split("|").length - 1);
                const Tag = ri === 0 ? "th" : "td";
                return (
                  <tr key={ri} style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.12)" }}>
                    {cells.map((cell, ci) => (
                      <Tag
                        key={ci}
                        className="py-3 px-4 text-left align-top"
                        style={{
                          color: ri === 0 ? "hsl(261 75% 65%)" : "hsl(0 0% 100% / 0.7)",
                          fontWeight: ri === 0 ? 600 : 400,
                          fontSize: ri === 0 ? "11px" : "14px",
                          textTransform: ri === 0 ? "uppercase" : "none",
                          letterSpacing: ri === 0 ? "0.06em" : "0",
                          wordBreak: "normal",
                          overflowWrap: "break-word",
                          hyphens: "none",
                          lineHeight: 1.5,
                        }}
                      >
                        {renderInline(cell.trim())}
                      </Tag>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Unordered list
    if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={key++} className="my-4 space-y-2 pl-5">
          {items.map((item, idx) => (
            <li key={idx} className="text-base leading-relaxed list-disc" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      elements.push(
        <blockquote
          key={key++}
          className="my-6 px-5 py-4 rounded-lg font-mono text-sm italic"
          style={{
            background: "hsl(261 75% 50% / 0.07)",
            borderLeft: "2px solid hsl(261 75% 50% / 0.4)",
            color: "hsl(261 75% 72%)",
          }}
        >
          {renderInline(line.slice(2))}
        </blockquote>
      );
      i++; continue;
    }

    // Bold label paragraph (e.g. **1. Title**)
    // Regular paragraph
    elements.push(
      <p key={key++} className="my-4 text-base leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return elements;
}

function renderInline(text: string): React.ReactNode {
  // Bold: **text**
  // Link: [text](url)
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} style={{ color: "hsl(0 0% 85%)", fontWeight: 600 }}>{part.slice(2, -2)}</strong>;
    }
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      const isInternal = href.startsWith("/") || href.includes("outreign.io");
      return (
        <a
          key={i}
          href={href}
          {...(!isInternal && { target: "_blank", rel: "noopener noreferrer" })}
          style={{ color: "hsl(261 75% 65%)", textDecoration: "underline", textDecorationColor: "hsl(261 75% 50% / 0.4)" }}
        >
          {label}
        </a>
      );
    }
    return part;
  });
}

const BlogPost = () => {
  const { slug } = useParams<{ slug: string }>();
  const initialPost = publicBlogPosts.find((post) => post.slug === slug);
  const post = useBlogPost(slug, initialPost);
  // Computed from the static index, so it is in the markup a crawler reads
  // rather than appearing after a fetch.
  const related = relatedPosts(slug ?? "");

  if (post === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(261 75% 2%)" }}>
        <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>Loading…</p>
      </div>
    );
  }
  if (post === null) return <Navigate to="/blog" replace />;

  const canonicalUrl = `https://outreign.io/blog/${post.slug}`;

  return (
    <>
      <SEOHead
        title={post.title}
        description={post.description}
        keywords={post.keywords.join(", ")}
        ogType="article"
        canonicalUrl={canonicalUrl}
        publishedTime={post.publishedAt}
      />
      <ArticleSchema
        headline={post.title}
        description={post.description}
        author={{ name: "Brandon Yakubov", url: "https://www.linkedin.com/in/buildwitbrandon" }}
        datePublished={post.publishedAt}
        url={canonicalUrl}
        keywords={post.keywords}
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://outreign.io" },
        { name: "Blog", url: "https://outreign.io/blog" },
        { name: post.title, url: canonicalUrl },
      ]} />

      <div className="min-h-screen" style={{ background: "hsl(261 75% 2%)" }}>
        <Navbar />

        <main className="container mx-auto px-6 py-20 max-w-3xl">
          {/* Back */}
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm mb-12 transition-colors duration-150"
            style={{ color: "hsl(0 0% 100% / 0.7)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.65)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.6)")}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All articles
          </Link>

          {/* Header */}
          <header className="mb-12">
            <p className="text-[10px] uppercase tracking-widest mb-4 font-medium text-primary">
              {post.category} · {post.readingTime}
            </p>
            <h1
              className="font-display text-3xl sm:text-5xl mb-6 font-extrabold leading-tight text-foreground break-words"
            >
              {post.title}
            </h1>
            <p className="text-lg font-light leading-relaxed mb-6" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
              {post.description}
            </p>
            <div className="h-px" style={{ background: "hsl(261 75% 50% / 0.2)" }} />
          </header>

          <p className="text-sm text-muted-foreground mb-8">
            By Brandon Yakubov · Updated <time dateTime={post.publishedAt}>{post.publishedAt}</time>
          </p>
          <nav aria-label="In this article" className="mb-10 border-y border-border py-5">
            <p className="text-sm font-semibold mb-3">In this article</p>
            <ul className="space-y-2 text-sm">
              {post.content.split("\n").filter((line) => line.startsWith("## ")).map((line) => (
                <li key={line}><a className="text-primary underline" href={`#${headingId(line.slice(3))}`}>{line.slice(3)}</a></li>
              ))}
            </ul>
          </nav>
          {/* Article body */}
          <article className="prose-custom">
            {renderMarkdown(post.content)}
          </article>

          {/* CTA */}
          <div
            className="mt-16 p-8 rounded-2xl"
            style={{ background: "hsl(261 75% 50% / 0.07)", border: "1px solid hsl(261 75% 50% / 0.18)" }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: "hsl(261 75% 70%)" }}>Try OutReign free</p>
            <p className="text-base font-light mb-5" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
              Explore the sample lead workflow, then choose a paid plan for live prospecting and enrichment.
            </p>
            <Button asChild><Link to="/auth">Get started free →</Link></Button>
          </div>

          {/* Where to go next.
              Every article used to end here, with one link back to the index.
              A reader who finished had nowhere to go and a crawler following
              one in found a leaf — sixteen articles that were sixteen islands,
              none of them passing any authority to the others. */}
          {related.length > 0 && (
            <section className="mt-20" aria-labelledby="related-heading">
              <h2
                id="related-heading"
                className="text-[10px] uppercase tracking-widest mb-6 font-medium"
                style={{ color: "hsl(0 0% 100% / 0.4)" }}
              >
                Keep reading
              </h2>
              <ul className="space-y-px">
                {related.map((item) => (
                  <li key={item.slug}>
                    <Link
                      to={`/blog/${item.slug}`}
                      className="group block rounded-lg px-4 py-4 -mx-4 transition-colors duration-150 hover:bg-white/[0.03]"
                    >
                      <p
                        className="text-[10px] uppercase tracking-widest mb-1.5 font-medium text-primary"
                      >
                        {item.category} · {item.readingTime}
                      </p>
                      <p
                        className="text-base font-medium leading-snug"
                        style={{ color: "hsl(0 0% 95%)" }}
                      >
                        {item.title}
                      </p>
                      <p
                        className="mt-1 text-sm font-light leading-relaxed line-clamp-2"
                        style={{ color: "hsl(0 0% 100% / 0.5)" }}
                      >
                        {item.description}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>

        <Suspense fallback={null}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default BlogPost;
