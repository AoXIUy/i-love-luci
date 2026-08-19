import { afterEach, describe, expect, it, vi } from "vitest";

import {
	getConntrackSummary,
	getDashboardStatus,
	getDeviceList,
	getInterfaceDetail,
	getNetworkProtocols,
	getProcessStats,
	getThermalHistory,
	killConntrackConnection,
	probeAuthSession,
	runNetworkInterfaceAction,
	toggleNftRule,
	validateInterfaceConfig,
} from "@/lib/rpc";

function stubBrowser(sessionId: string | null) {
	vi.stubGlobal("document", {
		body: { dataset: {} },
		title: "I Love LuCI",
	});
	vi.stubGlobal("window", {
		ILoveLuCI: sessionId ? { sessionId } : {},
		L: { env: {} },
	});
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
	return new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json", ...(init.headers ?? {}) },
		status: init.status ?? 200,
	});
}

describe("probeAuthSession", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("reports expired when no LuCI session id exists", async () => {
		stubBrowser(null);

		await expect(probeAuthSession()).resolves.toEqual({
			status: "expired",
			message: "Missing LuCI session id",
		});
	});

	it("reports valid when session_info returns successfully", async () => {
		stubBrowser("session-123");
		const fetchMock = vi.fn().mockResolvedValue(
			jsonResponse({
				result: [0, { ok: true, data: { user: "root", features: { mfa: false, passkeys: false, legacyFrame: true } } }],
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(probeAuthSession()).resolves.toEqual({ status: "valid" });
		expect(fetchMock).toHaveBeenCalledWith(
			"/ubus/",
			expect.objectContaining({
				credentials: "same-origin",
				method: "POST",
			}),
		);
		expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
			params: ["session-123", "luci.iloveluci", "session_info", {}],
		});
	});

	it("reports expired when uhttpd asks for login", async () => {
		stubBrowser("expired-session");
		vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, { status: 403 })));

		await expect(probeAuthSession()).resolves.toEqual({
			status: "expired",
			message: "LuCI login required",
		});
	});

	it("reports unknown for transient network failures", async () => {
		stubBrowser("session-123");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

		await expect(probeAuthSession()).resolves.toEqual({
			status: "unknown",
			message: "network down",
		});
	});
});

describe("getDashboardStatus", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("normalizes dashboard DHCP leases and preserves wireless associations", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: {
								board: {},
								system: {},
								devices: {},
								dhcpLeases: ["3600\taa:bb:cc:dd:ee:ff\t192.168.1.20\tphone\tclient-1"],
								wirelessAssociations: [{ mac: "aa:bb:cc:dd:ee:ff", interface: "wlan0", signal: -55 }],
							},
						},
					],
				}),
			),
		);

		await expect(getDashboardStatus()).resolves.toMatchObject({
			dhcpLeases: [
				{
					remaining: 3600,
					mac: "aa:bb:cc:dd:ee:ff",
					ip: "192.168.1.20",
					hostname: "phone",
					clientId: "client-1",
				},
			],
			wirelessAssociations: [{ mac: "aa:bb:cc:dd:ee:ff", interface: "wlan0", signal: -55 }],
		});
	});
});

