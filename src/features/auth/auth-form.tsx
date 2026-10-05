import { Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";

import { Button } from "#/components/ui/button.tsx";
import { Input } from "#/components/ui/input.tsx";
import { Label } from "#/components/ui/label.tsx";
import { authClient } from "#/lib/auth-client.ts";

/** One message for every failure, so the page never says whether an account exists. */
const SIGN_IN_FAILED = "The email or password is not right.";
const SIGN_UP_FAILED =
	"The account could not be created. Check the details and try again.";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
	const navigate = useNavigate();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [message, setMessage] = useState("");
	const [busy, setBusy] = useState(false);
	const signup = mode === "signup";

	async function submit(event: FormEvent) {
		event.preventDefault();
		setBusy(true);
		setMessage("");
		try {
			const result = signup
				? await authClient.signUp.email({
						name: name.trim(),
						email: email.trim(),
						password,
					})
				: await authClient.signIn.email({ email: email.trim(), password });
			if (result.error) {
				setMessage(signup ? SIGN_UP_FAILED : SIGN_IN_FAILED);
				return;
			}
			await navigate({ to: "/dashboard" });
		} catch {
			setMessage(signup ? SIGN_UP_FAILED : SIGN_IN_FAILED);
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="mx-auto w-[min(64rem,calc(100%-2.5rem))] pt-6 pb-10 text-foreground">
			<header className="flex items-center justify-between gap-4 pb-4">
				<Link
					to="/"
					className="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight text-foreground no-underline hover:text-foreground"
				>
					<span
						aria-hidden="true"
						className="grid size-8 place-items-center rounded-lg bg-primary font-semibold text-primary-foreground"
					>
						D
					</span>
					DigiSign
				</Link>
				<nav aria-label="Account" className="text-[0.95rem] font-medium">
					<Link
						to="/verify"
						className="text-foreground no-underline hover:text-primary"
					>
						Check a PDF
					</Link>
				</nav>
			</header>

			<main className="mx-auto w-full max-w-sm py-14">
				<h1 className="text-[clamp(1.7rem,3vw,2.1rem)] leading-tight font-semibold tracking-tight">
					{signup ? "Create your account" : "Sign in"}
				</h1>
				<p className="mt-3 leading-relaxed text-muted-foreground">
					{signup
						? "Accounts are for people who send documents. Signers do not need one."
						: "Sign in to prepare and send documents."}
				</p>
				<form
					className="mt-8 flex flex-col gap-4"
					onSubmit={(event) => void submit(event)}
				>
					{signup ? (
						<Field label="Name" id="auth-name">
							<Input
								id="auth-name"
								autoComplete="name"
								required
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
						</Field>
					) : null}
					<Field label="Email" id="auth-email">
						<Input
							id="auth-email"
							type="email"
							autoComplete="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
					</Field>
					<Field label="Password" id="auth-password">
						<Input
							id="auth-password"
							type="password"
							autoComplete={signup ? "new-password" : "current-password"}
							required
							minLength={8}
							maxLength={128}
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
						{signup ? (
							<span className="text-xs text-muted-foreground">
								At least 8 characters.
							</span>
						) : null}
					</Field>
					<Button type="submit" size="lg" disabled={busy} className="mt-2">
						{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
					</Button>
					{message ? (
						<p className="text-sm text-destructive" role="alert">
							{message}
						</p>
					) : null}
				</form>
				<p className="mt-6 text-sm text-muted-foreground">
					{signup ? (
						<>
							Already have an account?{" "}
							<Link to="/login" className="font-medium text-foreground">
								Sign in
							</Link>
						</>
					) : (
						<>
							New here?{" "}
							<Link to="/signup" className="font-medium text-foreground">
								Create an account
							</Link>
						</>
					)}
				</p>
			</main>
		</div>
	);
}

function Field({
	label,
	id,
	children,
}: {
	label: string;
	id: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			{children}
		</div>
	);
}

export function SignOutButton() {
	const navigate = useNavigate();
	return (
		<Button
			variant="outline"
			className="mt-6"
			onClick={() => {
				void authClient.signOut().then(() => navigate({ to: "/login" }));
			}}
		>
			Sign out
		</Button>
	);
}
