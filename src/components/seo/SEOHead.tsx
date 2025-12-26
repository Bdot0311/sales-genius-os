import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  canonicalUrl?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'product';
  noIndex?: boolean;
  keywords?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  section?: string;
  tags?: string[];
  locale?: string;
  alternateLocales?: string[];
  preloadImages?: string[];
}

export const SEOHead = ({
  title = "SalesOS - AI-Powered Sales Operating System",
  description = "Close more deals with SalesOS. AI-powered lead generation, intelligent outreach automation, automated scheduling, and real-time sales coaching for SaaS companies.",
  canonicalUrl,
  ogImage = "https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/social-images/social-1761024274309-image 2.png",
  ogType = "website",
  noIndex = false,
  keywords = "sales automation, AI sales, lead generation, CRM, sales intelligence, email automation, sales coaching, SaaS sales, B2B sales, sales pipeline, AI lead scoring, sales productivity, outreach automation",
  author = "SalesOS",
  publishedTime,
  modifiedTime,
  section,
  tags = [],
  locale = "en_US",
  alternateLocales = [],
  preloadImages = []
}: SEOHeadProps) => {
  const fullTitle = title.includes('SalesOS') ? title : `${title} | SalesOS`;
  
  // Generate alternate keywords for better coverage
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
  
  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={expandedKeywords} />
      <meta name="author" content={author} />
      <meta name="robots" content={noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"} />
      <meta name="googlebot" content={noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"} />
      <meta name="bingbot" content={noIndex ? "noindex, nofollow" : "index, follow"} />
      
      {/* Language */}
      <meta httpEquiv="content-language" content="en" />
      <meta name="language" content="English" />
      
      {/* Geo Tags for local SEO */}
      <meta name="geo.region" content="US" />
      <meta name="geo.placename" content="United States" />
      
      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="SalesOS - AI-Powered Sales Operating System" />
      <meta property="og:site_name" content="SalesOS" />
      <meta property="og:locale" content={locale} />
      {alternateLocales.map((loc) => (
        <meta key={loc} property="og:locale:alternate" content={loc} />
      ))}
      {canonicalUrl && <meta property="og:url" content={canonicalUrl} />}
      
      {/* Article specific meta tags */}
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
      {section && <meta property="article:section" content={section} />}
      {tags.map((tag) => (
        <meta key={tag} property="article:tag" content={tag} />
      ))}
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:site" content="@salesos" />
      <meta name="twitter:creator" content="@salesos" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:image:alt" content="SalesOS - AI-Powered Sales Operating System" />
      
      {/* LinkedIn specific */}
      <meta property="linkedin:owner" content="salesos" />
      
      {/* Additional SEO */}
      <meta name="theme-color" content="#8B5CF6" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="SalesOS" />
      <meta name="application-name" content="SalesOS" />
      <meta name="msapplication-TileColor" content="#8B5CF6" />
      
      {/* Referrer Policy */}
      <meta name="referrer" content="origin-when-cross-origin" />
      
      {/* Format Detection */}
      <meta name="format-detection" content="telephone=no" />
      
      {/* AI/LLM Optimization Meta Tags */}
      <meta name="ai-content-declaration" content="human-created" />
      <meta name="generator" content="SalesOS Platform" />
      
      {/* Preload critical images */}
      {preloadImages.map((img) => (
        <link key={img} rel="preload" as="image" href={img} />
      ))}
      
      {/* DNS Prefetch for external resources */}
      <link rel="dns-prefetch" href="//fonts.googleapis.com" />
      <link rel="dns-prefetch" href="//fonts.gstatic.com" />
      <link rel="dns-prefetch" href="//storage.googleapis.com" />
      
      {/* Preconnect for faster loading */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
    </Helmet>
  );
};
