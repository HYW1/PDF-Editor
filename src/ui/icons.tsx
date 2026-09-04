import type { ReactNode } from 'react';

type IconProps = { size?: number; className?: string };

function Svg({ size = 22, className, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconEdit(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 20h4l11-11-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </Svg>
  );
}

export function IconMerge(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="3.5" width="10" height="14" rx="1.6" />
      <rect x="10" y="6.5" width="10" height="14" rx="1.6" />
    </Svg>
  );
}

export function IconWeb(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Svg>
  );
}

export function IconBack(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 6L8 12l6 6" />
    </Svg>
  );
}

export function IconUndo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 5 5 5 5 0 0 1-5 5h-4" />
    </Svg>
  );
}

export function IconRedo(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0-5 5 5 5 0 0 0 5 5h4" />
    </Svg>
  );
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M9 7V5h6v2M7 7l1 12h8l1-12" />
    </Svg>
  );
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function IconSign(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 16c3-1 5 2 8 0s4-6 8-5" />
      <path d="M4 20h16" />
    </Svg>
  );
}

export function IconText(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 6h14M12 6v13" />
    </Svg>
  );
}

export function IconRotate(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 8a8 8 0 1 0 1 4" />
      <path d="M20 4v4h-4" />
    </Svg>
  );
}

export function IconImage(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4 16l5-4 4 3 7-6" />
    </Svg>
  );
}

export function IconFile(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 3h7l5 5v13H7z" />
      <path d="M14 3v5h5" />
    </Svg>
  );
}

export function IconBlank(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
    </Svg>
  );
}

export function IconCloud(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11.3-1.6A4 4 0 0 0 7 18z" />
      <path d="M12 12v6M9.5 14.5 12 12l2.5 2.5" />
    </Svg>
  );
}

export function IconDocPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M12 11v6M9 14h6" />
    </Svg>
  );
}

export function IconChevron(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 6l6 6-6 6" />
    </Svg>
  );
}
