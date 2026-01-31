// SEO Utility Functions for SalesOS
// Canonical domain for all absolute URLs
export const CANONICAL_DOMAIN = 'https://salesos.alephwavex.io';

// Query params to strip from canonical URLs (tracking/duplicate content)
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'ref', 'fbclid', 'gclid', 'msclkid', 'mc_cid', 'mc_eid', '_ga'
];

/**
 * Generate a canonical URL from a path
 * Strips tracking parameters and normalizes the URL
 */
export function getCanonicalUrl(path: string, params?: Record<string, string>): string {
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  // Remove trailing slash (except for root)
  const cleanPath = normalizedPath === '/' ? '/' : normalizedPath.replace(/\/$/, '');
  
  // Build URL
  let url = `${CANONICAL_DOMAIN}${cleanPath}`;
  
  // Add non-tracking params if provided
  if (params) {
    const filteredParams = Object.entries(params)
      .filter(([key]) => !TRACKING_PARAMS.includes(key.toLowerCase()))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    
    if (filteredParams.length > 0) {
      url += `?${filteredParams.join('&')}`;
    }
  }
  
  return url.toLowerCase();
}

/**
 * Strip tracking parameters from current URL
 */
export function stripTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    TRACKING_PARAMS.forEach(param => urlObj.searchParams.delete(param));
    return urlObj.toString();
  } catch {
    return url;
  }
}

/**
 * Calculate reading time for content
 * Average reading speed: 200-250 words per minute
 */
export function calculateReadingTime(content: string, wordsPerMinute = 225): {
  minutes: number;
  text: string;
  words: number;
} {
  const words = content.trim().split(/\s+/).length;
  const minutes = Math.ceil(words / wordsPerMinute);
  
  return {
    minutes,
    text: minutes === 1 ? '1 min read' : `${minutes} min read`,
    words
  };
}

/**
 * Truncate text to a maximum length with ellipsis
 * Useful for meta descriptions (max 160 chars)
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3).trim() + '...';
}

/**
 * Generate page title with site name suffix
 */
export function formatPageTitle(title: string, siteName = 'SalesOS'): string {
  if (title.toLowerCase().includes(siteName.toLowerCase())) {
    return title;
  }
  return `${title} | ${siteName}`;
}

/**
 * Validate meta description length
 */
export function validateMetaDescription(description: string): {
  isValid: boolean;
  length: number;
  message: string;
} {
  const length = description.length;
  
  if (length < 50) {
    return { isValid: false, length, message: 'Too short (min 50 chars)' };
  }
  if (length > 160) {
    return { isValid: false, length, message: 'Too long (max 160 chars)' };
  }
  return { isValid: true, length, message: 'Good length' };
}

/**
 * Generate breadcrumb items from URL path
 */
export function generateBreadcrumbsFromPath(path: string): Array<{ name: string; url: string }> {
  const segments = path.split('/').filter(Boolean);
  const breadcrumbs: Array<{ name: string; url: string }> = [
    { name: 'Home', url: CANONICAL_DOMAIN }
  ];
  
  let currentPath = '';
  segments.forEach(segment => {
    currentPath += `/${segment}`;
    // Convert slug to readable name
    const name = segment
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    
    breadcrumbs.push({
      name,
      url: `${CANONICAL_DOMAIN}${currentPath}`
    });
  });
  
  return breadcrumbs;
}

/**
 * Format ISO date for schema.org
 */
export function formatSchemaDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * Generate excerpt from content for meta description
 */
export function generateExcerpt(content: string, maxLength = 160): string {
  // Remove HTML tags if present
  const textOnly = content.replace(/<[^>]*>/g, '');
  // Remove multiple spaces
  const cleaned = textOnly.replace(/\s+/g, ' ').trim();
  return truncateText(cleaned, maxLength);
}

/**
 * Check if current page should be indexed
 * Returns true for public pages, false for authenticated/admin pages
 */
export function shouldIndexPage(path: string): boolean {
  const noIndexPaths = [
    '/dashboard',
    '/admin',
    '/settings',
    '/auth',
    '/pipeline',
    '/leads',
    '/analytics',
    '/automations',
    '/outreach',
    '/calendar',
    '/coach',
    '/saved-leads',
    '/integrations',
    '/confirmation'
  ];
  
  return !noIndexPaths.some(p => path.startsWith(p));
}

/**
 * OG Image URL - returns page-specific or default
 */
export function getOGImageUrl(pageName?: string): string {
  const defaultOG = 'https://storage.googleapis.com/gpt-engineer-file-uploads/ZFJK1zezovOpOdjy9TptFukIhhc2/social-images/social-1768238149761-SalesOS full logo.png';
  
  // Add custom OG images here as they're created
  const ogImages: Record<string, string> = {
    home: defaultOG,
    pricing: defaultOG,
    // Add more as custom OG images are created
  };
  
  return pageName && ogImages[pageName] ? ogImages[pageName] : defaultOG;
}
