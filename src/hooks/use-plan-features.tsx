import { useState, useCallback } from 'react';
import { useSubscription } from './use-subscription';
import { useAdmin } from './use-admin';
import { PLAN_FEATURES, UPGRADE_MESSAGES, type PlanType, type UpgradeFeature } from '@/lib/plan-features';

export const usePlanFeatures = () => {
  const { subscription, loading } = useSubscription();
  const { isAdmin } = useAdmin();
  const [gateModalOpen, setGateModalOpen] = useState(false);
  const [gatedFeature, setGatedFeature] = useState<UpgradeFeature | null>(null);
  
  const currentPlan: PlanType = subscription?.plan || 'growth';
  // Admins get elite-level features
  const features = isAdmin ? PLAN_FEATURES.elite : PLAN_FEATURES[currentPlan];

  // Check if a feature is available on the current plan (admins have access to everything)
  const hasFeature = useCallback((feature: UpgradeFeature): boolean => {
    if (isAdmin) return true;
    
    const requiredPlan = UPGRADE_MESSAGES[feature].availableOn as PlanType;
    const planOrder: PlanType[] = ['growth', 'pro', 'elite'];
    const currentIndex = planOrder.indexOf(currentPlan);
    const requiredIndex = planOrder.indexOf(requiredPlan);
    return currentIndex >= requiredIndex;
  }, [currentPlan, isAdmin]);

  // Check if a numeric limit is exceeded (admins have unlimited)
  const checkLimit = useCallback((current: number, limitKey: keyof typeof features): boolean => {
    if (isAdmin) return true;
    
    const limit = features[limitKey] as number;
    if (limit === -1) return true; // unlimited
    return current < limit;
  }, [features, isAdmin]);

  // Get the limit value for a feature (admins get unlimited)
  const getLimit = useCallback((limitKey: keyof typeof features): number => {
    if (isAdmin) return -1; // unlimited for admins
    return features[limitKey] as number;
  }, [features, isAdmin]);

  // Trigger the gate modal for a feature
  const triggerGate = useCallback((feature: UpgradeFeature) => {
    setGatedFeature(feature);
    setGateModalOpen(true);
  }, []);

  // Execute an action or show gate if not available
  const gatedAction = useCallback((feature: UpgradeFeature, action: () => void) => {
    if (hasFeature(feature)) {
      action();
    } else {
      triggerGate(feature);
    }
  }, [hasFeature, triggerGate]);

  // Check limit and execute action or show gate
  const limitedAction = useCallback((
    current: number, 
    limitKey: keyof typeof features, 
    feature: UpgradeFeature, 
    action: () => void
  ) => {
    if (checkLimit(current, limitKey)) {
      action();
    } else {
      triggerGate(feature);
    }
  }, [checkLimit, triggerGate]);

  return {
    currentPlan: isAdmin ? 'elite' as PlanType : currentPlan,
    features,
    loading,
    hasFeature,
    checkLimit,
    getLimit,
    triggerGate,
    gatedAction,
    limitedAction,
    gateModalOpen,
    setGateModalOpen,
    gatedFeature,
    isAdmin,
  };
};
