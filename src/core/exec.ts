export interface ExecResult {
	stdout: string;
	exitCode: number;
}

export interface ExecOptions {
	reject?: boolean;
}

export async function exec(
	cmd: string,
	args: string[],
	options: ExecOptions = {},
): Promise<ExecResult> {
	const { reject = true } = options;

	const proc = Bun.spawn([cmd, ...args], {
		stdout: "pipe",
		stderr: "pipe",
	});

	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;

	if (reject && exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(
			`Command failed with exit code ${exitCode}: ${stderr || stdout}`,
		);
	}

	return { stdout, exitCode };
}
