import * as React from "react"

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function Tooltip({ children, content, side = 'top' }: TooltipProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const [position, setPosition] = React.useState({ x: 0, y: 0 });
  const triggerRef = React.useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      
      let x = rect.left + rect.width / 2;
      let y = rect.top;
      
      switch (side) {
        case 'top':
          y = rect.top - 10;
          break;
        case 'bottom':
          y = rect.bottom + 10;
          break;
        case 'left':
          x = rect.left - 10;
          y = rect.top + rect.height / 2;
          break;
        case 'right':
          x = rect.right + 10;
          y = rect.top + rect.height / 2;
          break;
      }
      
      setPosition({ x, y });
    }
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-block"
      >
        {children}
      </div>
      
      {isVisible && content && (
        <div
          style={{
            position: 'fixed',
            left: position.x + 'px',
            top: position.y + 'px',
            transform: side === 'top' ? 'translate(-50%, -100%)' : 
                      side === 'bottom' ? 'translate(-50%, 0%)' :
                      side === 'left' ? 'translate(-100%, -50%)' : 
                      'translate(0%, -50%)',
            zIndex: 999999,
            backgroundColor: '#1f2937',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '14px',
            whiteSpace: 'nowrap',
            maxWidth: '500px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
            border: '1px solid #374151',
            pointerEvents: 'none'
          }}
        >
          {content}
        </div>
      )}
    </>
  );
}
