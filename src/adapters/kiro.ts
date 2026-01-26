import { Backend, BackendResult } from "./base.js";
import { ProcessExecutor } from "../core/process-executor.js";

export interface KiroAdapterConfig {
  agent: string;
}

export class KiroAdapter implements Backend {
  readonly name = "kiro";
  constructor(private config: KiroAdapterConfig, private executor?: ProcessExecutor) {}
  async execute(prompt: string): Promise<BackendResult> {
    throw new Error("Not implemented");
  }
}
