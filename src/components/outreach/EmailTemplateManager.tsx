import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, FolderOpen, Trash2, MoreVertical, Edit, Plus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

export interface UserEmailTemplate {
  id: string;
  name: string;
  goal: string | null;
  suggested_subject: string | null;
  trigger_context: string | null;
  social_proof: string | null;
  created_at: string;
  updated_at: string;
}

interface EmailTemplateManagerProps {
  currentTemplate: {
    goal?: string;
    suggestedSubject?: string;
    triggerContext?: string;
    socialProof?: string;
  };
  onLoadTemplate: (template: UserEmailTemplate) => void;
}

export const EmailTemplateManager = ({
  currentTemplate,
  onLoadTemplate,
}: EmailTemplateManagerProps) => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<UserEmailTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [manageDialogOpen, setManageDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<UserEmailTemplate | null>(null);
  const [templateName, setTemplateName] = useState("");

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_email_templates")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setTemplates((data as UserEmailTemplate[]) || []);
    } catch (error: any) {
      toast({
        title: "Error loading templates",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for your template",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsSaving(true);
    try {
      const templateData = {
        user_id: user.id,
        name: templateName.trim(),
        goal: currentTemplate.goal || null,
        suggested_subject: currentTemplate.suggestedSubject || null,
        trigger_context: currentTemplate.triggerContext || null,
        social_proof: currentTemplate.socialProof || null,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from("user_email_templates")
          .update(templateData)
          .eq("id", editingTemplate.id);
        if (error) throw error;
        toast({
          title: "Template updated",
          description: `"${templateName}" has been updated`,
        });
      } else {
        const { error } = await supabase
          .from("user_email_templates")
          .insert(templateData);
        if (error) throw error;
        toast({
          title: "Template saved",
          description: `"${templateName}" has been saved`,
        });
      }

      setSaveDialogOpen(false);
      setTemplateName("");
      setEditingTemplate(null);
      loadTemplates();
    } catch (error: any) {
      toast({
        title: "Error saving template",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteTemplate = async (template: UserEmailTemplate) => {
    try {
      const { error } = await supabase
        .from("user_email_templates")
        .delete()
        .eq("id", template.id);

      if (error) throw error;
      toast({
        title: "Template deleted",
        description: `"${template.name}" has been removed`,
      });
      loadTemplates();
    } catch (error: any) {
      toast({
        title: "Error deleting template",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEditClick = (template: UserEmailTemplate) => {
    setEditingTemplate(template);
    setTemplateName(template.name);
    setSaveDialogOpen(true);
  };

  const handleSaveNewClick = () => {
    setEditingTemplate(null);
    setTemplateName("");
    setSaveDialogOpen(true);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Save Template Button */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" onClick={handleSaveNewClick}>
            <Save className="w-4 h-4 mr-2" />
            Save as Template
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Update Template" : "Save Email Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g., Tech Startup Outreach"
                className="mt-1.5"
              />
            </div>
            <div className="p-3 bg-muted/50 rounded-lg text-sm space-y-1">
              <p className="font-medium text-muted-foreground">Saves current:</p>
              <ul className="text-muted-foreground list-disc list-inside">
                {currentTemplate.suggestedSubject && <li>Subject line template</li>}
                {currentTemplate.triggerContext && <li>Trigger/context</li>}
                {currentTemplate.socialProof && <li>Social proof</li>}
                {currentTemplate.goal && <li>Email goal</li>}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveTemplate} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {editingTemplate ? "Update" : "Save"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load/Manage Templates Button */}
      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <FolderOpen className="w-4 h-4 mr-2" />
            My Templates
            {templates.length > 0 && (
              <span className="ml-2 text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                {templates.length}
              </span>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Email Templates</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8">
                <FolderOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">No saved templates yet</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Save your current configuration as a template to reuse later
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-2">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className="flex-1 cursor-pointer"
                        onClick={() => {
                          onLoadTemplate(template);
                          setManageDialogOpen(false);
                          toast({
                            title: "Template loaded",
                            description: `"${template.name}" has been applied`,
                          });
                        }}
                      >
                        <p className="font-medium">{template.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {template.goal && (
                            <span className="text-xs bg-muted px-2 py-0.5 rounded">
                              {template.goal}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">
                            Updated {new Date(template.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              onLoadTemplate(template);
                              setManageDialogOpen(false);
                            }}
                          >
                            <FolderOpen className="w-4 h-4 mr-2" />
                            Load Template
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setManageDialogOpen(false);
                              handleEditClick(template);
                            }}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit Name
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteTemplate(template)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
