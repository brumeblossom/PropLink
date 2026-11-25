import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://prop-link-delta.vercel.app";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms"],
      disallow: ["/landlord", "/tenant", "/api", "/auth"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
