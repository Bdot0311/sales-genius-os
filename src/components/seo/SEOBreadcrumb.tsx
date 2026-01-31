import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import { BreadcrumbSchema } from './StructuredData';
import { CANONICAL_DOMAIN, generateBreadcrumbsFromPath } from '@/lib/seo-utils';

interface BreadcrumbItem {
  name: string;
  url?: string;
}

interface SEOBreadcrumbProps {
  items?: BreadcrumbItem[];
  className?: string;
  showHome?: boolean;
}

/**
 * SEO-optimized breadcrumb component
 * Includes both visible navigation and JSON-LD schema
 */
export const SEOBreadcrumb = ({ 
  items, 
  className = '',
  showHome = true 
}: SEOBreadcrumbProps) => {
  const location = useLocation();
  
  // Auto-generate from path if items not provided
  const breadcrumbItems = items || generateBreadcrumbsFromPath(location.pathname);
  
  // Ensure home is included if showHome is true
  const finalItems = showHome && breadcrumbItems[0]?.name !== 'Home'
    ? [{ name: 'Home', url: CANONICAL_DOMAIN }, ...breadcrumbItems]
    : breadcrumbItems;
  
  // Schema items need full URLs
  const schemaItems = finalItems.map(item => ({
    name: item.name,
    url: item.url || `${CANONICAL_DOMAIN}${location.pathname}`
  }));

  return (
    <>
      {/* JSON-LD Schema */}
      <BreadcrumbSchema items={schemaItems} />
      
      {/* Visible Breadcrumb Navigation */}
      <nav 
        aria-label="Breadcrumb" 
        className={`flex items-center text-sm text-muted-foreground ${className}`}
      >
        <ol 
          className="flex items-center space-x-1" 
          itemScope 
          itemType="https://schema.org/BreadcrumbList"
        >
          {finalItems.map((item, index) => {
            const isLast = index === finalItems.length - 1;
            const path = item.url?.replace(CANONICAL_DOMAIN, '') || '/';
            
            return (
              <li 
                key={index}
                className="flex items-center"
                itemProp="itemListElement" 
                itemScope 
                itemType="https://schema.org/ListItem"
              >
                {index > 0 && (
                  <ChevronRight className="h-4 w-4 mx-1 text-muted-foreground/50" aria-hidden="true" />
                )}
                
                {isLast ? (
                  // Current page - no link
                  <span 
                    className="text-foreground font-medium"
                    itemProp="name"
                    aria-current="page"
                  >
                    {item.name === 'Home' ? <Home className="h-4 w-4" /> : item.name}
                  </span>
                ) : (
                  // Linked item
                  <Link
                    to={path}
                    className="hover:text-foreground transition-colors flex items-center"
                    itemProp="item"
                  >
                    <span itemProp="name">
                      {item.name === 'Home' ? <Home className="h-4 w-4" /> : item.name}
                    </span>
                  </Link>
                )}
                <meta itemProp="position" content={String(index + 1)} />
              </li>
            );
          })}
        </ol>
      </nav>
    </>
  );
};
