import { Plus, SquareTerminal, X, ExternalLink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { buildConsoleEmbeddedUrl, buildConsoleFallbackUrl } from "@/lib/console-url";
import {
	closeConsole,
	getConsoleLaunch,
	getConsoleStatus,
	pollConsole,
	resizeConsole,
	writeConsole,
	type ConsoleLaunch,
	type ConsoleStatus,
} from "@/lib/rpc";
import { t } from "@/lib/i18n";

// 最多支持 2 个并发 PTY 会话
const MAX_SESSIONS = 2;

type ConsoleState = "idle" | "loading" | "ready" | "unavailable" | "error";

type ConsoleTab = {
	id: string;
	label: string;
	state: ConsoleState;
	launch: ConsoleLaunch | null;
};

function makeTabId() {
	return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ConsolePage() {
	const [searchParams] = useSearchParams();
	const autoLaunch = searchParams.get("launch") === "1";
	const [status, setStatus] = useState<ConsoleStatus | null>(null);
	const [tabs, setTabs] = useState<ConsoleTab[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);

	// 根据 tabId 更新单个 tab 的字段
	function updateTab(id: string, patch: Partial<ConsoleTab>) {
		setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
	}

	const launchSession = useCallback(
		async (tabId: string, knownStatus?: ConsoleStatus | null) => {
			updateTab(tabId, { state: "loading" });
			try {
				const nextStatus = knownStatus ?? (await getConsoleStatus());
				setStatus(nextStatus);

				if (!nextStatus.available || !nextStatus.enabled) {
					updateTab(tabId, { state: "unavailable" });
					return;
				}

				const nextLaunch = await getConsoleLaunch();
				const hasDirectFallback = !!buildConsoleFallbackUrl(nextLaunch, window.location.hostname);
				const ready =
					nextLaunch.available &&
					nextLaunch.enabled &&
					(hasDirectFallback || !!nextLaunch.sessionId);
				updateTab(tabId, { state: ready ? "ready" : "unavailable", launch: nextLaunch });
			} catch {
				updateTab(tabId, { state: "error" });
			}
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	// 初始化：读取 console status，按需自动启动
	useEffect(() => {
		let cancelled = false;

		async function init() {
			try {
				const nextStatus = await getConsoleStatus();
				if (cancelled) return;
				setStatus(nextStatus);

				if (autoLaunch) {
					const firstTab: ConsoleTab = {
						id: makeTabId(),
						label: "Session 1",
						state: "loading",
						launch: null,
					};
					setTabs([firstTab]);
					setActiveTabId(firstTab.id);
					await launchSession(firstTab.id, nextStatus);
				}
			} catch {
				if (!cancelled) setStatus(null);
			}
		}

		void init();
		return () => {
			cancelled = true;
		};
	}, [autoLaunch, launchSession]);

	// 新建 tab
	function addTab() {
		if (tabs.length >= MAX_SESSIONS) return;
		const id = makeTabId();
		const label = `Session ${tabs.length + 1}`;
		const newTab: ConsoleTab = { id, label, state: "idle", launch: null };
		setTabs((prev) => [...prev, newTab]);
		setActiveTabId(id);
	}

	// 关闭 tab
	function closeTab(tabId: string) {
		const tab = tabs.find((t) => t.id === tabId);
		if (tab?.launch?.sessionId) {
			void closeConsole(tab.launch.sessionId);
		}
		setTabs((prev) => {
			const next = prev.filter((t) => t.id !== tabId);
			if (activeTabId === tabId) {
				setActiveTabId(next.length ? next[next.length - 1].id : null);
			}
			return next;
		});
	}

	const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

	// 初始空状态：没有任何 tab 时，显示启动界面
	if (tabs.length === 0) {
		return (
			<div className="mx-auto grid w-full max-w-7xl gap-5">
				<div className="flex items-center gap-3 border-b pb-3">
					<div className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
						<SquareTerminal className="size-4" />
					</div>
					<div>
						<h1 className="text-lg font-semibold">{t("Router console")}</h1>
						<p className="text-sm text-muted-foreground">
							{status?.transport === "tunnel"
								? t("Same-origin terminal tunnel through the authenticated I Love LuCI session.")
								: t("Trusted-LAN direct console fallback.")}
						</p>
					</div>
				</div>
				<div className="relative flex flex-col items-center justify-center gap-5 rounded-xl border bg-gradient-to-b from-black/5 to-transparent py-20 text-center overflow-hidden">
					<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50"></div>
					<div className="relative grid size-16 place-items-center rounded-2xl bg-black/5 shadow-inner ring-1 ring-black/10">
						<SquareTerminal className="size-8 text-primary/80" />
					</div>
					<div className="relative z-10 space-y-1">
						<h3 className="text-lg font-medium">{t("No active sessions")}</h3>
						<p className="text-sm text-muted-foreground">{t("Open the console to start a new command line session.")}</p>
					</div>
					<Button onClick={addTab} type="button" className="relative z-10 shadow-lg hover:shadow-primary/25 transition-all duration-300">
						<Plus className="mr-2 size-4" />
						{t("Launch Terminal")}
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto grid h-[clamp(20rem,calc(100dvh-10rem),52rem)] min-h-0 w-full max-w-7xl grid-rows-[auto_auto_minmax(0,1fr)] gap-0">
			{/* 标题行 */}
			<div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3 mb-3">
				<div className="flex min-w-0 items-center gap-2 sm:gap-3">
					<div className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground sm:size-9">
						<SquareTerminal className="size-4" />
					</div>
					<div className="min-w-0">
						<h1 className="text-base font-semibold sm:text-lg">{t("Router console")}</h1>
						<p className="truncate text-xs text-muted-foreground sm:text-sm">
							{status?.transport === "tunnel"
								? t("Same-origin terminal tunnel through the authenticated session.")
								: t("Trusted-LAN direct console fallback.")}
						</p>
					</div>
				</div>
				{tabs.length < MAX_SESSIONS && (
					<Button size="sm" type="button" variant="outline" onClick={addTab}>
						<Plus className="mr-1.5 size-3.5" />
						{t("New session")}
					</Button>
				)}
			</div>

			{/* Tab 栏 */}
			<div className="flex items-center gap-1 overflow-x-auto border-b mb-0 pb-0">
				{tabs.map((tab) => (
					<button
						key={tab.id}
						className={[
							"group flex shrink-0 items-center gap-1.5 rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition-colors",
							tab.id === activeTabId
								? "bg-black text-zinc-100 border-zinc-700"
								: "bg-card text-muted-foreground hover:bg-secondary border-border",
						].join(" ")}
						onClick={() => setActiveTabId(tab.id)}
						type="button"
					>
						<span
							className={[
								"size-1.5 rounded-full",
								tab.state === "ready" ? "bg-green-400" :
								tab.state === "loading" ? "bg-yellow-400 animate-pulse" :
								tab.state === "error" || tab.state === "unavailable" ? "bg-red-400" :
								"bg-zinc-500",
							].join(" ")}
						/>
						{tab.label}
						<span
							className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-zinc-700"
							role="button"
							tabIndex={0}
							onClick={(e) => {
								e.stopPropagation();
								closeTab(tab.id);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.stopPropagation();
									closeTab(tab.id);
								}
							}}
						>
							<X className="size-3" />
						</span>
					</button>
				))}
			</div>

			{/* 控制台内容区 */}
			<div className="min-h-0 overflow-hidden rounded-b-md rounded-tr-md border border-t-0 bg-black">
				{activeTab ? (
					<TabContent
						key={activeTab.id}
						status={status}
						tab={activeTab}
						onLaunch={(tabId) => void launchSession(tabId, status)}
					/>
				) : null}
			</div>
		</div>
	);
}

function TabContent({
	tab,
	status,
	onLaunch,
}: {
	tab: ConsoleTab;
	status: ConsoleStatus | null;
	onLaunch: (tabId: string) => void;
}) {
	const fallbackUrl = buildConsoleFallbackUrl(tab.launch, window.location.hostname);
	const embeddedUrl = buildConsoleEmbeddedUrl(tab.launch, window.location.hostname);

	if (tab.state === "ready" && tab.launch?.sessionId) {
		return (
			<TunnelConsole
				pollAfterMs={tab.launch.pollAfterMs}
				sessionId={tab.launch.sessionId}
			/>
		);
	}

	if (tab.state === "ready" && embeddedUrl) {
		return <iframe className="size-full border-0" src={embeddedUrl} title={t("Router console")} />;
	}

	return (
		<div className="grid size-full place-items-center p-6 text-center text-sm text-muted-foreground">
			{tab.state === "idle" ? (
				<div className="grid gap-3">
					<p>{t("Open the console to start a session.")}</p>
					{fallbackUrl && !tab.launch?.sessionId ? (
						<Button
							type="button"
							variant="outline"
							onClick={() => window.open(fallbackUrl, "_blank", "noopener,noreferrer")}
						>
							<ExternalLink className="mr-2 size-4" />
							{t("Open console")}
						</Button>
					) : (
						<Button type="button" onClick={() => onLaunch(tab.id)}>
							<SquareTerminal className="mr-2 size-4" />
							{t("Open console")}
						</Button>
					)}
				</div>
			) : null}
			{tab.state === "loading" ? <p>{t("Opening console...")}</p> : null}
			{tab.state === "unavailable" ? (
				<div className="grid gap-2">
					<p>{t("Console bridge is not available.")}</p>
					<p>
						{t("Helper status:")} {status?.available ? t("installed") : t("missing")} /{" "}
						{status?.enabled ? t("enabled") : t("disabled")}
					</p>
				</div>
			) : null}
			{tab.state === "error" ? <p>{t("Console launch failed. Refresh and try again.")}</p> : null}
		</div>
	);
}

// 自适应轮询延迟配置
const POLL_DELAY_MIN = 80;       // 有输出时最短间隔 (ms)
const POLL_DELAY_MAX = 800;      // 空轮询最大退避上限 (ms)
const POLL_DELAY_BACKOFF = 1.8;  // 空轮询退避系数

function TunnelConsole({ pollAfterMs, sessionId }: { pollAfterMs?: number; sessionId: string }) {
	const [output, setOutput] = useState("");
	const [sequence, setSequence] = useState(0);
	const [active, setActive] = useState(true);
	const outputRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	// 自适应延迟状态
	const adaptiveDelay = useRef(Math.max(POLL_DELAY_MIN, pollAfterMs ?? POLL_DELAY_MIN));

	const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
		window.requestAnimationFrame(() => {
			const element = outputRef.current;
			if (!element) return;
			element.scrollTo({ top: element.scrollHeight, behavior });
		});
	}, []);

	// 自适应轮询循环
	useEffect(() => {
		let cancelled = false;
		let timer: number | null = null;

		async function poll() {
			const result = await pollConsole(sessionId, sequence);

			if (cancelled) return;

			if (!result.available || !result.active) {
				setActive(false);
				return;
			}

			if (result.output) {
				setOutput((current) => `${current}${result.output}`);
				// 有输出时重置为最短间隔
				adaptiveDelay.current = POLL_DELAY_MIN;
			} else {
				// 无输出时指数退避，上限 POLL_DELAY_MAX
				adaptiveDelay.current = Math.min(
					POLL_DELAY_MAX,
					adaptiveDelay.current * POLL_DELAY_BACKOFF,
				);
			}

			if (typeof result.sequence === "number") {
				setSequence(result.sequence);
			}

			timer = window.setTimeout(() => void poll(), adaptiveDelay.current);
		}

		void poll();

		return () => {
			cancelled = true;
			if (timer != null) window.clearTimeout(timer);
		};
	// sequence 变化时重启 poll 循环
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [sessionId, sequence]);

	// 关闭时清理 PTY 会话
	useEffect(() => {
		return () => {
			void closeConsole(sessionId);
		};
	}, [sessionId]);

	// 自动滚动到底部
	useEffect(() => {
		scrollToBottom();
	}, [active, output, scrollToBottom]);

	// PTY 尺寸自适应
	useEffect(() => {
		const element = outputRef.current;
		if (!element || !active) return;

		let frame = 0;
		let previousSize = "";

		const sendSize = () => {
			const rect = element.getBoundingClientRect();
			const columns = clamp(Math.floor(rect.width / 7.5), 40, 220);
			const rows = clamp(Math.floor(rect.height / 17), 12, 80);
			const nextSize = `${columns}:${rows}`;
			if (nextSize === previousSize) return;
			previousSize = nextSize;
			void resizeConsole(sessionId, columns, rows);
			scrollToBottom();
		};

		const scheduleSize = () => {
			if (frame) window.cancelAnimationFrame(frame);
			frame = window.requestAnimationFrame(sendSize);
		};

		const observer = new ResizeObserver(scheduleSize);
		observer.observe(element);
		scheduleSize();
		window.addEventListener("resize", scheduleSize);

		return () => {
			observer.disconnect();
			window.removeEventListener("resize", scheduleSize);
			if (frame) window.cancelAnimationFrame(frame);
		};
	}, [active, scrollToBottom, sessionId]);

	// 原始键盘事件：Ctrl+C / Ctrl+D / Tab / 方向键透传
	function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
		// Tab：透传 \t，不触发焦点跳转
		if (event.key === "Tab") {
			event.preventDefault();
			void writeConsole(sessionId, "\t");
			return;
		}

		// 方向键 ANSI 转义
		const arrowMap: Record<string, string> = {
			ArrowUp:    "\x1b[A",
			ArrowDown:  "\x1b[B",
			ArrowRight: "\x1b[C",
			ArrowLeft:  "\x1b[D",
		};

		if (event.key in arrowMap) {
			event.preventDefault();
			void writeConsole(sessionId, arrowMap[event.key]);
			return;
		}

		// Ctrl 组合键
		if (event.ctrlKey) {
			const ctrlMap: Record<string, string> = {
				c: "\x03", // SIGINT
				d: "\x04", // EOF
				z: "\x1a", // SIGTSTP
				l: "\x0c", // 清屏
				u: "\x15", // 删至行首
				k: "\x0b", // 删至行尾
				a: "\x01", // 行首
				e: "\x05", // 行尾
			};

			if (event.key.toLowerCase() in ctrlMap) {
				event.preventDefault();
				void writeConsole(sessionId, ctrlMap[event.key.toLowerCase()]);
				return;
			}
		}
	}

	// textarea onChange：发送输入并清空
	function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
		const value = event.target.value;
		if (!value || !active) return;
		event.target.value = "";

		// 检测 Enter 并追加 \n
		if (value.endsWith("\n")) {
			void writeConsole(sessionId, value);
		} else {
			void writeConsole(sessionId, value);
		}
		scrollToBottom("smooth");
	}

	return (
		<div className="flex size-full min-h-0 flex-col bg-black text-[11px] text-zinc-100 sm:text-xs">
			{/* 输出区 */}
			<div
				ref={outputRef}
				className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words p-2.5 font-mono leading-snug sm:p-3"
				onClick={() => textareaRef.current?.focus()}
			>
				{output || t("Opening router shell...")}
				{!active && (
					<div className="mt-2 text-zinc-500 text-[10px]">
						— {t("Console session ended")} —
					</div>
				)}
			</div>
			{/* 透明 textarea 覆盖层：捕获键盘输入 */}
			<div className="sticky bottom-0 flex shrink-0 border-t border-zinc-800 bg-zinc-950">
				<textarea
					ref={textareaRef}
					autoComplete="off"
					autoCorrect="off"
					className="min-h-[2.5rem] min-w-0 flex-1 resize-none bg-transparent px-3 py-2 font-mono text-xs text-zinc-100 outline-none placeholder:text-zinc-600 leading-5"
					disabled={!active}
					placeholder={active ? t("Type a command and press Enter (Ctrl+C / Ctrl+D supported)") : t("Session ended")}
					rows={1}
					spellCheck={false}
					onChange={handleChange}
					onKeyDown={handleKeyDown}
					onFocus={() => {
						scrollToBottom();
					}}
				/>
			</div>
		</div>
	);
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}
