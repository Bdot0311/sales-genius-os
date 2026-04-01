import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Copy,
  Users,
  FileText,
  MessageSquare,
  Target,
  Trophy,
  MousePointerClick,
  X as XIcon,
  Shield,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usePlanFeatures } from '@/hooks/use-plan-features';
import { MessageBlockEditor } from './MessageBlockEditor';
import { PlanLimitBadge } from '@/components/dashboard/PlanLimitBadge';

interface MessageBlock {
  id: string;
  name: string;
  category: string;
  content: string;
  is_shared: boolean;
  use_count: number;
  user_id: string;
}

const CATEGORY_ICONS: Record<string, any> = {
  opener: FileText,
  pain_point: Target,
  social_proof: Trophy,
  cta: MousePointerClick,
  closing: XIcon,
  objection_handler: Shield,
};

const CATEGORY_COLORS: Record<string, string> = {
  opener: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  pain_point: 'bg-red-500/10 text-red-600 border-red-500/20',
  social_proof: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
  cta: 'bg-green-500/10 text-green-600 border-green-500/20',
  closing: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
  objection_handler: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
};

export const MessageBlocksList = () => {
  const { toast } = useToast();
  const { features, currentPlan, getLimit } = usePlanFeatures();
  const [blocks, setBlocks] = useState<MessageBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<MessageBlock | null>(null);

  const messageBlocksLimit = getLimit('messageBlocks');
  const isAtLimit = messageBlocksLimit !== -1 && blocks.length >= messageBlocksLimit;

  const fetchBlocks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's own blocks and shared blocks from team
      const { data, error } = await supabase
        .from('message_blocks')
        .select('*')
        .or(`user_id.eq.${user.id},is_shared.eq.true`)
        .order('category')
        .order('name');

      if (error) throw error;
      setBlocks(data || []);
    } catch (error) {
      console.error('Error fetching blocks:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBlocks();
  }, []);

  const handleCopy = async (content: string, blockId: string) => {
    await navigator.clipboard.writeText(content);
    
    // Increment use count
    await supabase
      .from('message_blocks')
      .update({ use_count: blocks.find(b => b.id === blockId)!.use_count + 1 })
      .eq('id', blockId);

    toast({ title: 'Copied to clipboard' });
    fetchBlocks();
  };

  const handleDelete = async (blockId: string) => {
    try {
      const { error } = await supabase
        .from('message_blocks')
        .delete()
        .eq('id', blockId);

      if (error) throw error;
      toast({ title: 'Block deleted' });
      fetchBlocks();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete block.',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (block: MessageBlock) => {
    setEditingBlock(block);
    setEditorOpen(true);
  };

  const handleCreate = () => {
    if (isAtLimit) {
      toast({
        title: 'Limit reached',
        description: `Your plan allows ${messageBlocksLimit} message blocks. Upgrade to add more.`,
        variant: 'destructive',
      });
      return;
    }
    setEditingBlock(null);
    setEditorOpen(true);
  };

  const filteredBlocks = blocks.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.content.toLowerCase().includes(search.toLowerCase()) ||
      b.category.toLowerCase().includes(search.toLowerCase())
  );

  const groupedBlocks = filteredBlocks.reduce((acc, block) => {
    if (!acc[block.category]) acc[block.category] = [];
    acc[block.category].push(block);
    return acc;
  }, {} as Record<string, MessageBlock[]>);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Message Blocks</h2>
          <p className="text-muted-foreground">
            Reusable content components for building emails
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PlanLimitBadge
            current={blocks.filter(b => b.user_id).length}
            limit={messageBlocksLimit}
            label="blocks"
          />
          <Button onClick={handleCreate} disabled={isAtLimit}>
            <Plus className="w-4 h-4 mr-2" />
            New Block
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search blocks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : Object.keys(groupedBlocks).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageSquare className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No message blocks yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create reusable content blocks to speed up email writing
            </p>
            <Button onClick={handleCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Block
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedBlocks).map(([category, categoryBlocks]) => {
            const Icon = CATEGORY_ICONS[category] || FileText;
            const colorClass = CATEGORY_COLORS[category] || 'bg-muted';

            return (
              <div key={category}>
                <div className="flex items-center gap-2 mb-3">
                  <Badge className={colorClass}>
                    <Icon className="w-3 h-3 mr-1" />
                    {category.replace('_', ' ')}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {categoryBlocks.length} blocks
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {categoryBlocks.map((block) => (
                    <Card key={block.id} className="group">
                      <CardHeader className="py-3 px-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-sm font-medium flex items-center gap-2">
                              {block.name}
                              {block.is_shared && (
                                <Users className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </CardTitle>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Used {block.use_count} times
                            </p>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleCopy(block.content, block.id)}
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleEdit(block)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive"
                              onClick={() => handleDelete(block.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0 px-4 pb-3">
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {block.content}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <MessageBlockEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        block={editingBlock}
        onSave={fetchBlocks}
      />
    </div>
  );
};
