import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kitchen Plan",
    short_name: "Kitchen Plan",
    description: "Review the next three dinners, build a shopping list, and approve meal swaps.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f1e7",
    theme_color: "#29452f",
    orientation: "any",
    icons: [
      {
        src: "/favicon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
