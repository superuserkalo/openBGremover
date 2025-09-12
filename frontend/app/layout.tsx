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
  description: "Enterprise-grade AI background removal API at fair prices. Open source alternative with transparent pricing and no subscriptions.",
  keywords: ["background removal API", "AI background removal", "remove.bg alternative"],

  openGraph: {
    title: "openBGremover - AI Background Removal API",
    description: "Enterprise-grade AI background removal at fair prices. Open source with transparent pricing.",
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
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <Toaster position="bottom-right" theme="dark" richColors closeButton />
      </body>
    </html>
  );
}
