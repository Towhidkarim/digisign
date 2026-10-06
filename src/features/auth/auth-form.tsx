import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";

import { Logo } from "#/components/logo.tsx";
import { Alert, AlertDescription } from "#/components/ui/alert.tsx";
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
	const [showPassword, setShowPassword] = useState(false);
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
		<div className="min-h-svh bg-background text-foreground">
			<header className="flex h-16 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
				<Logo className="max-sm:min-h-11" />
				<Button asChild variant="ghost" className="max-sm:min-h-11">
					<Link to="/verify">Check a PDF</Link>
				</Button>
			</header>

			<main className="mx-auto w-full max-w-110 px-4 pt-10 pb-16 sm:pt-16">
				<h1 className="text-title font-semibold tracking-tight">
					{signup ? "Create your account" : "Welcome back"}
				</h1>
				<p className="mt-2 text-muted-foreground">
					{signup
						? "Accounts are for people who send documents. Signers do not need one."
						: "Sign in to prepare and send documents."}
				</p>

				<form
					className="mt-8 flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:p-6"
					onSubmit={(event) => void submit(event)}
				>
					{message ? (
						<Alert variant="destructive" role="alert">
							<AlertDescription className="mt-0">{message}</AlertDescription>
						</Alert>
					) : null}
					{signup ? (
						<Field label="Name" id="auth-name">
							<Input
								id="auth-name"
								autoComplete="name"
								required
								autoFocus
								className="h-11"
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
							autoFocus={!signup}
							className="h-11"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
						/>
					</Field>
					<Field
						label="Password"
						id="auth-password"
						help={signup ? "At least 8 characters." : undefined}
					>
						<div className="relative">
							<Input
								id="auth-password"
								type={showPassword ? "text" : "password"}
								autoComplete={signup ? "new-password" : "current-password"}
								required
								minLength={8}
								maxLength={128}
								className="h-11 pr-11"
								aria-describedby={signup ? "auth-password-help" : undefined}
								value={password}
								onChange={(event) => setPassword(event.target.value)}
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="absolute top-0 right-0 size-11 text-muted-foreground"
								aria-label={showPassword ? "Hide password" : "Show password"}
								aria-pressed={showPassword}
								onClick={() => setShowPassword((value) => !value)}
							>
								{showPassword ? (
									<EyeOff aria-hidden="true" className="size-4" />
								) : (
									<Eye aria-hidden="true" className="size-4" />
								)}
							</Button>
						</div>
					</Field>
					<Button
						type="submit"
						className="h-11 w-full"
						disabled={busy}
						aria-busy={busy}
					>
						{busy ? (
							<LoaderCircle
								aria-hidden="true"
								className="size-4 animate-spin motion-reduce:animate-none"
							/>
						) : null}
						{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
					</Button>
				</form>

				<p className="mt-6 text-center text-sm text-muted-foreground">
					{signup ? (
						<>
							Already have an account?{" "}
							<Link
								to="/login"
								className="inline-flex items-center font-medium text-foreground underline max-sm:min-h-11"
							>
								Sign in
							</Link>
						</>
					) : (
						<>
							New here?{" "}
							<Link
								to="/signup"
								className="inline-flex items-center font-medium text-foreground underline max-sm:min-h-11"
							>
								Create an account
							</Link>
						</>
					)}
				</p>
				<p className="mt-3 text-center text-small text-muted-foreground">
					Asked to sign a document? Open the link in your email. You don't need
					an account.
				</p>
			</main>
		</div>
	);
}

function Field({
	label,
	id,
	help,
	children,
}: {
	label: string;
	id: string;
	help?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{help ? (
				<span id={`${id}-help`} className="text-small text-muted-foreground">
					{help}
				</span>
			) : null}
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
