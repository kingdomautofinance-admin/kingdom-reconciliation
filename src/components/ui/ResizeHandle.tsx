import { useState, useEffect } from 'react';

interface ResizeHandleProps {
  width: string;
  onResize: (newWidth: number) => void;
  className?: string;
}

export function ResizeHandle({ width, onResize, className = '' }: ResizeHandleProps) {
  const [isResizing, setIsResizing] = useState(false);

  // Parse numeric value from string like "100px"
  const getNumericWidth = (w: string) => {
    const match = w.match(/^(\d+(\.\d+)?)px$/);
    return match ? parseFloat(match[1]) : null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startWidth = getNumericWidth(width);

    if (startWidth === null) return; // Cannot resize non-pixel widths (like 1fr)

    setIsResizing(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.max(50, startWidth + deltaX); // Minimum 50px
      onResize(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  // Don't render handle for non-pixel widths (like 1fr)
  if (getNumericWidth(width) === null) {
    return null;
  }

  return (
    <div
      className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/5 transition-colors z-20 group ${
        isResizing ? 'bg-primary/10' : 'bg-transparent'
      } ${className}`}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div 
        className={`absolute right-0 top-2 bottom-2 w-px transition-colors ${
          isResizing ? 'bg-primary' : 'bg-border/60 group-hover:bg-primary/50'
        }`} 
      />
    </div>
  );
}
