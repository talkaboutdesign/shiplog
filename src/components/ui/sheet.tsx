import * as React from "react";
import { cn } from "@/lib/utils";

const SheetContext = React.createContext<{
  open: boolean;
  setOpen: (open: boolean) => void;
}>({ open: false, setOpen: () => {} });

export interface SheetProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: "left" | "right" | "top" | "bottom";
}

export interface SheetTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const Sheet = ({ children, open: controlledOpen, onOpenChange }: SheetProps) => {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  return (
    <SheetContext.Provider value={{ open, setOpen }}>
      {children}
    </SheetContext.Provider>
  );
};

const SheetTrigger = React.forwardRef<HTMLButtonElement, SheetTriggerProps>(
  ({ className, asChild, children, ...props }, ref) => {
    const context = React.useContext(SheetContext);

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, {
        ...props,
        onClick: () => {
          context.setOpen(true);
          if (props.onClick) {
            (props.onClick as (e: React.MouseEvent) => void)({} as React.MouseEvent);
          }
        },
      });
    }

    return (
      <button
        ref={ref}
        className={cn(className)}
        onClick={() => context.setOpen(true)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
SheetTrigger.displayName = "SheetTrigger";

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ className, side = "right", children, ...props }, ref) => {
    const context = React.useContext(SheetContext);

    if (!context.open) return null;

    return (
      <>
        <div
          className={cn("fixed inset-0 z-50 bg-black/50")}
          onClick={() => context.setOpen(false)}
        />
        <div
          ref={ref}
          className={cn(
            "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out",
            side === "right" && "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
            side === "left" && "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
            side === "top" && "inset-x-0 top-0 border-b",
            side === "bottom" && "inset-x-0 bottom-0 border-t",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </>
    );
  }
);
SheetContent.displayName = "SheetContent";

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    )}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

const SheetTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

const SheetDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";

export {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
};
