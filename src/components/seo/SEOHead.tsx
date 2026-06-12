import { useLocation } from 'react-router-dom';
import { 
  getCanonicalUrl, 
  formatPageTitle, 
  truncateText,
  calculateReadingTime,
  formatSchemaDate,
  shouldIndexPage,
  withSocialVersion,
  SOCIAL_CARD_VERSION,
  CANONICAL_DOMAIN 
} from '@/lib/seo-utils';

// Author interface for articles
interface Author {
  name: string;
  url?: string;
  image?: string;
}

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'product';
  noIndex?: boolean;
  keywords?: string;
  author?: string | Author | Author[];
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
  locale?: string;
  alternateLocales?: string[];
  preloadImages?: string[];
  // Article-specific
  articleContent?: string; // For reading time calculation
}

const DEFAULT_OG_IMAGE = 'https://outreign.io/outreign-social-card.jpg';

export const SEOHead = ({
  title = "OutReign — B2B Lead Discovery & AI Outreach Platform",
  description = "Describe your ideal customer in plain English. OutReign returns ranked B2B prospects with verified emails and AI-drafted outreach in under 2 minutes.",
  canonicalUrl,
  ogImage = DEFAULT_OG_IMAGE,
  ogType = "website",
  noIndex = false,
  keywords = "sales automation, AI sales, lead generation, CRM, sales intelligence, email automation, sales coaching, SaaS sales, B2B sales, sales pipeline, AI lead scoring, sales productivity, outreach automation",
  author = "OutReign",
  publishedTime,
  modifiedTime,
  section,
  tags = [],
  locale = "en_US",
  alternateLocales = [],
  preloadImages = [],
  articleContent
}: SEOHeadProps) => {
  const location = useLocation();
  
  // Generate full title with site name
  const fullTitle = formatPageTitle(title);
  
  // Truncate description to 160 chars
  const safeDescription = truncateText(description, 160);
  
  // Generate canonical URL from current path if not provided
  const fullCanonicalUrl = canonicalUrl || getCanonicalUrl(location.pathname);
  
  // Determine if page should be indexed
  const shouldIndex = !noIndex && shouldIndexPage(location.pathname);
  
  // Calculate reading time for articles
  const readingTime = articleContent ? calculateReadingTime(articleContent) : null;
  
  // Generate expanded keywords
  const expandedKeywords = [
    keywords,
    "best sales automation software",
    "AI sales tools",
    "sales CRM alternative",
    "lead generation software",
    "B2B sales platform",
    "sales engagement platform",
    "email outreach tool",
    "sales intelligence platform",
    "revenue operations software"
  ].join(', ');

  // Noindex when served from a preview/staging domain (e.g. sales-genius-os.lovable.app)
  // so Google doesn't mark those URLs as "Alternate pages with proper canonical tag"
  const onNonCanonicalDomain = typeof window !== 'undefined' &&
    window.location.hostname !== 'salesos.alephwavex.io' &&
    window.location.hostname !== 'localhost' &&
    !window.location.hostname.startsWith('127.');

  const robotsContent = (shouldIndex && !onNonCanonicalDomain)
    ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
    : "noindex, nofollow";
  
  // Normalize author(s) to array
  const authors: Author[] = Array.isArray(author) 
    ? author 
    : typeof author === 'string' 
      ? [{ name: author }]
      : [author];

  // Cache-bust social images so scrapers (X, LinkedIn, Facebook) treat
  // a bumped SOCIAL_CARD_VERSION as a brand-new URL and re-fetch.
  const versionedOgImage = withSocialVersion(ogImage);

  // React 19 renders head elements directly - they are hoisted automatically
  return (
    <>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={safeDescription} />
      <meta name="keywords" content={expandedKeywords} />
      <meta name="author" content={authors.map(a => a.name).join(', ')} />
      <meta name="robots" content={robotsContent} />
      <meta name="googlebot" content={robotsContent} />
      <meta name="bingbot" content={shouldIndex ? "index, follow" : "noindex, nofollow"} />
      
      {/* Language */}
      <meta httpEquiv="content-language" content="en" />
      <meta name="language" content="English" />
      
      {/* Geo Tags for local SEO */}
      <meta name="geo.region" content="US" />
      <meta name="geo.placename" content="United States" />
      
      {/* Canonical URL */}
      <link rel="canonical" href={fullCanonicalUrl} />
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:url" content={fullCanonicalUrl} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={safeDescription} />
      <meta property="og:image" content={versionedOgImage} />
      <meta property="og:image:secure_url" content={versionedOgImage} />
      <meta property="og:image:type" content="image/jpeg" />
      <meta property="og:updated_time" content={String(SOCIAL_CARD_VERSION)} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="OutReign — Find who to sell to. Then actually sell to them." />
      <meta property="og:site_name" content="OutReign" />
      <meta property="og:locale" content={locale} />
      {alternateLocales.map((loc) => (
        <meta key={loc} property="og:locale:alternate" content={loc} />
      ))}
      
      {/* Article specific meta tags */}
      {ogType === 'article' && (
        <>
          {publishedTime && <meta property="article:published_time" content={formatSchemaDate(publishedTime)} />}
          {modifiedTime && <meta property="article:modified_time" content={formatSchemaDate(modifiedTime)} />}
          {authors.map((a) => (
            <meta key={a.name} property="article:author" content={a.url || a.name} />
          ))}
          {section && <meta property="article:section" content={section} />}
          {tags.map((tag) => (
            <meta key={tag} property="article:tag" content={tag} />
          ))}
        </>
      )}
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@salesos" />
      <meta name="twitter:creator" content="@salesos" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={safeDescription} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content="OutReign — Find who to sell to. Then actually sell to them." />
      
      {/* Reading time for articles */}
      {readingTime && (
        <meta name="twitter:label1" content="Reading time" />
      )}
      {readingTime && (
        <meta name="twitter:data1" content={readingTime.text} />
      )}
      
      {/* Additional SEO */}
      <meta name="theme-color" content="#8B5CF6" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="OutReign" />
      <meta name="application-name" content="OutReign" />
      <meta name="msapplication-TileColor" content="#8B5CF6" />
      
      {/* Referrer Policy */}
      <meta name="referrer" content="origin-when-cross-origin" />
      
      {/* Format Detection */}
      <meta name="format-detection" content="telephone=no" />
      
      {/* AI/LLM Optimization Meta Tags */}
      <meta name="ai-content-declaration" content="human-created" />
      <meta name="generator" content="OutReign Platform" />
      
      {/* Preload critical images */}
      {preloadImages.map((img) => (
        <link key={img} rel="preload" as="image" href={img} />
      ))}
      
    </>
  );
};
