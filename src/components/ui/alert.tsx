import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "#/lib/utils.ts";

const alertVariants = cva(
	"relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:top-3.5 [&>svg]:left-4 [&>svg]:size-4 [&>svg~*]:pl-7",
	{
		variants: {
			variant: {
				default: "border-border bg-card text-card-foreground",
				info: "border-brand-soft bg-brand-bg text-brand-fg",
				success: "border-success/30 bg-success-bg text-success-fg",
				warning: "border-warning/30 bg-warning-bg text-warning-fg",
				destructive: "border-destructive/30 bg-danger-bg text-danger-fg",
			},
		},
		defaultVariants: { variant: "default" },
	},
);

function Alert({
	className,
	variant,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return (
		<div
			data-slot="alert"
			role={variant === "destructive" ? "alert" : "status"}
			className={cn(alertVariants({ variant }), className)}
			{...props}
		/>
	);
}

function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="alert-title"
			className={cn("font-medium", className)}
			{...props}
		/>
	);
}

function AlertDescription({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-description"
			className={cn("mt-1 text-small leading-relaxed", className)}
			{...props}
		/>
	);
}

export { Alert, AlertDescription, AlertTitle };
