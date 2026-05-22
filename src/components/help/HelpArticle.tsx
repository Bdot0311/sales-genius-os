import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, ThumbsUp, ThumbsDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  HelpArticle as HelpArticleType,
  getRelatedArticles,
  getCategoryInfo,
} from "./helpArticles";

interface HelpArticleProps {
  article: HelpArticleType;
}

const cardStyle = {
  background: "hsl(261 75% 50% / 0.04)",
  border: "1px solid hsl(261 75% 50% / 0.14)",
} as const;

const dividerStyle = { borderColor: "hsl(261 75% 50% / 0.14)" } as const;

export const HelpArticle = ({ article }: HelpArticleProps) => {
  const [feedbackGiven, setFeedbackGiven] = useState<"helpful" | "not-helpful" | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const categoryInfo = getCategoryInfo(article.category);
  const relatedArticles = getRelatedArticles(article.id);

  const handleFeedback = (type: "helpful" | "not-helpful") => {
    setFeedbackGiven(type);
    toast({
      title: "Thank you for your feedback!",
      description:
        type === "helpful"
          ? "We're glad this article was helpful."
          : "We'll work on improving this article.",
    });
  };

  const renderInlineFormatting = (text: string) => {
    const result = text
      .replace(/\*\*(.*?)\*\*/g, '<strong style="color:hsl(0 0% 90%);font-weight:600">$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:hsl(261 75% 50% / 0.12);padding:2px 6px;border-radius:4px;font-size:0.85em;color:hsl(261 75% 72%)">$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:hsl(261 75% 65%);text-decoration:underline">$1</a>');
    return <span dangerouslySetInnerHTML={{ __html: result }} />;
  };

  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const elements: JSX.Element[] = [];
    let inCodeBlock = false;
    let codeContent = "";
    let inTable = false;
    let tableRows: string[][] = [];

    lines.forEach((line, index) => {
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          elements.push(
            <pre
              key={`code-${index}`}
              className="rounded-xl p-4 overflow-x-auto my-4 text-sm"
              style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.18)", color: "hsl(261 75% 72%)" }}
            >
              <code>{codeContent}</code>
            </pre>
          );
          codeContent = "";
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        return;
      }
      if (inCodeBlock) {
        codeContent += (codeContent ? "\n" : "") + line;
        return;
      }

      if (line.startsWith("|")) {
        if (!inTable) { inTable = true; tableRows = []; }
        if (!line.includes("---")) {
          const cells = line.split("|").filter((c) => c.trim()).map((c) => c.trim());
          tableRows.push(cells);
        }
        return;
      } else if (inTable) {
        elements.push(
          <div key={`table-${index}`} className="overflow-x-auto my-4 rounded-xl" style={{ border: "1px solid hsl(261 75% 50% / 0.14)" }}>
            <table className="w-full border-collapse">
              <thead style={{ background: "hsl(261 75% 50% / 0.06)" }}>
                <tr>
                  {tableRows[0]?.map((cell, i) => (
                    <th key={i} className="text-left p-3 text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(261 75% 65%)", borderBottom: "1px solid hsl(261 75% 50% / 0.14)" }}>{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex} style={{ borderBottom: "1px solid hsl(261 75% 50% / 0.08)" }}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="p-3 text-sm" style={{ color: "hsl(0 0% 100% / 0.6)" }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        inTable = false;
        tableRows = [];
      }

      if (line.startsWith("## ")) {
        elements.push(
          <h2 key={index} className="font-display mt-10 mb-4 text-2xl font-semibold leading-snug" style={{ color: "hsl(0 0% 90%)", letterSpacing: "-0.01em" }}>
            {line.slice(3)}
          </h2>
        );
        return;
      }
      if (line.startsWith("### ")) {
        elements.push(
          <h3 key={index} className="mt-7 mb-3 text-lg font-semibold" style={{ color: "hsl(0 0% 85%)" }}>
            {line.slice(4)}
          </h3>
        );
        return;
      }
      if (line.startsWith("#### ")) {
        elements.push(
          <h4 key={index} className="mt-5 mb-2 text-base font-semibold" style={{ color: "hsl(0 0% 82%)" }}>
            {line.slice(5)}
          </h4>
        );
        return;
      }

      if (line.match(/^\d+\.\s/)) {
        elements.push(
          <li key={index} className="ml-6 mb-2 list-decimal text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            {renderInlineFormatting(line.replace(/^\d+\.\s/, ""))}
          </li>
        );
        return;
      }
      if (line.startsWith("- ")) {
        elements.push(
          <li key={index} className="ml-6 mb-2 list-disc text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            {renderInlineFormatting(line.slice(2))}
          </li>
        );
        return;
      }

      if (line.trim()) {
        elements.push(
          <p key={index} className="mb-4 text-sm leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.6)" }}>
            {renderInlineFormatting(line)}
          </p>
        );
      }
    });

    return elements;
  };

  return (
    <article className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm mb-6" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
        <Link to="/help" className="transition-colors hover:text-white">Help Center</Link>
        <ChevronRight className="h-4 w-4" style={{ color: "hsl(261 75% 50% / 0.4)" }} />
        <Link to={`/help/category/${article.category}`} className="transition-colors hover:text-white">
          {categoryInfo?.title}
        </Link>
        <ChevronRight className="h-4 w-4" style={{ color: "hsl(261 75% 50% / 0.4)" }} />
        <span style={{ color: "hsl(0 0% 88%)" }}>{article.title}</span>
      </nav>

      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 mb-6 text-sm transition-colors"
        style={{ color: "hsl(0 0% 100% / 0.7)" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 80%)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {/* Article header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <span
            className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ background: "hsl(261 75% 50% / 0.12)", border: "1px solid hsl(261 75% 50% / 0.25)", color: "hsl(261 75% 70%)" }}
          >
            {categoryInfo?.title}
          </span>
          <div className="flex items-center text-sm" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
            <Clock className="h-3.5 w-3.5 mr-1" />
            {article.readTime} min read
          </div>
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold mb-4" style={{ color: "hsl(0 0% 95%)", letterSpacing: "-0.02em" }}>
          {article.title}
        </h1>
        <p className="text-base leading-relaxed" style={{ color: "hsl(0 0% 100% / 0.5)" }}>
          {article.description}
        </p>
      </header>

      {/* Divider */}
      <div className="h-px mb-8" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

      {/* Article content */}
      <div>{renderContent(article.content)}</div>

      {/* Divider */}
      <div className="h-px my-8" style={{ background: "hsl(261 75% 50% / 0.18)" }} />

      {/* Feedback section */}
      <div className="rounded-xl p-6 mb-8" style={cardStyle}>
        <h3 className="font-semibold mb-4" style={{ color: "hsl(0 0% 90%)" }}>Was this article helpful?</h3>
        {feedbackGiven ? (
          <p style={{ color: "hsl(0 0% 100% / 0.55)" }}>
            Thank you for your feedback!
            {feedbackGiven === "not-helpful" && (
              <span>
                {" "}Need more help?{" "}
                <a href="mailto:support@bdotindustries.com" style={{ color: "hsl(261 75% 65%)" }} className="hover:underline">
                  Contact support
                </a>
              </span>
            )}
          </p>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => handleFeedback("helpful")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 85%)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
            >
              <ThumbsUp className="h-4 w-4" />
              Yes, helpful
            </button>
            <button
              onClick={() => handleFeedback("not-helpful")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors"
              style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 85%)" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
            >
              <ThumbsDown className="h-4 w-4" />
              Needs improvement
            </button>
          </div>
        )}
      </div>

      {/* Related articles */}
      {relatedArticles.length > 0 && (
        <section>
          <h3 className="font-semibold text-lg mb-4" style={{ color: "hsl(0 0% 90%)" }}>Related Articles</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {relatedArticles.map((related) => (
              <Link key={related.id} to={`/help/article/${related.slug}`}>
                <div
                  className="p-4 rounded-xl transition-colors"
                  style={cardStyle}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.14)")}
                >
                  <h4 className="font-medium text-sm mb-1" style={{ color: "hsl(0 0% 90%)" }}>{related.title}</h4>
                  <p className="text-xs leading-relaxed line-clamp-2" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
                    {related.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Tags */}
      {article.tags.length > 0 && (
        <div className="mt-8 flex flex-wrap gap-2">
          {article.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2.5 py-1 rounded-full"
              style={{ background: "hsl(261 75% 50% / 0.08)", border: "1px solid hsl(261 75% 50% / 0.18)", color: "hsl(0 0% 100% / 0.5)" }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
};
