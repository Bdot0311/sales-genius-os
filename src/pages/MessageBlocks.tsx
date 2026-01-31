import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MessageBlocksList } from '@/components/sequences/MessageBlocksList';

const MessageBlocks = () => {
  return (
    <DashboardLayout>
      <MessageBlocksList />
    </DashboardLayout>
  );
};

export default MessageBlocks;
