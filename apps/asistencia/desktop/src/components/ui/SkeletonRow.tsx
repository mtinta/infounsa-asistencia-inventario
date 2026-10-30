export default function SkeletonRow({ count = 5 }: { count?: number }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ height: '44px', animationDelay: `${i * 0.08}s` }} />
      ))}
    </div>
  );
}
