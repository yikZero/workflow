/**
 * Durable Agent brand mark.
 *
 * Bot glyph — rounded body, antenna, two eyes — the universal "agent" icon.
 * All `currentColor`.
 */
export function LogoDurableAgent({
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
      <title>Durable agent</title>
      <rect x="3.5" y="9" width="17" height="11" rx="2" />
      <path d="M12 5v4" />
      <circle cx="12" cy="3.75" r="1.25" fill="currentColor" stroke="none" />
      <path d="M8.5 14v1.5" />
      <path d="M15.5 14v1.5" />
      <path d="M2 14v2" />
      <path d="M22 14v2" />
    </svg>
  );
}
