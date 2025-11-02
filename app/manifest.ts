import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Track My Bill",
    short_name: "BillTracker",
    description: "AI Powered application for tracking expenses.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0070f3",
    icons: [
      {
        src: "/track-my-bill.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/track-my-bill.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
