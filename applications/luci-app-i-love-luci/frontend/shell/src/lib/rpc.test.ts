import { afterEach, describe, expect, it, vi } from "vitest";

import {
	getConntrackSummary,
	getDashboardStatus,
	getProcessStats,
	getThermalHistory,
	probeAuthSession,
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
});

