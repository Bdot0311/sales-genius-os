import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
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

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
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
      <Card
        className="p-6 h-full transition-all duration-300 group cursor-pointer hover:border-primary/40"
        style={{
          background: "hsl(0 0% 100% / 0.025)",
          border: "1px solid hsl(0 0% 100% / 0.06)",
        }}
      >
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 group-hover:bg-primary/20 transition-colors">
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-lg text-white group-hover:text-primary transition-colors">
              {category.title}
            </h3>
            <p className="text-sm text-white/55 mt-1">
              {category.description}
            </p>
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-white/75">
                {articleCount} article{articleCount !== 1 ? "s" : ""}
              </span>
              <ChevronRight className="h-4 w-4 text-white/75 group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
};
