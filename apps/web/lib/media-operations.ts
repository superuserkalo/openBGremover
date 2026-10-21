import { createLucideIcon, ScanText, Minimize2, Expand, RefreshCw } from "lucide-react";

/** Lucide scan corners around a head-and-shoulders outline; pathLength lets CSS draw the outline. */
const ScanPerson = createLucideIcon("scan-person", [
  ["path", { d: "M3 7V5a2 2 0 0 1 2-2h2", key: "corner-top-left" }],
  ["path", { d: "M17 3h2a2 2 0 0 1 2 2v2", key: "corner-top-right" }],
  ["path", { d: "M21 17v2a2 2 0 0 1-2 2h-2", key: "corner-bottom-right" }],
  ["path", { d: "M7 21H5a2 2 0 0 1-2-2v-2", key: "corner-bottom-left" }],
  ["path", { d: "M7.5 17c0-2 1.4-3.3 3-3.5A3 3 0 1 1 13.5 13.5c1.6.2 3 1.5 3 3.5", pathLength: 1, key: "person" }],
]);

export const mediaOperations = [
  {
    id: "remove",
    name: "Remove background",
    short: "Remove",
    icon: ScanPerson,
    description: "Keep the subject. Get a transparent background.",
    available: true,
  },
  {
    id: "compress",
    name: "Compress",
    short: "Compress",
    icon: Minimize2,
    description: "Smaller files for faster pages and lighter uploads.",
    available: true,
  },
  {
    id: "upscale",
    name: "Upscale",
    short: "Upscale",
    icon: Expand,
    description: "More resolution for the images you already have.",
    available: false,
  },
  {
    id: "convert",
    name: "Convert",
    short: "Convert",
    icon: RefreshCw,
    description: "The right image format for the next step.",
    available: true,
  },
  {
    id: "ocr",
    name: "OCR",
    short: "OCR",
    icon: ScanText,
    description: "Turn text in images into text you can use.",
    available: false,
  },
] as const;
