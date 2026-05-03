/**
 * Rate Limiting brand mark.
 *
 * Gauge / speedometer with a needle — represents throttling and backoff.
 * All `currentColor`.
 */
export function LogoRateLimiting({
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
      <title>Rate limiting</title>
      <path d="M3.5 17a8.5 8.5 0 1 1 17 0" />
      <path d="m12 17 4-6" />
      <circle cx="12" cy="17" r="1.25" fill="currentColor" stroke="none" />
    </svg>
  );
}
