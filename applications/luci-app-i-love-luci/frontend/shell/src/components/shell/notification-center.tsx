import { AlertCircle, AlertTriangle, Bell, Info, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { getSystemEvents, type SystemEvent } from "@/lib/rpc";

// 每 30 秒轮询一次系统事件
const POLL_INTERVAL_MS = 30_000;
// 最多显示最近 30 条事件
const MAX_DISPLAY = 30;
// localStorage key：记录用户最后查看的事件时间戳字符串，用于计算未读数
const LAST_READ_KEY = "i-love-luci.notifications.lastRead";

function readLastReadTime(): string {
	try {
		return window.localStorage.getItem(LAST_READ_KEY) ?? "";
	} catch {
		return "";
	}
}

function writeLastReadTime(timeStr: string) {
	try {
		window.localStorage.setItem(LAST_READ_KEY, timeStr);
	} catch {
		// 忽略 localStorage 异常
	}
}

const levelIcon: Record<SystemEvent["level"], React.ReactNode> = {
	info:    <Info className="size-3.5 text-blue-400 shrink-0 mt-0.5" />,
	warning: <AlertTriangle className="size-3.5 text-yellow-400 shrink-0 mt-0.5" />,
	error:   <AlertCircle className="size-3.5 text-red-400 shrink-0 mt-0.5" />,
};

const levelBg: Record<SystemEvent["level"], string> = {
	info:    "",
	warning: "bg-yellow-500/5",
	error:   "bg-red-500/8",
};

export function NotificationCenter() {
	const [events, setEvents] = useState<SystemEvent[]>([]);
	const [open, setOpen] = useState(false);
	const [lastRead, setLastRead] = useState(readLastReadTime);
	const panelRef = useRef<HTMLDivElement>(null);

	// 计算未读数（timeStr 字符串比较，比 lastRead 更新的条目视为未读）
	const unreadCount = events.filter((e) => !lastRead || e.timeStr > lastRead).length;

	const fetchEvents = useCallback(async () => {
		const data = await getSystemEvents(MAX_DISPLAY + 20);
		setEvents(data.slice(-MAX_DISPLAY));
	}, []);

	// 初始加载 + 定期轮询
	useEffect(() => {
		void fetchEvents();
		const timer = window.setInterval(() => void fetchEvents(), POLL_INTERVAL_MS);
		return () => window.clearInterval(timer);
	}, [fetchEvents]);

	// 点击外部关闭面板
	useEffect(() => {
		if (!open) return;

		function handleClick(event: MouseEvent) {
			if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		}

		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	function togglePanel() {
		if (!open) {
			// 打开时标记已读
			const latest = events[events.length - 1];
			if (latest) {
				writeLastReadTime(latest.timeStr);
				setLastRead(latest.timeStr);
			}
		}
		setOpen((prev) => !prev);
	}

	function clearNotifications() {
		const latest = events[events.length - 1];
		if (latest) {
			writeLastReadTime(latest.timeStr);
			setLastRead(latest.timeStr);
		}
		setOpen(false);
	}

	return (
		<div className="relative" ref={panelRef}>
			{/* 铃铛按钮 */}
			<button
				aria-expanded={open}
				aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
				className="relative hidden h-9 w-9 items-center justify-center rounded-md border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:flex"
				type="button"
				onClick={togglePanel}
			>
				<Bell className="size-4" />
				{unreadCount > 0 && (
					<span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
						{unreadCount > 99 ? "99+" : unreadCount}
					</span>
				)}
			</button>

			{/* 通知面板下拉 */}
			{open && (
				<div className="absolute right-0 top-11 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-lg border bg-card shadow-xl">
					{/* 面板标题 */}
					<div className="flex items-center justify-between border-b px-4 py-3">
						<span className="text-sm font-semibold">System Events</span>
						<div className="flex items-center gap-2">
							<button
								className="text-xs text-muted-foreground hover:text-foreground transition-colors"
								type="button"
								onClick={clearNotifications}
							>
								Mark all read
							</button>
							<button
								aria-label="Close notifications"
								className="rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
								type="button"
								onClick={() => setOpen(false)}
							>
								<X className="size-4" />
							</button>
						</div>
					</div>

					{/* 事件列表 */}
					<div className="max-h-96 overflow-y-auto">
						{events.length === 0 ? (
							<div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-sm text-muted-foreground">
								<Bell className="size-8 opacity-30" />
								<p>No recent system events</p>
							</div>
						) : (
							<ul>
								{[...events].reverse().map((event, index) => {
									const isUnread = !lastRead || event.timeStr > lastRead;
									return (
										<li
											key={`${event.timeStr}-${index}`}
											className={[
												"flex gap-2.5 border-b px-4 py-3 last:border-0 text-sm",
												levelBg[event.level],
												isUnread ? "bg-primary/5" : "",
											].join(" ")}
										>
											{levelIcon[event.level]}
											<div className="min-w-0 flex-1">
												<div className="flex items-center justify-between gap-2">
													<span className="font-medium truncate text-xs text-muted-foreground">
														{event.source}
													</span>
													<span className="shrink-0 text-xs text-muted-foreground">
														{event.timeStr.split(" ").slice(-1)[0]}
													</span>
												</div>
												<p className="mt-0.5 break-words text-xs leading-relaxed">
													{event.message}
												</p>
											</div>
											{isUnread && (
												<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
											)}
										</li>
									);
								})}
							</ul>
						)}
					</div>

					{/* 底部说明 */}
					<div className="border-t px-4 py-2.5 text-xs text-muted-foreground">
						Last {MAX_DISPLAY} events from system log · Refreshes every 30s
					</div>
				</div>
			)}
		</div>
	);
}
