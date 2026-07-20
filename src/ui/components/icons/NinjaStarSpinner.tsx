/**
 * Spinning Ninja Star (Shuriken) indicator for operation progress
 */

interface NinjaStarSpinnerProps {
  className?: string;
  spinning?: boolean;
}

export function NinjaStarSpinner({ className = "", spinning = true }: NinjaStarSpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={`h-3 w-3 ${spinning ? "animate-spin" : ""} ${className}`}
      aria-hidden="true"
    >
      {/* 4-pointed shuriken star */}
      <path d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10L12 2Z" />
    </svg>
  );
}
