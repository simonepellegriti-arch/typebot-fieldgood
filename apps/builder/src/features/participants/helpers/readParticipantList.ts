import { readZipEntry } from "@typebot.io/results/research/wordCoding/readZipEntry";
import Papa from "papaparse";

export type ParticipantList = {
  columns: string[];
  rows: Record<string, string>[];
};

export class ParticipantListError extends Error {}

/**
 * Reads a respondent list in the browser: Excel (.xlsx, first sheet) or CSV
 * (comma or semicolon). The first non-empty row holds the column names.
 */
export const readParticipantList = async (file: {
  name: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
}): Promise<ParticipantList> => {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === "xls")
    throw new ParticipantListError(
      "Formato .xls non supportato: salva il file come .xlsx o .csv",
    );
  const table =
    extension === "xlsx" ? await readXlsxRows(bytes) : readCsvRows(bytes);
  return toParticipantList(table);
};

const toParticipantList = (table: string[][]): ParticipantList => {
  const nonEmptyRows = table.filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );
  const [header, ...rows] = nonEmptyRows;
  if (!header || rows.length === 0)
    throw new ParticipantListError(
      "Il file è vuoto: serve una riga di intestazione e almeno un partecipante",
    );
  const columns: string[] = [];
  header.forEach((cell, index) => {
    const base = cell.trim() || `Colonna ${index + 1}`;
    let name = base;
    for (let suffix = 2; columns.includes(name); suffix++)
      name = `${base} ${suffix}`;
    columns.push(name);
  });
  return {
    columns,
    rows: rows.map((row) =>
      Object.fromEntries(
        columns.map((column, index) => [column, (row[index] ?? "").trim()]),
      ),
    ),
  };
};

const readCsvRows = (bytes: Uint8Array) => {
  const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
  const { data } = Papa.parse<string[]>(text, {
    skipEmptyLines: true,
    delimitersToGuess: [";", ",", "\t", "|"],
  });
  return data;
};

const readXlsxRows = async (bytes: Uint8Array) => {
  const readXml = async (name: string) => {
    try {
      const entry = await readZipEntry(bytes, name);
      return entry ? new TextDecoder().decode(entry) : undefined;
    } catch {
      throw new ParticipantListError("File Excel non leggibile");
    }
  };
  const sheetXml = await readXml(await getFirstSheetPath(readXml));
  if (!sheetXml) throw new ParticipantListError("File Excel non leggibile");
  const sharedStrings = [
    ...((await readXml("xl/sharedStrings.xml")) ?? "").matchAll(
      /<si>([\s\S]*?)<\/si>/g,
    ),
  ].map(([, item]) => readTextRuns(item ?? ""));

  return [...sheetXml.matchAll(/<row[\s>][\s\S]*?<\/row>/g)].map(([row]) => {
    const cells: string[] = [];
    let nextIndex = 0;
    for (const [, attributes = "", content = ""] of row.matchAll(
      /<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g,
    )) {
      const reference = attributes.match(/\sr="([A-Z]+)\d+"/)?.[1];
      const index = reference ? columnIndex(reference) : nextIndex;
      nextIndex = index + 1;
      const type = attributes.match(/\st="([^"]+)"/)?.[1];
      const value = content.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      cells[index] =
        type === "inlineStr"
          ? readTextRuns(content)
          : value === undefined
            ? ""
            : type === "s"
              ? (sharedStrings[Number(value)] ?? "")
              : decodeXmlEntities(value);
    }
    return Array.from(cells, (cell) => cell ?? "");
  });
};

/** First sheet of the workbook (not always sheet1.xml). */
const getFirstSheetPath = async (
  readXml: (name: string) => Promise<string | undefined>,
) => {
  const workbook = (await readXml("xl/workbook.xml")) ?? "";
  const relationshipId = workbook.match(/<sheet\s[^>]*r:id="([^"]+)"/)?.[1];
  const relationships = (await readXml("xl/_rels/workbook.xml.rels")) ?? "";
  const target = relationshipId
    ? [...relationships.matchAll(/<Relationship\s([^>]*?)\/?>/g)]
        .map(([, attributes = ""]) => attributes)
        .find((attributes) => attributes.includes(`Id="${relationshipId}"`))
        ?.match(/Target="([^"]+)"/)?.[1]
    : undefined;
  if (!target) return "xl/worksheets/sheet1.xml";
  return target.startsWith("/")
    ? target.slice(1)
    : `xl/${target.replace(/^\.\//, "")}`;
};

const columnIndex = (letters: string) =>
  [...letters].reduce(
    (index, letter) => index * 26 + (letter.charCodeAt(0) - 64),
    0,
  ) - 1;

const readTextRuns = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map(([, text]) => decodeXmlEntities(text ?? ""))
    .join("");

const decodeXmlEntities = (text: string) =>
  text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/g, "&");
