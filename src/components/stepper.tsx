import { Check } from "lucide-react";
import { Fragment } from "react";

import { cn } from "#/lib/utils.ts";

export const PREPARE_STEPS = [
	"Upload",
	"Signers and fields",
	"Review and send",
] as const;

/**
 * A numbered, ordered progress indicator. `current` is the 0-based index of the active step.
 * `compact` is for tool headers: smaller marks, and only the active step keeps its label.
 * On narrow screens the full version also shows just the active label.
 */
export function Stepper({
	steps = PREPARE_STEPS,
	current,
	compact = false,
	className,
}: {
	steps?: readonly string[];
	current: number;
	compact?: boolean;
	className?: string;
}) {
	return (
		<ol
			aria-label="Progress"
			className={cn("flex items-center justify-center", className)}
		>
			{steps.map((label, index) => {
				const state =
					index < current ? "done" : index === current ? "current" : "todo";
				return (
					<Fragment key={label}>
						{index > 0 ? (
							<li
								aria-hidden="true"
								className={cn(
									"h-px bg-border",
									compact ? "mx-2 w-4" : "mx-2 w-6 sm:mx-3 sm:w-12",
									index <= current && "bg-primary",
								)}
							/>
						) : null}
						<li
							aria-current={state === "current" ? "step" : undefined}
							className="flex items-center gap-2"
						>
							<span
								className={cn(
									"grid shrink-0 place-items-center rounded-full border text-xs font-semibold",
									compact ? "size-6" : "size-7",
									state === "current" &&
										"border-primary bg-primary text-primary-foreground",
									state === "done" && "border-primary bg-card text-primary",
									state === "todo" &&
										"border-input bg-card text-muted-foreground",
								)}
							>
								{state === "done" ? (
									<Check className="size-3.5" strokeWidth={2} />
								) : (
									index + 1
								)}
							</span>
							<span
								className={cn(
									"text-sm whitespace-nowrap",
									state === "current"
										? "font-semibold text-foreground"
										: "text-muted-foreground",
									state !== "current" &&
										(compact ? "hidden" : "hidden sm:inline"),
								)}
							>
								<span className="sr-only">
									{state === "done"
										? "Completed: "
										: state === "current"
											? "Current step: "
											: ""}
								</span>
								{label}
							</span>
						</li>
					</Fragment>
				);
			})}
		</ol>
	);
}
