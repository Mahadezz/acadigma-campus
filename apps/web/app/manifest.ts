import type { MetadataRoute } from "next"

/**
 * PWA manifest (ARCHITECTURE §6). `display: standalone` is what makes the installed
 * app lose the browser chrome, which is also what the Capacitor and Tauri shells
 * reproduce natively in the wrapper phase (D-13).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Acadigma Campus",
    short_name: "Acadigma",
    description:
      "Attendance, timetables, marks and billing for Bangladeshi schools.",
    start_url: "/app/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "en",
    dir: "ltr",
    categories: ["education", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Take attendance",
        short_name: "Attendance",
        url: "/app/attendance",
      },
      { name: "Timetable", short_name: "Timetable", url: "/app/timetable" },
    ],
  }
}
