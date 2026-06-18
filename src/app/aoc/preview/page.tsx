import Link from "next/link";
import { course } from "@/lib/aoc/course";
import styles from "./preview.module.css";

// Classroom grid — maps over course.json (no hardcoded titles). Cards are <Link>s
// so they are clickable and keyboard-accessible out of the box.
export default function ClassroomPage() {
  return (
    <main className={styles.main}>
      <header className={styles.classroomHead}>
        <h1 className={styles.classroomTitle}>{course.course}</h1>
        <p className={styles.classroomSub}>
          {course.totalModules} modules · {course.totalLessons} lessons
        </p>
      </header>

      <div className={styles.grid}>
        {course.modules.map((module) => (
          <Link key={module.number} href={`/aoc/preview/${module.number}`} className={styles.card}>
            <div className={styles.cardThumb}>
              <img src="/aoc/brand/aoc-white.svg" alt="" aria-hidden className={styles.cardWatermark} />
              <span className={styles.cardThumbTitle}>{module.title}</span>
            </div>
            <div className={styles.cardBody}>
              <h2 className={styles.cardTitle}>
                Module {module.number}: {module.title}
              </h2>
              <p className={styles.cardSub}>
                {module.lessonCount} {module.lessonCount === 1 ? "lesson" : "lessons"}
              </p>
              <div className={styles.progress}>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} />
                </div>
                <span className={styles.progressLabel}>0%</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
