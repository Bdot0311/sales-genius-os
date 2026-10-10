import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { accountProfileKey, useAccountProfile } from "@/hooks/use-account-profile";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ProfileIdentityEditor({ userId }: { userId: string }) {
  const { data, isLoading, error } = useAccountProfile(userId);
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>();
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setName(data?.display_name ?? ""); }, [data?.display_name]);
  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const save = async () => {
    if (!data || saving) return;
    setSaving(true);
    let uploadedPath: string | null = null;
    try {
      let avatarPath = removePhoto ? null : data.avatar_path;
      if (file) {
        const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
        const extension = extensions[file.type];
        if (!extension || file.size > 5 * 1024 * 1024) throw new Error("Choose a JPG, PNG or WebP photo under 5 MB.");
        uploadedPath = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(uploadedPath, file, { contentType: file.type });
        if (uploadError) throw uploadError;
        avatarPath = uploadedPath;
      }
      const { data: saved, error: saveError } = await supabase.from("profiles")
        .update({ display_name: name.trim() || null, avatar_path: avatarPath, updated_at: new Date().toISOString() })
        .eq("id", userId).select("id").single();
      if (saveError || !saved) throw saveError ?? new Error("Your profile could not be saved.");
      if (data.avatar_path && data.avatar_path !== avatarPath) {
        await supabase.storage.from("profile-avatars").remove([data.avatar_path]);
      }
      await queryClient.invalidateQueries({ queryKey: accountProfileKey(userId) });
      setFile(null);
      setRemovePhoto(false);
      toast.success("Display name and photo saved");
    } catch (err) {
      if (uploadedPath) await supabase.storage.from("profile-avatars").remove([uploadedPath]);
      toast.error(err instanceof Error ? err.message : "Could not save your profile. Try again.");
    } finally { setSaving(false); }
  };

  const photo = removePhoto ? undefined : preview ?? data?.avatarUrl;
  const dirty = name.trim() !== (data?.display_name ?? "") || Boolean(file) || removePhoto;

  return (
    <div className="space-y-4 border-b border-border pb-5">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={photo} alt="Profile photo" className="object-cover" />
          <AvatarFallback className="bg-primary/15 text-primary text-lg">{(name || data?.full_name || "U").slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="space-y-2">
          <Label>Profile photo</Label>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={saving || isLoading || Boolean(error)} onClick={() => fileInput.current?.click()}><Camera className="h-4 w-4 mr-2" />Change photo</Button>
            {photo && <Button variant="ghost" size="icon" aria-label="Remove profile photo" title="Remove profile photo" disabled={saving} onClick={() => { setFile(null); setRemovePhoto(true); }}><Trash2 className="h-4 w-4" /></Button>}
          </div>
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Upload profile photo" className="hidden" onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (!selected) return;
            if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 5 * 1024 * 1024) {
              toast.error("Choose a JPG, PNG or WebP photo under 5 MB."); return;
            }
            setFile(selected); setRemovePhoto(false);
          }} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input id="display-name" value={name} maxLength={100} disabled={saving || isLoading || Boolean(error)} onChange={event => setName(event.target.value)} placeholder={data?.full_name || "Your name"} />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">Your profile could not be loaded. Please refresh and try again.</p>}
      <Button size="sm" onClick={save} disabled={!dirty || saving || isLoading || Boolean(error)}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save name & photo
      </Button>
    </div>
  );
}