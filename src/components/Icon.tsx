// A small hand-picked stroke icon set (24px grid), so we ship no icon library.
const PATHS: Record<string, string> = {
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  parcels: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  log: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  weather: 'M7 16a4 4 0 010-8 5 5 0 019.6-1.5A4 4 0 1117 16M8 19l-1 2M12 19l-1 2M16 19l-1 2',
  report: 'M7 3h7l5 5v13H7zM13 3v6h6M10 13h6M10 17h4M4 7v14h11',
  rules: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5M9 7h6',
  deadlines: 'M12 7v5l3 2M12 21a9 9 0 110-18 9 9 0 010 18z',
  help: 'M12 21a9 9 0 110-18 9 9 0 010 18zM9.5 9a2.5 2.5 0 114 2c-1 .6-1.5 1.2-1.5 2.5M12 17h.01',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-1.8-.3 1.6 1.6 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1-1.5 1.6 1.6 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.6 1.6 0 00.3-1.8 1.6 1.6 0 00-1.5-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.5-1 1.6 1.6 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 001.8.3H9a1.6 1.6 0 001-1.5V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.5 1.6 1.6 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00-.3 1.8V9a1.6 1.6 0 001.5 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.5 1z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  sprout: 'M12 21v-9M12 12C12 7 8 5 4 5c0 4 3 7 8 7zM12 10c0-4 3-6 8-6 0 4-3 6-8 6z',
  assistant: 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 15l.6 1.4L7 17l-1.4.6L5 19l-.6-1.4L3 17l1.4-.6z',
  send: 'M4 12l16-8-6 16-2-7z',
  close: 'M6 6l12 12M18 6L6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  info: 'M12 21a9 9 0 110-18 9 9 0 010 18zM12 11v6M12 7.5h.01',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  pin: 'M12 21s-7-6.2-7-12a7 7 0 1114 0c0 5.8-7 12-7 12zM12 11a2 2 0 100-4 2 2 0 000 4z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  search: 'M11 18a7 7 0 110-14 7 7 0 010 14zM20 20l-4-4',
  rain: 'M7 14a4 4 0 010-8 5 5 0 019.6-1.5A4 4 0 1117 14M8 17v3M12 17v3M16 17v3',
  print: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  play: 'M7 4l13 8-13 8z',
  keyboard: 'M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10',
  book: 'M4 4h6a3 3 0 013 3v13a2 2 0 00-2-2H4zM20 4h-6a3 3 0 00-3 3v13a2 2 0 012-2h7z',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 13A9 9 0 1111 3a7 7 0 0010 10z',
  globe: 'M12 21a9 9 0 110-18 9 9 0 010 18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, title, className }: { name: IconName | string; size?: number; title?: string; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      className={className}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

/** The brand mark: a meadow under a rain line, drawn like a field-notebook stamp. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      <circle cx="20" cy="20" r="19" fill="var(--meadow)" />
      <path d="M6 27c5-3 9-3 14 0s9 3 14 0" stroke="var(--paper)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M12 26v-7M16 25v-9M20 26v-11M24 25v-8M28 26v-6" stroke="var(--hay)" strokeWidth="2" strokeLinecap="round" />
      <path d="M11 11l-1 2M17 9l-1 2M23 9l-1 2M29 11l-1 2" stroke="var(--paper)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
