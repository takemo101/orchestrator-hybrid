import { Backend, BackendResult } from "./base.js";
import { ProcessExecutor } from "../core/process-executor.js";

export class GeminiAdapter implements Backend {
  readonly name = "gemini";
  constructor(private executor?: ProcessExecutor) {}
  async execute(prompt: string): Promise<BackendResult> {
    throw new Error("Not implemented");
  }
}
