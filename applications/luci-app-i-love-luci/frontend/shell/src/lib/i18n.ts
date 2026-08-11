const dict: Record<string, string> = {
	// Common / Sidebar
	"Dashboard": "控制面板",
	"Status": "状态",
	"System": "系统",
	"Services": "服务",
	"Network": "网络",
	"VPN": "VPN",
	"Settings": "渲染设置",
	"Router console": "路由器控制台",
	"Log out": "退出登录",
	"Signed in as": "当前登录用户为",
	"Open console": "打开控制台",
	"New session": "新建会话",
	"Same-origin terminal tunnel through the authenticated session.": "通过已认证会话的同源终端隧道。",
	"Same-origin terminal tunnel through the authenticated I Love LuCI session.": "通过已认证的 I Love LuCI 会话的同源终端隧道。",
	"Trusted-LAN direct console fallback.": "局域网直接控制台备用连接方式。",
	"Type a command and press Enter (Ctrl+C / Ctrl+D supported)": "输入命令并按回车 (支持 Ctrl+C / Ctrl+D)",
	"Session ended": "会话已结束",
	"Type a command": "输入命令",
	"Console session ended": "控制台会话结束",
	"Open the console to start a session.": "打开控制台开始会话。",
	"Opening router shell...": "正在打开路由器终端...",
	"Opening console...": "正在打开控制台...",
	"Console bridge is not available.": "控制台桥接不可用。",
	"Console bridge is not available. Install and enable the `i-love-luci-console` helper on the router.": "控制台桥接不可用。请在路由器上安装并启用 `i-love-luci-console` 帮助程序。",
	"Helper status:": "服务状态：",
	"installed": "已安装",
	"missing": "未安装",
	"enabled": "已启用",
	"disabled": "已禁用",
	"Console launch failed. Refresh and try again.": "控制台启动失败，请刷新并重试。",
	"Send": "发送",
	"Pending changes": "未应用修改",
	"pending": "个待应用修改",
	"Close": "关闭",
	"Discard changes": "放弃修改",
	"Pending changes discarded.": "待应用修改已放弃。",
	"No pending changes.": "没有待应用的修改。",
	"Config": "配置",
	"Action": "操作",
	"Section": "小节",
	"Option": "选项",
	"Value": "值",
	"Navigation": "导航菜单",
	"Collapse all": "全部折叠",
	"Expand all": "全部展开",
	"Console service is available on port": "控制台服务已在端口",
	"This will use the trusted-LAN direct fallback.": "这将会使用局域网直接控制台备用连接方式。",
	"Last 30 events from system log · Refreshes every 30s": "系统日志中的最新 30 条事件 · 每 30 秒自动更新",

	// Dashboard
	"Download": "下载速率",
	"Upload": "上传速率",
	"Memory": "内存",
	"Disk": "磁盘空间",
	"CPU load": "CPU 负载",
	"Bandwidth": "实时带宽",
	"Disk Space": "磁盘空间",
	"Associated Devices": "无线关联设备",
	"Active DHCP Leases": "活动 DHCP 租约",
	"Interfaces": "网络接口",
	"Uptime": "运行时间",
	"Memory available": "可用内存",
	"Root filesystem": "根文件系统",
	"Temp filesystem": "临时文件系统",
	"Kernel": "内核版本",
	"Target": "架构平台",
	"Device": "接口设备",
	"State": "物理状态",
	"Speed": "物理速度",
	"Transferred": "已传输数据",
	"Trend": "趋势图",
	"Peak": "峰值",
	"Temperature": "系统温度",
	"Disk I/O": "磁盘 I/O 速率",
	"System Events": "系统事件日志",
	"Mark all read": "全部标为已读",
	"No recent system events": "近期没有系统事件",
	"used": "已使用",
	"Free": "空闲",
	"Cached": "缓存",
	"Buffered": "缓冲区",
	"Shared": "共享",
	"Total": "总容量",
	"Available": "可用",
	"Root total": "根总容量",
	"Root used": "根已使用",
	"Root free": "根可用",
	"Temp total": "临时总容量",
	"Temp used": "临时已使用",
	"Temp free": "临时可用",
	"Memory details": "内存详情",
	"Disk details": "磁盘详情",
	"No active network devices reported by LuCI.": "LuCI 未报告任何活动的网络设备。",
	"No associated Wi-Fi devices reported.": "没有无线设备关联。",
	"No active DHCP leases found.": "未找到活动的 DHCP 租约。",
	"Host": "主机名",
	"Expires": "租约到期",
	"Station": "MAC 地址",
	"Interface": "接口",
	"Signal": "信号强度",
	"Rate": "协商速率",
	"Connected": "连接时间",
	"down": "下载",
	"up": "上传",

	// Settings
	"Authentication": "认证与安全",
	"Multi-factor authentication": "多因子身份认证 (MFA)",
	"TOTP MFA requires server-side support before it can be enabled.": "TOTP 多因子认证需要路由器后端支持才能启用。",
	"Configure": "配置",
	"Passcode / passkey": "安全密钥 / Passkey",
	"Passcode is feasible later; WebAuthn/passkey should be optional after TOTP lands.": "Passkey 登录需要 HTTPS 证书和后端支持。",
	"Review": "查看",
	"Route compatibility": "路由渲染兼容性",
	"Search routes": "搜索路由",
	"Search": "搜索",
	"Status, DHCP, firewall": "状态、DHCP、防火墙...",
	"Route": "路由路径",
	"Coverage": "覆盖类型",
	"Mode": "渲染模式",
	"MFA setup": "双因子认证设置",
	"MFA setup is not available in this package yet. TOTP secrets must be generated and verified on the router.": "本软件包中尚不支持在线配置 MFA，需先在路由器后台生成 TOTP 密钥。",
	"Verification code": "验证码",
	"Cancel": "取消",
	"Verify": "验证",
	"Route mode saved": "路由渲染模式已保存",
	"Route mode was not saved": "路由渲染模式保存失败",
	"Router shell configuration and security options.": "路由器外壳配置与安全性选项。",
	"supported": "已原生支持",
	"compat": "兼容模式",
	"unsupported": "暂未支持",
	"auto": "自动判断 (推荐)",
	"modern": "React 原生渲染",
	"legacy": "LuCI 兼容框",
	"hidden": "隐藏此路由",

	// Additional Dashboard terms
	"Connections": "连接数",
	"Active Connections": "当前连接数",
	"Collecting connection data...": "正在采集连接数数据...",
	"max": "上限",
	"leases": "个租约",
	"sensors": "个传感器",
	"devices": "个设备",
	"Read": "读取",
	"Write": "写入",
	"Source": "数据源",
	"Polls every": "刷新间隔",
	"Collecting thermal data...": "正在采集温度数据...",
	"Collecting disk I/O data...": "正在采集磁盘 I/O 数据..."
};

export function getLanguagePreference(): "zh" | "en" {
	if (typeof window === "undefined") return "en";
	try {
		const stored = window.localStorage?.getItem("i-love-luci.lang");
		if (stored === "zh" || stored === "en") return stored;

		if (typeof navigator !== "undefined" && navigator.language) {
			const navLang = navigator.language.toLowerCase();
			if (navLang.startsWith("zh")) return "zh";
		}
	} catch {
		// 忽略 SSR 或浏览器隐私模式导致的 localStorage 报错
	}
	return "en";
}

export function setLanguagePreference(lang: "zh" | "en") {
	if (typeof window === "undefined") return;
	try {
		window.localStorage?.setItem("i-love-luci.lang", lang);
	} catch {
		// 忽略写入异常
	}
}

export function t(text: string): string {
	const currentLang = getLanguagePreference();
	if (currentLang === "en") return text;
	return dict[text] ?? text;
}
