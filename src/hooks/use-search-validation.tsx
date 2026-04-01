import { useCallback } from 'react';
import { toast } from 'sonner';

interface SearchFilters {
  jobTitle?: string;
  seniority?: string;
  department?: string;
  industry?: string;
  companySize?: string;
  location?: string;
  country?: string;
  city?: string;
  companyName?: string;
  technologies?: string[];
  [key: string]: string | string[] | undefined;
}

interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Hook for validating search queries before API requests
 * Prevents empty or overly broad queries
 */
export const useSearchValidation = () => {
  const validateSearchFilters = useCallback((filters: SearchFilters): ValidationResult => {
    // Check if at least one meaningful filter is provided
    const meaningfulFilters = [
      'jobTitle',
      'seniority', 
      'department',
      'industry',
      'companySize',
      'location',
      'country',
      'city',
      'companyName',
      'technologies',
    ];

    const hasFilter = meaningfulFilters.some(key => {
      const value = filters[key];
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value && value.trim().length > 0;
    });

    if (!hasFilter) {
      return {
        valid: false,
        reason: 'Please refine your search filters before running this query.',
      };
    }

    // Check for overly broad queries (e.g., only selecting a very large country without other filters)
    const hasNarrowingFilter = [
      'jobTitle',
      'companyName',
      'industry',
      'department',
      'seniority',
    ].some(key => {
      const value = filters[key];
      return value && (Array.isArray(value) ? value.length > 0 : value.trim().length > 0);
    });

    const onlyHasLocation = !hasNarrowingFilter && (
      filters.country || filters.city || filters.location
    );

    if (onlyHasLocation) {
      return {
        valid: false,
        reason: 'Please add at least one filter (job title, industry, or company) to narrow your search.',
      };
    }

    return { valid: true };
  }, []);

  const validateAndToast = useCallback((filters: SearchFilters): boolean => {
    const result = validateSearchFilters(filters);
    
    if (!result.valid) {
      toast.error(result.reason || 'Please refine your search filters.');
      return false;
    }
    
    return true;
  }, [validateSearchFilters]);

  /**
   * Validates batch size for bulk operations
   */
  const validateBatchSize = useCallback((count: number, maxBatch: number = 100): ValidationResult => {
    if (count <= 0) {
      return {
        valid: false,
        reason: 'Please select at least one prospect.',
      };
    }

    if (count > maxBatch) {
      return {
        valid: false,
        reason: `Maximum ${maxBatch} prospects can be processed at once.`,
      };
    }

    return { valid: true };
  }, []);

  return {
    validateSearchFilters,
    validateAndToast,
    validateBatchSize,
  };
};
