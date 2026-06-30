import React from 'react';
interface MenuVersionSectionProps {
  appVersion: string;
  closeMenu: () => void;
}

export const MenuVersionSection: React.FC<MenuVersionSectionProps> = ({
  appVersion,
  closeMenu,
}) => {
  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <a
          href="https://github.com/ilja/plannotator"
          target="_blank"
          rel="noopener noreferrer"
          onClick={closeMenu}
          className="text-[10px] font-semibold tracking-wide text-muted-foreground hover:text-foreground transition-colors"
        >
          Plannotator
        </a>
        <span className="text-[10px] font-mono text-muted-foreground/70">
          v{appVersion}
        </span>
      </div>
      <div className="flex flex-col items-start gap-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <a
            href="https://github.com/ilja/plannotator/releases"
            target="_blank"
            rel="noopener noreferrer"
            onClick={closeMenu}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            Release notes
          </a>
        </span>
      </div>
    </div>
  );
};
