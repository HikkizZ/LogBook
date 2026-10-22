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

export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="M3 8.5l3.2 3L13 4.5" />
  </Icon>
);
export const ChevronDownIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 6l4 4 4-4" />
  </Icon>
);
export const ChevronLeftIcon = (p: P) => (
  <Icon {...p}>
    <path d="M10 3L5 8l5 5" />
  </Icon>
);
export const ChevronRightIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 3l5 5-5 5" />
  </Icon>
);
export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M4 4l8 8M12 4l-8 8" />
  </Icon>
);
export const ClockIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3l2 1.5" />
  </Icon>
);
export const SunIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.5" />
    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
  </Icon>
);
export const CalendarIcon = (p: P) => (
  <Icon {...p}>
    <rect x="2" y="3" width="12" height="11" rx="1.5" />
    <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
  </Icon>
);
export const TimelineIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2 4h6M5 8h8M3 12h5" />
  </Icon>
);
export const TagIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5V2z" />
    <circle cx="5" cy="5" r="0.8" />
  </Icon>
);
export const KeyIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="5" cy="10" r="3" />
    <path d="M7.2 7.8L13 2M11 4l1.5 1.5" />
  </Icon>
);
export const SettingsIcon = (p: P) => (
  <Icon {...p}>
    <path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" />
    <circle cx="10.5" cy="4.5" r="1.5" />
    <circle cx="5.5" cy="11.5" r="1.5" />
  </Icon>
);
export const SidebarIcon = (p: P) => (
  <Icon {...p}>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M6 3v10" />
  </Icon>
);
export const PlusIcon = (p: P) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
