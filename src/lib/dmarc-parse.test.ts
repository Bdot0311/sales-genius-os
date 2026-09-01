import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isIpAddress,
  parseDmarcReport,
  parseXml,
  textAt,
  tokenFromRecipient,
} from "../../supabase/functions/_shared/dmarc-parse.ts";

/** A Google report: two aligned sources, one forwarder breaking SPF. */
const GOOGLE_REPORT = `<?xml version="1.0" encoding="UTF-8" ?>
<feedback>
  <report_metadata>
    <org_name>google.com</org_name>
    <email>noreply-dmarc-support@google.com</email>
    <extra_contact_info>https://support.google.com/a/answer/2466580</extra_contact_info>
    <report_id>7391842910384756</report_id>
    <date_range><begin>1756684800</begin><end>1756771199</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>outreign.io</domain>
    <adkim>r</adkim><aspf>r</aspf>
    <p>reject</p><sp>reject</sp><pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>209.85.220.41</source_ip>
      <count>97</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>outreign.io</header_from><envelope_from>outreign.io</envelope_from></identifiers>
    <auth_results>
      <dkim><domain>outreign.io</domain><selector>google</selector><result>pass</result></dkim>
      <spf><domain>outreign.io</domain><result>pass</result></spf>
    </auth_results>
  </record>
  <record>
    <row>
      <source_ip>2a00:1450:4864:20::43</source_ip>
      <count>3</count>
      <policy_evaluated><disposition>quarantine</disposition><dkim>pass</dkim><spf>fail</spf></policy_evaluated>
    </row>
    <identifiers><header_from>outreign.io</header_from></identifiers>
    <auth_results>
      <dkim><domain>outreign.io</domain><selector>google</selector><result>pass</result></dkim>
      <spf><domain>mail.forwarder.example</domain><result>softfail</result></spf>
    </auth_results>
  </record>
</feedback>`;

describe("a real Google report", () => {
  const report = parseDmarcReport(GOOGLE_REPORT)!;

  it("reads the metadata", () => {
    expect(report.orgName).toBe("google.com");
    expect(report.externalReportId).toBe("7391842910384756");
    expect(report.domain).toBe("outreign.io");
  });

  it("converts the epoch date range", () => {
    // Reporters send epoch seconds; the column is timestamptz.
    expect(report.dateRangeBegin).toBe("2025-09-01T00:00:00.000Z");
    expect(report.dateRangeEnd).toBe("2025-09-01T23:59:59.000Z");
  });

  it("also accepts epoch milliseconds, which some reporters send", () => {
    const ms = GOOGLE_REPORT.replace("<begin>1756684800</begin>", "<begin>1756684800000</begin>");
    expect(parseDmarcReport(ms)!.dateRangeBegin).toBe("2025-09-01T00:00:00.000Z");
  });

  it("reads the published policy", () => {
    expect(report.policyP).toBe("reject");
    expect(report.policySp).toBe("reject");
    expect(report.policyPct).toBe(100);
  });

  it("reads both source rows", () => {
    expect(report.records).toHaveLength(2);
    expect(report.skipped).toEqual([]);
    expect(report.records[0].sourceIp).toBe("209.85.220.41");
    expect(report.records[1].sourceIp).toBe("2a00:1450:4864:20::43");
  });

  it("names the forwarder that broke SPF — the whole point of the feed", () => {
    const forwarded = report.records[1];
    expect(forwarded.spfResult).toBe("fail");
    expect(forwarded.dkimResult).toBe("pass");
    expect(forwarded.spfDomain).toBe("mail.forwarder.example");
    expect(forwarded.disposition).toBe("quarantine");
  });

  it("counts DMARC pass as aligned DKIM *or* aligned SPF", () => {
    // Requiring both would report a false failure on every domain that signs
    // with only one. The forwarded mail passed DKIM, so it passed DMARC.
    expect(report.totalMessages).toBe(100);
    expect(report.passingMessages).toBe(100);
  });
});

describe("a report where mail actually failed", () => {
  const failing = GOOGLE_REPORT
    .replace("<dkim>pass</dkim><spf>fail</spf>", "<dkim>fail</dkim><spf>fail</spf>");

  it("does not count a row that failed both", () => {
    const report = parseDmarcReport(failing)!;
    expect(report.totalMessages).toBe(100);
    expect(report.passingMessages).toBe(97);
  });
});

describe("Microsoft's shape, with entities and CDATA", () => {
  const MS_REPORT = `<?xml version="1.0"?>
<!-- generated -->
<feedback>
  <report_metadata>
    <org_name><![CDATA[Enterprise Outlook]]></org_name>
    <email>dmarcreport@microsoft.com</email>
    <report_id>a1b2c3d4-e5f6</report_id>
    <date_range><begin>1756684800</begin><end>1756771199</end></date_range>
  </report_metadata>
  <policy_published>
    <domain>OutReign.IO</domain><p>none</p><pct>100</pct>
  </policy_published>
  <record>
    <row>
      <source_ip>40.107.220.75</source_ip><count>12</count>
      <policy_evaluated><disposition>none</disposition><dkim>pass</dkim><spf>pass</spf></policy_evaluated>
    </row>
    <identifiers><header_from>Sales &amp; Marketing</header_from></identifiers>
    <auth_results><spf><domain>outreign.io</domain><result>pass</result></spf></auth_results>
  </record>
</feedback>`;

  const report = parseDmarcReport(MS_REPORT)!;

  it("unwraps CDATA and decodes entities", () => {
    expect(report.orgName).toBe("Enterprise Outlook");
    expect(report.records[0].headerFrom).toBe("Sales & Marketing");
  });

  it("lower-cases the domain so it joins to sending_domains", () => {
    expect(report.domain).toBe("outreign.io");
  });

  it("survives a record with no DKIM block at all", () => {
    expect(report.records[0].dkimDomain).toBeNull();
    expect(report.records[0].spfDomain).toBe("outreign.io");
  });
});

