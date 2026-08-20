import {
	ArcElement,
	BarElement,
	CategoryScale,
	Chart as ChartJS,
	Filler,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
} from "chart.js";
import type { ChartData, ChartOptions } from "chart.js";
import {
	Activity,
	ChevronRight,
	Cpu,
	HardDrive,
	Loader2,
	MemoryStick,
	Network,
	Power,
	RefreshCw,
	Shield,
	Thermometer,
	Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	getConntrackSummary,
	getDashboardStatus,
	getPasswallStatus,
	getProcessStats,
	getThermalHistory,
	restartPasswall,
	togglePasswall,
	type ConntrackSummary,
	type DashboardStatus,
	type DeviceStatus,
	type DhcpLease,
	type DiskStatEntry,
	type NetworkInterfaceStatus,
	type PasswallStatus,
	type ProcessStats,
	type ThermalHistoryResult,
	type ThermalZone,
	type WirelessAssociation,
} from "@/lib/rpc";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

ChartJS.register(
	ArcElement,
	BarElement,
	CategoryScale,
	Filler,
	Legend,
	LinearScale,
	LineElement,
	PointElement,
	Tooltip,
);

type BandwidthSample = {
	label: string;
	rxMbps: number;
	txMbps: number;
	load: number;
	memory: number;
	diskReadMBps: number;
	diskWriteMBps: number;
	maxTempC: number;
	activeConnections: number;
	maxConnections: number;
};

// 接口速率迷你趋势线（最近 10 个采样点）
type DeviceSparkline = {
	name: string;
	rxHistory: number[];
	txHistory: number[];
};

type DeviceRate = {
	name: string;
	rxMbps: number;
	txMbps: number;
	rxBytes: number;
	txBytes: number;
	up: boolean;
	carrier: boolean;
	speed: string;
};

type TrafficSourceOption = {
	id: string;
	label: string;
	detail: string;
	deviceNames: string[];
	default?: boolean;
};

const emptyStatus: DashboardStatus = {
	board: {},
	system: {},
	devices: {},
	dhcpLeases: [],
	wirelessAssociations: [],
};

const maxSamples = 24;
const pollOptions = [1000, 2000, 5000] as const;
const trafficSourceStorageKey = "i-love-luci.dashboard.trafficSource";

function defaultPollIntervalMs() {
	if (typeof window === "undefined") {
		return 5000;
	}

	const host = window.location.hostname.toLowerCase();
	const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);

	if (host === "localhost" || host.endsWith(".lan") || host.endsWith(".local")) {
		return 1000;
	}

	if (!ipv4) {
		return 5000;
	}

	const [, aText, bText] = ipv4;
	const a = Number(aText);
	const b = Number(bText);

	if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)) {
		return 1000;
	}

	return 5000;
}

const lineOptions: ChartOptions<"line"> = {
	responsive: true,
	maintainAspectRatio: false,
	interaction: {
		intersect: false,
		mode: "index",
	},
	plugins: {
		legend: {
			position: "bottom",
			labels: {
				boxWidth: 10,
				boxHeight: 10,
				usePointStyle: true,
			},
		},
		tooltip: {
			callbacks: {
				label: (item) => `${item.dataset.label}: ${formatMbps(Number(item.raw))}`,
			},
		},
	},
	scales: {
		x: {
			grid: {
				display: false,
			},
		},
		y: {
			beginAtZero: true,
			ticks: {
				callback: (value) => formatMbps(Number(value)),
			},
		},
	},
};

const doughnutOptions: ChartOptions<"doughnut"> = {
	responsive: true,
	maintainAspectRatio: false,
	cutout: "70%",
	plugins: {
		legend: {
			display: false,
		},
		tooltip: {
			callbacks: {
				label: (item) => `${item.label}: ${formatBytes(Number(item.raw))}`,
			},
		},
	},
};

const barOptions: ChartOptions<"bar"> = {
	responsive: true,
	maintainAspectRatio: false,
	plugins: {
		legend: {
			display: false,
		},
		tooltip: {
			callbacks: {
				label: (item) => `Load: ${Number(item.raw).toFixed(2)}`,
			},
		},
	},
	scales: {
		x: {
			grid: {
				display: false,
			},
		},
		y: {
			beginAtZero: true,
		},
	},
};

