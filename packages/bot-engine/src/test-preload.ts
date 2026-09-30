import { mock } from "bun:test";

process.env.SKIP_ENV_CHECK = "true";

// isolated-vm is a native module Bun can't load: every export used by the
// code runners must exist here, or importing them fails at link time.
mock.module("isolated-vm", () => ({
  default: {},
  Isolate: class {},
  Context: class {},
  Reference: class {},
  ExternalCopy: class {},
  Callback: class {},
}));
