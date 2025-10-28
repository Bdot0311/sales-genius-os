import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Zap } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const TriggerNode = memo(({ data, selected }: NodeProps) => {
  return (
    <Card className={`min-w-[200px] p-4 ${selected ? 'ring-2 ring-primary' : ''}`}>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">TRIGGER</p>
          <p className="font-semibold">{data.label || 'Trigger'}</p>
          {data.config?.type && (
            <p className="text-xs text-muted-foreground mt-1">{data.config.type}</p>
          )}
        </div>
      </div>
    </Card>
  );
});