import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const spec = JSON.parse(readFileSync("public/openapi.json", "utf8"));

describe("documented REST contracts", () => {
  it("bounds every REST list at the implemented 100-row maximum", () => {
    for (const path of ["/leads", "/deals", "/activities", "/contacts"]) {
      const limit = spec.paths[path].get.parameters.find((p: { name: string }) => p.name === "limit");
      expect(limit.schema).toMatchObject({ minimum: 1, maximum: 100, default: 50 });
    }
  });

  it("limits bulk lead imports to 100 and describes indexed errors", () => {
    const operation = spec.paths["/leads/bulk"].post;
    expect(operation.requestBody.content["application/json"].schema.properties.leads.maxItems).toBe(100);
    expect(operation.responses["201"].content["application/json"].schema.properties.errors.items.properties.index.type).toBe("integer");
  });

  it("documents retrieval for deals, activities and contacts", () => {
    for (const resource of ["deals", "activities", "contacts"]) {
      expect(spec.paths[`/${resource}/{id}`].get.responses["200"].content["application/json"].schema.properties.data.$ref).toMatch(/^#\/components\/schemas\//);
    }
  });

  it("requires generator inputs rather than an unsupported leadId-only request", () => {
    const operation = spec.paths["/email/generate"].post;
    const schema = operation.requestBody.content["application/json"].schema;
    expect(schema.required).toEqual(["lead", "tone", "goal"]);
    expect(schema.properties.lead.required).toEqual(["id"]);
    expect(operation.responses["200"].content["application/json"].schema.properties.email.type).toBe("string");
  });

  it("uses API-key authentication for REST rather than advertising MCP OAuth as REST auth", () => {
    expect(spec.security).toEqual([{ ApiKeyAuth: [] }]);
    expect(spec.components.securitySchemes.ApiKeyAuth).toMatchObject({ type: "apiKey", in: "header", name: "X-API-Key" });
    expect(Object.keys(spec.components.securitySchemes)).toEqual(["ApiKeyAuth"]);
  });
});