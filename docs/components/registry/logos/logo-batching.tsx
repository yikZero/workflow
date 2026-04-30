/**
 * Batching brand mark.
 *
 * Three stacked, slightly-offset rounded rectangles — a "batch" of work.
 * Top rectangle filled to suggest the active batch.
 */
export function LogoBatching({
  size = 20,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      role="img"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <title>Batched parallel processing</title>
      <rect
        x="6.5"
        y="14.5"
        width="13"
        height="5"
        rx="1.25"
        stroke="currentColor"
        strokeWidth={1.75}
      />
      <rect
        x="5"
        y="9.5"
        width="13"
        height="5"
        rx="1.25"
        fill="var(--color-background, #fff)"
        stroke="currentColor"
        strokeWidth={1.75}
      />
      <rect
        x="3.5"
        y="4.5"
        width="13"
        height="5"
        rx="1.25"
        fill="currentColor"
      />
    </svg>
  );
}