describe("extended dashboard RPCs", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("fetches conntrack summary successfully", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: {
								total: 150,
								max: 16384,
								tcp: 100,
								udp: 45,
								icmp: 3,
								other: 2,
								tcpDetails: { established: 90, timeWait: 5, closeWait: 3, synSent: 2, other: 0 },
							},
						},
					],
				}),
			),
		);

		const summary = await getConntrackSummary();
		expect(summary.total).toBe(150);
		expect(summary.tcp).toBe(100);
		expect(summary.udp).toBe(45);
	});

	it("falls back gracefully when conntrack call fails", async () => {
		stubBrowser("session-123");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("RPC failed")));

		const summary = await getConntrackSummary();
		expect(summary).toMatchObject({
			total: 0,
			max: 0,
			tcp: 0,
			udp: 0,
			icmp: 0,
			other: 0,
		});
	});

	it("fetches process stats and handles fallback", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: {
								collectedAt: 123456789,
								processes: [{ pid: 1, user: "root", cpu: 5.2, mem: 1.1, command: "/sbin/procd", name: "procd" }],
								topCpu: [{ pid: 1, user: "root", cpu: 5.2, mem: 1.1, command: "/sbin/procd", name: "procd" }],
								topMem: [{ pid: 1, user: "root", cpu: 5.2, mem: 1.1, command: "/sbin/procd", name: "procd" }],
							},
						},
					],
				}),
			),
		);

		const stats = await getProcessStats();
		expect(stats.processes).toHaveLength(1);
		expect(stats.processes[0].name).toBe("procd");

		// Fallback
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
		const fallback = await getProcessStats();
		expect(fallback.processes).toHaveLength(0);
	});

	it("fetches thermal history and handles fallback", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: {
								collectedAt: 123456789,
								current: [{ type: "cpu-thermal", tempC: 52.5 }],
								sensors: ["cpu-thermal"],
								history: [{ timestamp: 123456789, sensors: { "cpu-thermal": 52.5 } }],
							},
						},
					],
				}),
			),
		);

		const result = await getThermalHistory();
		expect(result.sensors).toEqual(["cpu-thermal"]);
		expect(result.history).toHaveLength(1);

		// Fallback
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
		const fallback = await getThermalHistory();
		expect(fallback.history).toHaveLength(0);
	});

	it("fetches network protocols and handles error", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: [
								{ id: "dhcp", name: "DHCP client", category: "standard", description: "Dynamic IP", virtual: false, fields: ["hostname"] },
								{ id: "static", name: "Static address", category: "standard", description: "Static IP", virtual: false, fields: ["ipaddr", "netmask"] },
								{ id: "pppoe", name: "PPPoE", category: "ppp", description: "PPPoE broadband", virtual: false, fields: ["username", "password"] },
							],
						},
					],
				}),
			),
		);

		const protos = await getNetworkProtocols();
		expect(protos).toHaveLength(3);
		expect(protos[0].id).toBe("dhcp");
		expect(protos[2].id).toBe("pppoe");

		// Fallback
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
		const fallback = await getNetworkProtocols();
		expect(fallback).toEqual([]);
	});

	it("fetches device list with carrier states", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: [
								{ name: "eth0", type: "ethernet", devtype: "ethernet", present: true, up: true, carrier: true, macaddr: "00:11:22:33:44:55", mtu: 1500, speed: 1000, duplex: "full", ports: [], rx_bytes: 1024, tx_bytes: 2048, rx_packets: 10, tx_packets: 20, rx_errors: 0, tx_errors: 0, status_label: "UP" },
								{ name: "br-lan", type: "bridge", devtype: "bridge", present: true, up: true, carrier: true, macaddr: "00:11:22:33:44:56", mtu: 1500, speed: 0, duplex: "unknown", ports: ["lan1", "lan2"], rx_bytes: 0, tx_bytes: 0, rx_packets: 0, tx_packets: 0, rx_errors: 0, tx_errors: 0, status_label: "UP" },
							],
						},
					],
				}),
			),
		);

		const devs = await getDeviceList();
		expect(devs).toHaveLength(2);
		expect(devs[0].name).toBe("eth0");
		expect(devs[0].status_label).toBe("UP");
		expect(devs[1].ports).toContain("lan1");

		// Fallback
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
		const fallback = await getDeviceList();
		expect(fallback).toEqual([]);
	});

	it("fetches interface detail and validates config", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: {
								name: "wan",
								config: { section: "wan", proto: "dhcp", device: "eth1", disabled: "0", auto: "1", ipaddr: "", netmask: "", gateway: "", broadcast: "", ip6assign: "", ip6hint: "", ip6ifaceid: "", ip6class: "", ip6prefix: "", dns: "", dns_metric: "", metric: "", peerdns: "1", delegate: "1", hostname: "", clientid: "", vendorid: "", norelease: "" },
								zone: "wan",
								status: { up: true, uptime: 120 },
								device_status: null,
							},
						},
					],
				}),
			),
		);

		const detail = await getInterfaceDetail("wan");
		expect(detail).not.toBeNull();
		expect(detail?.name).toBe("wan");
		expect(detail?.config.proto).toBe("dhcp");

		// Validation test
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: {
								valid: true,
								errors: {},
								message: "Configuration is valid.",
							},
						},
					],
				}),
			),
		);

		const valResult = await validateInterfaceConfig({ section: "wan", proto: "static", ipaddr: "192.168.1.2/24" });
		expect(valResult.valid).toBe(true);
	});

	it("runs network interface action (up/down/restart)", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: {
								ok: true,
								name: "lan",
								action: "restart",
								message: "Interface restart completed successfully.",
								state: null,
							},
						},
					],
				}),
			),
		);

		const res = await runNetworkInterfaceAction("lan", "restart");
		expect(res.ok).toBe(true);
		expect(res.action).toBe("restart");

		// Fallback
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));
		const fallback = await runNetworkInterfaceAction("lan", "restart");
		expect(fallback.ok).toBe(false);
	});
});

describe("killConntrackConnection", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("kills connection successfully via RPC", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: {
								ok: true,
								message: "Connection deleted.",
							},
						},
					],
				}),
			),
		);

		const res = await killConntrackConnection({
			protocol: "tcp",
			src: "192.168.1.100",
			dst: "1.1.1.1",
			sport: 54321,
			dport: 443,
			family: "ipv4",
		});

		expect(res.ok).toBe(true);
	});

	it("handles RPC failure gracefully", async () => {
		stubBrowser("session-123");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

		const res = await killConntrackConnection({
			protocol: "tcp",
			src: "192.168.1.100",
			dst: "1.1.1.1",
		});

		expect(res.ok).toBe(false);
		expect(res.error).toBeDefined();
	});
});

describe("toggleNftRule", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("disables nftables rule successfully via RPC", async () => {
		stubBrowser("session-123");
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(
				jsonResponse({
					result: [
						0,
						{
							ok: true,
							data: {
								ok: true,
								message: "Rule deleted in runtime.",
							},
						},
					],
				}),
			),
		);

		const res = await toggleNftRule({
			table: "inet fw4",
			chain: "input_lan",
			handle: 42,
			action: "disable",
		});

		expect(res.ok).toBe(true);
	});

	it("handles nft delete failure gracefully", async () => {
		stubBrowser("session-123");
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("nft error")));

		const res = await toggleNftRule({
			table: "inet fw4",
			chain: "input_lan",
			handle: 99,
			action: "disable",
		});

		expect(res.ok).toBe(false);
		expect(res.error).toBeDefined();
	});
});

