import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Play,
  Pause,
  MessageSquare,
  Archive,
  User,
  Building2,
  AlertCircle,
  Clock,
  X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { LeadEngagementBadge } from './LeadEngagementBadge';

interface Lead {
  id: string;
  contact_name: string;
  company_name: string;
  job_title?: string;
  engagement_state?: string;
}

interface Enrollment {
  id: string;
  status: string;
  paused_reason?: string;
  current_step: number;
  lead: Lead;
  sequence: {
    name: string;
  };
}

interface HandoffActionPanelProps {
  enrollments: Enrollment[];
  onRefresh: () => void;
}

export const HandoffActionPanel = ({ enrollments, onRefresh }: HandoffActionPanelProps) => {
  const { toast } = useToast();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const pausedEnrollments = enrollments.filter(e => e.status === 'paused');

  const handleResume = async (enrollmentId: string) => {
    setLoading(enrollmentId);
    try {
      const { error } = await supabase
        .from('sequence_enrollments')
        .update({ 
          status: 'active', 
          paused_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrollmentId);

      if (error) throw error;

      toast({
        title: 'Sequence resumed',
        description: 'The lead will continue receiving automated emails.',
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to resume sequence.',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleArchive = async (enrollmentId: string) => {
    setLoading(enrollmentId);
    try {
      const { error } = await supabase
        .from('sequence_enrollments')
        .update({ 
          status: 'exited',
          updated_at: new Date().toISOString(),
        })
        .eq('id', enrollmentId);

      if (error) throw error;

      toast({
        title: 'Lead archived',
        description: 'The lead has been removed from this sequence.',
      });
      onRefresh();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to archive lead.',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  const handleSendReply = async (enrollment: Enrollment) => {
    if (!replyContent.trim()) return;

    setLoading(enrollment.id);
    try {
      // Create a draft email for the user to send
      const { error } = await supabase
        .from('email_drafts')
        .insert({
          user_id: (await supabase.auth.getUser()).data.user?.id,
          lead_id: enrollment.lead.id,
          subject: `Re: Follow-up`,
          body: replyContent,
          trigger_context: `Manual reply from sequence handoff - ${enrollment.paused_reason}`,
        });

      if (error) throw error;

      toast({
        title: 'Draft created',
        description: 'Your reply has been saved as a draft. Go to Outreach to send it.',
      });
      
      setReplyingTo(null);
      setReplyContent('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create draft.',
        variant: 'destructive',
      });
    } finally {
      setLoading(null);
    }
  };

  const getPauseReasonIcon = (reason?: string) => {
    if (!reason) return <AlertCircle className="w-4 h-4" />;
    if (reason.includes('question')) return <MessageSquare className="w-4 h-4" />;
    if (reason.includes('timing')) return <Clock className="w-4 h-4" />;
    return <AlertCircle className="w-4 h-4" />;
  };

  if (pausedEnrollments.length === 0) {
    return null;
  }

  return (
    <Card className="border-orange-500/20 bg-orange-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5 text-orange-500" />
          Leads Requiring Action
          <Badge variant="secondary" className="ml-2">
            {pausedEnrollments.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {pausedEnrollments.map((enrollment) => (
          <div 
            key={enrollment.id}
            className="p-4 rounded-lg border bg-background"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium truncate">
                    {enrollment.lead.contact_name}
                  </span>
                  {enrollment.lead.engagement_state && (
                    <LeadEngagementBadge 
                      state={enrollment.lead.engagement_state} 
                      size="sm" 
                    />
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Building2 className="w-3.5 h-3.5" />
                  <span className="truncate">
                    {enrollment.lead.company_name}
                    {enrollment.lead.job_title && ` • ${enrollment.lead.job_title}`}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  {getPauseReasonIcon(enrollment.paused_reason)}
                  <span className="text-orange-600 dark:text-orange-400">
                    {enrollment.paused_reason || 'Paused for review'}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Sequence: {enrollment.sequence.name} • Step {enrollment.current_step}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleResume(enrollment.id)}
                  disabled={loading === enrollment.id}
                >
                  <Play className="w-3.5 h-3.5 mr-1" />
                  Resume
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setReplyingTo(
                    replyingTo === enrollment.id ? null : enrollment.id
                  )}
                  disabled={loading === enrollment.id}
                >
                  <MessageSquare className="w-3.5 h-3.5 mr-1" />
                  Reply
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => handleArchive(enrollment.id)}
                  disabled={loading === enrollment.id}
                >
                  <Archive className="w-3.5 h-3.5 mr-1" />
                  Archive
                </Button>
              </div>
            </div>

            {replyingTo === enrollment.id && (
              <div className="mt-4 pt-4 border-t space-y-3">
                <Textarea
                  placeholder="Write your reply..."
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  rows={3}
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setReplyingTo(null);
                      setReplyContent('');
                    }}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleSendReply(enrollment)}
                    disabled={!replyContent.trim() || loading === enrollment.id}
                  >
                    Create Draft
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
