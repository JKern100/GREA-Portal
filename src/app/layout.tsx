import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GREA Portal",
  description: "Cross-office collaboration tool"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