export function DashboardPage({ description, title = "Dashboard" }: { description?: string; title?: string }) {
	const [status, setStatus] = useState<DashboardStatus>(emptyStatus);
	const [samples, setSamples] = useState<BandwidthSample[]>([]);
	const [rates, setRates] = useState<DeviceRate[]>([]);
	const [sparklines, setSparklines] = useState<DeviceSparkline[]>([]);
	const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
	const [loading, setLoading] = useState(true);
	const [pollIntervalMs, setPollIntervalMs] = useState(defaultPollIntervalMs);
	const [trafficSourceId, setTrafficSourceId] = useState(readTrafficSourcePreference);
	const previousStatus = useRef<DashboardStatus | null>(null);
	const previousTime = useRef<number | null>(null);
	const previousDiskStats = useRef<DiskStatEntry[] | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function refresh() {
			const nextStatus = await getDashboardStatus();
			const now = Date.now();

			if (cancelled) {
				return;
			}

			const nextRates = computeRates(nextStatus, previousStatus.current, now, previousTime.current);
			const nextTrafficRates = selectTrafficRates(nextRates, nextStatus.interfaces, trafficSourceId);
			const totals = nextTrafficRates.reduce(
				(total, rate) => ({
					rxMbps: total.rxMbps + rate.rxMbps,
					txMbps: total.txMbps + rate.txMbps,
				}),
				{ rxMbps: 0, txMbps: 0 },
			);

			// 磁盘 I/O delta 计算
			const elapsedSeconds = previousTime.current ? Math.max(1, (now - previousTime.current) / 1000) : 0;
			const { diskReadMBps, diskWriteMBps } = computeDiskRates(
				nextStatus.diskStats ?? [],
				previousDiskStats.current,
				elapsedSeconds,
			);

			// 温度：取所有 zone 中最高值
			const maxTempC = (nextStatus.thermalZones ?? []).reduce(
				(max, z) => Math.max(max, z.tempC),
				0,
			);

			setStatus(nextStatus);
			setRates(nextRates);
			setUpdatedAt(new Date(now));
			setLoading(false);
			setSamples((current) => [
				...current.slice(Math.max(0, current.length - maxSamples + 1)),
				{
					label: formatTime(now),
					rxMbps: totals.rxMbps,
					txMbps: totals.txMbps,
					load: normaliseLoad(nextStatus.system.load?.[0]),
					memory: memoryUsage(nextStatus).percent,
					diskReadMBps,
					diskWriteMBps,
					maxTempC,
					activeConnections: nextStatus.connections?.count ?? 0,
					maxConnections: nextStatus.connections?.max ?? 0,
				},
			]);

			// 更新接口 sparkline 历史（最多保留 10 个点）
			setSparklines((prev) => {
				const map = new Map(prev.map((s) => [s.name, s]));
				for (const rate of nextRates) {
					const existing = map.get(rate.name);
					map.set(rate.name, {
						name: rate.name,
						rxHistory: [...(existing?.rxHistory ?? []).slice(-9), rate.rxMbps],
						txHistory: [...(existing?.txHistory ?? []).slice(-9), rate.txMbps],
					});
				}
				return [...map.values()];
			});

			previousStatus.current = nextStatus;
			previousTime.current = now;
			previousDiskStats.current = nextStatus.diskStats ?? null;
		}

		void refresh();
		const timer = window.setInterval(() => void refresh(), pollIntervalMs);

		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [pollIntervalMs, trafficSourceId]);

	const memory = memoryUsage(status);
	const root = storageUsage(status.system.root);
	const tmp = storageUsage(status.system.tmp);
	const load1 = normaliseLoad(status.system.load?.[0]);
	const load5 = normaliseLoad(status.system.load?.[1]);
	const load15 = normaliseLoad(status.system.load?.[2]);
	const activeDevices = rates.filter((rate) => rate.carrier || rate.rxMbps > 0 || rate.txMbps > 0);
	const trafficSourceOptions = trafficSourceOptionsFor(status.interfaces);
	const selectedTrafficSource = trafficSourceOptions.find((option) => option.id === trafficSourceId) ?? trafficSourceOptions[0];
	const trafficRates = selectTrafficRates(rates, status.interfaces, trafficSourceId);
	const totalRx = trafficRates.reduce((sum, rate) => sum + rate.rxMbps, 0);
	const totalTx = trafficRates.reduce((sum, rate) => sum + rate.txMbps, 0);
	const trafficDetail = trafficRates.length
		? `${selectedTrafficSource.label}: ${trafficRates.map((rate) => rate.name).join(", ")}`
		: "Live aggregate";

	function changeTrafficSource(value: string) {
		writeTrafficSourcePreference(value);
		setTrafficSourceId(value);
		setSamples([]);
	}

	const bandwidthData = useMemo<ChartData<"line">>(
		() => ({
			labels: samples.map((sample) => sample.label),
			datasets: [
				{
					label: t("Download"),
					data: samples.map((sample) => sample.rxMbps),
					borderColor: "#0f766e",
					backgroundColor: (context: any) => {
						const chart = context.chart;
						const { ctx, chartArea } = chart;
						if (!chartArea) return "rgba(15, 118, 110, 0.12)";
						const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
						gradient.addColorStop(0, "rgba(15, 118, 110, 0.3)");
						gradient.addColorStop(1, "rgba(15, 118, 110, 0)");
						return gradient;
					},
					fill: true,
					tension: 0.35,
					pointRadius: 0,
					pointHoverRadius: 3,
				},
				{
					label: t("Upload"),
					data: samples.map((sample) => sample.txMbps),
					borderColor: "#2563eb",
					backgroundColor: (context: any) => {
						const chart = context.chart;
						const { ctx, chartArea } = chart;
						if (!chartArea) return "rgba(37, 99, 235, 0.08)";
						const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
						gradient.addColorStop(0, "rgba(37, 99, 235, 0.2)");
						gradient.addColorStop(1, "rgba(37, 99, 235, 0)");
						return gradient;
					},
					fill: true,
					tension: 0.35,
					pointRadius: 0,
					pointHoverRadius: 3,
				},
			],
		}),
		[samples],
	);

	const memoryData = useMemo<ChartData<"doughnut">>(
		() => ({
			labels: [t("Used"), t("Available")],
			datasets: [
				{
					data: [memory.used, memory.available],
					backgroundColor: ["#0f766e", "#e4e4e7"],
					borderWidth: 0,
				},
			],
		}),
		[memory.available, memory.used],
	);

	const loadData = useMemo<ChartData<"bar">>(
		() => ({
			labels: ["1 min", "5 min", "15 min"],
			datasets: [
				{
					data: [load1, load5, load15],
					backgroundColor: ["#0f766e", "#2563eb", "#71717a"],
					borderRadius: 6,
				},
			],
		}),
		[load1, load15, load5],
	);

	return (
		<div className="mx-auto grid w-full max-w-7xl min-w-0 gap-5">
			<div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="min-w-0">
					<h1 className="text-2xl font-semibold">{title}</h1>
					<p className="break-words text-sm text-muted-foreground">
						{description ?? `${status.board.hostname ?? "Router"} · ${status.board.model ?? "OpenWrt"}`}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<div className="inline-flex rounded-md border bg-card p-0.5">
						{pollOptions.map((option) => (
							<Button
								aria-pressed={pollIntervalMs === option}
								key={option}
								onClick={() => setPollIntervalMs(option)}
								size="sm"
								type="button"
								variant={pollIntervalMs === option ? "secondary" : "ghost"}
							>
								{option / 1000}s
							</Button>
						))}
					</div>
					<Badge>{status.board.release?.version ?? "OpenWrt"}</Badge>
					<Badge>{updatedAt ? `Updated ${formatTime(updatedAt.getTime())}` : "Updating"}</Badge>
				</div>
			</div>

			<div className={`grid gap-3 sm:grid-cols-2 ${(status.thermalZones ?? []).length > 0 ? 'xl:grid-cols-6' : 'xl:grid-cols-5'}`}>
				<MetricCard icon={Network} label={t("Download")} value={formatMbps(totalRx)} detail={trafficDetail} />
				<MetricCard icon={Activity} label={t("Upload")} value={formatMbps(totalTx)} detail={trafficDetail} />
				<MetricCard icon={MemoryStick} label={t("Memory")} value={`${memory.percent.toFixed(0)}%`} detail={formatBytes(memory.used)} />
				<MetricCard icon={HardDrive} label={t("Disk")} value={`${root.percent.toFixed(0)}%`} detail={t("root filesystem used")} />
				<MetricCard icon={Cpu} label={t("CPU load")} value={load1.toFixed(2)} detail={t("1 minute average")} />
				{(status.thermalZones ?? []).length > 0 && (
					<MetricCard
						icon={Thermometer}
						label={t("Temperature")}
						value={`${(samples[samples.length - 1]?.maxTempC ?? 0).toFixed(1)}°C`}
						detail={`${(status.thermalZones ?? []).length} ${t("sensors")}`}
					/>
				)}
			</div>

			<div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
				<div className="grid gap-5 h-fit">
					<Card>
						<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<CardTitle>{t("Bandwidth")}</CardTitle>
							<div className="flex flex-wrap items-center gap-2">
								<label className="text-xs text-muted-foreground" htmlFor="dashboard-traffic-source">
									{t("Source")}
								</label>
								<select
									className="h-8 max-w-full rounded-md border bg-card px-2 text-sm"
									id="dashboard-traffic-source"
									onChange={(event) => changeTrafficSource(event.target.value)}
									value={selectedTrafficSource.id}
								>
									{trafficSourceOptions.map((option) => (
										<option key={option.id} value={option.id}>
											{t(option.label)}
										</option>
									))}
								</select>
								<span className="text-xs text-muted-foreground">{t("Polls every")} {pollIntervalMs / 1000}s</span>
							</div>
						</CardHeader>
						<CardContent>
							<div className="h-72">
								{loading ? <EmptyChartLabel label={t("Loading bandwidth")} /> : <Line data={bandwidthData} options={lineOptions} />}
							</div>
						</CardContent>
					</Card>
					<ConnectionsPanel />
				</div>

				<div className="grid gap-5">
					<Card>
						<CardHeader>
							<CardTitle>{t("CPU load")}</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="h-48">
								<Bar data={loadData} options={barOptions} />
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{t("Memory")}</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-4">
							<div className="grid justify-center gap-3">
								<div className="relative h-44 w-44">
									<Doughnut data={memoryData} options={doughnutOptions} />
									<div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
										<div>
											<div className="text-2xl font-semibold">{memory.percent.toFixed(0)}%</div>
											<div className="text-xs text-muted-foreground">{t("used")}</div>
										</div>
									</div>
								</div>
								<ChartLegend
									items={[
										{ color: "#0f766e", label: `${t("Used")} ${formatBytes(memory.used)}` },
										{ color: "#e4e4e7", label: `${t("Available")} ${formatBytes(memory.available)}` },
									]}
								/>
							</div>
							<ResourceDetails
								rows={[
									[t("Total"), formatBytes(memory.total)],
									[t("Available"), formatBytes(memory.available)],
									[t("Free"), formatBytes(status.system.memory?.free ?? 0)],
									[t("Cached"), formatBytes(status.system.memory?.cached ?? 0)],
									[t("Buffered"), formatBytes(status.system.memory?.buffered ?? 0)],
									[t("Shared"), formatBytes(status.system.memory?.shared ?? 0)],
								]}
								summary={t("Memory details")}
							/>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{t("Disk Space")}</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-4 text-sm">
							<StorageMeter label={t("Root filesystem")} usage={root} />
							<StorageMeter label={t("Temporary filesystem")} usage={tmp} />
							<ResourceDetails
								rows={[
									[t("Root total"), formatBytes(root.total)],
									[t("Root used"), formatBytes(root.used)],
									[t("Root free"), formatBytes(Math.max(0, root.total - root.used))],
									[t("Temp total"), formatBytes(tmp.total)],
									[t("Temp used"), formatBytes(tmp.used)],
									[t("Temp free"), formatBytes(Math.max(0, tmp.total - tmp.used))],
								]}
								summary={t("Disk details")}
							/>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* Passwall 代理墙卡片 (10s 刷新) */}
			<div className="grid gap-5">
				<PasswallStatusCard />
			</div>

			{/* 进程 CPU / 内存实时趋势面板 (10s 刷新) */}
			<div className="grid gap-5">
				<ProcessTrendPanel />
			</div>

			{/* 温度传感器历史曲线面板 (30s 刷新) */}
			<div className="grid gap-5">
				<ThermalHistoryPanel />
			</div>

			{/* 活动 DHCP 租约 (可折叠持久化) */}
			<div className="grid gap-5">
				<CollapsibleCard
					id="dhcp-leases"
					title={t("Active DHCP Leases")}
					badge={<Badge>{status.dhcpLeases?.length ?? 0} {t("leases")}</Badge>}
				>
					<CardContent className="p-0">
						<LeaseTable leases={status.dhcpLeases ?? []} />
					</CardContent>
				</CollapsibleCard>
			</div>

			<div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(22rem,1fr)]">
				<CollapsibleCard
					id="interfaces"
					title={t("Interfaces")}
					badge={
						<Badge variant="outline" className="text-xs">
							{activeDevices.length} {t("Connected")}
						</Badge>
					}
				>
					<CardContent className="p-0">
						<div className="overflow-x-auto">
							<table className="w-full min-w-[42rem] text-left text-sm">
								<thead className="border-b text-xs uppercase text-muted-foreground">
									<tr>
										<th className="px-4 py-3 font-medium">{t("Device")}</th>
										<th className="px-4 py-3 font-medium">{t("State")}</th>
										<th className="px-4 py-3 font-medium">{t("Speed")}</th>
										<th className="px-4 py-3 text-right font-medium">{t("Download")}</th>
										<th className="px-4 py-3 text-right font-medium">{t("Upload")}</th>
										<th className="px-4 py-3 text-right font-medium">{t("Transferred")}</th>
										<th className="px-4 py-3 text-right font-medium">{t("Trend")}</th>
									</tr>
								</thead>
								<tbody>
									{activeDevices.length ? (
										activeDevices.map((device) => (
											<tr className="border-b last:border-0" key={device.name}>
												<td className="px-4 py-3 font-medium">{device.name}</td>
												<td className="px-4 py-3">
													<Badge className={device.carrier ? "text-primary" : ""}>
														{device.carrier ? t("Connected") : device.up ? "Up" : "Down"}
													</Badge>
												</td>
												<td className="px-4 py-3 text-muted-foreground">{device.speed}</td>
												<td className="px-4 py-3 text-right">{formatMbps(device.rxMbps)}</td>
												<td className="px-4 py-3 text-right">{formatMbps(device.txMbps)}</td>
												<td className="px-4 py-3 text-right text-muted-foreground">
													{formatBytes(device.rxBytes + device.txBytes)}
												</td>
												<td className="px-4 py-3 text-right">
													{(() => {
														const sl = sparklines.find((s) => s.name === device.name);
														return sl ? (
															<div className="inline-flex flex-col items-end gap-0.5">
																<Sparkline color="#0f766e" data={sl.rxHistory} />
																<Sparkline color="#2563eb" data={sl.txHistory} />
															</div>
														) : <span className="text-muted-foreground text-xs">—</span>;
													})()}
												</td>
											</tr>
										))
									) : (
										<tr>
											<td className="px-4 py-6 text-muted-foreground" colSpan={7}>
												{t("No active network devices reported by LuCI.")}
											</td>
										</tr>
									)}
								</tbody>
							</table>
						</div>
					</CardContent>
				</CollapsibleCard>

				<Card>
					<CardHeader>
						<CardTitle>{t("System")}</CardTitle>
					</CardHeader>
					<CardContent className="grid gap-4 text-sm">
						<InfoRow label={t("Uptime")} value={formatDuration(status.system.uptime ?? 0)} />
						<InfoRow label={t("Memory available")} value={formatBytes(memory.available)} />
						<InfoRow label={t("Root filesystem")} value={`${root.percent.toFixed(0)}% ${t("used")}`} />
						<InfoRow label={t("Temp filesystem")} value={`${tmp.percent.toFixed(0)}% ${t("used")}`} />
						<InfoRow label={t("Kernel")} value={status.board.release?.description ?? status.board.system ?? "Unavailable"} />
						<InfoRow label={t("Target")} value={status.board.release?.target ?? "Unavailable"} />
					</CardContent>
				</Card>
			</div>

			{/* 磁盘 I/O 速率折线图 */}
			<DiskIOCard samples={samples} />
		</div>
	);
}

