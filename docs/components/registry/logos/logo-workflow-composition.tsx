/**
 * Workflow Composition brand mark.
 *
 * Two nested rounded rectangles — a child workflow inside a parent — with a
 * small arrow indicating composition / call. All `currentColor`.
 */
export function LogoWorkflowComposition({
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
      <title>Workflow composition</title>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <rect
        x="11"
        y="9"
        width="7"
        height="6"
        rx="1.25"
        fill="currentColor"
        stroke="none"
      />
      <path d="M5 12h4.5" />
      <path d="m7.5 10 2 2-2 2" />
    </svg>
  );
}
