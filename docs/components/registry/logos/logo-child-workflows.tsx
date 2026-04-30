/**
 * Child Workflows brand mark.
 *
 * Parent node fanning out to three child nodes — the spawn-and-poll shape.
 * All `currentColor`.
 */
export function LogoChildWorkflows({
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
      <title>Child workflows</title>
      <circle cx="5" cy="5" r="2" fill="currentColor" stroke="none" />
      <path d="M7 5h3a3 3 0 0 1 3 3v0" />
      <path d="M7 5h3a3 3 0 0 1 3 3v6" />
      <path d="M7 5h3a3 3 0 0 1 3 3v12" />
      <circle cx="15" cy="8" r="2" />
      <circle cx="15" cy="14" r="2" />
      <circle cx="15" cy="20" r="2" />
    </svg>
  );
}
