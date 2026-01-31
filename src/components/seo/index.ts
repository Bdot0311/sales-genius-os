export { SEOHead } from './SEOHead';
export { SEOBreadcrumb } from './SEOBreadcrumb';
export { 
  OrganizationSchema, 
  SoftwareApplicationSchema, 
  FAQSchema, 
  ProductSchema,
  WebSiteSchema,
  BreadcrumbSchema,
  HowToSchema,
  VideoSchema,
  ArticleSchema,
  BlogPostingSchema,
  ServiceSchema,
  SpeakableSchema,
  ItemListSchema,
  ComparisonSchema,
  ReviewSchema,
  AggregateRatingSchema
} from './StructuredData';

// Re-export utilities
export {
  getCanonicalUrl,
  calculateReadingTime,
  formatPageTitle,
  truncateText,
  generateBreadcrumbsFromPath,
  shouldIndexPage,
  formatSchemaDate,
  generateExcerpt,
  validateMetaDescription,
  getOGImageUrl,
  CANONICAL_DOMAIN
} from '@/lib/seo-utils';
