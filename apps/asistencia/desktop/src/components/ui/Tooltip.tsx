import React, { useState, useRef, useEffect, ReactNode, useId } from 'react';

export interface TooltipProps {
  content: string | ReactNode;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delayMs?: number;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delayMs = 200,
  disabled = false,
  className = '',
  style,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const showTooltip = () => {
    if (disabled || !content) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  };

  const hideTooltip = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (disabled || !content) {
    return <>{children}</>;
  }

  return (
    <div
      className={`tooltip-anchor ${className}`.trim()}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      onTouchStart={() => {
        if (!isVisible) showTooltip();
      }}
      style={{ display: 'inline-flex', position: 'relative', ...style }}
      aria-describedby={isVisible ? tooltipId : undefined}
    >
      {children}
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`tooltip-bubble tooltip-${position}`}
          aria-hidden={!isVisible}
        >
          {content}
        </div>
      )}
    </div>
  );
};

export default Tooltip;
