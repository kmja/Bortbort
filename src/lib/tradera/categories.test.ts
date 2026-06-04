import { describe, expect, it } from "vitest";

import { parseCategories } from "./categories";

describe("parseCategories", () => {
  it("flattens a nested category tree into id + breadcrumb path", () => {
    const result = {
      GetCategoriesResult: {
        Category: [
          {
            Id: 1,
            Name: "Hem & Hushåll",
            Categories: {
              Category: [
                {
                  Id: 10,
                  Name: "Möbler",
                  Categories: {
                    Category: [{ Id: 100, Name: "Stolar & fåtöljer" }],
                  },
                },
              ],
            },
          },
          { Id: 2, Name: "Elektronik" },
        ],
      },
    };

    const flat = parseCategories(result);
    const byId = Object.fromEntries(flat.map((c) => [c.id, c.path]));

    expect(flat).toHaveLength(4);
    expect(byId[1]).toBe("Hem & Hushåll");
    expect(byId[10]).toBe("Hem & Hushåll > Möbler");
    expect(byId[100]).toBe("Hem & Hushåll > Möbler > Stolar & fåtöljer");
    expect(byId[2]).toBe("Elektronik");
  });

  it("handles a single child element (not wrapped in an array)", () => {
    const result = {
      GetCategoriesResult: { Category: { Id: 5, Name: "Böcker" } },
    };
    expect(parseCategories(result)).toEqual([{ id: 5, name: "Böcker", path: "Böcker" }]);
  });

  it("returns [] for empty or missing input", () => {
    expect(parseCategories(undefined)).toEqual([]);
    expect(parseCategories({})).toEqual([]);
  });
});
