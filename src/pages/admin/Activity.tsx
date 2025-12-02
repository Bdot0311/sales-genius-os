import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const AdminActivity = () => {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity Logs</CardTitle>
        <CardDescription>View system and user activity logs</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-center py-12 text-muted-foreground">
          <p>Activity logs section coming soon</p>
        </div>
      </CardContent>
    </Card>
  );
};

export default AdminActivity;
