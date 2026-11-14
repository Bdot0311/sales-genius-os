import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
}

export function PageHeader({ title, description, breadcrumbs, actions }: PageHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="dashboard-page-header border-b border-border/60 bg-background/80 backdrop-blur-sm">
      <div className="pt-4 pb-4">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1 mb-2">
            {breadcrumbs.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                {crumb.href ? (
                  <Button
                    variant="ghost"
                    onClick={() => { if (crumb.href) navigate(crumb.href); }}
                    className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {crumb.label}
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{crumb.label}</span>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">{title}</h1>
            {description && (
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
          {actions && <div className="mobile-action-row flex flex-wrap items-center gap-2 sm:flex-shrink-0 sm:flex-row sm:items-center">{actions}</div>}
        </div>
      </div>
    </div>
  );
}
