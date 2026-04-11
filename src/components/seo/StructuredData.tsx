const BASE_URL = 'https://salesos.alephwavex.io';

interface FAQItem {
  question: string;
  answer: string;
}

interface OrganizationSchemaProps {
  name?: string;
  description?: string;
  url?: string;
  logo?: string;
}

interface ProductSchemaProps {
  name: string;
  description: string;
  price: string;
  priceCurrency?: string;
}

interface FAQSchemaProps {
  faqs: FAQItem[];
}

interface HowToStep {
  name: string;
  text: string;
  image?: string;
}

interface HowToSchemaProps {
  name: string;
  description: string;
  steps: HowToStep[];
  totalTime?: string;
}

interface VideoSchemaProps {
  name: string;
  description: string;
  thumbnailUrl: string;
  uploadDate: string;
  duration?: string;
  contentUrl?: string;
  embedUrl?: string;
}

interface ArticleAuthor {
  name: string;
  url?: string;
  image?: string;
}

interface ArticleSchemaProps {
  headline: string;
  description: string;
  author: string | ArticleAuthor | ArticleAuthor[];
  datePublished: string;
  dateModified?: string;
  image?: string;
  wordCount?: number;
  articleSection?: string;
  keywords?: string[];
  url?: string;
}

// Helper component to render JSON-LD scripts (React 19 native head hoisting)
const JsonLdScript = ({ schema }: { schema: object }) => (
  <script
    type="application/ld+json"
    dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
  />
);

// Organization Schema for brand recognition - Enhanced for AEO
export const OrganizationSchema = ({
  name = "SalesOS",
  description = "SalesOS is a B2B lead discovery and outbound email platform. Describe your ideal customer in plain English, get ranked prospects with SMTP-verified emails, and send AI-drafted first-touch emails — all from one workflow.",
  url = BASE_URL,
  logo = "https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/uploads/1761024288225-image 2.png"
}: OrganizationSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${BASE_URL}/#organization`,
    "name": name,
    "alternateName": ["Sales OS", "SalesOS Platform"],
    "description": description,
    "url": url,
    "logo": {
      "@type": "ImageObject",
      "url": logo,
      "width": 512,
      "height": 512
    },
    "image": logo,
    "contactPoint": [
      {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "email": "support@bdotindustries.com",
        "availableLanguage": ["English"]
      },
      {
        "@type": "ContactPoint",
        "contactType": "sales",
        "email": "sales@bdotindustries.com",
        "availableLanguage": ["English"]
      }
    ],
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "New York",
      "addressRegion": "NY",
      "addressCountry": "US"
    },
    "founder": {
      "@type": "Person",
      "name": "Brandon",
      "url": "https://linkedin.com/in/brandon"
    },
    "foundingDate": "2026",
    "knowsAbout": [
      "B2B Lead Generation",
      "Outbound Email",
      "ICP Scoring",
      "Lead Enrichment",
      "Email Verification",
      "Sales Automation",
      "Personalized Outreach"
    ],
    "slogan": "Find who to sell to. Then actually sell to them.",
    "areaServed": "Worldwide"
  };

  return <JsonLdScript schema={schema} />;
};

