/** Simple line icons for the admin menu (generic shapes, 20 px, follow the text colour). */

import type { ReactElement } from 'react';

const PATHS: Record<string, string> = {
  dashboard: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 7 3-3M6 13h8',
  staff: 'M7 9a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm6 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM2.5 16c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4m1-3.8c.2 0 .3-.2.5-.2 2.2 0 4 1.5 4.5 4',
  audit: 'M5 3h10v14H5zM8 7h4M8 10h4M8 13h2',
  health: 'M2 10h4l2-5 4 10 2-5h4',
  deals: 'M3 6h11l-3-3M17 14H6l3 3',
  setups: 'M10 7.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Zm6 2.5-1.6-.6-.4-1 .7-1.6-1.4-1.4-1.6.7-1-.4L10 3.5h-2l-.6 1.6-1 .4-1.6-.7-1.4 1.4.7 1.6-.4 1-1.7.7v2l1.6.6.4 1-.7 1.6 1.4 1.4 1.6-.7 1 .4.7 1.7h2l.6-1.6 1-.4 1.6.7 1.4-1.4-.7-1.6.4-1 1.7-.7Z',
  profile: 'M10 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-6 7c.6-3 3-5 6-5s5.4 2 6 5',
  search: 'M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm4.5-1.5L17 17',
  filter: 'M3 4h14l-5.5 6.5V16l-3 1.5v-7Z',
  reset: 'M4 10a6 6 0 1 0 2-4.5M4 4v3h3',
  more: 'M10 5h.01M10 10h.01M10 15h.01',
  chevron: 'M6 8l4 4 4-4',
  logout: 'M8 4H4v12h4M12 6l4 4-4 4M16 10H8',
  disputes: 'M10 3v14M4 6h12M4 6l-2 5h4zM16 6l-2 5h4zM7 17h6',
  bell: 'M10 3a4.5 4.5 0 0 0-4.5 4.5c0 4-1.5 5.5-2 6h13c-.5-.5-2-2-2-6A4.5 4.5 0 0 0 10 3Zm-1.6 13.5a1.8 1.8 0 0 0 3.2 0',
  close: 'M6 6l8 8M14 6l-8 8',
  reversals: 'M7 5 4 8l3 3M4 8h8a4 4 0 0 1 0 8H8',
  outages: 'M10 3 2.5 16h15L10 3ZM10 8v4M10 14.5h.01',
  kyc: 'M3 5h14v10H3zM6 9.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0ZM5 13c.4-1 1.3-1.5 2.5-1.5S9.6 12 10 13M12 8.5h3M12 11h3',
  fraud: 'M10 2.5 4 5v4.5c0 3.8 2.6 6.6 6 8 3.4-1.4 6-4.2 6-8V5l-6-2.5ZM10 7v3.5M10 13h.01',
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS; size?: number }): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 2.6 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type IconName = keyof typeof PATHS;
