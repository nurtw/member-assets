import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/**
 * The button, and its look for a link that acts as one (`buttonVariants`).
 *
 * Green is the primary action (DESIGN.md §2). A dangerous act is the deny
 * verdict's solid fill, and says what it does in words: the colour only
 * repeats it.
 */
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium " +
    "transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60 " +
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-on-solid hover:bg-primary-hover",
        secondary:
          "border border-line bg-surface text-foreground shadow-xs hover:bg-surface-muted",
        ghost:
          "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
        danger: "bg-verdict-deny-solid text-on-solid hover:brightness-110",
        link: "text-link underline-offset-2 hover:underline",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-11 px-5 text-base",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    compoundVariants: [{ variant: "link", className: "h-auto px-0" }],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    /** Render the one child (a `Link`, say) with the button's look. */
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return (
    <Component
      // A button inside a form submits it unless told otherwise.
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
