export function NavBackLabel({ children }: { children: string }) {
  return (
    <span className="nav-back">
      <svg className="nav-chevron-icon" viewBox="0 0 10 16" aria-hidden="true">
        <path
          d="M8 2L2.5 8 8 14"
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
