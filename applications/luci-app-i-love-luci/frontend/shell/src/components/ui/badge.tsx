import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
	variant?: "default" | "secondary" | "outline" | "destructive";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex h-7 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground",
				variant === "outline" && "border-border text-foreground",
				variant === "secondary" && "bg-secondary text-secondary-foreground",
				variant === "destructive" && "border-destructive text-destructive",
				className,
			)}
			{...props}
		/>
	);
}

