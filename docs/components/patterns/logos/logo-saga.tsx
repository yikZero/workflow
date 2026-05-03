/**
 * Saga / Transactions & Rollbacks brand mark.
 *
 * Two arrows curving in opposite directions — forward progress + reverse
 * compensation. All `currentColor`.
 */
export function LogoSaga({
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
      <title>Saga rollback</title>
      <path d="M4 8h11a4 4 0 0 1 4 4" />
      <path d="m12 5 3 3-3 3" />
      <path d="M20 16H9a4 4 0 0 1-4-4" />
      <path d="m12 19-3-3 3-3" />
    </svg>
  );
}
