import { analytics } from "@heycatch/sdk";

// Module-scope init — runs once when the client bundle evaluates.
analytics.init({
  projectKey: "hck_pk_VgVASkSJkbBwJBEWh_CuEjUgEzDkKPNt",
  install: {
    framework: "vite-react",
    frameworkVersion: "19",
    agent: "lovable",
  },
});

export { analytics };
