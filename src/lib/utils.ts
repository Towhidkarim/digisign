import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge needs to know our named type sizes (see @theme in styles.css). Without this
 * it reads `text-small` as a text colour and drops a real colour class next to it.
 */
const twMerge = extendTailwindMerge({
	extend: {
		classGroups: {
			"font-size": [
				{
					text: ["display", "title", "heading", "subheading", "small"],
				},
			],
		},
	},
});

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
