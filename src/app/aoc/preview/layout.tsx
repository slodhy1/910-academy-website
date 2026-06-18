import type { Metadata } from "next";
import { TopBar } from "./_components/TopBar";
import styles from "./preview.module.css";
import "./preview-base.css";

export const metadata: Metadata = {
  title: "Agent on Camera — Course Preview · 910 Academy",
  description: "A preview of the Agent on Camera classroom.",
  // Design-only pre-launch shell — keep it out of search indexes.
  robots: { index: false, follow: false },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.page}>
      <TopBar />
      {children}
    </div>
  );
}
