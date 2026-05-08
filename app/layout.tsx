import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inscription Cropper",
  description: "Manual line-by-line cropping for epigraphic image analysis.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
