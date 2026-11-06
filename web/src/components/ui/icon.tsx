import type { SVGProps } from "react";

const paths = {
  home: "M3 10 12 3l9 7v11h-6v-7H9v7H3Z",
  building: "M4 21V4h10v17M14 9h6v12M7 8h4M7 12h4M7 16h4M17 13h1M17 17h1M2 21h20",
  award: "M8 14 7 22l5-3 5 3-1-8M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm0 3v6m-3-3h6",
  clipboard: "M8 4H4v17h16V4h-4M8 2h8v5H8Zm0 11 3 3 6-7",
  calendar: "M3 5h18v16H3ZM7 2v6m10-6v6M3 10h18M7 14h2m3 0h2m3 0h1M7 17h2m3 0h2",
  mail: "M3 5h18v14H3Zm0 0 9 8 9-8",
  bell: "M18 8a6 6 0 0 0-12 0v7l-2 3h16l-2-3ZM10 21h4M12 1v2",
  history: "M3 4v6h6M3 10a9 9 0 1 1 0 5m9-10v7l4 2",
  shield: "m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5ZM12 3v17",
  database: "M3 6c0-5 18-5 18 0s-18 5-18 0Zm0 0v12c0 5 18 5 18 0V6M3 12c0 5 18 5 18 0",
  settings: "M3 6h18M3 12h18M3 18h18M7 3v6m10 0v6M9 15v6",
  user: "M7 7a5 5 0 1 0 10 0A5 5 0 0 0 7 7ZM3 22v-3c0-7 18-7 18 0v3Z",
  logout: "M9 3H3v18h6m-1-9h13m-5-5 5 5-5 5",
  menu: "M3 5h18M3 12h18M3 19h18",
  close: "m5 5 14 14M19 5 5 19",
  arrow: "M3 12h18m-6-6 6 6-6 6",
  chevron: "m9 5 7 7-7 7",
  alert: "M3 3h18v15h-7l-4 4v-4H3ZM12 7v5m0 2v1",
  check: "m4 12 5 5L20 5",
  chart: "M3 3v18h18M7 17v-5m5 5V7m5 10V3",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false" {...props}><path d={paths[name]}/></svg>;
}
