import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Zap, Play, GitBranch } from 'lucide-react';

interface NodeToolbarProps {
  onAddNode: (type: 'trigger' | 'action' | 'condition') => void;
}

export const NodeToolbar = ({ onAddNode }: NodeToolbarProps) => {
  return (
    <Card className="w-64 p-4 m-4 space-y-2">
      <h3 className="font-semibold mb-4">Add Nodes</h3>
      
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => onAddNode('trigger')}
      >
        <Zap className="w-4 h-4 mr-2 text-primary" />
        Trigger
      </Button>
      
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => onAddNode('action')}
      >
        <Play className="w-4 h-4 mr-2 text-accent" />
        Action
      </Button>
      
      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => onAddNode('condition')}
      >
        <GitBranch className="w-4 h-4 mr-2 text-chart-2" />
        Condition
      </Button>

      <div className="mt-6 pt-4 border-t border-border">
        <h4 className="text-sm font-medium mb-2">Tips</h4>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>• Drag nodes to position them</li>
          <li>• Connect nodes by dragging from handles</li>
          <li>• Click a node to configure it</li>
        </ul>
      </div>
    </Card>
  );
};