// Software Application Schema - Enhanced with more details
export const SoftwareApplicationSchema = () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${BASE_URL}/#software`,
    "name": "SalesOS",
    "alternateName": "SalesOS Lead Discovery Platform",
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "B2B Lead Generation Software",
    "operatingSystem": "Web Browser (Chrome, Firefox, Safari, Edge)",
    "description": "SalesOS turns your ICP into ranked prospects with SMTP-verified contact data and AI-drafted first-touch emails — in under 2 minutes. Describe your ideal customer in plain English: no boolean search, no list building, no manual scoring.",
    "url": BASE_URL,
    "downloadUrl": `${BASE_URL}/auth`,
    "screenshot": "https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/social-images/social-1768238149761-SalesOS full logo.png",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "39",
      "highPrice": "179",
      "priceCurrency": "USD",
      "offerCount": "3",
      "offers": [
        {
          "@type": "Offer",
          "name": "Starter Plan",
          "price": "39",
          "priceCurrency": "USD",
          "priceValidUntil": "2027-12-31",
          "availability": "https://schema.org/InStock",
          "description": "For solo founders — verified prospects/month, AI email drafting, SMTP-verified emails"
        },
        {
          "@type": "Offer",
          "name": "Growth Plan",
          "price": "89",
          "priceCurrency": "USD",
          "priceValidUntil": "2027-12-31",
          "availability": "https://schema.org/InStock",
          "description": "For growing teams — higher prospect volume, advanced filters, bulk export, sequence automation"
        },
        {
          "@type": "Offer",
          "name": "Pro Plan",
          "price": "179",
          "priceCurrency": "USD",
          "priceValidUntil": "2027-12-31",
          "availability": "https://schema.org/InStock",
          "description": "High-volume outbound — maximum prospect volume, API access, CRM integrations"
        }
      ]
    },
    "featureList": [
      "Plain-English ICP-based lead search",
      "ICP fit scoring for every prospect",
      "SMTP-verified business email enrichment",
      "AI-drafted first-touch email per prospect",
      "Reply management and follow-up tracking",
      "Sequence automation",
      "CRM integration (HubSpot, Salesforce)",
      "Gmail integration for email delivery",
      "Pipeline management"
    ],
    "softwareRequirements": "Modern web browser with JavaScript enabled",
    "author": {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`
    }
  };

  return <JsonLdScript schema={schema} />;
};

// FAQ Schema for rich snippets - Enhanced
export const FAQSchema = ({ faqs }: FAQSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${BASE_URL}/#faq`,
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };

  return <JsonLdScript schema={schema} />;
};

// Product/Pricing Schema - Enhanced
export const ProductSchema = ({ name, description, price, priceCurrency = "USD" }: ProductSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    "name": name,
    "description": description,
    "brand": {
      "@type": "Brand",
      "name": "SalesOS",
      "logo": "https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/uploads/1761024288225-image 2.png"
    },
    "offers": {
      "@type": "Offer",
      "price": price,
      "priceCurrency": priceCurrency,
      "availability": "https://schema.org/InStock",
      "priceValidUntil": "2027-12-31",
      "seller": {
        "@type": "Organization",
        "@id": `${BASE_URL}/#organization`
      }
    }
  };

  return <JsonLdScript schema={schema} />;
};

// WebSite Schema with SearchAction for sitelinks - Enhanced
export const WebSiteSchema = () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${BASE_URL}/#website`,
    "name": "SalesOS",
    "alternateName": "SalesOS - AI Sales Platform",
    "url": BASE_URL,
    "description": "SalesOS is the leading AI-powered sales operating system. Generate leads, automate outreach, and close more deals.",
    "publisher": {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`
    },
    "potentialAction": [
      {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": `${BASE_URL}/search?q={search_term_string}`
        },
        "query-input": "required name=search_term_string"
      },
      {
        "@type": "ReadAction",
        "target": BASE_URL
      }
    ],
    "inLanguage": "en-US",
    "copyrightYear": new Date().getFullYear().toString(),
    "copyrightHolder": {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`
    }
  };

  return <JsonLdScript schema={schema} />;
};

// Breadcrumb Schema - Enhanced
export const BreadcrumbSchema = ({ items }: { items: { name: string; url: string }[] }) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url
    }))
  };

  return <JsonLdScript schema={schema} />;
};

// HowTo Schema for AEO - Great for "How to" queries
export const HowToSchema = ({ name, description, steps, totalTime = "PT10M" }: HowToSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": name,
    "description": description,
    "totalTime": totalTime,
    "estimatedCost": {
      "@type": "MonetaryAmount",
      "currency": "USD",
      "value": "0"
    },
    "step": steps.map((step, index) => ({
      "@type": "HowToStep",
      "position": index + 1,
      "name": step.name,
      "text": step.text,
      ...(step.image && { image: step.image })
    }))
  };

  return <JsonLdScript schema={schema} />;
};

