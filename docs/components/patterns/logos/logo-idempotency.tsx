/**
 * Idempotency brand mark.
 *
 * Refresh arrow looping around an equals sign — the visual statement
 * "f(f(x)) = f(x)". No matter how many times you replay the operation,
 * the result is equal. All `currentColor`.
 */
export function LogoIdempotency({
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
      <title>Idempotent</title>
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M9 10.5h6" />
      <path d="M9 13.5h6" />
    </svg>
  );
}
