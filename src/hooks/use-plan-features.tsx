import { useState, useCallback } from 'react';
import { useSubscription } from './use-subscription';
import { PLAN_FEATURES, UPGRADE_MESSAGES, type PlanType, type UpgradeFeature } from '@/lib/plan-features';

export const usePlanFeatures = () => {
  const { subscription, loading } = useSubscription();
  const [gateModalOpen, setGateModalOpen] = useState(false);
  const [gatedFeature, setGatedFeature] = useState<UpgradeFeature | null>(null);
  
  const currentPlan: PlanType = subscription?.plan || 'growth';
  const features = PLAN_FEATURES[currentPlan];

  // Check if a feature is available on the current plan
  const hasFeature = useCallback((feature: UpgradeFeature): boolean => {
    const requiredPlan = UPGRADE_MESSAGES[feature].availableOn as PlanType;
    const planOrder: PlanType[] = ['growth', 'pro', 'elite'];
    const currentIndex = planOrder.indexOf(currentPlan);
    const requiredIndex = planOrder.indexOf(requiredPlan);
    return currentIndex >= requiredIndex;
  }, [currentPlan]);

  // Check if a numeric limit is exceeded
  const checkLimit = useCallback((current: number, limitKey: keyof typeof features): boolean => {
    const limit = features[limitKey] as number;
    if (limit === -1) return true; // unlimited
    return current < limit;
  }, [features]);

  // Get the limit value for a feature
  const getLimit = useCallback((limitKey: keyof typeof features): number => {
    return features[limitKey] as number;
  }, [features]);

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
    currentPlan,
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
  };
};