// Video Schema for video content
export const VideoSchema = ({ 
  name, 
  description, 
  thumbnailUrl, 
  uploadDate, 
  duration,
  contentUrl,
  embedUrl 
}: VideoSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": name,
    "description": description,
    "thumbnailUrl": thumbnailUrl,
    "uploadDate": uploadDate,
    ...(duration && { duration }),
    ...(contentUrl && { contentUrl }),
    ...(embedUrl && { embedUrl }),
    "publisher": {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`
    }
  };

  return <JsonLdScript schema={schema} />;
};

// Enhanced Article Schema for blog/content pages with multiple author support
export const ArticleSchema = ({ 
  headline, 
  description, 
  author, 
  datePublished,
  dateModified,
  image,
  wordCount,
  articleSection,
  keywords,
  url
}: ArticleSchemaProps) => {
  // Normalize author(s) to array
  const normalizeAuthors = (auth: string | ArticleAuthor | ArticleAuthor[]): ArticleAuthor[] => {
    if (Array.isArray(auth)) return auth;
    if (typeof auth === 'string') return [{ name: auth }];
    return [auth];
  };
  
  const authors = normalizeAuthors(author);
  
  // Calculate reading time if word count provided
  const readingTimeMinutes = wordCount ? Math.ceil(wordCount / 225) : undefined;
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": headline,
    "description": description,
    "author": authors.length === 1 
      ? {
          "@type": "Person",
          "name": authors[0].name,
          ...(authors[0].url && { "url": authors[0].url }),
          ...(authors[0].image && { "image": authors[0].image })
        }
      : authors.map(a => ({
          "@type": "Person",
          "name": a.name,
          ...(a.url && { "url": a.url }),
          ...(a.image && { "image": a.image })
        })),
    "publisher": {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      "name": "SalesOS",
      "logo": {
        "@type": "ImageObject",
        "url": "https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/uploads/1761024288225-image 2.png"
      }
    },
    "datePublished": datePublished,
    "dateModified": dateModified || datePublished,
    ...(image && { "image": image }),
    ...(wordCount && { "wordCount": wordCount }),
    ...(readingTimeMinutes && { "timeRequired": `PT${readingTimeMinutes}M` }),
    ...(articleSection && { "articleSection": articleSection }),
    ...(keywords && keywords.length > 0 && { "keywords": keywords.join(", ") }),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": url || BASE_URL
    },
    "inLanguage": "en-US"
  };

  return <JsonLdScript schema={schema} />;
};

// BlogPosting Schema - more specific than Article for blog content
interface BlogPostingSchemaProps extends ArticleSchemaProps {
  categories?: string[];
}

export const BlogPostingSchema = ({ 
  headline, 
  description, 
  author, 
  datePublished,
  dateModified,
  image,
  wordCount,
  articleSection,
  keywords,
  url,
  categories
}: BlogPostingSchemaProps) => {
  // Normalize author(s)
  const normalizeAuthors = (auth: string | ArticleAuthor | ArticleAuthor[]): ArticleAuthor[] => {
    if (Array.isArray(auth)) return auth;
    if (typeof auth === 'string') return [{ name: auth }];
    return [auth];
  };
  
  const authors = normalizeAuthors(author);
  const readingTimeMinutes = wordCount ? Math.ceil(wordCount / 225) : undefined;
  
  const schema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": headline,
    "description": description,
    "author": authors.map(a => ({
      "@type": "Person",
      "name": a.name,
      ...(a.url && { "url": a.url }),
      ...(a.image && { "image": a.image })
    })),
    "publisher": {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      "name": "SalesOS",
      "logo": {
        "@type": "ImageObject",
        "url": "https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/uploads/1761024288225-image 2.png"
      }
    },
    "datePublished": datePublished,
    "dateModified": dateModified || datePublished,
    ...(image && { "image": image }),
    ...(wordCount && { "wordCount": wordCount }),
    ...(readingTimeMinutes && { "timeRequired": `PT${readingTimeMinutes}M` }),
    ...(articleSection && { "articleSection": articleSection }),
    ...(keywords && keywords.length > 0 && { "keywords": keywords.join(", ") }),
    ...(categories && categories.length > 0 && { "articleSection": categories[0] }),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": url || BASE_URL
    },
    "isAccessibleForFree": true,
    "inLanguage": "en-US"
  };

  return <JsonLdScript schema={schema} />;
};

// Review Schema for testimonials
interface ReviewSchemaProps {
  itemReviewed: {
    name: string;
    type?: string;
  };
  author: string;
  reviewBody: string;
  ratingValue: number;
  datePublished?: string;
}

export const ReviewSchema = ({ 
  itemReviewed, 
  author, 
  reviewBody, 
  ratingValue,
  datePublished 
}: ReviewSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Review",
    "itemReviewed": {
      "@type": itemReviewed.type || "SoftwareApplication",
      "name": itemReviewed.name
    },
    "author": {
      "@type": "Person",
      "name": author
    },
    "reviewBody": reviewBody,
    "reviewRating": {
      "@type": "Rating",
      "ratingValue": ratingValue,
      "bestRating": 5,
      "worstRating": 1
    },
    ...(datePublished && { "datePublished": datePublished })
  };

  return <JsonLdScript schema={schema} />;
};

// AggregateRating Schema
interface AggregateRatingSchemaProps {
  itemName: string;
  ratingValue: number;
  ratingCount: number;
  reviewCount?: number;
}

export const AggregateRatingSchema = ({ 
  itemName, 
  ratingValue, 
  ratingCount,
  reviewCount 
}: AggregateRatingSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": itemName,
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": ratingValue,
      "ratingCount": ratingCount,
      ...(reviewCount && { "reviewCount": reviewCount }),
      "bestRating": 5,
      "worstRating": 1
    }
  };

  return <JsonLdScript schema={schema} />;
};

// Service Schema - Great for describing what SalesOS offers
export const ServiceSchema = () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${BASE_URL}/#service`,
    "serviceType": "Sales Automation Software",
    "name": "SalesOS Sales Automation Platform",
    "description": "Comprehensive AI-powered sales automation service including lead generation, email automation, pipeline management, and AI coaching for B2B SaaS companies.",
    "provider": {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`
    },
    "areaServed": {
      "@type": "Place",
      "name": "Worldwide"
    },
    "hasOfferCatalog": {
      "@type": "OfferCatalog",
      "name": "SalesOS Plans",
      "itemListElement": [
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Starter Plan"
          },
          "price": "39",
          "priceCurrency": "USD"
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Growth Plan"
          },
          "price": "89",
          "priceCurrency": "USD"
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Pro Plan"
          },
          "price": "179",
          "priceCurrency": "USD"
        }
      ]
    }
  };

  return <JsonLdScript schema={schema} />;
};

// Speakable Schema for voice search optimization
export const SpeakableSchema = ({ cssSelectors }: { cssSelectors: string[] }) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "speakable": {
      "@type": "SpeakableSpecification",
      "cssSelector": cssSelectors
    },
    "url": BASE_URL
  };

  return <JsonLdScript schema={schema} />;
};

// ItemList Schema for features/benefits lists
export const ItemListSchema = ({ 
  name, 
  items 
}: { 
  name: string; 
  items: { name: string; description: string; position: number }[] 
}) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": name,
    "numberOfItems": items.length,
    "itemListElement": items.map(item => ({
      "@type": "ListItem",
      "position": item.position,
      "name": item.name,
      "description": item.description
    }))
  };

  return <JsonLdScript schema={schema} />;
};

// Comparison Schema for pricing/product comparisons
export const ComparisonSchema = ({ 
  plans 
}: { 
  plans: { name: string; price: string; features: string[] }[] 
}) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "SalesOS Pricing Plans Comparison",
    "description": "Compare SalesOS pricing plans to find the right fit for your sales team",
    "numberOfItems": plans.length,
    "itemListElement": plans.map((plan, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "item": {
        "@type": "Product",
        "name": `SalesOS ${plan.name}`,
        "description": plan.features.join(", "),
        "offers": {
          "@type": "Offer",
          "price": plan.price,
          "priceCurrency": "USD",
          "availability": "https://schema.org/InStock"
        }
      }
    }))
  };

  return <JsonLdScript schema={schema} />;
};
