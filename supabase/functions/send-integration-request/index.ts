import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IntegrationRequest {
  name: string;
  email: string;
  company: string;
  integration: string;
  description: string;
  useCase: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, company, integration, description, useCase }: IntegrationRequest = await req.json();

    console.log("Integration request received for:", integration);
    console.log("From:", name, email);
    console.log("Company:", company);
    console.log("Description:", description);
    console.log("Use Case:", useCase);

    // For now, just log the request
    // You'll need to configure Resend API key and uncomment email sending code
    // Instructions: https://resend.com/api-keys
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Integration request received successfully" 
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-integration-request function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
