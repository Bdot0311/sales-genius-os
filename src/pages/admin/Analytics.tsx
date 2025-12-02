import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const AdminAnalytics = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Analytics</CardTitle>
        <CardDescription>View detailed analytics and reports</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 text-muted-foreground">
          <p>Analytics section coming soon</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminAnalytics;
