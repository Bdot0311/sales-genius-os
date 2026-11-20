import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import demoVideo from "@/assets/outreign-demo.mp4.asset.json";

interface DemoVideoModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Product demo popup. Replaces the old /demo page: every "See how it works"
 * entry point (hero, footer, exit-intent) opens this instead of navigating.
 * The video element only mounts while open so closing stops playback and
 * the 24MB file is never fetched until someone actually asks for it.
 */
export const DemoVideoModal = ({ open, onOpenChange }: DemoVideoModalProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[calc(100vw-1.5rem)] max-w-4xl overflow-hidden border-border bg-background p-0 sm:rounded-2xl">
      <DialogTitle className="sr-only">See how OutReign works</DialogTitle>
      {open && (
        <video
          src={demoVideo.url}
          className="aspect-video w-full"
          controls
          autoPlay
          playsInline
          preload="metadata"
        />
      )}
    </DialogContent>
  </Dialog>
);
