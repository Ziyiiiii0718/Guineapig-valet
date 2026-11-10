const paths = {
  home: "m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
  pets: "M8 14c-6 4-3 8 1 6 2-1 4-1 6 0 4 2 7-2 1-6-3-3-5-3-8 0ZM5 7c-3 0-3 5 0 5s3-5 0-5ZM10 3c-3 0-3 6 0 6s3-6 0-6ZM16 4c-3 0-3 5 0 5s3-5 0-5ZM20 8c-3 0-3 5 0 5s3-5 0-5Z",
  photos: "M3 4h18v16H3ZM3 16l6-6 5 5 3-3 4 4M16 8h.01",
  albums: "M3 6h7l2-3h5v3h4v15H3ZM7 11h10M7 15h7",
  upload: "M4 4h16v16H4ZM12 16V8m-3 3 3-3 3 3",
  review: "M5 3h14v18H5ZM8 8l1 1 2-2m2 1h3M8 14l1 1 2-2m2 1h3",
  camera: "M3 7h4l2-3h6l2 3h4v14H3ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  health: "M5 3h10l4 4v14H5ZM14 3v5h5M9 14h6m-3-3v6",
  weight: "M5 7h14l2 14H3ZM9 7V5a3 3 0 0 1 6 0v2m-3 4v5m-2-2 2 2 2-2",
  edit: "m4 15 11-11 5 5L9 20l-6 1ZM13 6l5 5",
  heart: "M12 21S1 14 3 7c2-6 8-4 9 0 1-4 7-6 9 0 2 7-9 14-9 14Z",
  leaf: "M4 20C0 7 9 2 21 3c0 12-4 20-17 17Zm0 0L16 8",
  calendar: "M3 5h18v16H3ZM7 2v6m10-6v6M3 10h18M8 14h1m6 0h1m-8 4h1",
  arrow: "M4 12h16m-6-6 6 6-6 6",
} as const;

export type IconName = keyof typeof paths;

export function OutlineIcon({
  name,
  className = "",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`outline-icon ${className}`}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
