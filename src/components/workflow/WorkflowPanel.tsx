import { Node } from 'reactflow';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { X, Trash2 } from 'lucide-react';
import { useState } from 'react';

interface WorkflowPanelProps {
  node: Node;
  onUpdateNode: (nodeId: string, data: any) => void;
  onDeleteNode: (nodeId: string) => void;
  onClose: () => void;
}

const triggerOptions = [
  { value: 'new_lead', label: 'New Lead Added' },
  { value: 'deal_stage_change', label: 'Deal Stage Changed' },
  { value: 'meeting_completed', label: 'Meeting Completed' },
  { value: 'no_response', label: 'No Response' },
  { value: 'lead_scored', label: 'Lead Scored' },
];

const actionOptions = [
  { value: 'send_email', label: 'Send Email' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'update_lead', label: 'Update Lead' },
  { value: 'notify_slack', label: 'Notify Slack' },
  { value: 'add_to_sequence', label: 'Add to Sequence' },
];

const conditionOptions = [
  { value: 'lead_score', label: 'Lead Score' },
  { value: 'deal_value', label: 'Deal Value' },
  { value: 'response_time', label: 'Response Time' },
  { value: 'company_size', label: 'Company Size' },
];

export const WorkflowPanel = ({ node, onUpdateNode, onDeleteNode, onClose }: WorkflowPanelProps) => {
  const [label, setLabel] = useState(node.data.label || '');
  const [configType, setConfigType] = useState(node.data.config?.type || '');

  const handleUpdate = () => {
    onUpdateNode(node.id, {
      label,
      config: { ...node.data.config, type: configType },
    });
  };

  const getOptions = () => {
    switch (node.type) {
      case 'trigger': return triggerOptions;
      case 'action': return actionOptions;
      case 'condition': return conditionOptions;
      default: return [];
    }
  };

  return (
    <Card className="w-80 p-4 m-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">
          Configure {node.type?.charAt(0).toUpperCase()}{node.type?.slice(1)}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <Label>Node Name</Label>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Enter node name"
            onBlur={handleUpdate}
          />
        </div>

        <div>
          <Label>Type</Label>
          <Select value={configType} onValueChange={(value) => {
            setConfigType(value);
            setTimeout(handleUpdate, 0);
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {getOptions().map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {node.type === 'action' && configType === 'send_email' && (
          <>
            <div>
              <Label>Email Template</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="welcome">Welcome Email</SelectItem>
                  <SelectItem value="followup">Follow-up Email</SelectItem>
                  <SelectItem value="proposal">Proposal Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {node.type === 'condition' && (
          <>
            <div>
              <Label>Operator</Label>
              <Select>
                <SelectTrigger>
                  <SelectValue placeholder="Select operator" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="greater">Greater than</SelectItem>
                  <SelectItem value="less">Less than</SelectItem>
                  <SelectItem value="equal">Equal to</SelectItem>
                  <SelectItem value="contains">Contains</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Value</Label>
              <Input placeholder="Enter value" />
            </div>
          </>
        )}
      </div>

      <Button
        variant="destructive"
        className="w-full"
        onClick={() => onDeleteNode(node.id)}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        Delete Node
      </Button>
    </Card>
  );
};