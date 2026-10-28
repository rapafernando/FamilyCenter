import { cn } from '@/lib/cn';
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-md bg-line motion-reduce:animate-none', className)} />;
}
export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16" />)}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
