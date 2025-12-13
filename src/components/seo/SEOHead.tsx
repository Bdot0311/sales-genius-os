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
}

export const SEOHead = ({
  title = "SalesOS - AI-Powered Sales Operating System",
  description = "Close more deals with SalesOS. AI-powered lead generation, intelligent outreach automation, automated scheduling, and real-time sales coaching for SaaS companies.",
  canonicalUrl,
  ogImage = "https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/social-images/social-1761024274309-image 2.png",
  ogType = "website",
  noIndex = false,
  keywords = "sales automation, AI sales, lead generation, CRM, sales intelligence, email automation, sales coaching, SaaS sales",
  author = "SalesOS"
}: SEOHeadProps) => {
  const fullTitle = title.includes('SalesOS') ? title : `${title} | SalesOS`;
  
  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{fullTitle}</title>
      <meta name="title" content={fullTitle} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      <meta name="author" content={author} />
      <meta name="robots" content={noIndex ? "noindex, nofollow" : "index, follow"} />
      
      {/* Canonical URL */}
      {canonicalUrl && <link rel="canonical" href={canonicalUrl} />}
      
      {/* Open Graph / Facebook */}
      <meta property="og:type" content={ogType} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:site_name" content="SalesOS" />
      
      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      
      {/* Additional SEO */}
      <meta name="theme-color" content="#8B5CF6" />
      <meta name="mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
    </Helmet>
  );
};
