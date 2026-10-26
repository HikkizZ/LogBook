import type { SVGProps } from 'react';

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

type P = SVGProps<SVGSVGElement>;

export const CopyIcon = (p: P) => (
  <Icon {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" />
  </Icon>
);
export const MoreIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="3.5" cy="8" r="0.8" />
    <circle cx="8" cy="8" r="0.8" />
    <circle cx="12.5" cy="8" r="0.8" />
  </Icon>
);
export const GripIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="6" cy="4" r="0.8" />
    <circle cx="10" cy="4" r="0.8" />
    <circle cx="6" cy="8" r="0.8" />
    <circle cx="10" cy="8" r="0.8" />
    <circle cx="6" cy="12" r="0.8" />
    <circle cx="10" cy="12" r="0.8" />
  </Icon>
);
export const TrashIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2.5 4.5h11M6 4.5v-1.5h4v1.5M4 4.5l.6 8.5h6.8l.6-8.5" />
  </Icon>
);
export const ArrowRightIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Icon>
);
export const CommitIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.5" />
    <path d="M1.5 8h4M10.5 8h4" />
  </Icon>
);
