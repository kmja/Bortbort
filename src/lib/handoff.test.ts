import { describe, expect, it } from "vitest";

import { formatDescription, formatFullListing, type ListingFields } from "./handoff";

const base: ListingFields = {
  title: "Stol",
  description: "Fin stol.",
  category: "Möbler",
  condition: "Bra skick",
  keywords: ["stol", "möbel"],
  priceSEK: 250,
};

describe("handoff formatting", () => {
  it("weaves condition and price into the description", () => {
    const d = formatDescription(base);
    expect(d).toContain("Fin stol.");
    expect(d).toContain("Skick: Bra skick");
    expect(d).toContain("Pris: 250 kr");
  });

  it("omits the price line when price is null", () => {
    const d = formatDescription({ ...base, priceSEK: null });
    expect(d).not.toContain("Pris:");
  });

  it("leads the full listing with the title", () => {
    expect(formatFullListing(base).startsWith("Stol")).toBe(true);
  });
});
