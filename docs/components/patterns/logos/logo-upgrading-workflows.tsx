/**
 * Upgrading Workflows brand mark.
 *
 * A circular refresh arrow with an upward-pointing bolt at the top,
 * representing a workflow that respawns itself on the latest deployment.
 * All `currentColor`.
 */
export function LogoUpgradingWorkflows({
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
      <title>Upgrading workflows</title>
      {/* Circular refresh path — opens at the top-right so the arrow head is visible */}
      <path d="M20 12a8 8 0 1 1-2.343-5.657" />
      {/* Arrow head pointing up-right on the refresh arc */}
      <polyline points="16 4 20 4 20 8" />
      {/* Upward bolt / upgrade indicator in the center */}
      <polyline points="12 15 12 9 10 11" fill="none" />
      <polyline points="12 9 14 11" fill="none" />
    </svg>
  );
}
