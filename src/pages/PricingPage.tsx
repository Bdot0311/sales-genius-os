import { Navbar } from "@/components/Navbar";
import { Pricing } from "@/components/Pricing";
import { Footer } from "@/components/Footer";

const PricingPage = () => {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <Pricing />
      <Footer />
    </div>
  );
};

export default PricingPage;
