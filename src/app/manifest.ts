import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PropLink",
    short_name: "PropLink",
    description: "Property management for landlords and tenants",
    start_url: "/",
    display: "standalone",
    background_color: "#F2F1EC",
    theme_color: "#0E1E45",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
