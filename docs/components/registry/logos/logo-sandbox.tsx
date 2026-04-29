/**
 * Vercel Sandbox brand mark — isometric cube glyph.
 *
 * Vercel Sandbox doesn't ship a square brand mark of its own, so this is a
 * purpose-built cube icon that reads as "container / sandbox" at a glance
 * and pairs with the "Sandbox" title on the card.
 *
 * Recolored to `currentColor` so it inherits text color and adapts to
 * light/dark themes automatically.
 */
export function LogoSandbox({
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
      <title>Sandbox</title>
      <path
        d="M12 2.5L3 7V17L12 21.5L21 17V7L12 2.5ZM12 4.7L18.6 8L12 11.3L5.4 8L12 4.7ZM4.5 9.2L11.25 12.6V19.3L4.5 15.9V9.2ZM12.75 19.3V12.6L19.5 9.2V15.9L12.75 19.3Z"
        fill="currentColor"
      />
    </svg>
  );
}
