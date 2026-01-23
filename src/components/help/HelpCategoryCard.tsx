import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { 
  Rocket, 
  CreditCard, 
  Sparkles, 
  Plug, 
  Wrench, 
  Code,
  ChevronRight
} from "lucide-react";
import { HelpCategoryInfo, getArticlesByCategory } from "./helpArticles";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Rocket,
  CreditCard,
  Sparkles,
  Plug,
  Wrench,
  Code
};

interface HelpCategoryCardProps {
  category: HelpCategoryInfo;
}

export const HelpCategoryCard = ({ category }: HelpCategoryCardProps) => {
  const Icon = iconMap[category.icon] || Rocket;
  const articleCount = getArticlesByCategory(category.id).length;

  return (
    <Link to={`/help/category/${category.id}`}>
      <Card className="p-6 h-full bg-card border-border hover:border-primary/50 transition-all duration-300 group cursor-pointer">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
              {category.title}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {category.description}
            </p>
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-muted-foreground">
                {articleCount} article{articleCount !== 1 ? 's' : ''}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
};
