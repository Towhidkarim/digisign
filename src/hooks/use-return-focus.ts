import { useCallback, useRef } from "react";

/**
 * Radix only puts focus back on a `Trigger`. These dialogs are opened from ordinary buttons,
 * so this remembers the element that had focus when the dialog mounted and returns focus to it
 * on close. A caller that handles `onCloseAutoFocus` itself (and prevents the default) wins.
 */
export function useReturnFocus(
	onCloseAutoFocus?: (event: Event) => void,
): (event: Event) => void {
	const opener = useRef<Element | null>(
		typeof document === "undefined" ? null : document.activeElement,
	);
	return useCallback(
		(event: Event) => {
			onCloseAutoFocus?.(event);
			if (event.defaultPrevented) return;
			event.preventDefault();
			const target = opener.current;
			if (target instanceof HTMLElement && target.isConnected) target.focus();
		},
		[onCloseAutoFocus],
	);
}
