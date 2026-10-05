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
			await navigate({ to: "/prepare" });
		} catch {
			setMessage(signup ? SIGN_UP_FAILED : SIGN_IN_FAILED);
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className="sheet">
			<p className="wordmark">DigiSign</p>
			<h1 className="doc-title">
				{signup ? "Create your account" : "Sign in"}
			</h1>
			<p>
				{signup
					? "Accounts are for people who send documents. Signers do not need one."
					: "Sign in to prepare and send documents."}
			</p>
			<form
				className="mt-4 flex max-w-sm flex-col gap-3"
				onSubmit={(event) => void submit(event)}
			>
				{signup ? (
					<div className="flex flex-col gap-1">
						<Label htmlFor="auth-name">Name</Label>
						<Input
							id="auth-name"
							autoComplete="name"
							required
							value={name}
							onChange={(event) => setName(event.target.value)}
						/>
					</div>
				) : null}
				<div className="flex flex-col gap-1">
					<Label htmlFor="auth-email">Email</Label>
					<Input
						id="auth-email"
						type="email"
						autoComplete="email"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
					/>
				</div>
				<div className="flex flex-col gap-1">
					<Label htmlFor="auth-password">Password</Label>
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
				</div>
				<Button type="submit" disabled={busy}>
					{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
				</Button>
				{message ? (
					<p className="text-sm text-destructive" role="alert">
						{message}
					</p>
				) : null}
			</form>
			<p className="mt-4 text-sm">
				{signup ? (
					<>
						Already have an account? <Link to="/login">Sign in</Link>
					</>
				) : (
					<>
						New here? <Link to="/signup">Create an account</Link>
					</>
				)}
			</p>
		</main>
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
