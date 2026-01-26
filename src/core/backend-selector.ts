import { Config } from "./types.js";
import { Backend } from "../adapters/base.js";

export class BackendSelector {
  constructor(private config: Config) {}
  selectBackend(hatName: string): Backend {
    throw new Error("Not implemented");
  }
}
