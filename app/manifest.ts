import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#0b1b24",
    description: "Asistente de IA para enfermería renal",
    display: "standalone",
    icons: [
      { sizes: "192x192", src: "/icon-192.png", type: "image/png" },
      { sizes: "512x512", src: "/icon-512.png", type: "image/png" },
    ],
    name: "NefroIA",
    short_name: "NefroIA",
    start_url: "/",
    theme_color: "#0E7490",
  };
}
