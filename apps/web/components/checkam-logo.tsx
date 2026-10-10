import Link from "next/link";

export function CheckAmLogo({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="CheckAm home">
      <svg
        aria-hidden="true"
        className="brand-mark"
        viewBox="0 0 80 80"
        fill="none"
      >
        <rect x="6" y="6" width="68" height="68" rx="24" fill="currentColor" />
        <path
          d="M24 33.5C24 27.7 28.7 23 34.5 23H45.5C51.3 23 56 27.7 56 33.5V42.5C56 48.3 51.3 53 45.5 53H39.4L29.5 61.5V53H34.5C28.7 53 24 48.3 24 42.5V33.5Z"
          fill="white"
        />
        <path
          d="M32 39L38 45L51 31"
          stroke="#176c56"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M57 18L62 25L58.5 34L51 30L57 18Z" fill="#e79a48" />
      </svg>
      <span className="brand-stack">
        <span className="brand-wordmark">
          <span>Check</span>
          <span className="brand-accent">Am</span>
        </span>
        <span className="brand-tagline">Check am before you pay</span>
      </span>
    </Link>
  );
}
