/**
 * Distributed Abort Controller brand mark.
 *
 * Universal abort glyph — circle with a slash through it — overlaid with a
 * small dotted ring suggesting cross-process / distributed coordination.
 * All `currentColor`.
 */
export function LogoDistributedAbortController({
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
      <title>Distributed abort controller</title>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.5 5.5 13 13" />
      <circle
        cx="12"
        cy="12"
        r="5.5"
        strokeDasharray="1.5 2"
        strokeWidth={1.25}
      />
    </svg>
  );
}
