import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { PUBLIC_DOCS_URL } from "@/lib/public-api";

/** Keep existing /api-docs bookmarks and in-app links working. */
export default function DeveloperDocsRedirect() {
  useEffect(() => {
    window.location.replace(PUBLIC_DOCS_URL);
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold">OutReign developer documentation</h1>
        <Button asChild><a href={PUBLIC_DOCS_URL}>Open documentation</a></Button>
      </div>
    </main>
  );
}