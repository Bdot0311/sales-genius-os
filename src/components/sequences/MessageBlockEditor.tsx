import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usePlanFeatures } from '@/hooks/use-plan-features';

const BLOCK_CATEGORIES = [
  { value: 'opener', label: 'Opener' },
  { value: 'pain_point', label: 'Pain Point' },
  { value: 'social_proof', label: 'Social Proof' },
  { value: 'cta', label: 'Call to Action' },
  { value: 'closing', label: 'Closing' },
  { value: 'objection_handler', label: 'Objection Handler' },
];

interface MessageBlock {
  id?: string;
  name: string;
  category: string;
  content: string;
  is_shared: boolean;
}

interface MessageBlockEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block?: MessageBlock | null;
  onSave: () => void;
}

export const MessageBlockEditor = ({
  open,
  onOpenChange,
  block,
  onSave,
}: MessageBlockEditorProps) => {
  const { toast } = useToast();
  const { features, currentPlan } = usePlanFeatures();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<MessageBlock>(
    block || {
      name: '',
      category: 'opener',
      content: '',
      is_shared: false,
    }
  );

  const isPro = currentPlan === 'pro';

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.content.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Name and content are required.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (block?.id) {
        // Update existing
        const { error } = await supabase
          .from('message_blocks')
          .update({
            name: formData.name,
            category: formData.category,
            content: formData.content,
            is_shared: isElite ? formData.is_shared : false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', block.id);

        if (error) throw error;
        toast({ title: 'Block updated' });
      } else {
        // Create new
        const { error } = await supabase
          .from('message_blocks')
          .insert({
            user_id: user.id,
            name: formData.name,
            category: formData.category,
            content: formData.content,
            is_shared: isElite ? formData.is_shared : false,
          });

        if (error) throw error;
        toast({ title: 'Block created' });
      }

      onSave();
      onOpenChange(false);
      setFormData({
        name: '',
        category: 'opener',
        content: '',
        is_shared: false,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {block?.id ? 'Edit Message Block' : 'Create Message Block'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Block Name</Label>
            <Input
              id="name"
              placeholder="e.g., Pain point for sales teams"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={formData.category}
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BLOCK_CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content">Content</Label>
            <Textarea
              id="content"
              placeholder="Write your reusable content block here..."
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              rows={5}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Use {'{{first_name}}'}, {'{{company}}'}, {'{{job_title}}'} for personalization
            </p>
          </div>

          {isElite && (
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="shared">Share with team</Label>
                <p className="text-xs text-muted-foreground">
                  Make this block available to all team members
                </p>
              </div>
              <Switch
                id="shared"
                checked={formData.is_shared}
                onCheckedChange={(checked) => 
                  setFormData({ ...formData, is_shared: checked })
                }
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? 'Saving...' : block?.id ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
