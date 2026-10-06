import { createFileRoute, Link } from "@tanstack/react-router";

import { AppHeader } from "#/components/app-header.tsx";
import { Button } from "#/components/ui/button.tsx";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
	return (
		<div className="mx-auto w-[min(64rem,calc(100%-2.5rem))] pt-6 pb-10 text-foreground">
			<AppHeader>
				<nav
					aria-label="Account"
					className="flex items-center gap-5 text-[0.95rem] font-medium"
				>
					<Link
						to="/verify"
						className="hidden text-foreground no-underline hover:text-brand-hover sm:inline"
					>
						Check a PDF
					</Link>
					<Link
						to="/login"
						className="hidden text-foreground no-underline hover:text-brand-hover sm:inline"
					>
						Sign in
					</Link>
					<Button asChild size="sm">
						<Link to="/signup">Create an account</Link>
					</Button>
				</nav>
			</AppHeader>

			<main>
				<section
					aria-labelledby="landing-headline"
					className="grid items-center gap-10 py-11 md:grid-cols-[1.3fr_1fr] md:gap-14 md:py-18"
				>
					<div>
						<h1
							id="landing-headline"
							className="max-w-[18ch] text-[clamp(2rem,4vw,3rem)] leading-[1.15] font-semibold tracking-tight"
						>
							Signed documents, kept in the file itself.
						</h1>
						<p className="mt-5 max-w-[42ch] text-lg leading-relaxed text-muted-foreground">
							You place the fields, people sign from a link, and the finished
							PDF carries a record that anyone can check.
						</p>
						<div className="mt-8 flex flex-wrap gap-3">
							<Button asChild size="lg">
								<Link to="/signup">Create an account</Link>
							</Button>
							<Button asChild size="lg" variant="outline">
								<Link to="/login">Sign in</Link>
							</Button>
						</div>
					</div>
					<DocumentSheet />
				</section>

				<section
					aria-labelledby="landing-how"
					className="border-t border-border pt-8 pb-10"
				>
					<h2
						id="landing-how"
						className="mb-6 text-[1.35rem] font-semibold tracking-tight"
					>
						How a document gets signed
					</h2>
					<ol className="grid list-decimal gap-8 pl-5 md:grid-cols-3 md:gap-8">
						<li className="pl-2">
							<StepPrepare />
							<strong className="mb-1 block">You prepare it.</strong>
							<span className="block max-w-[32ch] leading-relaxed text-muted-foreground">
								Place the fields on your PDF and name the people who sign, in
								order.
							</span>
						</li>
						<li className="pl-2">
							<StepLink />
							<strong className="mb-1 block">They sign from a link.</strong>
							<span className="block max-w-[32ch] leading-relaxed text-muted-foreground">
								Each person opens their link, reviews the document and signs. No
								account.
							</span>
						</li>
						<li className="pl-2">
							<StepCheck />
							<strong className="mb-1 block">Anyone can check it.</strong>
							<span className="block max-w-[32ch] leading-relaxed text-muted-foreground">
								The finished PDF carries its own record. Drop it on the public
								page to check it.
							</span>
						</li>
					</ol>
				</section>
			</main>

			<footer className="flex items-baseline justify-between gap-4 border-t border-border pt-5 text-sm">
				<span className="font-semibold">DigiSign</span>
				<Link to="/verify">Check a signed PDF</Link>
			</footer>
		</div>
	);
}

function StepFrame({ children }: { children: React.ReactNode }) {
	return (
		<svg
			className="mb-3.5 -ml-1.5 block h-auto w-full max-w-44"
			viewBox="0 0 160 96"
			aria-hidden="true"
		>
			<title>Step illustration</title>
			{children}
		</svg>
	);
}

