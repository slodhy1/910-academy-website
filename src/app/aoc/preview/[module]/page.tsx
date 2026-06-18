import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";
import { course, getModule } from "@/lib/aoc/course";
import styles from "../preview.module.css";

// Prerender every module at build time; reject anything else (fully static shell).
export const dynamicParams = false;

export function generateStaticParams() {
  return course.modules.map((module) => ({ module: String(module.number) }));
}

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module: moduleParam } = await params;
  const moduleNumber = Number(moduleParam);
  const mod = Number.isInteger(moduleNumber) ? getModule(moduleNumber) : undefined;
  if (!mod) notFound();

  return (
    <main className={styles.main}>
      <Link href="/aoc/preview" className={styles.back}>
        <ChevronLeft size={16} aria-hidden />
        Back to Classroom
      </Link>

      <header className={styles.moduleHeader}>
        <h1 className={styles.moduleTitle}>
          Module {mod.number}: {mod.title}
        </h1>
        <p className={styles.moduleSub}>
          {mod.lessonCount} {mod.lessonCount === 1 ? "lesson" : "lessons"}
        </p>
      </header>

      {/* Display-only lesson list — locked, non-clickable, no playback. */}
      <ul className={styles.lessons}>
        {mod.lessons.map((lesson) => (
          <li key={lesson.number} className={styles.lessonRow}>
            <span className={styles.lessonLock} aria-hidden>
              <Lock size={15} />
            </span>
            <div className={styles.lessonMain}>
              <span className={styles.lessonNum}>{lesson.number}.</span>
              <span className={styles.lessonTitle}>{lesson.title}</span>
            </div>
            <span className={styles.comingSoon}>Coming soon</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
