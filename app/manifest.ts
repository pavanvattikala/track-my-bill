import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Track My Bill",
    short_name: "TrackMyBill",
    description: "AI Powered application for tracking expenses.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#000000",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/track-my-bill.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
