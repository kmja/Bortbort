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
    const byId = Object.fromEntries(flat.map((c) => [c.id, c]));

    expect(flat).toHaveLength(4);
    expect(byId[1].path).toBe("Hem & Hushåll");
    expect(byId[1].parentId).toBeNull();
    expect(byId[1].leaf).toBe(false);
    expect(byId[10].path).toBe("Hem & Hushåll > Möbler");
    expect(byId[10].parentId).toBe(1);
    expect(byId[100].path).toBe("Hem & Hushåll > Möbler > Stolar & fåtöljer");
    expect(byId[100].parentId).toBe(10);
    expect(byId[100].leaf).toBe(true);
    expect(byId[2].path).toBe("Elektronik");
    expect(byId[2].parentId).toBeNull();
    expect(byId[2].leaf).toBe(true);
  });

  it("handles a single child element (not wrapped in an array)", () => {
    const result = {
      GetCategoriesResult: { Category: { Id: 5, Name: "Böcker" } },
    };
    expect(parseCategories(result)).toEqual([
      { id: 5, name: "Böcker", path: "Böcker", parentId: null, leaf: true },
    ]);
  });

  it("reads id/name from XML attributes (@_Id/@_Name), as the live API returns them", () => {
    // Shape produced by the attribute-aware parser: ids arrive as strings.
    const result = {
      GetCategoriesResult: {
        Category: [
          {
            "@_Id": "1",
            "@_Name": "Antikt & Design",
            Category: [
              { "@_Id": "10", "@_Name": "Möbler", Category: [{ "@_Id": "100", "@_Name": "Stolar" }] },
            ],
          },
          { "@_Id": "2", "@_Name": "Elektronik" },
        ],
      },
    };
    const flat = parseCategories(result);
    const byId = Object.fromEntries(flat.map((c) => [c.id, c]));

    expect(flat).toHaveLength(4);
    expect(byId[100].path).toBe("Antikt & Design > Möbler > Stolar");
    expect(byId[100].parentId).toBe(10);
    expect(byId[100].leaf).toBe(true);
    expect(byId[1].leaf).toBe(false);
    expect(byId[2].parentId).toBeNull();
  });

  it("returns [] for empty or missing input", () => {
    expect(parseCategories(undefined)).toEqual([]);
    expect(parseCategories({})).toEqual([]);
  });
});
