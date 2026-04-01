import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, ThumbsUp, ThumbsDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { 
  HelpArticle as HelpArticleType, 
  getRelatedArticles, 
  getCategoryInfo 
} from "./helpArticles";

interface HelpArticleProps {
  article: HelpArticleType;
}

export const HelpArticle = ({ article }: HelpArticleProps) => {
  const [feedbackGiven, setFeedbackGiven] = useState<'helpful' | 'not-helpful' | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const categoryInfo = getCategoryInfo(article.category);
  const relatedArticles = getRelatedArticles(article.id);

  const handleFeedback = (type: 'helpful' | 'not-helpful') => {
    setFeedbackGiven(type);
    toast({
      title: "Thank you for your feedback!",
      description: type === 'helpful' 
        ? "We're glad this article was helpful." 
        : "We'll work on improving this article.",
    });
  };

  // Simple markdown-like content renderer
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    const elements: JSX.Element[] = [];
    let inCodeBlock = false;
    let codeContent = '';
    let codeLanguage = '';
    let inTable = false;
    let tableRows: string[][] = [];

    lines.forEach((line, index) => {
      // Code block start/end
      if (line.startsWith('```')) {
        if (inCodeBlock) {
          elements.push(
            <pre key={`code-${index}`} className="bg-muted rounded-lg p-4 overflow-x-auto my-4">
              <code className="text-sm">{codeContent}</code>
            </pre>
          );
          codeContent = '';
          inCodeBlock = false;
        } else {
          codeLanguage = line.slice(3);
          inCodeBlock = true;
        }
        return;
      }

      if (inCodeBlock) {
        codeContent += (codeContent ? '\n' : '') + line;
        return;
      }

      // Table handling
      if (line.startsWith('|')) {
        if (!inTable) {
          inTable = true;
          tableRows = [];
        }
        if (!line.includes('---')) {
          const cells = line.split('|').filter(cell => cell.trim()).map(cell => cell.trim());
          tableRows.push(cells);
        }
        return;
      } else if (inTable) {
        elements.push(
          <div key={`table-${index}`} className="overflow-x-auto my-4">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {tableRows[0]?.map((cell, i) => (
                    <th key={i} className="text-left p-2 font-semibold text-foreground">{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.slice(1).map((row, rowIndex) => (
                  <tr key={rowIndex} className="border-b border-border/50">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="p-2 text-muted-foreground">{cell}</td>
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

      // Headers
      if (line.startsWith('## ')) {
        elements.push(
          <h2 key={index} className="text-2xl font-bold mt-8 mb-4 text-foreground">
            {line.slice(3)}
          </h2>
        );
        return;
      }
      if (line.startsWith('### ')) {
        elements.push(
          <h3 key={index} className="text-xl font-semibold mt-6 mb-3 text-foreground">
            {line.slice(4)}
          </h3>
        );
        return;
      }
      if (line.startsWith('#### ')) {
        elements.push(
          <h4 key={index} className="text-lg font-medium mt-4 mb-2 text-foreground">
            {line.slice(5)}
          </h4>
        );
        return;
      }

      // Lists
      if (line.match(/^\d+\.\s/)) {
        elements.push(
          <li key={index} className="ml-6 mb-2 list-decimal text-muted-foreground">
            {renderInlineFormatting(line.replace(/^\d+\.\s/, ''))}
          </li>
        );
        return;
      }
      if (line.startsWith('- ')) {
        elements.push(
          <li key={index} className="ml-6 mb-2 list-disc text-muted-foreground">
            {renderInlineFormatting(line.slice(2))}
          </li>
        );
        return;
      }

      // Regular paragraph
      if (line.trim()) {
        elements.push(
          <p key={index} className="mb-4 text-muted-foreground leading-relaxed">
            {renderInlineFormatting(line)}
          </p>
        );
      }
    });

    return elements;
  };

  const renderInlineFormatting = (text: string) => {
    // Handle bold
    let result = text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
    // Handle inline code
    result = result.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm">$1</code>');
    // Handle links
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="text-primary hover:underline">$1</a>');
    
    return <span dangerouslySetInnerHTML={{ __html: result }} />;
  };

  return (
    <article className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link to="/help" className="hover:text-foreground transition-colors">
          Help Center
        </Link>
        <ChevronRight className="h-4 w-4" />
        <Link 
          to={`/help/category/${article.category}`} 
          className="hover:text-foreground transition-colors"
        >
          {categoryInfo?.title}
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground">{article.title}</span>
      </nav>

      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate(-1)}
        className="mb-6"
      >
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {/* Article header */}
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-4">
          <Badge variant="secondary">{categoryInfo?.title}</Badge>
          <div className="flex items-center text-sm text-muted-foreground">
            <Clock className="h-4 w-4 mr-1" />
            {article.readTime} min read
          </div>
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">
          {article.title}
        </h1>
        <p className="text-lg text-muted-foreground mt-4">
          {article.description}
        </p>
      </header>

      {/* Article content */}
      <div className="prose prose-invert max-w-none">
        {renderContent(article.content)}
      </div>

      <Separator className="my-8" />

      {/* Feedback section */}
      <div className="bg-card border border-border rounded-lg p-6 mb-8">
        <h3 className="font-semibold text-foreground mb-4">Was this article helpful?</h3>
        {feedbackGiven ? (
          <p className="text-muted-foreground">
            Thank you for your feedback! 
            {feedbackGiven === 'not-helpful' && (
              <span> Need more help? <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">Contact support</a></span>
            )}
          </p>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => handleFeedback('helpful')}
            >
              <ThumbsUp className="h-4 w-4 mr-2" />
              Yes, helpful
            </Button>
            <Button
              variant="outline"
              onClick={() => handleFeedback('not-helpful')}
            >
              <ThumbsDown className="h-4 w-4 mr-2" />
              No, needs improvement
            </Button>
          </div>
        )}
      </div>

      {/* Related articles */}
      {relatedArticles.length > 0 && (
        <section>
          <h3 className="font-semibold text-xl text-foreground mb-4">Related Articles</h3>
          <div className="grid gap-4 md:grid-cols-2">
            {relatedArticles.map((related) => (
              <Link key={related.id} to={`/help/article/${related.slug}`}>
                <Card className="p-4 hover:border-primary/50 transition-colors">
                  <h4 className="font-medium text-foreground">{related.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {related.description}
                  </p>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Tags */}
      <div className="mt-8 flex flex-wrap gap-2">
        {article.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>
    </article>
  );
};
