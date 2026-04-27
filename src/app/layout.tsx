import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "910 Academy Account",
  description: "Your 910 Academy member portal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
