/**
 * Agent Cancellation brand mark.
 *
 * Universal media-stop glyph — a circle with a solid square inside. Reads as
 * "stop the running thing" in any chat UI. The outer circle is stroked and
 * the inner square is filled, both with `currentColor` so the mark adapts
 * to light and dark themes.
 */
export function LogoAgentCancellation({
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
      <title>Agent cancellation</title>
      <circle
        cx="12"
        cy="12"
        r="9.25"
        stroke="currentColor"
        strokeWidth={1.75}
      />
      <rect x="8.5" y="8.5" width="7" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}
