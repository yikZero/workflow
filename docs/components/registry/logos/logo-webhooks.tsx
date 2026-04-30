/**
 * Webhooks brand mark.
 *
 * The webhooks.fyi triangle — three nodes (one at each vertex of an
 * equilateral triangle) connected by edges. The de facto "webhook" logo
 * across the web. All `currentColor`.
 */
export function LogoWebhooks({
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
      <title>Webhook</title>
      <circle cx="12" cy="5" r="2" />
      <circle cx="5" cy="17" r="2" />
      <circle cx="19" cy="17" r="2" />
      <path d="M11 6.7 6 15.3" />
      <path d="m13 6.7 5 8.6" />
      <path d="M7 17h10" />
    </svg>
  );
}
