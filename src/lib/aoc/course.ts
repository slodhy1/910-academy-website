import courseData from "./course.json";

export type Lesson = {
  number: number;
  title: string;
};

export type CourseModule = {
  number: number;
  title: string;
  lessonCount: number;
  lessons: Lesson[];
};

export type Course = {
  course: string;
  totalModules: number;
  totalLessons: number;
  modules: CourseModule[];
};

// Single source of truth for the static course-preview pages. The JSON ships with
// the build (resolveJsonModule), so there is no runtime fetch or server code.
export const course = courseData as Course;

export function getModule(moduleNumber: number): CourseModule | undefined {
  return course.modules.find((m) => m.number === moduleNumber);
}
