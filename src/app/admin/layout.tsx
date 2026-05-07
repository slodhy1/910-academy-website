import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./admin-globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`dark ${geist.variable} font-sans min-h-screen bg-background text-foreground antialiased`}>
      {children}
      <Toaster richColors position="top-right" />
    </div>
  );
}
