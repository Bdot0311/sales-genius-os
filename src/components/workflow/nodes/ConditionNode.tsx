import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { GitBranch } from 'lucide-react';
import { Card } from '@/components/ui/card';

export const ConditionNode = memo(({ data, selected }: NodeProps) => {
  return (
    <Card className={`min-w-[200px] p-4 ${selected ? 'ring-2 ring-primary' : ''}`}>
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      <Handle type="source" position={Position.Bottom} id="true" className="w-3 h-3" style={{ left: '35%' }} />
      <Handle type="source" position={Position.Bottom} id="false" className="w-3 h-3" style={{ left: '65%' }} />
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-chart-2/10">
          <GitBranch className="w-5 h-5 text-chart-2" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium">CONDITION</p>
          <p className="font-semibold">{data.label || 'Condition'}</p>
          {data.config?.type && (
            <p className="text-xs text-muted-foreground mt-1">{data.config.type}</p>
          )}
        </div>
      </div>
    </Card>
  );
});