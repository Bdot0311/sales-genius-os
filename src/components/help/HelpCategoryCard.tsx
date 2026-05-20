import { Link } from "react-router-dom";
import {
  Rocket,
  CreditCard,
  Sparkles,
  Plug,
  Wrench,
  Code,
  ChevronRight,
} from "lucide-react";
import { HelpCategoryInfo, getArticlesByCategory } from "./helpArticles";

const iconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Rocket,
  CreditCard,
  Sparkles,
  Plug,
  Wrench,
  Code,
};

interface HelpCategoryCardProps {
  category: HelpCategoryInfo;
}

export const HelpCategoryCard = ({ category }: HelpCategoryCardProps) => {
  const Icon = iconMap[category.icon] || Rocket;
  const articleCount = getArticlesByCategory(category.id).length;

  return (
    <Link to={`/help/category/${category.id}`}>
      <div
        className="p-6 h-full rounded-2xl transition-all duration-300 group cursor-pointer"
        style={{ background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.3)")}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.14)")}
      >
        <div className="flex items-start gap-4">
          <div
            className="p-3 rounded-xl shrink-0 transition-colors"
            style={{ background: "hsl(261 75% 50% / 0.1)", border: "1px solid hsl(261 75% 50% / 0.2)" }}
          >
            <Icon className="h-5 w-5" style={{ color: "hsl(261 75% 65%)" }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              className="font-semibold text-lg mb-1 transition-colors"
              style={{ color: "hsl(0 0% 92%)" }}
            >
              {category.title}
            </h3>
            <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
              {category.description}
            </p>
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs" style={{ color: "hsl(0 0% 100% / 0.45)" }}>
                {articleCount} article{articleCount !== 1 ? "s" : ""}
              </span>
              <ChevronRight
                className="h-4 w-4 group-hover:translate-x-1 transition-transform"
                style={{ color: "hsl(261 75% 55% / 0.6)" }}
              />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};
