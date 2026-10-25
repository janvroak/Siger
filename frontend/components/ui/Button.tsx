import { Loader2, type LucideIcon } from "lucide-react";
import { ButtonHTMLAttributes, forwardRef } from "react";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-ghost";
export type ButtonSize = "sm" | "md" | "lg" | "icon-sm" | "icon-md";

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg shadow-sm hover:bg-accent-hover border border-transparent",
  secondary:
    "bg-surface text-fg border border-line-strong shadow-sm hover:bg-surface-2 hover:border-line-strong",
  ghost: "bg-transparent text-muted border border-transparent hover:bg-surface-2 hover:text-fg",
  danger: "bg-danger text-white shadow-sm hover:brightness-110 border border-transparent dark:text-[#2c1414]",
  "danger-ghost":
    "bg-transparent text-danger border border-transparent hover:bg-danger-soft",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-[13px]",
  md: "h-9 gap-2 px-3.5 text-sm",
  lg: "h-11 gap-2 px-5 text-sm",
  "icon-sm": "h-8 w-8",
  "icon-md": "h-9 w-9",
};

/** Classes for anything that should look like a button (links included). */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", extra = "") {
  return cn(
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg font-medium",
    "transition-[background-color,border-color,color,box-shadow,transform,filter] duration-150",
    "active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  /** Shows a spinner in place of the icon and disables the button. */
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon: Icon, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  const iconSize = size === "sm" ? 14 : 16;
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden />
      ) : Icon ? (
        <Icon size={iconSize} aria-hidden />
      ) : null}
      {children}
    </button>
  );
});

/** Square icon-only button; the label is required for screen readers and the tooltip. */
export function IconButton({
  icon: Icon,
  label,
  variant = "ghost",
  size = "md",
  className,
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  icon: LucideIcon;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={buttonClass(variant, size === "sm" ? "icon-sm" : "icon-md", className)}
      {...rest}
    >
      <Icon size={size === "sm" ? 15 : 17} aria-hidden />
    </button>
  );
}