function MetricCard({
	detail,
	icon: Icon,
	label,
	value,
}: {
	detail: string;
	icon: LucideIcon;
	label: string;
	value: string;
}) {
	return (
		<Card className="transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
			<CardContent className="flex items-center justify-between gap-3 p-4">
				<div className="min-w-0">
					<p className="text-sm text-muted-foreground">{label}</p>
					<p className="mt-1 truncate text-2xl font-semibold">{value}</p>
					<p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
				</div>
				<div className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-primary">
					<Icon className="size-5" />
				</div>
			</CardContent>
		</Card>
	);
}

function ChartLegend({ items }: { items: Array<{ color: string; label: string }> }) {
	return (
		<div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
			{items.map((item) => (
				<span className="inline-flex items-center gap-1.5" key={item.label}>
					<span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} />
					{item.label}
				</span>
			))}
		</div>
	);
}

function ResourceDetails({ rows, summary }: { rows: Array<[string, string]>; summary: string }) {
	return (
		<details className="rounded-md border px-3 py-2 text-sm">
			<summary className="cursor-pointer font-medium">{summary}</summary>
			<div className="mt-3 grid gap-2">
				{rows.map(([label, value]) => (
					<InfoRow key={label} label={label} value={value} />
				))}
			</div>
		</details>
	);
}