function StepPrepare() {
	return (
		<StepFrame>
			<rect
				x="46"
				y="10"
				width="68"
				height="76"
				rx="4"
				className="fill-card stroke-border"
				strokeWidth="1.5"
			/>
			<rect
				x="56"
				y="24"
				width="40"
				height="4"
				rx="2"
				className="fill-accent"
			/>
			<rect
				x="56"
				y="34"
				width="30"
				height="4"
				rx="2"
				className="fill-accent"
			/>
			<rect
				x="56"
				y="50"
				width="48"
				height="16"
				rx="3"
				className="fill-accent stroke-primary"
				strokeWidth="1.5"
			/>
			<path
				d="M92 42 l4 4 8-9"
				className="fill-none stroke-brand-hover"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</StepFrame>
	);
}

function StepLink() {
	return (
		<StepFrame>
			<rect
				x="18"
				y="24"
				width="84"
				height="48"
				rx="6"
				className="fill-card stroke-border"
				strokeWidth="1.5"
			/>
			<path
				d="M30 40 h46 M30 50 h34 M30 60 h24"
				className="fill-none stroke-ink-subtle"
				strokeWidth="3"
				strokeLinecap="round"
			/>
			<circle
				cx="122"
				cy="48"
				r="18"
				className="fill-accent stroke-primary"
				strokeWidth="1.5"
			/>
			<path
				d="M114 48 h16 M126 44 l6 4 -6 4"
				className="fill-none stroke-brand-hover"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</StepFrame>
	);
}

function StepCheck() {
	return (
		<StepFrame>
			<rect
				x="34"
				y="14"
				width="60"
				height="72"
				rx="4"
				className="fill-card stroke-border"
				strokeWidth="1.5"
			/>
			<path
				d="M46 34 h36 M46 44 h26"
				className="fill-none stroke-ink-subtle"
				strokeWidth="3"
				strokeLinecap="round"
			/>
			<circle
				cx="108"
				cy="62"
				r="22"
				className="fill-card stroke-primary"
				strokeWidth="2"
			/>
			<path
				d="M99 62 l6 6 13-14"
				className="fill-none stroke-brand-hover"
				strokeWidth="2.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</StepFrame>
	);
}

function DocumentSheet() {
	return (
		<figure
			aria-label="A document with two signatures"
			className="m-0 rounded-lg border border-border bg-card px-6 pt-6 pb-5 shadow-lg"
		>
			<figcaption className="flex justify-between border-b border-border pb-3 text-sm font-semibold">
				<span>Service agreement</span>
				<span className="font-normal text-muted-foreground">Page 1 of 4</span>
			</figcaption>
			<div aria-hidden="true" className="grid gap-2 py-4">
				<span className="block h-2 w-[92%] rounded-full bg-accent" />
				<span className="block h-2 w-[74%] rounded-full bg-accent" />
				<span className="block h-2 w-[92%] rounded-full bg-accent" />
				<span className="block h-2 w-[74%] rounded-full bg-accent" />
			</div>
			<div className="mt-1 grid grid-cols-2 gap-3">
				<div className="rounded-lg border border-dashed border-ink-subtle px-3 pt-2.5 pb-3">
					<p className="m-0 text-xs text-muted-foreground">Jordan Hale</p>
					<svg
						viewBox="0 0 240 50"
						aria-hidden="true"
						className="block h-10 w-full"
					>
						<title>A drawn signature</title>
						<path
							className="fill-none stroke-primary"
							strokeWidth="2.5"
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M10 32 C 22 12, 28 8, 38 18 C 45 27, 48 42, 56 32 C 64 20, 68 10, 77 24 C 84 34, 91 38, 102 26 C 114 14, 128 16, 136 28 C 142 36, 158 32, 175 24 C 188 18, 204 20, 218 16"
						/>
					</svg>
					<small className="block text-[0.72rem] text-brand-fg">Signed</small>
				</div>
				<div className="rounded-lg border border-dashed border-ink-subtle px-3 pt-2.5 pb-3">
					<p className="m-0 text-xs text-muted-foreground">Amira Solano</p>
					<em className="mt-4 block text-[0.72rem] font-normal text-muted-foreground not-italic">
						Waiting
					</em>
				</div>
			</div>
		</figure>
	);
}
