import { describe, expect, it } from "vitest";

import { parseSoldFromHtml } from "./sold";

function pageWithNextData(data: unknown): string {
  return (
    "<html><body>" +
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>` +
    "</body></html>"
  );
}

describe("parseSoldFromHtml", () => {
  it("returns [] when there is no __NEXT_DATA__ script", () => {
    expect(parseSoldFromHtml("<html><body>no data</body></html>")).toEqual([]);
  });

  it("returns [] on malformed JSON", () => {
    const html =
      '<script id="__NEXT_DATA__" type="application/json">{not json}</script>';
    expect(parseSoldFromHtml(html)).toEqual([]);
  });

  it("extracts priced items nested anywhere in the JSON tree", () => {
    const html = pageWithNextData({
      props: {
        pageProps: {
          searchResult: {
            items: [
              { shortDescription: "iPhone 12 64GB", soldPrice: 2400 },
              { title: "iPhone 11", finalPrice: 1800 },
            ],
          },
        },
      },
    });
    const items = parseSoldFromHtml(html);
    expect(items).toContainEqual({ title: "iPhone 12 64GB", price: 2400 });
    expect(items).toContainEqual({ title: "iPhone 11", price: 1800 });
  });

  it("reads a nested price object and de-dupes identical entries", () => {
    const html = pageWithNextData({
      a: { title: "Stol", price: { amount: 500 } },
      b: { title: "Stol", price: { amount: 500 } },
    });
    expect(parseSoldFromHtml(html)).toEqual([{ title: "Stol", price: 500 }]);
  });

  it("ignores objects without a positive price or a title", () => {
    const html = pageWithNextData({
      items: [
        { title: "Utan pris" },
        { price: 100 },
        { title: "Gratis", price: 0 },
      ],
    });
    expect(parseSoldFromHtml(html)).toEqual([]);
  });
});
