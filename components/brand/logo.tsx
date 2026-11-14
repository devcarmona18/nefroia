import { useId } from "react";

/** Marca de NefroIA (gota con línea de pulso). Ver también public/logo.svg. */
export function Logo({
  className,
  size = 24,
  title,
}: {
  className?: string;
  size?: number;
  title?: string;
}) {
  const gradientId = useId();

  return (
    <svg
      aria-hidden={title ? undefined : true}
      className={className}
      height={size}
      role={title ? "img" : undefined}
      viewBox="0 0 64 64"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={gradientId}
          x1="12"
          x2="52"
          y1="6"
          y2="58"
        >
          <stop offset="0" stopColor="#14B8A6" />
          <stop offset="1" stopColor="#0E7490" />
        </linearGradient>
      </defs>
      <path
        d="M32 5C32 5 12 25.5 12 40a20 20 0 0 0 40 0C52 25.5 32 5 32 5Z"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M15.5 39H25l4-9.5 6 19 4.5-9.5h9"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3.4"
      />
    </svg>
  );
}