function StorageMeter({ label, usage }: { label: string; usage: ReturnType<typeof storageUsage> }) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-3">
				<span className="font-medium">{label}</span>
				<span className="text-muted-foreground">
					{formatBytes(usage.used)} / {formatBytes(usage.total)}
				</span>
			</div>
			<div className="h-2 overflow-hidden rounded-full bg-secondary">
				<div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, usage.percent)}%` }} />
			</div>
		</div>
	);
}

function AssociationTable({ associations }: { associations: WirelessAssociation[] }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[44rem] text-left text-sm">
				<thead className="border-b text-xs uppercase text-muted-foreground">
					<tr>
						<th className="px-4 py-3 font-medium">{t("Station")}</th>
						<th className="px-4 py-3 font-medium">{t("Interface")}</th>
						<th className="px-4 py-3 font-medium">{t("SSID")}</th>
						<th className="px-4 py-3 text-right font-medium">{t("Signal")}</th>
						<th className="px-4 py-3 text-right font-medium">{t("Rate")}</th>
						<th className="px-4 py-3 text-right font-medium">{t("Connected")}</th>
					</tr>
				</thead>
				<tbody>
					{associations.length ? (
						associations.map((device) => (
							<tr className="border-b last:border-0" key={`${device.interface}.${device.mac}`}>
								<td className="px-4 py-3 font-mono text-xs">{device.mac}</td>
								<td className="px-4 py-3">
									<span className="inline-flex items-center gap-2 font-medium">
										<Wifi className="size-4 text-muted-foreground" />
										{device.interface}
									</span>
								</td>
								<td className="px-4 py-3 text-muted-foreground">{device.ssid || "unknown"}</td>
								<td className="px-4 py-3 text-right">{formatSignal(device.signal, device.noise)}</td>
								<td className="px-4 py-3 text-right">{formatWirelessRate(device.rxRate, device.txRate)}</td>
								<td className="px-4 py-3 text-right text-muted-foreground">
									{formatDuration(device.connectedTime ?? 0)}
								</td>
							</tr>
						))
					) : (
						<tr>
							<td className="px-4 py-6 text-muted-foreground" colSpan={6}>
								{t("No associated Wi-Fi devices reported.")}
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

function LeaseTable({ leases }: { leases: DhcpLease[] }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[44rem] text-left text-sm">
				<thead className="border-b text-xs uppercase text-muted-foreground">
					<tr>
						<th className="px-4 py-3 font-medium">{t("Host")}</th>
						<th className="px-4 py-3 font-medium">{t("IP")}</th>
						<th className="px-4 py-3 font-medium">{t("MAC")}</th>
						<th className="px-4 py-3 text-right font-medium">{t("Expires")}</th>
					</tr>
				</thead>
				<tbody>
					{leases.length ? (
						leases.map((lease) => (
							<tr className="border-b last:border-0" key={`${lease.mac}.${lease.ip}.${lease.clientId}`}>
								<td className="px-4 py-3 font-medium">{lease.hostname || "unknown"}</td>
								<td className="px-4 py-3 font-mono text-xs">{lease.ip}</td>
								<td className="px-4 py-3 font-mono text-xs">{lease.mac}</td>
								<td className="px-4 py-3 text-right">{formatDuration(lease.remaining)}</td>
							</tr>
						))
					) : (
						<tr>
							<td className="px-4 py-6 text-muted-foreground" colSpan={4}>
								{t("No active DHCP leases found.")}
							</td>
						</tr>
					)}
				</tbody>
			</table>
		</div>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
			<span className="text-muted-foreground">{label}</span>
			<span className="max-w-64 text-right font-medium">{value}</span>
		</div>
	);
}

function EmptyChartLabel({ label }: { label: string }) {
	return <div className="grid h-full place-items-center text-sm text-muted-foreground">{label}</div>;
}

// ─── 磁盘 I/O 速率计算 ───────────────────────────────────────────────────────

function computeDiskRates(
	current: DiskStatEntry[],
	previous: DiskStatEntry[] | null,
	elapsedSeconds: number,
): { diskReadMBps: number; diskWriteMBps: number } {
	if (!previous || elapsedSeconds <= 0) {
		return { diskReadMBps: 0, diskWriteMBps: 0 };
	}

	const prevMap = new Map(previous.map((d) => [d.device, d]));
	let totalReadDelta = 0;
	let totalWriteDelta = 0;

	for (const cur of current) {
		const prev = prevMap.get(cur.device);
		if (!prev) continue;
		totalReadDelta += Math.max(0, cur.readBytes - prev.readBytes);
		totalWriteDelta += Math.max(0, cur.writeBytes - prev.writeBytes);
	}

	return {
		diskReadMBps: totalReadDelta / elapsedSeconds / 1_048_576,
		diskWriteMBps: totalWriteDelta / elapsedSeconds / 1_048_576,
	};
}

// ─── 迷你趋势线 SVG 组件 ─────────────────────────────────────────────────────

function Sparkline({ data, color = "#0f766e" }: { data: number[]; color?: string }) {
	if (data.length < 2) {
		return <span className="text-xs text-muted-foreground">—</span>;
	}

	const width = 48;
	const height = 18;
	const max = Math.max(...data, 0.001);
	const points = data
		.map((v, i) => {
			const x = (i / (data.length - 1)) * width;
			const y = height - (v / max) * height;
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg
			aria-hidden="true"
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			width={width}
			xmlns="http://www.w3.org/2000/svg"
		>
			<polyline
				fill="none"
				points={points}
				stroke={color}
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
		</svg>
	);
}

// ─── 面板折叠状态持久化与通用卡片 ─────────────────────────────────────────────

function usePanelCollapseState(panelId: string, defaultExpanded = true) {
	const storageKey = `i-love-luci.dashboard.panel.${panelId}.expanded`;
	const [expanded, setExpanded] = useState<boolean>(() => {
		if (typeof window === "undefined") return defaultExpanded;
		const saved = window.localStorage.getItem(storageKey);
		return saved !== null ? saved === "true" : defaultExpanded;
	});

	const toggle = () => {
		setExpanded((prev) => {
			const next = !prev;
			if (typeof window !== "undefined") {
				window.localStorage.setItem(storageKey, String(next));
			}
			return next;
		});
	};

	return [expanded, toggle] as const;
}

function CollapsibleCard({
	id,
	title,
	badge,
	extraHeader,
	defaultExpanded = true,
	children,
	className,
	contentClassName,
}: {
	id: string;
	title: string;
	badge?: React.ReactNode;
	extraHeader?: React.ReactNode;
	defaultExpanded?: boolean;
	children: React.ReactNode;
	className?: string;
	contentClassName?: string;
}) {
	const [expanded, toggle] = usePanelCollapseState(id, defaultExpanded);

	return (
		<Card className={cn("transition-all duration-200", className)}>
			<CardHeader
				className="flex flex-row items-center justify-between gap-3 cursor-pointer select-none py-3.5 px-4 sm:px-6"
				onClick={toggle}
			>
				<div className="flex flex-wrap items-center gap-2 min-w-0">
					<CardTitle>{title}</CardTitle>
					{badge}
				</div>
				<div className="flex items-center gap-2 shrink-0">
					{extraHeader && <div onClick={(e) => e.stopPropagation()}>{extraHeader}</div>}
					<Button
						className="h-8 w-8"
						size="icon"
						variant="ghost"
						type="button"
						aria-expanded={expanded}
						aria-label={expanded ? t("Collapse panel") : t("Expand panel")}
					>
						<ChevronRight className={cn("size-4 transition-transform duration-300", expanded && "rotate-90")} />
					</Button>
				</div>
			</CardHeader>
			<div
				className={cn(
					"grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
					expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
				)}
			>
				<div className="overflow-hidden">
					<div className={cn("border-t", contentClassName)}>
						{children}
					</div>
				</div>
			</div>
		</Card>
	);
}

// ─── 1. 网络连接追踪面板 (ConnectionsPanel - 30s 刷新) ─────────────────────────

function ConnectionsPanel() {
	const [summary, setSummary] = useState<ConntrackSummary | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function fetchSummary() {
			try {
				const data = await getConntrackSummary();
				if (!cancelled) {
					setSummary(data);
					setLoading(false);
				}
			}
			catch {
				if (!cancelled) setLoading(false);
			}
		}

		void fetchSummary();
		const timer = window.setInterval(() => void fetchSummary(), 30000);

		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, []);

	const tcp = summary?.tcp ?? 0;
	const udp = summary?.udp ?? 0;
	const icmp = summary?.icmp ?? 0;
	const other = summary?.other ?? 0;
	const total = summary?.total ?? (tcp + udp + icmp + other);
	const max = summary?.max ?? 0;
	const percent = max > 0 ? (total / max) * 100 : 0;

	const doughnutData = useMemo<ChartData<"doughnut">>(() => {
		return {
			labels: [t("TCP"), t("UDP"), t("ICMP"), t("Other")],
			datasets: [
				{
					data: [tcp, udp, icmp, other],
					backgroundColor: ["#0284c7", "#10b981", "#f59e0b", "#8b5cf6"],
					borderWidth: 0,
				},
			],
		};
	}, [icmp, other, tcp, udp]);

	const doughnutOptions: ChartOptions<"doughnut"> = {
		responsive: true,
		maintainAspectRatio: false,
		cutout: "72%",
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (item) => {
						const val = Number(item.raw) || 0;
						const pct = total > 0 ? ((val / total) * 100).toFixed(1) : "0.0";
						return `${item.label}: ${val} (${pct}%)`;
					},
				},
			},
		},
	};

	return (
		<CollapsibleCard
			id="connections-summary"
			title={t("Connection Tracking")}
			badge={
				<Badge variant="outline" className="text-xs">
					{total} {t("Connections")}
				</Badge>
			}
			extraHeader={
				<span className="text-xs text-muted-foreground hidden sm:inline">
					{t("Refreshes every 30s")}
				</span>
			}
		>
			<CardContent className="p-4 sm:p-6">
				{loading ? (
					<div className="py-8">
						<EmptyChartLabel label={t("Loading connection stats...")} />
					</div>
				) : (
					<div className="grid gap-6 md:grid-cols-[160px_1fr] items-center">
						<div className="relative mx-auto h-36 w-36 shrink-0">
							<Doughnut data={doughnutData} options={doughnutOptions} />
							<div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
								<div>
									<div className="text-xl font-bold">{total}</div>
									<div className="text-[11px] text-muted-foreground">{t("Active")}</div>
								</div>
							</div>
						</div>

						<div className="grid gap-4 min-w-0">
							{/* 容量进度条 */}
							{max > 0 && (
								<div className="grid gap-1.5">
									<div className="flex justify-between text-xs text-muted-foreground">
										<span>{t("Usage")} ({percent.toFixed(1)}%)</span>
										<span>{total} / {max} {t("max")}</span>
									</div>
									<div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
										<div
											className="h-full rounded-full bg-sky-600 transition-all duration-500"
											style={{ width: `${Math.min(100, percent)}%` }}
										/>
									</div>
								</div>
							)}

							{/* 各协议卡片 */}
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
								<div className="rounded-lg border bg-card p-2.5 shadow-xs">
									<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
										<span className="size-2 rounded-full bg-[#0284c7]" />
										<span>TCP</span>
									</div>
									<div className="mt-1 text-base font-semibold">{tcp}</div>
									<div className="text-[11px] text-muted-foreground">
										{total > 0 ? ((tcp / total) * 100).toFixed(0) : 0}%
									</div>
								</div>
								<div className="rounded-lg border bg-card p-2.5 shadow-xs">
									<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
										<span className="size-2 rounded-full bg-[#10b981]" />
										<span>UDP</span>
									</div>
									<div className="mt-1 text-base font-semibold">{udp}</div>
									<div className="text-[11px] text-muted-foreground">
										{total > 0 ? ((udp / total) * 100).toFixed(0) : 0}%
									</div>
								</div>
								<div className="rounded-lg border bg-card p-2.5 shadow-xs">
									<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
										<span className="size-2 rounded-full bg-[#f59e0b]" />
										<span>ICMP</span>
									</div>
									<div className="mt-1 text-base font-semibold">{icmp}</div>
									<div className="text-[11px] text-muted-foreground">
										{total > 0 ? ((icmp / total) * 100).toFixed(0) : 0}%
									</div>
								</div>
								<div className="rounded-lg border bg-card p-2.5 shadow-xs">
									<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
										<span className="size-2 rounded-full bg-[#8b5cf6]" />
										<span>{t("Other")}</span>
									</div>
									<div className="mt-1 text-base font-semibold">{other}</div>
									<div className="text-[11px] text-muted-foreground">
										{total > 0 ? ((other / total) * 100).toFixed(0) : 0}%
									</div>
								</div>
							</div>

							{/* TCP 状态细分 */}
							{summary?.tcpDetails && (summary.tcpDetails.established > 0 || summary.tcpDetails.timeWait > 0) && (
								<div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1 border-t">
									<span>{t("Established")}: <strong className="text-foreground">{summary.tcpDetails.established}</strong></span>
									<span>{t("Time Wait")}: <strong className="text-foreground">{summary.tcpDetails.timeWait}</strong></span>
									<span>{t("Close Wait")}: <strong className="text-foreground">{summary.tcpDetails.closeWait}</strong></span>
									<span>{t("Syn Sent")}: <strong className="text-foreground">{summary.tcpDetails.synSent}</strong></span>
								</div>
							)}
						</div>
					</div>
				)}
			</CardContent>
		</CollapsibleCard>
	);
}

// ─── 1.5 Passwall 代理墙状态卡片 (PasswallStatusCard - 10s 刷新) ────────────────

function PasswallStatusCard() {
	const [status, setStatus] = useState<PasswallStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [toggling, setToggling] = useState(false);
	const [restarting, setRestarting] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function fetchStatus() {
			try {
				const data = await getPasswallStatus();
				if (!cancelled) {
					setStatus(data);
					setLoading(false);
				}
			}
			catch {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		void fetchStatus();
		const interval = window.setInterval(() => {
			void fetchStatus();
		}, 10000);

		return () => {
			cancelled = true;
			window.clearInterval(interval);
		};
	}, []);

	async function handleToggle() {
		if (!status) return;
		const nextState = !status.enabled;
		setToggling(true);
		try {
			const res = await togglePasswall(nextState);
			if (res.ok) {
				toast.success(nextState ? t("Activate passwall") : t("Deactivate passwall"));
				const updated = await getPasswallStatus();
				setStatus(updated);
			}
			else {
				toast.error(t("Operation failed"));
			}
		}
		catch (e) {
			toast.error(e instanceof Error ? e.message : t("Operation failed"));
		}
		finally {
			setToggling(false);
		}
	}

	async function handleRestart() {
		setRestarting(true);
		try {
			const res = await restartPasswall();
			if (res.ok) {
				toast.success(t("Passwall restarted"));
				const updated = await getPasswallStatus();
				setStatus(updated);
			}
			else {
				toast.error(t("Operation failed"));
			}
		}
		catch (e) {
			toast.error(e instanceof Error ? e.message : t("Operation failed"));
		}
		finally {
			setRestarting(false);
		}
	}

	if (!loading && (!status || status.installed === false)) {
		return null;
	}

	const isRunning = Boolean(status?.running && status?.enabled);
	const modeLabel = status?.mode === "0" ? t("Global proxy") : status?.mode === "1" ? t("Direct") : t("Bypass mainland China");

	return (
		<CollapsibleCard
			id="passwall-status"
			title={t("Passwall")}
			badge={
				loading ? (
					<Badge variant="outline" className="text-xs">
						<Loader2 className="mr-1 size-3 animate-spin" />
						{t("Loading...")}
					</Badge>
				) : (
					<Badge className={isRunning ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-medium border-emerald-500/20" : "bg-muted text-muted-foreground"}>
						<span className={cn("mr-1.5 size-1.5 rounded-full inline-block", isRunning ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground")} />
						{isRunning ? t("Running") : status?.enabled ? t("Stopped") : t("Disabled")}
					</Badge>
				)
			}
			extraHeader={
				<span className="text-xs text-muted-foreground hidden sm:inline">
					{t("Refreshes every 10s")}
				</span>
			}
		>
			<CardContent className="p-4 sm:p-6 grid gap-5">
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
					{/* 当前主节点 */}
					<div className="rounded-lg border bg-card p-3.5 shadow-xs flex flex-col justify-between">
						<div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
							<span>{t("Main Node")}</span>
							{status?.mainNode?.type && (
								<Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
									{status.mainNode.type}
								</Badge>
							)}
						</div>
						<div className="font-semibold text-sm truncate" title={status?.mainNode?.remarks || t("None")}>
							{status?.mainNode?.remarks || t("None")}
						</div>
						<div className="text-xs font-mono text-muted-foreground truncate mt-1">
							{status?.mainNode?.address ? `${status.mainNode.address}:${status.mainNode.port}` : "—"}
						</div>
					</div>

					{/* 代理核心 */}
					<div className="rounded-lg border bg-card p-3.5 shadow-xs flex flex-col justify-between">
						<div className="text-xs text-muted-foreground mb-1">{t("Core Type")}</div>
						<div className="font-semibold text-sm flex items-center gap-1.5">
							<span className="capitalize">{status?.coreType || "Xray"}</span>
							{status?.coreVersion && (
								<span className="text-xs font-mono text-muted-foreground">v{status.coreVersion}</span>
							)}
						</div>
						<div className="text-xs text-muted-foreground mt-1">
							{status?.pid ? `${t("PID")}: ${status.pid}` : t("Idle")}
						</div>
					</div>

					{/* 代理模式 */}
					<div className="rounded-lg border bg-card p-3.5 shadow-xs flex flex-col justify-between">
						<div className="text-xs text-muted-foreground mb-1">{t("Proxy Mode")}</div>
						<div className="font-semibold text-sm">{modeLabel}</div>
						<div className="text-xs text-muted-foreground mt-1">
							{status?.enabled ? t("Active") : t("Inactive")}
						</div>
					</div>

					{/* 节点与订阅统计 */}
					<div className="rounded-lg border bg-card p-3.5 shadow-xs flex flex-col justify-between">
						<div className="text-xs text-muted-foreground mb-1">{t("Stats")}</div>
						<div className="font-semibold text-sm">
							{status?.nodeCount ?? 0} {t("Nodes")} · {status?.subscriptionCount ?? 0} {t("Subscriptions")}
						</div>
						<div className="text-xs text-muted-foreground mt-1">
							{status?.subscriptionCount ? `${status.subscriptionCount} ${t("active sources")}` : t("No subscriptions")}
						</div>
					</div>
				</div>

				<div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
					<div className="flex items-center gap-2">
						<Button
							size="sm"
							variant={status?.enabled ? "outline" : "default"}
							disabled={toggling || loading}
							onClick={() => void handleToggle()}
						>
							{toggling ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Power className="mr-1.5 size-3.5" />}
							{status?.enabled ? t("Deactivate passwall") : t("Activate passwall")}
						</Button>
						<Button
							size="sm"
							variant="outline"
							disabled={restarting || loading || !status?.enabled}
							onClick={() => void handleRestart()}
						>
							{restarting ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 size-3.5" />}
							{t("Restart")}
						</Button>
					</div>
					<Link
						to="/native/service/passwall/nodes"
						className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-secondary px-3 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
					>
						{t("Manage Nodes")}
						<ChevronRight className="size-3.5" />
					</Link>
				</div>
			</CardContent>
		</CollapsibleCard>
	);
}

// ─── 2. 进程 CPU/内存实时趋势面板 (ProcessTrendPanel - 10s 刷新) ───────────────

type ProcessHistoryPoint = {
	time: string;
	pids: Record<string, number>;
};

const PROCESS_COLORS = ["#0f766e", "#2563eb", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#64748b"];

function ProcessTrendPanel() {
	const [stats, setStats] = useState<ProcessStats | null>(null);
	const [history, setHistory] = useState<ProcessHistoryPoint[]>([]);
	const [activeTab, setActiveTab] = useState<"trend" | "cpu" | "mem">("trend");

	useEffect(() => {
		let cancelled = false;

		async function fetchStats() {
			try {
				const data = await getProcessStats();
				if (cancelled) return;

				setStats(data);
				const now = Date.now();
				const timeLabel = formatTime(now);

				const pointMap: Record<string, number> = {};
				for (const proc of (data.topCpu ?? []).slice(0, 5)) {
					const key = `${proc.name} (${proc.pid})`;
					pointMap[key] = proc.cpu;
				}

				setHistory((prev) => [
					...prev.slice(Math.max(0, prev.length - 17)),
					{ time: timeLabel, pids: pointMap },
				]);
			}
			catch {
				// 忽略请求错误
			}
		}

		void fetchStats();
		const timer = window.setInterval(() => void fetchStats(), 10000);

		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, []);

	const topKeys = useMemo(() => {
		const keySet = new Set<string>();
		for (let i = history.length - 1; i >= 0; i--) {
			for (const k of Object.keys(history[i].pids)) {
				keySet.add(k);
				if (keySet.size >= 5) break;
			}
			if (keySet.size >= 5) break;
		}
		return Array.from(keySet);
	}, [history]);

	const lineData = useMemo<ChartData<"line">>(() => {
		return {
			labels: history.map((h) => h.time),
			datasets: topKeys.map((key, i) => {
				const color = PROCESS_COLORS[i % PROCESS_COLORS.length];
				return {
					label: key,
					data: history.map((h) => h.pids[key] ?? 0),
					borderColor: color,
					backgroundColor: `${color}15`,
					fill: false,
					tension: 0.35,
					pointRadius: history.length > 10 ? 0 : 2,
					pointHoverRadius: 4,
				};
			}),
		};
	}, [history, topKeys]);

	const lineOptions: ChartOptions<"line"> = {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { intersect: false, mode: "index" },
		plugins: {
			legend: {
				position: "bottom",
				labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true },
			},
			tooltip: {
				callbacks: {
					label: (item) => `${item.dataset.label}: ${Number(item.raw).toFixed(1)}% CPU`,
				},
			},
		},
		scales: {
			x: { grid: { display: false } },
			y: {
				beginAtZero: true,
				ticks: { callback: (v) => `${Number(v).toFixed(0)}%` },
			},
		},
	};

	return (
		<CollapsibleCard
			id="process-trend"
			title={t("Process Monitor")}
			badge={
				<Badge variant="outline" className="text-xs">
					{stats?.processes?.length ?? 0} {t("Top Processes")}
				</Badge>
			}
			extraHeader={
				<div className="flex items-center gap-2">
					<div className="inline-flex rounded-md border bg-muted p-0.5 text-xs">
						<button
							type="button"
							className={cn(
								"px-2 py-0.5 rounded text-xs transition-colors cursor-pointer",
								activeTab === "trend" ? "bg-background shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
							)}
							onClick={() => setActiveTab("trend")}
						>
							{t("Trend")}
						</button>
						<button
							type="button"
							className={cn(
								"px-2 py-0.5 rounded text-xs transition-colors cursor-pointer",
								activeTab === "cpu" ? "bg-background shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
							)}
							onClick={() => setActiveTab("cpu")}
						>
							{t("Top CPU")}
						</button>
						<button
							type="button"
							className={cn(
								"px-2 py-0.5 rounded text-xs transition-colors cursor-pointer",
								activeTab === "mem" ? "bg-background shadow-xs font-medium" : "text-muted-foreground hover:text-foreground"
							)}
							onClick={() => setActiveTab("mem")}
						>
							{t("Top Memory")}
						</button>
					</div>
					<span className="text-xs text-muted-foreground hidden sm:inline">
						{t("Refreshes every 10s")}
					</span>
				</div>
			}
		>
			<CardContent className="p-4 sm:p-6">
				{activeTab === "trend" ? (
					<div className="h-56">
						{history.length < 2 ? (
							<EmptyChartLabel label={t("Collecting process data...")} />
						) : (
							<Line data={lineData} options={lineOptions} />
						)}
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="w-full min-w-[36rem] text-left text-sm">
							<thead className="border-b text-xs uppercase text-muted-foreground">
								<tr>
									<th className="px-3 py-2 font-medium">PID</th>
									<th className="px-3 py-2 font-medium">{t("User")}</th>
									<th className="px-3 py-2 font-medium">{t("Command")}</th>
									<th className="px-3 py-2 text-right font-medium">{t("CPU %")}</th>
									<th className="px-3 py-2 text-right font-medium">{t("Memory %")}</th>
								</tr>
							</thead>
							<tbody>
								{((activeTab === "cpu" ? stats?.topCpu : stats?.topMem) ?? []).map((p) => (
									<tr key={`${p.pid}-${p.name}`} className="border-b last:border-0 hover:bg-muted/40">
										<td className="px-3 py-2 font-mono text-xs text-muted-foreground">{p.pid}</td>
										<td className="px-3 py-2 text-xs">{p.user}</td>
										<td className="px-3 py-2 font-medium truncate max-w-[18rem]" title={p.command}>
											{p.name}
										</td>
										<td className="px-3 py-2 text-right font-mono text-xs font-semibold">
											{p.cpu.toFixed(1)}%
										</td>
										<td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
											{p.mem.toFixed(1)}%
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</CardContent>
		</CollapsibleCard>
	);
}

// ─── 3. 温度历史时序曲线面板 (ThermalHistoryPanel - 30s 刷新) ───────────────────

function ThermalHistoryPanel() {
	const [thermalData, setThermalData] = useState<ThermalHistoryResult | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function fetchThermal() {
			try {
				const result = await getThermalHistory();
				if (!cancelled) {
					setThermalData(result);
					setLoading(false);
				}
			}
			catch {
				if (!cancelled) setLoading(false);
			}
		}

		void fetchThermal();
		const timer = window.setInterval(() => void fetchThermal(), 30000);

		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, []);

	const THERMAL_COLORS = ["#f97316", "#ef4444", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

	const sensors = thermalData?.sensors ?? [];
	const history = thermalData?.history ?? [];

	const chartData = useMemo<ChartData<"line">>(() => {
		const labels = history.map((h) => formatTime(h.timestamp * 1000));
		const datasets = sensors.map((sensorName, i) => {
			const color = THERMAL_COLORS[i % THERMAL_COLORS.length];
			return {
				label: sensorName,
				data: history.map((h) => h.sensors?.[sensorName] ?? null),
				borderColor: color,
				backgroundColor: `${color}18`,
				fill: false,
				tension: 0.35,
				pointRadius: history.length > 20 ? 0 : 2,
				pointHoverRadius: 4,
				spanGaps: true,
			};
		});

		return { labels, datasets };
	}, [history, sensors]);

	const chartOptions: ChartOptions<"line"> = {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { intersect: false, mode: "index" },
		plugins: {
			legend: {
				position: "bottom",
				labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true },
			},
			tooltip: {
				callbacks: {
					label: (item) => `${item.dataset.label}: ${Number(item.raw).toFixed(1)}°C`,
				},
			},
		},
		scales: {
			x: { grid: { display: false } },
			y: {
				beginAtZero: false,
				ticks: { callback: (v) => `${Number(v).toFixed(0)}°C` },
			},
		},
	};

	const sensorStats = useMemo(() => {
		return sensors.map((s) => {
			const values = history
				.map((h) => h.sensors?.[s])
				.filter((v): v is number => typeof v === "number" && !isNaN(v));
			const current = values.length
				? values[values.length - 1]
				: (thermalData?.current?.find((z) => z.type === s)?.tempC ?? 0);
			const max = values.length ? Math.max(...values) : current;
			const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : current;
			return { name: s, current, max, avg };
		});
	}, [history, sensors, thermalData?.current]);

	if (!loading && sensors.length === 0 && (thermalData?.current ?? []).length === 0) {
		return null;
	}

	return (
		<CollapsibleCard
			id="thermal-history"
			title={t("Thermal History (Last 30 min)")}
			badge={
				<Badge variant="outline" className="text-xs">
					{sensors.length} {t("Sensors")}
				</Badge>
			}
			extraHeader={
				<span className="text-xs text-muted-foreground hidden sm:inline">
					{t("Refreshes every 30s")}
				</span>
			}
		>
			<CardContent className="p-4 sm:p-6 grid gap-6">
				{sensorStats.length > 0 && (
					<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
						{sensorStats.map((st, i) => (
							<div key={st.name} className="rounded-lg border bg-card p-3 shadow-xs">
								<div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground truncate" title={st.name}>
									<span
										className="size-2.5 shrink-0 rounded-full"
										style={{ backgroundColor: THERMAL_COLORS[i % THERMAL_COLORS.length] }}
									/>
									<span className="truncate">{st.name}</span>
								</div>
								<div className="mt-1.5 flex items-baseline justify-between">
									<span className="text-xl font-bold">{st.current.toFixed(1)}°C</span>
									<span className="text-xs text-muted-foreground">
										{t("Max")}: {st.max.toFixed(1)}°C
									</span>
								</div>
								<div className="mt-1 text-[11px] text-muted-foreground">
									{t("Average")}: {st.avg.toFixed(1)}°C
								</div>
							</div>
						))}
					</div>
				)}

				<div className="h-56">
					{history.length < 2 ? (
						<EmptyChartLabel label={t("Collecting thermal history...")} />
					) : (
						<Line data={chartData} options={chartOptions} />
					)}
				</div>
			</CardContent>
		</CollapsibleCard>
	);
}

// ─── 磁盘 I/O 速率折线图卡片 ──────────────────────────────────────────────────

const diskLineOptions: ChartOptions<"line"> = {
	responsive: true,
	maintainAspectRatio: false,
	interaction: { intersect: false, mode: "index" },
	plugins: {
		legend: {
			position: "bottom",
			labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true },
		},
		tooltip: {
			callbacks: {
				label: (item) =>
					`${t(item.dataset.label ?? "")}: ${Number(item.raw).toFixed(2)} MB/s`,
			},
		},
	},
	scales: {
		x: { grid: { display: false } },
		y: {
			beginAtZero: true,
			ticks: { callback: (v) => `${Number(v).toFixed(1)} MB/s` },
		},
	},
};

function DiskIOCard({ samples }: { samples: BandwidthSample[] }) {
	const diskData = useMemo<ChartData<"line">>(
		() => ({
			labels: samples.map((s) => s.label),
			datasets: [
				{
					label: t("Read"),
					data: samples.map((s) => s.diskReadMBps),
					borderColor: "#7c3aed",
					backgroundColor: "rgb(124 58 237 / 0.10)",
					fill: true,
					tension: 0.35,
					pointRadius: 0,
					pointHoverRadius: 3,
				},
				{
					label: t("Write"),
					data: samples.map((s) => s.diskWriteMBps),
					borderColor: "#db2777",
					backgroundColor: "rgb(219 39 119 / 0.08)",
					fill: true,
					tension: 0.35,
					pointRadius: 0,
					pointHoverRadius: 3,
				},
			],
		}),
		[samples],
	);

	const hasData = samples.some((s) => s.diskReadMBps > 0 || s.diskWriteMBps > 0);

	if (!hasData && samples.length > 3) {
		return null;
	}

	return (
		<CollapsibleCard
			id="disk-io"
			title={t("Disk I/O")}
		>
			<CardContent className="p-4 sm:p-6">
				<div className="h-48">
					{samples.length < 2 ? (
						<EmptyChartLabel label={t("Collecting disk I/O data...")} />
					) : (
						<Line data={diskData} options={diskLineOptions} />
					)}
				</div>
			</CardContent>
		</CollapsibleCard>
	);
}

function computeRates(
	status: DashboardStatus,
	previous: DashboardStatus | null,
	now: number,
	previousTimestamp: number | null,
): DeviceRate[] {
	const devices = Object.entries(status.devices)
		.filter(([name, device]) => isDashboardDevice(name, device))
		.sort(([left], [right]) => left.localeCompare(right));
	const elapsedSeconds = previousTimestamp ? Math.max(1, (now - previousTimestamp) / 1000) : 0;

	return devices.map(([name, device]) => {
		const stats = device.statistics ?? {};
		const previousStats = previous?.devices[name]?.statistics;
		const rxBytes = stats.rx_bytes ?? 0;
		const txBytes = stats.tx_bytes ?? 0;
		const rxDelta = previousStats ? Math.max(0, rxBytes - (previousStats.rx_bytes ?? 0)) : 0;
		const txDelta = previousStats ? Math.max(0, txBytes - (previousStats.tx_bytes ?? 0)) : 0;

		return {
			name,
			rxMbps: elapsedSeconds ? bytesToMbps(rxDelta, elapsedSeconds) : 0,
			txMbps: elapsedSeconds ? bytesToMbps(txDelta, elapsedSeconds) : 0,
			rxBytes,
			txBytes,
			up: Boolean(device.up),
			carrier: Boolean(device.carrier),
			speed: formatSpeed(device.speed),
		};
	});
}

function isDashboardDevice(name: string, device: DeviceStatus) {
	if (name === "lo" || !device.present) {
		return false;
	}

	if (device.devtype === "ethernet") {
		return true;
	}

	return Boolean(device.statistics && !device["bridge-members"]?.length);
}

function selectTrafficRates(rates: DeviceRate[], interfaces?: NetworkInterfaceStatus[], trafficSourceId = "all") {
	const source = trafficSourceOptionsFor(interfaces).find((option) => option.id === trafficSourceId);
	const deviceNames = source && !source.default ? source.deviceNames : defaultRouteDeviceNames(interfaces);
	const selectedRates = deviceNames
		.map((name) => rates.find((rate) => rate.name === name))
		.filter((rate): rate is DeviceRate => Boolean(rate));

	if (source && !source.default) {
		return selectedRates;
	}

	return selectedRates.length ? selectedRates : rates;
}

function trafficSourceOptionsFor(interfaces?: NetworkInterfaceStatus[]): TrafficSourceOption[] {
	const options: TrafficSourceOption[] = [
		{
			id: "all",
			label: "All WAN",
			detail: "Default WAN interfaces",
			deviceNames: defaultRouteDeviceNames(interfaces),
			default: true,
		},
	];
	const seen = new Set<string>();

	for (const iface of interfaces ?? []) {
		if (!iface.up || !isInternetFacingInterface(iface)) {
			continue;
		}

		const l3Name = iface.l3_device;
		const physName = iface.device;

		if (physName && physName !== "lo" && !seen.has(physName)) {
			seen.add(physName);
			options.push({
				id: physName,
				label: iface.interface && iface.interface !== physName ? `${physName} via ${iface.interface}` : physName,
				detail: "Physical interface (Recommended)",
				deviceNames: [physName],
			});
		}

		if (l3Name && l3Name !== "lo" && l3Name !== physName && !seen.has(l3Name)) {
			seen.add(l3Name);
			options.push({
				id: l3Name,
				label: iface.interface && iface.interface !== l3Name ? `${l3Name} via ${iface.interface}` : l3Name,
				detail: "Virtual interface (May bypass offloaded traffic)",
				deviceNames: [l3Name],
			});
		}
	}

	return options;
}

function defaultRouteDeviceNames(interfaces?: NetworkInterfaceStatus[]) {
	const names = new Set<string>();

	for (const iface of interfaces ?? []) {
		if (!iface.up || !isInternetFacingInterface(iface)) {
			continue;
		}

		// Prefer physical device (iface.device) because hardware/software 
		// flow offloading bypasses virtual L3 devices (like pppoe-wan),
		// which results in inaccurate traffic statistics.
		const deviceName = iface.device || iface.l3_device;

		if (deviceName && deviceName !== "lo") {
			names.add(deviceName);
		}
	}

	return [...names];
}

function isInternetFacingInterface(iface: NetworkInterfaceStatus) {
	if (iface.route?.some((route) => route.mask === 0 && (route.target === "0.0.0.0" || route.target === "::"))) {
		return true;
	}

	const interfaceName = iface.interface ?? "";
	const deviceName = iface.l3_device || iface.device || "";

	return (
		/^(wan|wwan|lte|cellular|modem|wg|vpn|tun)/i.test(interfaceName) ||
		/^(pppoe-|wg|tun|wwan|lte|cellular|modem)/i.test(deviceName) ||
		/^(pppoe|wireguard|qmi|ncm|wwan|3g|lte|modemmanager|pptp|l2tp)$/i.test(iface.proto ?? "")
	);
}

function readTrafficSourcePreference() {
	if (typeof window === "undefined") {
		return "all";
	}

	return window.localStorage.getItem(trafficSourceStorageKey) || "all";
}

function writeTrafficSourcePreference(value: string) {
	if (typeof window === "undefined") {
		return;
	}

	window.localStorage.setItem(trafficSourceStorageKey, value);
}

function memoryUsage(status: DashboardStatus) {
	const total = status.system.memory?.total ?? 0;
	const available = status.system.memory?.available ?? status.system.memory?.free ?? 0;
	const used = Math.max(0, total - available);

	return {
		total,
		available,
		used,
		percent: total ? (used / total) * 100 : 0,
	};
}

function storageUsage(storage?: { total?: number; used?: number; free?: number; avail?: number }) {
	const total = storage?.total ?? 0;
	const used = storage?.used ?? Math.max(0, total - (storage?.avail ?? storage?.free ?? 0));

	return {
		total,
		used,
		percent: total ? (used / total) * 100 : 0,
	};
}

function normaliseLoad(value?: number) {
	if (!value) {
		return 0;
	}

	return value > 32 ? value / 65536 : value;
}

function bytesToMbps(bytes: number, elapsedSeconds: number) {
	return (bytes * 8) / elapsedSeconds / 1_000_000;
}

function formatMbps(value: number) {
	if (value >= 1000) {
		return `${(value / 1000).toFixed(2)} Gbps`;
	}

	if (value >= 10) {
		return `${value.toFixed(1)} Mbps`;
	}

	return `${value.toFixed(2)} Mbps`;
}

function formatBytes(value: number) {
	if (!value) {
		return "0 B";
	}

	const units = ["B", "KB", "MB", "GB", "TB"];
	const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
	const scaled = value / 1024 ** index;

	return `${scaled >= 10 || index === 0 ? scaled.toFixed(0) : scaled.toFixed(1)} ${units[index]}`;
}

function formatDuration(seconds: number) {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	if (days) {
		return `${days}d ${hours}h`;
	}

	if (hours) {
		return `${hours}h ${minutes}m`;
	}

	return `${minutes}m`;
}

function formatSpeed(speed?: string | number) {
	if (!speed) {
		return "Unknown";
	}

	return typeof speed === "number" ? `${speed} Mbps` : String(speed);
}

function formatSignal(signal?: number | null, noise?: number | null) {
	if (signal == null) {
		return "Unknown";
	}

	return noise == null ? `${signal} dBm` : `${signal} dBm / ${noise} dBm`;
}

function formatWirelessRate(rxRate?: number | null, txRate?: number | null) {
	if (rxRate == null && txRate == null) {
		return "Unknown";
	}

	const rx = rxRate == null ? "?" : `${rxRate} Mbps`;
	const tx = txRate == null ? "?" : `${txRate} Mbps`;

	return `${rx} down / ${tx} up`;
}

function formatTime(timestamp: number) {
	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(timestamp);
}
