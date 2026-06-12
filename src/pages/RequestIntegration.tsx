import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SEOHead } from "@/components/seo/SEOHead";

const inputStyle = {
  background: "hsl(261 75% 50% / 0.06)",
  border: "1px solid hsl(261 75% 50% / 0.2)",
  color: "hsl(0 0% 92%)",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  width: "100%",
  fontSize: "0.875rem",
  outline: "none",
} as const;

const labelStyle = { color: "hsl(0 0% 80%)", fontSize: "0.875rem", fontWeight: 500 } as const;
const cardStyle = { background: "hsl(261 75% 50% / 0.04)", border: "1px solid hsl(261 75% 50% / 0.14)" } as const;

const RequestIntegration = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "", company: "", integration: "", description: "", useCase: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.email || !formData.integration) {
      toast.error("Please fill in all required fields");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke("send-integration-request", { body: formData });
      if (error) throw error;
      toast.success("Integration request sent successfully! We'll get back to you soon.");
      setFormData({ name: "", email: "", company: "", integration: "", description: "", useCase: "" });
      setTimeout(() => navigate("/"), 2000);
    } catch (error: unknown) {
      console.error("Error sending integration request:", error);
      toast.error("Failed to send request. Please try again or email us directly at support@bdotindustries.com");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden" style={{ background: "hsl(261 75% 2%)" }}>
      <SEOHead
        title="Request a new integration"
        description="Tell us which tool you'd like OutReign to integrate with. We prioritize integrations based on customer demand."
      />
      <Navbar />

      <div className="flex-1 container mx-auto px-5 sm:px-6 pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-16 max-w-3xl">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 mb-8 text-sm transition-colors"
          style={{ color: "hsl(0 0% 100% / 0.7)" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 80%)")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "hsl(0 0% 100% / 0.7)")}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="space-y-6">
          <div>
            <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/70 sm:text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
              Integrations
            </span>
            <h1
              className="font-display text-3xl sm:text-4xl mb-2"
              style={{ fontWeight: 800, letterSpacing: "-0.02em", color: "hsl(0 0% 95%)" }}
            >
              Request an{" "}
              <span
                className="font-display italic animate-shiny"
                style={{
                  backgroundImage: "linear-gradient(to right, #050010 0%, #1a0060 12.5%, #9d72e8 32.5%, #c068e8 50%, #1a0060 67.5%, #050010 87.5%, #050010 100%)",
                  backgroundSize: "200% auto",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "url(#c3-noise)",
                }}
              >
                integration
              </span>
            </h1>
            <p style={{ color: "hsl(0 0% 100% / 0.55)" }}>
              Tell us which tool you'd like to integrate with OutReign and we'll prioritize it in our roadmap.
            </p>
          </div>

          <div className="rounded-2xl p-6 sm:p-7" style={cardStyle}>
            <h2 className="font-semibold mb-1" style={{ color: "hsl(0 0% 90%)" }}>Integration Request Form</h2>
            <p className="text-sm mb-6" style={{ color: "hsl(0 0% 100% / 0.7)" }}>
              Fill out the form below and we'll review your request within 48 hours.
            </p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label htmlFor="name" style={labelStyle}>
                    Your Name <span style={{ color: "hsl(0 70% 65%)" }}>*</span>
                  </label>
                  <input
                    id="name" name="name" value={formData.name} onChange={handleChange}
                    placeholder="John Doe" required style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.5)")}
                    onBlur={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.2)")}
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="email" style={labelStyle}>
                    Email Address <span style={{ color: "hsl(0 70% 65%)" }}>*</span>
                  </label>
                  <input
                    id="email" name="email" type="email" value={formData.email} onChange={handleChange}
                    placeholder="john@company.com" required style={inputStyle}
                    onFocus={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.5)")}
                    onBlur={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.2)")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="company" style={labelStyle}>Company Name</label>
                <input
                  id="company" name="company" value={formData.company} onChange={handleChange}
                  placeholder="Acme Inc." style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.2)")}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="integration" style={labelStyle}>
                  Integration Name <span style={{ color: "hsl(0 70% 65%)" }}>*</span>
                </label>
                <input
                  id="integration" name="integration" value={formData.integration} onChange={handleChange}
                  placeholder="e.g., Salesforce, HubSpot, LinkedIn" required style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.2)")}
                />
                <p className="text-xs" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                  Which tool or platform would you like to integrate?
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="description" style={labelStyle}>Integration Description</label>
                <textarea
                  id="description" name="description" value={formData.description} onChange={handleChange}
                  placeholder="Describe what data you'd like to sync and how the integration should work..."
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.2)")}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="useCase" style={labelStyle}>Use Case</label>
                <textarea
                  id="useCase" name="useCase" value={formData.useCase} onChange={handleChange}
                  placeholder="How will this integration help your sales process?"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.5)")}
                  onBlur={(e) => (e.target.style.borderColor = "hsl(261 75% 50% / 0.2)")}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg, hsl(261 75% 60%), hsl(261 75% 50%))" }}
                >
                  {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Sending...</> : <><Send className="w-4 h-4" />Submit Request</>}
                </button>
                <button
                  type="button"
                  onClick={() => navigate(-1)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-colors"
                  style={{ background: "hsl(261 75% 50% / 0.06)", border: "1px solid hsl(261 75% 50% / 0.2)", color: "hsl(0 0% 80%)" }}
                  onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.4)")}
                  onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "hsl(261 75% 50% / 0.2)")}
                >
                  Cancel
                </button>
              </div>

              <p className="text-xs" style={{ color: "hsl(0 0% 100% / 0.65)" }}>
                By submitting this form, you agree to be contacted regarding your integration request.
                We'll never share your information with third parties.
              </p>
            </form>
          </div>

          <div className="rounded-2xl p-5 sm:p-6" style={cardStyle}>
            <h2 className="font-semibold mb-3" style={{ color: "hsl(0 0% 90%)" }}>Need Help?</h2>
            <p className="text-sm mb-2" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
              Visit our{" "}
              <a href="/help" className="hover:underline font-medium" style={{ color: "hsl(261 75% 65%)" }}>
                Help Center
              </a>{" "}
              for guides on setting up integrations.
            </p>
            <p className="text-sm" style={{ color: "hsl(0 0% 100% / 0.55)" }}>
              Need immediate assistance? Reach out to{" "}
              <a href="mailto:support@bdotindustries.com" className="hover:underline font-medium" style={{ color: "hsl(261 75% 65%)" }}>
                support@bdotindustries.com
              </a>
            </p>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default RequestIntegration;
