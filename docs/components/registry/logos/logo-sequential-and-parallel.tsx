/**
 * Sequential & Parallel brand mark.
 *
 * Three lines branching from a single source — one continuing forward
 * (sequential), the others fanning out (parallel). All `currentColor`.
 */
export function LogoSequentialAndParallel({
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
      <title>Sequential and parallel execution</title>
      <circle cx="4" cy="12" r="2" fill="currentColor" stroke="none" />
      <path d="M6 12h4" />
      <path d="M10 12 14 6" />
      <path d="M10 12h6" />
      <path d="M10 12 14 18" />
      <circle cx="17" cy="6" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  );
}
