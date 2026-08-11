// 所有原生页面和服务的兼容路径已全部解除 —— 现在完全由原生 React 组件处理。
// 若将来有需要临时回退某个页面到 LuCI 兼容层，可在此重新添加对应条目。

// banip 的子路由（allowlist、blocklist、feeds、setreport、firewall_log、processing_log）
// 已通过 NativeServicePage 的 serviceFocusMeta 实现原生支持，不再需要 serviceCompatPath 映射。

// adblock-fast 现在也通过 NativeServicePage 的 ServiceSpecificSummary 处理，不再跳转 compat。

export function serviceCompatPath(_service: string, _focus = "") {
	return null;
}

export function nativePageCompatPath(_page: string) {
	return null;
}

export function legacyTarget(path: string) {
	return `/legacy?path=${encodeURIComponent(path)}`;
}
