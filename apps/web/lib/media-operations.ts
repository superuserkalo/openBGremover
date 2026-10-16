import { ScanLine, ScanText, Minimize2, Expand, RefreshCw } from "lucide-react";

export const mediaOperations = [
  {
    id: "remove",
    name: "Remove background",
    short: "Remove",
    icon: ScanLine,
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
