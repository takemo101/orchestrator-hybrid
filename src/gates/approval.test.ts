import { describe, expect, it } from "bun:test";
import { requestApproval } from "./approval.js";

describe("requestApproval", () => {
	describe("autoMode", () => {
		it("should return 'continue' when autoMode is true", async () => {
			const result = await requestApproval({
				gateName: "Test Gate",
				message: "Test message",
				autoMode: true,
			});

			expect(result).toBe("continue");
		});

		it("should return 'continue' regardless of gate name in autoMode", async () => {
			const gates = ["Pre-Loop", "Post-Completion", "Custom Gate"];

			for (const gateName of gates) {
				const result = await requestApproval({
					gateName,
					message: "Any message",
					autoMode: true,
				});
				expect(result).toBe("continue");
			}
		});

		it("should return 'continue' with scratchpadPath in autoMode", async () => {
			const result = await requestApproval({
				gateName: "Test Gate",
				message: "Test message",
				autoMode: true,
				scratchpadPath: ".agent/scratchpad.md",
			});

			expect(result).toBe("continue");
		});
	});
});
