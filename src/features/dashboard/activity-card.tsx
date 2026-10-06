import {
	type ActivityLine,
	formatActivityTime,
} from "#/features/dashboard/detail-format.ts";
import { formatWhen } from "#/features/dashboard/format.ts";
import { cn } from "#/lib/utils.ts";

const DOT: Record<ActivityLine["tone"], string> = {
	brand: "bg-primary",
	success: "bg-success",
	neutral: "bg-neutral",
	danger: "bg-destructive",
};

export function ActivityCard({ lines }: { lines: readonly ActivityLine[] }) {
	return (
		<section className="rounded-lg border border-border bg-card p-5 md:p-6">
			<h2 className="text-heading font-semibold">Activity</h2>
			{lines.length === 0 ? (
				<p className="mt-4 text-sm text-muted-foreground">
					Nothing has been recorded yet.
				</p>
			) : (
				<ol className="mt-4 border-t border-border">
					{lines.map((line) => (
						<li
							key={line.seq}
							className="flex items-center gap-3 border-b border-border py-3 last:border-b-0"
						>
							<span
								aria-hidden="true"
								className={cn("size-2 shrink-0 rounded-full", DOT[line.tone])}
							/>
							<p className="min-w-0 flex-1 text-sm break-words">{line.text}</p>
							<time
								dateTime={new Date(line.at).toISOString()}
								title={formatWhen(line.at)}
								className="shrink-0 text-small whitespace-nowrap text-muted-foreground tabular-nums"
							>
								{formatActivityTime(line.at)}
							</time>
						</li>
					))}
				</ol>
			)}
		</section>
	);
}
