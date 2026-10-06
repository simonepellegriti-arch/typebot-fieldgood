import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readParticipantList } from "./readParticipantList";

const asFile = (name: string, bytes: Uint8Array) => ({
  name,
  arrayBuffer: async () =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

describe("readParticipantList", () => {
  it("reads the first sheet of an Excel file, keeping empty cells in place", async () => {
    const bytes = new Uint8Array(
      await readFile(join(import.meta.dir, "fixtures/lista.xlsx")),
    );
    const list = await readParticipantList(asFile("lista.xlsx", bytes));
    expect(list.columns).toEqual(["ID", "Nome", "Telefono", "profilo"]);
    expect(list.rows).toEqual([
      {
        ID: "R001",
        Nome: "Anna Rossi",
        Telefono: "393331234567",
        profilo: "PLUS",
      },
      { ID: "R002", Nome: "", Telefono: "0612345678", profilo: "GAVISCON" },
      { ID: "R003", Nome: "Luca & Co", Telefono: "", profilo: "ESOXX" },
    ]);
  });

  it("reads semicolon CSV exported by Italian Excel", async () => {
    const csv = "﻿ID;Nome;Panel\nA1;Mario;TEST\n\nA2;Giulia;CONTROL\n";
    const list = await readParticipantList(
      asFile("lista.csv", new TextEncoder().encode(csv)),
    );
    expect(list.columns).toEqual(["ID", "Nome", "Panel"]);
    expect(list.rows).toHaveLength(2);
    expect(list.rows[1]).toEqual({
      ID: "A2",
      Nome: "Giulia",
      Panel: "CONTROL",
    });
  });
});
