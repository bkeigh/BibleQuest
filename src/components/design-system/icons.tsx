/**
 * Line icons — quiet, hairline UI glyphs (not the pixel sprites).
 * 1.5px strokes, rounded, inheriting currentColor. Kept minimal per the Codex.
 */
import { cn } from "@/lib/utils/cn";

interface IconProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
}

function Svg({
  className,
  size = 22,
  strokeWidth = 1.6,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("shrink-0", className)}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconHome = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 11.5 12 5l8 6.5" />
    <path d="M6 10.5V19h12v-8.5" />
    <path d="M10.5 19v-4.5h3V19" />
  </Svg>
);

export const IconQuest = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 20V5a1 1 0 0 1 1-1h8l-1.5 3L15 10H7" />
    <circle cx="6" cy="20" r="1.1" />
  </Svg>
);

export const IconBible = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6.5A1.5 1.5 0 0 0 5 20.5z" />
    <path d="M5 17.5A1.5 1.5 0 0 1 6.5 16H19" />
    <path d="M12 7v5M9.5 9.5h5" />
  </Svg>
);

export const IconPrayer = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4c-1.2 2.2-2 3.4-2 5.2 0 1.4.9 2.3 2 2.3s2-.9 2-2.3C14 7.4 13.2 6.2 12 4Z" />
    <path d="M8 20c0-3 1.5-5 4-5s4 2 4 5" />
    <path d="M6.5 20h11" />
  </Svg>
);

export const IconJourney = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 21c4-3 6-6.2 6-10a6 6 0 0 0-12 0c0 3.8 2 7 6 10Z" />
    <path d="M12 21V9M12 12l2.5-2M12 14l-2.5-2" />
  </Svg>
);

export const IconArrowRight = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 18}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </Svg>
);

export const IconArrowLeft = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 18}>
    <path d="M19 12H6M11 6l-6 6 6 6" />
  </Svg>
);

/** Send. The upward arrow every messaging surface has taught readers to expect. */
export const IconArrowUp = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 18} strokeWidth={p.strokeWidth ?? 2}>
    <path d="M12 19V6M6 12l6-6 6 6" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5 10 17 19 7" />
  </Svg>
);

export const IconBookmark = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z" />
  </Svg>
);

export const IconBookmarkFilled = (p: IconProps) => (
  <Svg {...p}>
    <path
      d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1Z"
      fill="currentColor"
      stroke="none"
    />
  </Svg>
);

export const IconPlus = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconSettings = (p: IconProps) => (
  // An unmistakable gear — an eight-toothed ring around a hub. (The old
  // circle-with-rays glyph read as a sun / theme toggle, not settings.)
  <Svg {...p}>
    <circle cx="12" cy="12" r="2.6" />
    <path d="M10.62 5.24L10.82 2.37A9.7 9.7 0 0 1 13.18 2.37L13.38 5.24A6.9 6.9 0 0 1 15.81 6.25L17.97 4.36A9.7 9.7 0 0 1 19.64 6.03L17.75 8.19A6.9 6.9 0 0 1 18.76 10.62L21.63 10.82A9.7 9.7 0 0 1 21.63 13.18L18.76 13.38A6.9 6.9 0 0 1 17.75 15.81L19.64 17.97A9.7 9.7 0 0 1 17.97 19.64L15.81 17.75A6.9 6.9 0 0 1 13.38 18.76L13.18 21.63A9.7 9.7 0 0 1 10.82 21.63L10.62 18.76A6.9 6.9 0 0 1 8.19 17.75L6.03 19.64A9.7 9.7 0 0 1 4.36 17.97L6.25 15.81A6.9 6.9 0 0 1 5.24 13.38L2.37 13.18A9.7 9.7 0 0 1 2.37 10.82L5.24 10.62A6.9 6.9 0 0 1 6.25 8.19L4.36 6.03A9.7 9.7 0 0 1 6.03 4.36L8.19 6.25A6.9 6.9 0 0 1 10.62 5.24Z" />
  </Svg>
);

export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 16}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Svg>
);

export const IconChevronRight = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 18}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4c.5 3.5 1.5 4.5 5 5-3.5.5-4.5 1.5-5 5-.5-3.5-1.5-4.5-5-5 3.5-.5 4.5-1.5 5-5Z" />
  </Svg>
);

export const IconShare = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 18}>
    <path d="M12 3v12M8 6l4-3 4 3" />
    <path d="M7 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
  </Svg>
);

export const IconLeaf = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19c0-8 6-13 14-13 0 8-5 14-13 14-.5 0-1 0-1-1Z" />
    <path d="M5 19C8 14 12 11 16 9.5" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 18}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="m15.5 15.5 4 4" />
  </Svg>
);

export const IconEye = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 18}>
    <path d="M3.5 12s3-5 8.5-5 8.5 5 8.5 5-3 5-8.5 5-8.5-5-8.5-5Z" />
    <circle cx="12" cy="12" r="2.25" />
  </Svg>
);

export const IconEyeOff = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 18}>
    <path d="m4 4 16 16" />
    <path d="M9.7 7.3A8.7 8.7 0 0 1 12 7c5.5 0 8.5 5 8.5 5a13 13 0 0 1-2.1 2.6M6.3 8.2A13.6 13.6 0 0 0 3.5 12s3 5 8.5 5c.9 0 1.7-.1 2.4-.3" />
  </Svg>
);

export const IconSliders = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 18}>
    <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
    <circle cx="15" cy="7" r="2" />
    <circle cx="9" cy="17" r="2" />
  </Svg>
);

export const IconInfo = (p: IconProps) => (
  <Svg {...p} size={p.size ?? 16}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5.5" />
    <path d="M12 7.75v.01" />
  </Svg>
);
