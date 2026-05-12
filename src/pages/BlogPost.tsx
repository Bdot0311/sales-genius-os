import { useParams, Link, Navigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { SEOHead, BreadcrumbSchema, ArticleSchema } from "@/components/seo";
import { getPostBySlug } from "@/data/blog-posts";
import { lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";

const FooterSection = lazy(() =>
  import("@/components/landing/FooterSection").then((m) => ({ default: m.FooterSection }))
);

// Minimal markdown renderer: headers, bold, links, lists, paragraphs
function renderMarkdown(content: string): JSX.Element[] {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let key = 0;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // H2
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={key++} className="font-display mt-12 mb-4 text-2xl font-semibold leading-snug" style={{ color: "hsl(0 0% 90%)", letterSpacing: "-0.01em" }}>
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
      const rows = tableLines.filter(l => !l.match(/^\|[-| ]+\|$/));
      elements.push(
        <div key={key++} className="overflow-x-auto my-8">
          <table className="w-full text-sm border-collapse">
            {rows.map((row, ri) => {
              const cells = row.split("|").filter((_, ci) => ci > 0 && ci < row.split("|").length - 1);
              const Tag = ri === 0 ? "th" : "td";
              return (
                <tr key={ri} style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.12)" }}>
                  {cells.map((cell, ci) => (
                    <Tag
                      key={ci}
                      className="py-3 px-4 text-left"
                      style={{
                        color: ri === 0 ? "hsl(261 75% 65%)" : "hsl(0 0% 100% / 0.6)",
                        fontWeight: ri === 0 ? 600 : 400,
                        fontSize: ri === 0 ? "11px" : "14px",
                        textTransform: ri === 0 ? "uppercase" : "none",
                        letterSpacing: ri === 0 ? "0.06em" : "0",
                      }}
                    >
                      {cell.trim()}
                    </Tag>
                  ))}
                </tr>
              );
            })}
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
          {line.slice(2)}
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
      const isInternal = href.startsWith("/") || href.includes("salesos.alephwavex.io");
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
  const post = slug ? getPostBySlug(slug) : undefined;

  if (!post) return <Navigate to="/blog" replace />;

  const canonicalUrl = `https://salesos.alephwavex.io/blog/${post.slug}`;

  return (
    <>
      <SEOHead
        title={post.title}
        description={post.description}
        keywords={post.keywords.join(", ")}
        ogType="article"
        canonicalUrl={canonicalUrl}
        publishedTime={post.publishedAt}
        ogImage="https://salesos.alephwavex.io/salesos-og.png"
      />
      <ArticleSchema
        headline={post.title}
        description={post.description}
        author={{ name: "Brandon Dottin", url: "https://www.linkedin.com/in/buildwitbrandon" }}
        datePublished={post.publishedAt}
        url={canonicalUrl}
        keywords={post.keywords}
      />
      <BreadcrumbSchema items={[
        { name: "Home", url: "https://salesos.alephwavex.io" },
        { name: "Blog", url: "https://salesos.alephwavex.io/blog" },
        { name: post.title, url: canonicalUrl },
      ]} />

      <div className="min-h-screen" style={{ background: "hsl(0,0%,3%)" }}>
        <Navbar />

        <main className="container mx-auto px-6 py-20 max-w-2xl">
          {/* Back */}
          <Link
            to="/blog"
            className="inline-flex items-center gap-1.5 text-sm mb-12 transition-colors duration-150"
            style={{ color: "hsl(0 0% 100% / 0.35)" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.65)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.35)")}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All articles
          </Link>

          {/* Header */}
          <header className="mb-12">
            <p className="text-[10px] uppercase tracking-widest mb-4 font-medium" style={{ color: "hsl(261 75% 55%)" }}>
              {post.category} · {post.readingTime}
            </p>
            <h1
              className="font-display mb-6"
              style={{
                fontSize: "clamp(1.75rem, 4vw, 3rem)",
                fontWeight: 800,
                lineHeight: 1.1,
                letterSpacing: "-0.02em",
                color: "hsl(0 0% 95%)",
              }}
            >
              {post.title}
            </h1>
            <p className="text-lg font-light leading-relaxed mb-6" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
              {post.description}
            </p>
            <div className="h-px" style={{ background: "hsl(261 75% 50% / 0.2)" }} />
          </header>

          {/* Article body */}
          <article className="prose-custom">
            {renderMarkdown(post.content)}
          </article>

          {/* CTA */}
          <div
            className="mt-16 p-8 rounded-2xl"
            style={{ background: "hsl(261 75% 50% / 0.07)", border: "1px solid hsl(261 75% 50% / 0.18)" }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: "hsl(261 75% 70%)" }}>Try SalesOS free</p>
            <p className="text-base font-light mb-5" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
              Describe your ICP in plain English and get ranked, verified prospects in under 2 minutes.
            </p>
            <a
              href="/auth"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold text-white transition-opacity duration-150 hover:opacity-90"
              style={{ background: "linear-gradient(135deg, hsl(261 75% 60%) 0%, hsl(261 75% 50%) 100%)" }}
            >
              Get started free →
            </a>
          </div>
        </main>

        <Suspense fallback={null}>
          <FooterSection />
        </Suspense>
      </div>
    </>
  );
};

export default BlogPost;
