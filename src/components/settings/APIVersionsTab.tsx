import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, Plus, Calendar, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface APIVersion {
  id: string;
  version: string;
  status: 'active' | 'deprecated' | 'sunset';
  deprecation_date: string | null;
  sunset_date: string | null;
  changelog: string | null;
  created_at: string;
}

export const APIVersionsTab = () => {
  const [versions, setVersions] = useState<APIVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newVersion, setNewVersion] = useState({
    version: '',
    status: 'active',
    changelog: '',
    deprecation_date: '',
    sunset_date: '',
  });
  const { toast } = useToast();

  useEffect(() => {
    loadVersions();
  }, []);

  const loadVersions = async () => {
    try {
      const { data, error } = await supabase
        .from('api_versions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading API versions",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    try {
      const { error } = await supabase.from('api_versions').insert({
        version: newVersion.version,
        status: newVersion.status,
        changelog: newVersion.changelog || null,
        deprecation_date: newVersion.deprecation_date || null,
        sunset_date: newVersion.sunset_date || null,
      });

      if (error) throw error;

      toast({
        title: "API version created",
        description: `Version ${newVersion.version} has been created successfully.`,
      });

      setCreateDialogOpen(false);
      setNewVersion({ version: '', status: 'active', changelog: '', deprecation_date: '', sunset_date: '' });
      loadVersions();
    } catch (error: any) {
      toast({
        title: "Error creating version",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from('api_versions')
        .update({ status })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Status updated",
        description: "API version status has been updated.",
      });

      loadVersions();
    } catch (error: any) {
      toast({
        title: "Error updating status",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string, deprecation_date: string | null, sunset_date: string | null) => {
    if (status === 'sunset') {
      return <Badge variant="destructive">Sunset</Badge>;
    }
    if (status === 'deprecated') {
      return <Badge variant="outline" className="border-yellow-500 text-yellow-600"><AlertTriangle className="w-3 h-3 mr-1" />Deprecated</Badge>;
    }
    return <Badge variant="default">Active</Badge>;
  };

  if (loading) {
    return <div className="text-center py-8">Loading API versions...</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>API Versions</CardTitle>
              <CardDescription>
                Manage API versions with deprecation warnings for seamless evolution
              </CardDescription>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Version
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New API Version</DialogTitle>
                  <DialogDescription>
                    Define a new API version with optional deprecation timeline
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="version">Version</Label>
                    <Input
                      id="version"
                      placeholder="v2.0"
                      value={newVersion.version}
                      onChange={(e) => setNewVersion({ ...newVersion, version: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="status">Status</Label>
                    <Select value={newVersion.status} onValueChange={(value) => setNewVersion({ ...newVersion, status: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="deprecated">Deprecated</SelectItem>
                        <SelectItem value="sunset">Sunset</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="changelog">Changelog</Label>
                    <Textarea
                      id="changelog"
                      placeholder="What's new in this version..."
                      value={newVersion.changelog}
                      onChange={(e) => setNewVersion({ ...newVersion, changelog: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="deprecation_date">Deprecation Date (Optional)</Label>
                    <Input
                      id="deprecation_date"
                      type="date"
                      value={newVersion.deprecation_date}
                      onChange={(e) => setNewVersion({ ...newVersion, deprecation_date: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="sunset_date">Sunset Date (Optional)</Label>
                    <Input
                      id="sunset_date"
                      type="date"
                      value={newVersion.sunset_date}
                      onChange={(e) => setNewVersion({ ...newVersion, sunset_date: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleCreateVersion}>Create Version</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No API versions created yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {versions.map((version) => (
                <div key={version.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{version.version}</h3>
                        {getStatusBadge(version.status, version.deprecation_date, version.sunset_date)}
                      </div>
                      {version.changelog && (
                        <p className="text-sm text-muted-foreground">{version.changelog}</p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Created: {new Date(version.created_at).toLocaleDateString()}
                        </div>
                        {version.deprecation_date && (
                          <div className="flex items-center gap-1 text-yellow-600">
                            <AlertTriangle className="w-3 h-3" />
                            Deprecation: {new Date(version.deprecation_date).toLocaleDateString()}
                          </div>
                        )}
                        {version.sunset_date && (
                          <div className="flex items-center gap-1 text-destructive">
                            <AlertCircle className="w-3 h-3" />
                            Sunset: {new Date(version.sunset_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <Select value={version.status} onValueChange={(value) => handleUpdateStatus(version.id, value)}>
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="deprecated">Deprecated</SelectItem>
                        <SelectItem value="sunset">Sunset</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
