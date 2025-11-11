import * as React from "react"
import { ChevronDown } from "lucide-react"

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, placeholder, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={`
            flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background 
            placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 
            disabled:cursor-not-allowed disabled:opacity-50 appearance-none cursor-pointer
            ${className}
          `}
          ref={ref}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {children}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50 pointer-events-none" />
        <style>{`
          select {
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            background: white;
            transition: all 0.2s ease;
          }
          select:focus {
            border-color: #3b82f6;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
          }
          select:disabled {
            background-color: #f9fafb;
            color: #6b7280;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    )
  }
)
Select.displayName = "Select"

export { Select }