describe("malformed input never throws into ingestion", () => {
  it("returns null rather than a half report when the id is missing", () => {
    expect(parseDmarcReport("<feedback><policy_published><domain>a.com</domain></policy_published></feedback>")).toBeNull();
  });

  it("returns null on a document with no date range", () => {
    const noRange = GOOGLE_REPORT.replace(/<date_range>[\s\S]*?<\/date_range>/, "");
    expect(parseDmarcReport(noRange)).toBeNull();
  });

  it("returns null on junk", () => {
    expect(parseDmarcReport("not xml at all")).toBeNull();
    expect(parseDmarcReport("")).toBeNull();
  });

  it("keeps the rows it understood and says what it dropped", () => {
    const oneBadRow = GOOGLE_REPORT.replace("209.85.220.41", "not-an-ip");
    const report = parseDmarcReport(oneBadRow)!;
    expect(report.records).toHaveLength(1);
    expect(report.skipped).toHaveLength(1);
    expect(report.skipped[0]).toContain("not-an-ip");
    // The dropped row must not be counted in a total it isn't in.
    expect(report.totalMessages).toBe(3);
  });
});

describe("source addresses", () => {
  it("accepts what Postgres inet will accept", () => {
    for (const ip of ["209.85.220.41", "8.8.8.8", "2a00:1450:4864:20::43", "::1", "fe80::1"]) {
      expect(isIpAddress(ip), ip).toBe(true);
    }
  });

  it("rejects what it won't", () => {
    for (const bad of ["", "  ", "not-an-ip", "999.1.1.1", "1.2.3", "example.com"]) {
      expect(isIpAddress(bad), bad).toBe(false);
    }
  });
});

describe("the XML reader", () => {
  it("handles self-closing and empty elements", () => {
    const node = parseXml("<a><b/><c></c><d>x</d></a>")!;
    expect(node.name).toBe("a");
    expect(textAt(node, "d")).toBe("x");
    expect(textAt(node, "b")).toBe("");
  });

  it("ignores attributes rather than choking on them", () => {
    expect(textAt(parseXml('<a><b id="1" x="y">v</b></a>'), "b")).toBe("v");
  });

  it("does not unwind past the root on a stray close tag", () => {
    expect(parseXml("<a></b><c>ok</c></a>")).not.toBeNull();
  });
});

/**
 * The rua address is published in public DNS, so junk and probing arrive at it
 * alongside the real reports. The token is also the only ownership proof the
 * ingestion has, so what counts as one has to be exact.
 */
describe("routing a report to the right tenant", () => {
  const TOKEN = "98f452a01272452aa50d55c3f81d89d2";

  it("reads the token from the delivery address", () => {
    expect(tokenFromRecipient(`${TOKEN}@dmarc.outreign.io`)).toBe(TOKEN);
  });

  it("handles a display-name address and mixed case", () => {
    expect(tokenFromRecipient(`Reports <${TOKEN.toUpperCase()}@dmarc.outreign.io>`)).toBe(TOKEN);
    expect(tokenFromRecipient(`  ${TOKEN}@DMARC.Outreign.IO  `)).toBe(TOKEN);
  });

  it("rejects anything that is not a token", () => {
    for (const bad of [
      "",
      "dmarc@outreign.io",
      "postmaster@dmarc.outreign.io",
      "abc@dmarc.outreign.io",
      `${TOKEN}x@dmarc.outreign.io`,
      `${TOKEN.slice(0, 31)}@dmarc.outreign.io`,
      "98f452a0-1272-452a-a50d-55c3f81d89d2@dmarc.outreign.io",
    ]) {
      expect(tokenFromRecipient(bad), bad).toBeNull();
    }
  });
});

/**
 * The ingestion endpoint is reachable from the public internet with no Supabase
 * session, so the guarantees below are the only things standing in front of it.
 */
describe("the ingestion endpoint's guarantees", () => {
  const SRC = readFileSync("supabase/functions/ingest-dmarc-report/index.ts", "utf8");

  it("compares the shared secret in constant time", () => {
    expect(SRC).toMatch(/diff \|= given\.charCodeAt\(i\) \^ expected\.charCodeAt\(i\)/);
  });

  it("refuses to run at all when the secret is unset", () => {
    // An empty expected value must never compare equal to an empty header.
    expect(SRC).toMatch(/if \(!expected\)/);
    expect(SRC).toMatch(/Server configuration error/);
  });

  it("does not hand the service-role key to the Worker", () => {
    expect(SRC).toMatch(/DMARC_INGEST_SECRET/);
    expect(SRC).not.toMatch(/x-dmarc-ingest-secret.*SERVICE_ROLE/);
  });

  it("replaces a re-delivered report's rows instead of appending them", () => {
    // Receivers re-send reports; appending would double every count on screen.
    expect(SRC).toMatch(/onConflict: "user_id,domain,external_report_id"/);
    expect(SRC).toMatch(/from\("dmarc_report_records"\)\.delete\(\)\.eq\("report_id"/);
  });

  it("answers mail it cannot use with 202, not an error", () => {
    // A 4xx/5xx makes the receiver retry a report we will never accept.
    expect(SRC).toMatch(/accepted: false \}, 202\)/);
  });
});
