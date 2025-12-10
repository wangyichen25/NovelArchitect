"use client";

import * as React from "react"
import { cn } from "@/lib/utils"
import { Check } from "lucide-react"

const Checkbox = React.forwardRef<
    HTMLInputElement,
    React.InputHTMLAttributes<HTMLInputElement> & {
        onCheckedChange?: (checked: boolean | 'indeterminate') => void
    }
>(({ className, onCheckedChange, onChange, checked, ...props }, ref) => {
    // Custom wrapper for native checkbox to look somewhat like ui component
    // OR we can just use native input with tailwind.

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange?.(e);
        onCheckedChange?.(e.target.checked);
    };

    return (
        <div className="relative flex items-center">
            <input
                type="checkbox"
                className={cn(
                    "peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground accent-primary",
                    className
                )}
                ref={ref}
                onChange={handleChange}
                checked={checked}
                {...props}
            />
        </div>
    )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }
