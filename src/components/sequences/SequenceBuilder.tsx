import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSequences, useSequenceSteps, Sequence, SequenceStep } from "@/hooks/use-sequences";
import { usePlanFeatures } from "@/hooks/use-plan-features";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SequenceStepCard } from "./SequenceStepCard";
import { LeadEngagementBadge } from "./LeadEngagementBadge";
import { UpgradePrompt } from "@/components/dashboard/UpgradePrompt";
import {
  ArrowLeft,
  Plus,
  Play,
  Pause,
  Settings,
  Users,
  BarChart3,
  Save,
} from "lucide-react";

export function SequenceBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { updateSequence } = useSequences();
  const { steps, createStep, updateStep, deleteStep, isLoading: stepsLoading } = useSequenceSteps(id);
  const { features, isAdmin, currentPlan } = usePlanFeatures();
  
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<SequenceStep | null>(null);
  
  // Form state for new/edit step
  const [stepForm, setStepForm] = useState({
    delay_days: 1,
    delay_hours: 0,
    subject_template: "",
    body_template: "",
    trigger_condition: "on_enroll",
  });

  // Fetch sequence details
  const { data: sequence, isLoading: sequenceLoading } = useQuery({
    queryKey: ['sequence', id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase
        .from('email_sequences')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) throw error;
      return data as Sequence;
    },
    enabled: !!id,
  });

  const maxSteps = features.stepsPerSequence;
  const isUnlimited = maxSteps === -1 || isAdmin;
  const canAddMoreSteps = isUnlimited || steps.length < maxSteps;
  const sequenceType: string = features.sequenceType === 'none' ? 'basic' : features.sequenceType;

  const triggerConditions = [
    { value: 'on_enroll', label: 'When enrolled', tier: 'basic' },
    { value: 'on_delay', label: 'After delay', tier: 'basic' },
    { value: 'on_open', label: 'When email opened', tier: 'behavioral' },
    { value: 'on_click', label: 'When link clicked', tier: 'behavioral' },
    { value: 'on_no_response', label: 'No response after delay', tier: 'behavioral' },
    { value: 'on_silence', label: 'Lead gone silent', tier: 'behavioral' },
    { value: 'on_custom', label: 'Custom trigger', tier: 'custom' },
  ];

  const availableTriggers = triggerConditions.filter(t => {
    if (sequenceType === 'custom') return true;
    if (sequenceType === 'behavioral') return t.tier !== 'custom';
    return t.tier === 'basic';
  });

  const handleAddStep = async () => {
    if (!id) return;
    
    await createStep.mutateAsync({
      sequence_id: id,
      step_number: steps.length + 1,
      delay_days: stepForm.delay_days,
      delay_hours: stepForm.delay_hours,
      subject_template: stepForm.subject_template,
      body_template: stepForm.body_template,
      step_type: 'email',
      trigger_condition: stepForm.trigger_condition,
      is_active: true,
    });
    
    resetStepForm();
    setIsAddStepOpen(false);
  };

  const handleUpdateStep = async () => {
    if (!editingStep) return;
    
    await updateStep.mutateAsync({
      id: editingStep.id,
      delay_days: stepForm.delay_days,
      delay_hours: stepForm.delay_hours,
      subject_template: stepForm.subject_template,
      body_template: stepForm.body_template,
      trigger_condition: stepForm.trigger_condition,
    });
    
    resetStepForm();
    setEditingStep(null);
  };

  const handleEditStep = (step: SequenceStep) => {
    setStepForm({
      delay_days: step.delay_days,
      delay_hours: step.delay_hours,
      subject_template: step.subject_template,
      body_template: step.body_template,
      trigger_condition: step.trigger_condition,
    });
    setEditingStep(step);
  };

  const handleDeleteStep = async (stepId: string) => {
    await deleteStep.mutateAsync(stepId);
  };

  const handleToggleSequenceStatus = async () => {
    if (!sequence) return;
    await updateSequence.mutateAsync({
      id: sequence.id,
      status: sequence.status === 'active' ? 'paused' : 'active',
    });
  };

  const resetStepForm = () => {
    setStepForm({
      delay_days: 1,
      delay_hours: 0,
      subject_template: "",
      body_template: "",
      trigger_condition: "on_enroll",
    });
  };

  if (sequenceLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (!sequence) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Sequence not found</p>
        <Button variant="link" onClick={() => navigate('/dashboard/sequences')}>
          Back to Sequences
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/sequences')}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{sequence.name}</h1>
            <p className="text-muted-foreground">{sequence.description || 'No description'}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge 
            variant="outline" 
            className={
              sequence.status === 'active' 
                ? 'bg-green-500/10 text-green-500' 
                : sequence.status === 'paused'
                ? 'bg-yellow-500/10 text-yellow-500'
                : ''
            }
          >
            {sequence.status}
          </Badge>
          
          <Button variant="outline" onClick={handleToggleSequenceStatus}>
            {sequence.status === 'active' ? (
              <>
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Activate
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Enrolled</CardDescription>
            <CardTitle className="text-2xl">{sequence.total_enrollments || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl">{sequence.total_completed || 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Steps</CardDescription>
            <CardTitle className="text-2xl">{steps.length}/{isUnlimited ? '∞' : maxSteps}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Sequence Type</CardDescription>
            <CardTitle className="text-2xl capitalize">{sequenceType}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Upgrade prompt if at step limit */}
      {!canAddMoreSteps && (
        <UpgradePrompt
          feature="More Sequence Steps"
          requiredPlan="pro"
        />
      )}

      {/* Steps Timeline */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Sequence Steps</h2>
          <Button 
            onClick={() => setIsAddStepOpen(true)} 
            disabled={!canAddMoreSteps}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Step
          </Button>
        </div>

        {steps.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No steps yet. Add your first step to get started.</p>
              <Button onClick={() => setIsAddStepOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add First Step
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {steps.map((step, index) => (
              <SequenceStepCard
                key={step.id}
                step={step}
                stepNumber={index + 1}
                isLast={index === steps.length - 1}
                onEdit={() => handleEditStep(step)}
                onDelete={() => handleDeleteStep(step.id)}
                sequenceType={sequenceType as 'basic' | 'behavioral' | 'custom'}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Step Dialog */}
      <Dialog 
        open={isAddStepOpen || !!editingStep} 
        onOpenChange={(open) => {
          if (!open) {
            setIsAddStepOpen(false);
            setEditingStep(null);
            resetStepForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingStep ? 'Edit Step' : 'Add New Step'}</DialogTitle>
            <DialogDescription>
              Configure when and what to send in this step.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Trigger Condition */}
            <div className="space-y-2">
              <Label>Trigger Condition</Label>
              <Select
                value={stepForm.trigger_condition}
                onValueChange={(value) => setStepForm(prev => ({ ...prev, trigger_condition: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTriggers.map((trigger) => (
                    <SelectItem key={trigger.value} value={trigger.value}>
                      {trigger.label}
                      {trigger.tier !== 'basic' && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          {trigger.tier === 'behavioral' ? 'Pro' : 'Elite'}
                        </Badge>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Delay */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Delay (Days)</Label>
                <Input
                  type="number"
                  min="0"
                  value={stepForm.delay_days}
                  onChange={(e) => setStepForm(prev => ({ ...prev, delay_days: parseInt(e.target.value) || 0 }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Delay (Hours)</Label>
                <Input
                  type="number"
                  min="0"
                  max="23"
                  value={stepForm.delay_hours}
                  onChange={(e) => setStepForm(prev => ({ ...prev, delay_hours: parseInt(e.target.value) || 0 }))}
                />
              </div>
            </div>

            {/* Subject */}
            <div className="space-y-2">
              <Label>Email Subject</Label>
              <Input
                placeholder="e.g., Quick follow-up on {{company_name}}"
                value={stepForm.subject_template}
                onChange={(e) => setStepForm(prev => ({ ...prev, subject_template: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Use {"{{variable}}"} for personalization: contact_name, company_name, job_title
              </p>
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label>Email Body</Label>
              <Textarea
                placeholder="Write your email content here..."
                className="min-h-[200px]"
                value={stepForm.body_template}
                onChange={(e) => setStepForm(prev => ({ ...prev, body_template: e.target.value }))}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsAddStepOpen(false);
                setEditingStep(null);
                resetStepForm();
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={editingStep ? handleUpdateStep : handleAddStep}
              disabled={!stepForm.subject_template || !stepForm.body_template}
            >
              <Save className="w-4 h-4 mr-2" />
              {editingStep ? 'Save Changes' : 'Add Step'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
