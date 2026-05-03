/**
 * Human-in-the-Loop brand mark.
 *
 * Thumbs-up glyph — represents a human approval signal that gates a
 * paused agent. Drawn with `currentColor` strokes so it inherits text color
 * in both light and dark themes.
 */
export function LogoHumanInTheLoop({
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
      <title>Human approval</title>
      <path d="M7 10v11" />
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9A2 2 0 0 0 19.66 9H14Z" />
    </svg>
  );
}
