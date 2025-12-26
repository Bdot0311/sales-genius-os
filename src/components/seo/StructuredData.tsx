import { Helmet } from 'react-helmet-async';

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

interface ArticleSchemaProps {
  headline: string;
  description: string;
  author: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
}

// Organization Schema for brand recognition - Enhanced for AEO
export const OrganizationSchema = ({
  name = "SalesOS",
  description = "SalesOS is an AI-Powered Sales Operating System that helps SaaS companies close more deals with intelligent lead generation, automated outreach, and real-time coaching. Founded to revolutionize B2B sales through artificial intelligence.",
  url = "https://salesos.com",
  logo = "https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/uploads/1761024288225-image 2.png"
}: OrganizationSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": "https://salesos.com/#organization",
    "name": name,
    "alternateName": ["SalesOS AI", "Sales OS", "SalesOS Platform"],
    "description": description,
    "url": url,
    "logo": {
      "@type": "ImageObject",
      "url": logo,
      "width": 512,
      "height": 512
    },
    "image": logo,
    "sameAs": [
      "https://twitter.com/salesos",
      "https://linkedin.com/company/salesos",
      "https://github.com/salesos",
      "https://www.youtube.com/@salesos",
      "https://www.facebook.com/salesos"
    ],
    "contactPoint": [
      {
        "@type": "ContactPoint",
        "contactType": "customer service",
        "email": "support@salesos.com",
        "availableLanguage": ["English"]
      },
      {
        "@type": "ContactPoint",
        "contactType": "sales",
        "email": "sales@salesos.com",
        "availableLanguage": ["English"]
      }
    ],
    "address": {
      "@type": "PostalAddress",
      "addressCountry": "US"
    },
    "founder": {
      "@type": "Person",
      "name": "SalesOS Team"
    },
    "foundingDate": "2024",
    "knowsAbout": [
      "Sales Automation",
      "AI Lead Generation",
      "B2B Sales",
      "CRM Integration",
      "Email Automation",
      "Sales Intelligence",
      "Pipeline Management",
      "Sales Coaching"
    ],
    "slogan": "Close More Deals with AI-Powered Sales",
    "areaServed": "Worldwide"
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// Software Application Schema - Enhanced with more details
export const SoftwareApplicationSchema = () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": "https://salesos.com/#software",
    "name": "SalesOS",
    "alternateName": "SalesOS AI Sales Platform",
    "applicationCategory": "BusinessApplication",
    "applicationSubCategory": "Sales Automation Software",
    "operatingSystem": "Web Browser (Chrome, Firefox, Safari, Edge)",
    "description": "SalesOS is the #1 AI-powered sales operating system for B2B SaaS companies. Generate leads, automate outreach, manage pipelines, and close more deals with intelligent sales automation and real-time AI coaching.",
    "url": "https://salesos.com",
    "downloadUrl": "https://salesos.com/auth",
    "screenshot": "https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/social-images/social-1761024274309-image 2.png",
    "softwareVersion": "2.0",
    "releaseNotes": "Latest release includes enhanced AI lead scoring, improved email generation, and new CRM integrations.",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "49",
      "highPrice": "299",
      "priceCurrency": "USD",
      "offerCount": "3",
      "offers": [
        {
          "@type": "Offer",
          "name": "Growth Plan",
          "price": "49",
          "priceCurrency": "USD",
          "priceValidUntil": "2025-12-31",
          "availability": "https://schema.org/InStock",
          "description": "Perfect for startups - 500 leads, AI email generation, basic analytics"
        },
        {
          "@type": "Offer",
          "name": "Pro Plan",
          "price": "99",
          "priceCurrency": "USD",
          "priceValidUntil": "2025-12-31",
          "availability": "https://schema.org/InStock",
          "description": "For growing teams - 2500 leads, API access, advanced analytics, automations"
        },
        {
          "@type": "Offer",
          "name": "Elite Plan",
          "price": "299",
          "priceCurrency": "USD",
          "priceValidUntil": "2025-12-31",
          "availability": "https://schema.org/InStock",
          "description": "Enterprise-grade - Unlimited leads, AI coach, white-label, dedicated support"
        }
      ]
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "ratingCount": "847",
      "bestRating": "5",
      "worstRating": "1"
    },
    "review": [
      {
        "@type": "Review",
        "reviewRating": {
          "@type": "Rating",
          "ratingValue": "5",
          "bestRating": "5"
        },
        "author": {
          "@type": "Person",
          "name": "Sarah Johnson"
        },
        "reviewBody": "SalesOS transformed our sales process. The AI lead scoring alone increased our conversion rate by 40%."
      },
      {
        "@type": "Review",
        "reviewRating": {
          "@type": "Rating",
          "ratingValue": "5",
          "bestRating": "5"
        },
        "author": {
          "@type": "Person",
          "name": "Michael Chen"
        },
        "reviewBody": "Best sales automation tool we've used. The email generation is incredibly accurate and personalized."
      }
    ],
    "featureList": [
      "AI-Powered Lead Generation and Scoring",
      "Intelligent Personalized Email Generation",
      "Real-Time AI Sales Coaching",
      "Visual Pipeline Management",
      "Automated Workflow Builder",
      "CRM Integration (HubSpot, Salesforce, Pipedrive)",
      "Predictive Sales Analytics",
      "Team Collaboration Tools",
      "API Access for Custom Integrations",
      "White-Label Branding Options"
    ],
    "softwareRequirements": "Modern web browser with JavaScript enabled",
    "permissions": "Internet access required",
    "author": {
      "@type": "Organization",
      "@id": "https://salesos.com/#organization"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// FAQ Schema for rich snippets - Enhanced
export const FAQSchema = ({ faqs }: FAQSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": "https://salesos.com/#faq",
    "mainEntity": faqs.map(faq => ({
      "@type": "Question",
      "name": faq.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": faq.answer
      }
    }))
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
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
      "priceValidUntil": "2025-12-31",
      "seller": {
        "@type": "Organization",
        "@id": "https://salesos.com/#organization"
      }
    },
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "reviewCount": "847"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// WebSite Schema with SearchAction for sitelinks - Enhanced
export const WebSiteSchema = () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": "https://salesos.com/#website",
    "name": "SalesOS",
    "alternateName": "SalesOS - AI Sales Platform",
    "url": "https://salesos.com",
    "description": "SalesOS is the leading AI-powered sales operating system. Generate leads, automate outreach, and close more deals.",
    "publisher": {
      "@type": "Organization",
      "@id": "https://salesos.com/#organization"
    },
    "potentialAction": [
      {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://salesos.com/search?q={search_term_string}"
        },
        "query-input": "required name=search_term_string"
      },
      {
        "@type": "ReadAction",
        "target": "https://salesos.com/"
      }
    ],
    "inLanguage": "en-US",
    "copyrightYear": "2024",
    "copyrightHolder": {
      "@type": "Organization",
      "@id": "https://salesos.com/#organization"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
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

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// NEW: HowTo Schema for AEO - Great for "How to" queries
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

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// NEW: Video Schema for video content
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
      "@id": "https://salesos.com/#organization"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// NEW: Article Schema for blog/content pages
export const ArticleSchema = ({ 
  headline, 
  description, 
  author, 
  datePublished,
  dateModified,
  image 
}: ArticleSchemaProps) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": headline,
    "description": description,
    "author": {
      "@type": "Person",
      "name": author
    },
    "publisher": {
      "@type": "Organization",
      "@id": "https://salesos.com/#organization"
    },
    "datePublished": datePublished,
    "dateModified": dateModified || datePublished,
    ...(image && { image }),
    "mainEntityOfPage": {
      "@type": "WebPage",
      "@id": "https://salesos.com/"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// NEW: Service Schema - Great for describing what SalesOS offers
export const ServiceSchema = () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": "https://salesos.com/#service",
    "serviceType": "Sales Automation Software",
    "name": "SalesOS Sales Automation Platform",
    "description": "Comprehensive AI-powered sales automation service including lead generation, email automation, pipeline management, and AI coaching for B2B SaaS companies.",
    "provider": {
      "@type": "Organization",
      "@id": "https://salesos.com/#organization"
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
            "name": "Growth Plan",
            "description": "AI-powered lead generation and email automation for startups"
          },
          "price": "49",
          "priceCurrency": "USD"
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Pro Plan",
            "description": "Advanced sales automation with API access and analytics"
          },
          "price": "99",
          "priceCurrency": "USD"
        },
        {
          "@type": "Offer",
          "itemOffered": {
            "@type": "Service",
            "name": "Elite Plan",
            "description": "Enterprise sales platform with AI coach and white-label options"
          },
          "price": "299",
          "priceCurrency": "USD"
        }
      ]
    },
    "termsOfService": "https://salesos.com/terms",
    "offers": {
      "@type": "AggregateOffer",
      "lowPrice": "49",
      "highPrice": "299",
      "priceCurrency": "USD"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// NEW: Speakable Schema for voice search/AEO
export const SpeakableSchema = () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": "https://salesos.com/#webpage",
    "name": "SalesOS - AI-Powered Sales Operating System",
    "description": "SalesOS is the leading AI-powered sales operating system for B2B SaaS companies. Close more deals with intelligent lead generation, automated outreach, and real-time AI coaching.",
    "speakable": {
      "@type": "SpeakableSpecification",
      "cssSelector": ["h1", ".hero-description", ".feature-title", ".faq-answer"]
    },
    "url": "https://salesos.com",
    "mainEntity": {
      "@type": "SoftwareApplication",
      "@id": "https://salesos.com/#software"
    }
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// NEW: ItemList Schema for Features/Benefits lists
export const ItemListSchema = ({ items, name }: { items: { name: string; description: string }[]; name: string }) => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": name,
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "description": item.description
    }))
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

