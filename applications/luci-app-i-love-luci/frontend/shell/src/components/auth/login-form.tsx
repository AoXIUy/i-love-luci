import { useEffect, useRef } from "react";
import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { storeReturnRouteFromHash } from "@/lib/auth";
import { getShellConfig } from "@/lib/config";

export function LoginForm() {
	const config = getShellConfig();
	const passwordRef = useRef<HTMLInputElement>(null);
	const usernameRef = useRef<HTMLInputElement>(null);
	const defaultUser = config.defaultUser || "root";
	const loginAction =
		typeof window === "undefined" ? undefined : `${window.location.pathname}${window.location.search}`;

	useEffect(() => {
		storeReturnRouteFromHash();

		if (defaultUser) {
			passwordRef.current?.focus();
		}
		else {
			usernameRef.current?.focus();
		}
	}, [defaultUser]);

	return (
		<Card className="w-full max-w-sm shadow-sm">
			<CardContent className="p-6">
				<div className="mb-6 flex flex-col gap-2">
					<img src={`${import.meta.env.BASE_URL}logo.png`} alt="JT-COM Logo" className="h-10 w-auto object-contain self-start dark:brightness-110" />
					<p className="text-xs text-muted-foreground">Router administration</p>
				</div>

				{config.loginFailed ? (
					<div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-foreground">
						Invalid username or password.
					</div>
				) : null}

				<form action={loginAction} autoComplete="on" className="grid gap-4" method="post" onSubmit={storeReturnRouteFromHash}>
					<div className="grid gap-2">
						<label className="text-sm font-medium" htmlFor="luci_username">
							Username
						</label>
						<Input
							ref={usernameRef}
							aria-label="Username"
							autoCapitalize="none"
							autoComplete="username"
							autoCorrect="off"
							defaultValue={defaultUser}
							enterKeyHint="next"
							id="luci_username"
							name="luci_username"
							required
							spellCheck={false}
							type="text"
						/>
					</div>
					<div className="grid gap-2">
						<label className="text-sm font-medium" htmlFor="luci_password">
							Password
						</label>
						<Input
							ref={passwordRef}
							aria-label="Password"
							autoComplete="current-password"
							enterKeyHint="done"
							id="luci_password"
							name="luci_password"
							required
							type="password"
						/>
					</div>
					<div className="flex justify-end">
						<Button type="submit">Log in</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
