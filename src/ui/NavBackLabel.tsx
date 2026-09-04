import { IconBack } from './icons';

export function NavBackLabel({ children }: { children: string }) {
  return (
    <span className="nav-back">
      <IconBack size={18} />
      <span className="nav-back-text">{children}</span>
    </span>
  );
}
