import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getMenuTree, setRouteMode, type MenuItem } from "@/lib/rpc";
import { coverageLabels, routeModeLabels, routeModeOptions, selectedRouteMode } from "@/lib/route-modes";
import { t } from "@/lib/i18n";

export function SettingsPage() {
	const [mfaOpen, setMfaOpen] = useState(false);
	const [routes, setRoutes] = useState<MenuItem[]>([]);
	const [routeQuery, setRouteQuery] = useState("");
	const visibleRoutes = useMemo(() => {
		const query = routeQuery.trim().toLowerCase();

		return routes
			.filter((route) => !query || route.title.toLowerCase().includes(query) || route.path.toLowerCase().includes(query))
			.slice(0, 80);
	}, [routeQuery, routes]);

	useEffect(() => {
		void getMenuTree().then((menu) => setRoutes(menu.routes?.length ? menu.routes : menu.items));
	}, []);

	async function updateRouteMode(route: MenuItem, mode: MenuItem["configuredMode"]) {
		const nextMode = mode ?? "auto";
		const saved = await setRouteMode(route.path, nextMode);

		if (!saved) {
			toast.error("Route mode was not saved");
			return;
		}

		setRoutes((current) =>
			current.map((item) => (item.path === route.path ? { ...item, configuredMode: nextMode } : item)),
		);
		toast.success(t("Route mode saved"), {
			description: `${t(route.title)} uses ${t(routeModeLabels[nextMode])}.`,
		});
	}

	return (
		<div className="mx-auto grid max-w-6xl gap-5">
			<div>
				<h1 className="text-2xl font-semibold">{t("Settings")}</h1>
				<p className="text-sm text-muted-foreground">{t("Router shell configuration and security options.")}</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>{t("Authentication")}</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4">
					<div className="flex items-center justify-between gap-4">
						<div>
							<p className="font-medium">{t("Multi-factor authentication")}</p>
							<p className="text-sm text-muted-foreground">
								{t("TOTP MFA requires server-side support before it can be enabled.")}
							</p>
						</div>
						<Button variant="outline" onClick={() => setMfaOpen(true)}>
							{t("Configure")}
						</Button>
					</div>
					<div className="flex items-center justify-between gap-4 border-t pt-4">
						<div>
							<p className="font-medium">{t("Passcode / passkey")}</p>
							<p className="text-sm text-muted-foreground">
								{t("Passcode is feasible later; WebAuthn/passkey should be optional after TOTP lands.")}
							</p>
						</div>
						<Button
							variant="outline"
							onClick={() =>
								toast.info("Not enabled", {
									description: "Passkey support needs HTTPS and server-side challenge verification.",
								})
							}
						>
							{t("Review")}
						</Button>
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{t("Route compatibility")}</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-4">
					<div className="grid gap-2 sm:max-w-md">
						<label className="text-sm font-medium" htmlFor="route-search">
							{t("Search routes")}
						</label>
						<Input
							id="route-search"
							placeholder={t("Status, DHCP, firewall")}
							value={routeQuery}
							onChange={(event) => setRouteQuery(event.target.value)}
						/>
					</div>
					<div className="grid gap-2 max-h-[60vh] overflow-y-auto pr-2">
						{visibleRoutes.map((route) => (
							<div key={route.path} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-md border hover:bg-muted/50 transition-colors">
								<div>
									<div className="font-medium">{t(route.title)}</div>
									<div className="text-xs text-muted-foreground">{route.path}</div>
								</div>
								<div className="flex items-center gap-3">
									<Badge variant="outline" className="hidden sm:inline-flex text-muted-foreground">
										{t(coverageLabels[route.nativeStatus ?? "unsupported"])}
									</Badge>
									<Select
										value={selectedRouteMode(route)}
										onValueChange={(value) => void updateRouteMode(route, value as MenuItem["configuredMode"])}
									>
										<SelectTrigger className="w-[140px] h-8 text-xs bg-background">
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{routeModeOptions(route).map((mode) => (
												<SelectItem key={mode} value={mode} className="text-xs">
													{t(routeModeLabels[mode])}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</Card>
			<Dialog open={mfaOpen} title={t("MFA setup")} onOpenChange={setMfaOpen}>
				<div className="grid gap-4">
					<p className="text-sm text-muted-foreground">
						{t("MFA setup is not available in this package yet. TOTP secrets must be generated and verified on the router.")}
					</p>
					<div className="grid gap-2">
						<label className="text-sm font-medium" htmlFor="mfa-code">
							{t("Verification code")}
						</label>
						<Input id="mfa-code" inputMode="numeric" placeholder="000000" />
					</div>
					<div className="flex justify-end gap-2">
						<Button variant="outline" onClick={() => setMfaOpen(false)}>
							{t("Cancel")}
						</Button>
						<Button
							onClick={() => {
								setMfaOpen(false);
								toast.info("MFA not enabled", {
									description: "Server-side TOTP support is required first.",
								});
							}}
						>
							{t("Verify")}
						</Button>
					</div>
				</div>
			</Dialog>
		</div>
	);
}
