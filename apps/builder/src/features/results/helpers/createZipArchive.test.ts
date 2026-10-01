import { describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createZipArchive } from "./createZipArchive";

describe("createZipArchive", () => {
  it("creates an archive standard tools can extract", () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
    const archive = createZipArchive([
      { fileName: "r1_FIRMA.jpg", content: jpeg },
      { fileName: "r2_FIRMA.jpg", content: new TextEncoder().encode("ciao") },
    ]);
    const directory = mkdtempSync(join(tmpdir(), "zip-"));
    const archivePath = join(directory, "signatures.zip");
    writeFileSync(archivePath, archive);
    execFileSync("python3", [
      "-c",
      "import sys, zipfile; z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; z.extractall(sys.argv[2])",
      archivePath,
      directory,
    ]);
    expect([...readFileSync(join(directory, "r1_FIRMA.jpg"))]).toEqual([
      ...jpeg,
    ]);
    expect(readFileSync(join(directory, "r2_FIRMA.jpg"), "utf8")).toBe("ciao");
  });
});