// NEW: Comparison Schema - For pricing/feature comparisons
export const ComparisonSchema = () => {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "SalesOS Pricing Plans Comparison",
    "description": "Compare SalesOS pricing plans - Growth, Pro, and Elite",
    "numberOfItems": 3,
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "item": {
          "@type": "Product",
          "name": "SalesOS Growth",
          "description": "Perfect for startups - 500 leads/month, AI email generation, basic analytics",
          "offers": {
            "@type": "Offer",
            "price": "49",
            "priceCurrency": "USD",
            "priceSpecification": {
              "@type": "UnitPriceSpecification",
              "price": "49",
              "priceCurrency": "USD",
              "billingDuration": "P1M"
            }
          }
        }
      },
      {
        "@type": "ListItem",
        "position": 2,
        "item": {
          "@type": "Product",
          "name": "SalesOS Pro",
          "description": "For growing teams - 2500 leads/month, API access, advanced analytics, automations",
          "offers": {
            "@type": "Offer",
            "price": "99",
            "priceCurrency": "USD",
            "priceSpecification": {
              "@type": "UnitPriceSpecification",
              "price": "99",
              "priceCurrency": "USD",
              "billingDuration": "P1M"
            }
          }
        }
      },
      {
        "@type": "ListItem",
        "position": 3,
        "item": {
          "@type": "Product",
          "name": "SalesOS Elite",
          "description": "Enterprise-grade - Unlimited leads, AI coach, white-label, dedicated support",
          "offers": {
            "@type": "Offer",
            "price": "299",
            "priceCurrency": "USD",
            "priceSpecification": {
              "@type": "UnitPriceSpecification",
              "price": "299",
              "priceCurrency": "USD",
              "billingDuration": "P1M"
            }
          }
        }
      }
    ]
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};
