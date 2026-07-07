import { describe, expect, it } from "vitest";

import { buildEnvelope, parseSoapResponse, TraderaApiError, xmlElement } from "./soap";

describe("xmlElement", () => {
  it("escapes special characters and serializes numbers", () => {
    expect(xmlElement("A", "x&y")).toBe("<A>x&amp;y</A>");
    expect(xmlElement("A", 5)).toBe("<A>5</A>");
  });
  it("omits empty / nullish values", () => {
    expect(xmlElement("A", "")).toBe("");
    expect(xmlElement("A", undefined)).toBe("");
    expect(xmlElement("A", null)).toBe("");
  });
});

describe("buildEnvelope", () => {
  const app = { appId: 6079, appKey: "k&y", publicKey: "p" };

  it("includes the authentication header + sandbox flag, escapes the app key", () => {
    const env = buildEnvelope({ operation: "GetOfficialTime", app, sandbox: true });
    expect(env).toContain("<AppId>6079</AppId>");
    expect(env).toContain("<AppKey>k&amp;y</AppKey>");
    expect(env).toContain("<Sandbox>1</Sandbox>");
    expect(env).toContain('<GetOfficialTime xmlns="http://api.tradera.com" />');
    expect(env).not.toContain("AuthorizationHeader");
  });

  it("adds the authorization header for user calls and respects sandbox=false", () => {
    const env = buildEnvelope({
      operation: "AddItem",
      bodyInnerXml: "<x/>",
      app,
      userAuth: { userId: 1, token: "t" },
      sandbox: false,
    });
    expect(env).toContain("<AuthorizationHeader");
    expect(env).toContain("<UserId>1</UserId>");
    expect(env).toContain("<Token>t</Token>");
    expect(env).toContain("<Sandbox>0</Sandbox>");
    expect(env).toContain("<x/></AddItem>");
  });
});

describe("parseSoapResponse", () => {
  it("returns the operation response node on success", () => {
    const xml =
      '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      '<soap:Body><GetOfficialTimeResponse xmlns="http://api.tradera.com">' +
      "<GetOfficialTimeResult>2026-06-04T10:00:00</GetOfficialTimeResult>" +
      "</GetOfficialTimeResponse></soap:Body></soap:Envelope>";
    const res = parseSoapResponse(xml, 200, "GetOfficialTime") as Record<string, unknown>;
    expect(res.GetOfficialTimeResult).toBe("2026-06-04T10:00:00");
  });

  it("throws TraderaApiError carrying the SOAP fault string", () => {
    const xml =
      '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">' +
      "<soap:Body><soap:Fault><faultstring>Invalid application</faultstring></soap:Fault>" +
      "</soap:Body></soap:Envelope>";
    expect(() => parseSoapResponse(xml, 500, "GetOfficialTime")).toThrow(TraderaApiError);
    expect(() => parseSoapResponse(xml, 500, "GetOfficialTime")).toThrow("Invalid application");
  });

  it("throws on a non-2xx response with no fault (e.g. the allowlist block)", () => {
    expect(() => parseSoapResponse("Host not in allowlist", 403, "GetOfficialTime")).toThrow(
      /HTTP 403/,
    );
  });
});
