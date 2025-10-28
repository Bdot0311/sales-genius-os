import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Play } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const ActionNode = memo(({ data, selected }: NodeProps) => {
  return (
    <Card className={`min-w-[200px] p-4 ${selected ? 'ring-2 ring-primary' : ''}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-accent/10">
          <Play className="w-5 h-5 text-accent" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">ACTION</p>
          <p className="font-semibold">{data.label || 'Action'}</p>
          {data.config?.type && (
            <p className="text-xs text-muted-foreground mt-1">{data.config.type}</p>
          )}
        </div>
      </div>
    </Card>
  );
});