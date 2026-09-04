export function NavBackLabel({ children }: { children: string }) {
  return (
    <span className="nav-back">
      <svg className="nav-chevron-icon" viewBox="0 0 12 20" aria-hidden="true">
        <path
          d="M9.5 2.5L2.5 10l7 7.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="nav-back-text">{children}</span>
    </span>
  );
}
