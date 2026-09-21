// Tiny hand-written icon set (24x24, stroke based) - no icon library needed.
const paths = {
  select: <path d="M5 3l14 7-6 2-2 6z" />,
  hand: (
    <>
      <path d="M8 13V6a1.5 1.5 0 013 0v5" />
      <path d="M11 11V4.5a1.5 1.5 0 013 0V11" />
      <path d="M14 11V6a1.5 1.5 0 013 0v7" />
      <path d="M8 13a1.5 1.5 0 00-3 0c0 3 2 8 7 8 4 0 6-3 6-7v-1" />
    </>
  ),
  sticky: (
    <>
      <path d="M5 4h14v10l-6 6H5z" />
      <path d="M19 14h-6v6" />
    </>
  ),
  rect: <rect x="4" y="6" width="16" height="12" rx="2" />,
  ellipse: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  text: (
    <>
      <path d="M5 6V4h14v2" />
      <path d="M12 4v16" />
      <path d="M9 20h6" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l1-4L16 5a2.1 2.1 0 013 3L8 19z" />
      <path d="M14 7l3 3" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 19L19 5" />
      <path d="M9 5h10v10" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10a6 6 0 010 12h-3" />
    </>
  ),
  redo: (
    <>
      <path d="M15 14l5-5-5-5" />
      <path d="M20 9H10a6 6 0 000 12h3" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" />
    </>
  ),
  share: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="17" cy="6" r="2.5" />
      <circle cx="17" cy="18" r="2.5" />
      <path d="M8.2 10.8l6.6-3.6M8.2 13.2l6.6 3.6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  fit: (
    <>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </>
  ),
  back: <path d="M15 5l-7 7 7 7" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2" />
      <path d="M12 17h.01" />
    </>
  ),
  check: <path d="M5 12l5 5 9-10" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  logout: (
    <>
      <path d="M10 4H5v16h5" />
      <path d="M16 8l4 4-4 4M20 12H9" />
    </>
  ),
  link: (
    <>
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </>
  ),
};

export function Icon({ name, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
