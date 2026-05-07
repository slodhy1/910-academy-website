import { absoluteTime, relativeTime } from "@/lib/admin/format";

export function RelativeTime({ iso, className }: { iso: string | null | undefined; className?: string }) {
  if (!iso) return <span className={className}>-</span>;
  return (
    <span className={className} title={absoluteTime(iso)} suppressHydrationWarning>
      {relativeTime(iso)}
    </span>
  );
}
