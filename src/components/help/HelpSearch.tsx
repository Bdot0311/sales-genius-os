import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchArticles, HelpArticle } from "./helpArticles";
import { useNavigate } from "react-router-dom";

interface HelpSearchProps {
  onSearch?: (query: string) => void;
  placeholder?: string;
  className?: string;
}

export const HelpSearch = ({ onSearch, placeholder = "Search for help articles...", className = "" }: HelpSearchProps) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HelpArticle[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (query.length >= 2) {
      const searchResults = searchArticles(query).slice(0, 5);
      setResults(searchResults);
      setIsOpen(true);
    } else {
      setResults([]);
      setIsOpen(false);
    }
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectArticle = (slug: string) => {
    setIsOpen(false);
    setQuery("");
    navigate(`/help/article/${slug}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch?.(query);
      navigate(`/help?search=${encodeURIComponent(query)}`);
      setIsOpen(false);
    }
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      'getting-started': 'Getting Started',
      'account': 'Account',
      'features': 'Features',
      'integrations': 'Integrations',
      'troubleshooting': 'Troubleshooting',
      'api': 'API'
    };
    return labels[category] || category;
  };

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <form onSubmit={handleSubmit}>
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-12 pr-12 h-14 text-lg bg-card border-border focus:border-primary"
          />
          {query && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2"
              onClick={() => {
                setQuery("");
                setResults([]);
                setIsOpen(false);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {results.map((article) => (
            <button
              key={article.id}
              className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors border-b border-border last:border-0"
              onClick={() => handleSelectArticle(article.slug)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">{article.title}</span>
                <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded">
                  {getCategoryLabel(article.category)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                {article.description}
              </p>
            </button>
          ))}
          {query.length >= 2 && (
            <button
              className="w-full px-4 py-3 text-left hover:bg-muted/50 transition-colors text-primary font-medium"
              onClick={handleSubmit}
            >
              See all results for "{query}"
            </button>
          )}
        </div>
      )}

      {isOpen && query.length >= 2 && results.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg z-50 p-4 text-center">
          <p className="text-muted-foreground">No articles found for "{query}"</p>
          <p className="text-sm text-muted-foreground mt-1">
            Try different keywords or <a href="mailto:support@bdotindustries.com" className="text-primary hover:underline">contact support</a>
          </p>
        </div>
      )}
    </div>
  );
};
