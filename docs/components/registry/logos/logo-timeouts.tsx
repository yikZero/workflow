/**
 * Timeouts brand mark.
 *
 * Stopwatch glyph — circle with a top crown and a hand pointing right.
 * All `currentColor`.
 */
export function LogoTimeouts({
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
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <title>Timeout deadline</title>
      <path d="M10 2.75h4" />
      <path d="M12 2.75v2.5" />
      <circle cx="12" cy="14" r="7.5" />
      <path d="M12 14v-3.25" />
      <path d="m12 14 3.25 1.75" />
    </svg>
  );
}
