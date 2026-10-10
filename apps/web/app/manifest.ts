import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CheckAm",
    short_name: "CheckAm",
    description: "Check a phone before you buy.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbfaf6",
    theme_color: "#176c56",
    orientation: "portrait",
    icons: [
      {
        src: "/checkam-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
