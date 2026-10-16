import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "openBGremover - AI Background Removal API",
    template: "%s | openBGremover"
  },
  description: "Remove image backgrounds through one authenticated API. Try the playground and build image processing into your app.",
  keywords: ["background removal API", "AI background removal", "remove.bg alternative"],

  openGraph: {
    title: "openBGremover - AI Background Removal API",
    description: "Background removal for your apps and agents. Try an image in the playground.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans bg-background text-foreground antialiased selection:bg-primary/15`}>
        {children}
        <Toaster position="bottom-right" theme="light" richColors closeButton />
      </body>
    </html>
  );
}
