import { describe, expect, it } from "vitest";

import { priceStats, summarizeComparables } from "./pricing";

describe("priceStats", () => {
  it("returns an empty summary for no prices", () => {
    expect(priceStats([])).toEqual({ count: 0, median: null, p25: null, p75: null, sample: [] });
  });

  it("drops non-positive / non-finite values and computes percentiles", () => {
    const s = priceStats([100, 0, -5, 200, 300, NaN]);
    expect(s.count).toBe(3);
    expect(s.median).toBe(200);
    expect(s.p25).toBe(150);
    expect(s.p75).toBe(250);
    expect(s.sample).toEqual([100, 200, 300]);
  });
});

describe("summarizeComparables", () => {
  it("returns low confidence and a null range with no comparables", () => {
    const s = summarizeComparables([]);
    expect(s.count).toBe(0);
    expect(s.suggested).toBeNull();
    expect(s.median).toBeNull();
    expect(s.confidence).toBe("low");
  });

  it("computes p25 / median / p75 and caps confidence at medium with enough comps", () => {
    const comps = Array.from({ length: 13 }, (_, i) => ({ price: (i + 1) * 100 })); // 100..1300
    const s = summarizeComparables(comps);
    expect(s.count).toBe(13);
    expect(s.median).toBe(700);
    expect(s.suggested).toEqual({ low: 400, high: 1000 });
    expect(s.confidence).toBe("medium");
    expect(s.basis).toBe("active-asking");
  });

  it("keeps confidence low with few comparables", () => {
    const s = summarizeComparables([{ price: 100 }, { price: 200 }, { price: 300 }]);
    expect(s.median).toBe(200);
    expect(s.confidence).toBe("low");
  });
});
