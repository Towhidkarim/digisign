import { Monitor, Moon, Sun } from "lucide-react";

import { type Theme, useTheme } from "#/components/theme-provider.tsx";
import { Button } from "#/components/ui/button.tsx";

const NEXT: Record<Theme, Theme> = {
	system: "light",
	light: "dark",
	dark: "system",
};

const LABEL: Record<Theme, string> = {
	system: "System theme",
	light: "Light theme",
	dark: "Dark theme",
};

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** Cycles system, light, dark. */
export function ThemeToggle({ className }: { className?: string }) {
	const { theme, setTheme } = useTheme();
	const Icon = ICON[theme];
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className={className}
			onClick={() => setTheme(NEXT[theme])}
		>
			<Icon strokeWidth={1.75} />
			{LABEL[theme]}
		</Button>
	);
}
