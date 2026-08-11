import { X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DrawerProps = {
	open: boolean;
	title: string;
	children: ReactNode;
	onOpenChange: (open: boolean) => void;
	className?: string;
};

export function Drawer({ open, title, children, onOpenChange, className }: DrawerProps) {
	if (!open) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex justify-end bg-foreground/30 transition-opacity">
			<div className={cn("flex h-full w-full max-w-2xl flex-col border-l bg-card shadow-xl", className)}>
				<div className="flex items-center justify-between border-b px-6 py-4">
					<h2 className="text-lg font-semibold">{title}</h2>
					<Button aria-label="Close" size="icon" variant="ghost" onClick={() => onOpenChange(false)}>
						<X className="size-5" />
					</Button>
				</div>
				<div className="flex-1 overflow-y-auto p-6">{children}</div>
			</div>
		</div>
	);
}
