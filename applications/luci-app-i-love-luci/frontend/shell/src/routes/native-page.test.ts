import { describe, expect, it } from "vitest";

import { nativePageCompatPath, serviceCompatPath } from "@/lib/service-compat";

describe("serviceCompatPath", () => {
	it("allows approved native service routes including previously compat-only ones", () => {
		expect(serviceCompatPath("adblock-fast")).toBeNull();
		expect(serviceCompatPath("banip")).toBeNull();
		expect(serviceCompatPath("banip", "allowlist")).toBeNull();
		expect(serviceCompatPath("uhttpd")).toBeNull();
		expect(serviceCompatPath("upnpd")).toBeNull();
		expect(serviceCompatPath("commands")).toBeNull();
	});
});

describe("nativePageCompatPath", () => {
	it("allows supported native page routes including previously compat-only ones", () => {
		expect(nativePageCompatPath("attendedsysupgrade")).toBeNull();
		expect(nativePageCompatPath("flash")).toBeNull();
		expect(nativePageCompatPath("packages")).toBeNull();
		expect(nativePageCompatPath("attendedsysupgrade-config")).toBeNull();
		expect(nativePageCompatPath("status-routes")).toBeNull();
		expect(nativePageCompatPath("firewall-status")).toBeNull();
		expect(nativePageCompatPath("connections")).toBeNull();
		expect(nativePageCompatPath("logs")).toBeNull();
	});
});
