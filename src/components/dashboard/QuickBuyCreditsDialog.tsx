import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap, ArrowUpRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { TOPUP_PACKS } from "@/lib/stripe-config";

interface QuickBuyCreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const QuickBuyCreditsDialog = ({ open, onOpenChange }: QuickBuyCreditsDialogProps) => {
  const [selectedPack, setSelectedPack] = useState(TOPUP_PACKS[1].priceId); // default to middle
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleConfirmPayment = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Please sign in first");
        return;
      }

      const { data, error } = await supabase.functions.invoke("purchase-credit-topup", {
        body: { priceId: selectedPack },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.url) {
        window.open(data.url, "_blank");
        onOpenChange(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to start checkout";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Quick Buy Credits
          </DialogTitle>
          <DialogDescription>
            Pay once — no commitments, no plan changes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {TOPUP_PACKS.map((pack) => {
            const isSelected = selectedPack === pack.priceId;
            return (
              <button
                key={pack.priceId}
                type="button"
                onClick={() => setSelectedPack(pack.priceId)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border/40 bg-card hover:border-primary/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Radio indicator */}
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    isSelected ? "border-primary" : "border-muted-foreground/40"
                  }`}>
                    {isSelected && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {pack.prospects} prospects
                      </span>
                      {pack.popular && (
                        <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">
                          Popular
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      ${pack.perTenCredits} / 10 credits
                    </span>
                  </div>
                </div>

                <span className="font-semibold text-foreground">
                  ${pack.price}
                </span>
              </button>
            );
          })}
        </div>

        <DialogFooter className="flex flex-col gap-3 sm:flex-col">
          <div className="flex gap-3 w-full">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPayment}
              className="flex-1"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm payment"
              )}
            </Button>
          </div>
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate("/pricing");
            }}
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-1"
          >
            Need more each month? Upgrade your plan
            <ArrowUpRight className="w-3 h-3" />
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
