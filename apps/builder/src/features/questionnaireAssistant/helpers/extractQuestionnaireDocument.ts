import { extractDocxLines } from "@typebot.io/results/research/wordCoding/extractDocxLines";
import { readZipEntry } from "@typebot.io/results/research/wordCoding/readZipEntry";

/** PDF are read by the AI itself; above this size they can't be sent. */
export const maxPdfSizeBytes = 2.5 * 1024 * 1024;
/** Text sent to the AI is cut beyond this length (very long documents). */
export const maxDocumentTextLength = 200_000;

export type QuestionnaireDocument =
  | { fileName: string; kind: "text"; text: string }
  | { fileName: string; kind: "pdf"; base64: string };

/**
 * Turns an attached file into what the AI reads, in the browser: Word,
 * Excel and PowerPoint text (tables kept as tab separated rows), plain text
 * files as is, PDF as a file. Old binary formats (.doc, .xls, .ppt) are
 * refused with a message asking for the modern format.
 */
export const extractQuestionnaireDocument = async ({
  fileName,
  bytes,
}: {
  fileName: string;
  bytes: Uint8Array;
}): Promise<QuestionnaireDocument> => {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (extension) {
    case "docx":
      return toTextDocument(fileName, await readDocxText(bytes));
    case "xlsx":
      return toTextDocument(fileName, await readXlsxText(bytes));
    case "pptx":
      return toTextDocument(fileName, await readPptxText(bytes));
    case "pdf":
      if (bytes.length > maxPdfSizeBytes)
        throw new QuestionnaireDocumentError("pdfTooLarge");
      return { fileName, kind: "pdf", base64: toBase64(bytes) };
    case "txt":
    case "md":
    case "csv":
    case "tsv":
      return toTextDocument(fileName, new TextDecoder().decode(bytes));
    case "doc":
    case "xls":
    case "ppt":
      throw new QuestionnaireDocumentError("legacyFormat");
    default:
      throw new QuestionnaireDocumentError("unsupportedFormat");
  }
};

export class QuestionnaireDocumentError extends Error {
  constructor(
    readonly reason:
      | "pdfTooLarge"
      | "legacyFormat"
      | "unsupportedFormat"
      | "unreadable"
      | "empty",
  ) {
    super(reason);
  }
}

const toTextDocument = (fileName: string, text: string) => {
  const trimmedText = text.trim();
  if (!trimmedText) throw new QuestionnaireDocumentError("empty");
  return {
    fileName,
    kind: "text" as const,
    text: trimmedText.slice(0, maxDocumentTextLength),
  };
};

const readDocxText = async (bytes: Uint8Array) => {
  const documentXml = await readXmlEntry(bytes, "word/document.xml");
  if (documentXml === undefined)
    throw new QuestionnaireDocumentError("unreadable");
  return extractDocxLines(documentXml).join("\n");
};

/** Every sheet, one line per row, cells separated by tabs. */
const readXlsxText = async (bytes: Uint8Array) => {
  const sharedStringsXml =
    (await readXmlEntry(bytes, "xl/sharedStrings.xml")) ?? "";
  const sharedStrings = [
    ...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map(([, item]) => readTextRuns(item ?? "", "t"));
  const sheets: string[] = [];
  for (let sheetNumber = 1; sheetNumber <= 50; sheetNumber++) {
    const sheetXml = await readXmlEntry(
      bytes,
      `xl/worksheets/sheet${sheetNumber}.xml`,
    );
    if (sheetXml === undefined) break;
    const rows = [...sheetXml.matchAll(/<row[\s>][\s\S]*?<\/row>/g)].map(
      ([row]) =>
        [...row.matchAll(/<c([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)]
          .map(([, attributes, content]) => {
            const type = attributes?.match(/\st="([^"]+)"/)?.[1];
            if (type === "inlineStr") return readTextRuns(content ?? "", "t");
            const value = content?.match(/<v>([\s\S]*?)<\/v>/)?.[1];
            if (value === undefined) return "";
            return type === "s"
              ? (sharedStrings[Number(value)] ?? "")
              : decodeXmlEntities(value);
          })
          .join("\t")
          .trimEnd(),
    );
    sheets.push(
      `## Sheet ${sheetNumber}\n${rows.filter((row) => row.trim()).join("\n")}`,
    );
  }
  if (sheets.length === 0) throw new QuestionnaireDocumentError("unreadable");
  return sheets.join("\n\n");
};

/** Every slide, one line per paragraph. */
const readPptxText = async (bytes: Uint8Array) => {
  const slides: string[] = [];
  for (let slideNumber = 1; slideNumber <= 300; slideNumber++) {
    const slideXml = await readXmlEntry(
      bytes,
      `ppt/slides/slide${slideNumber}.xml`,
    );
    if (slideXml === undefined) break;
    const paragraphs = [...slideXml.matchAll(/<a:p[\s>][\s\S]*?<\/a:p>/g)]
      .map(([paragraph]) => readTextRuns(paragraph, "a:t").trim())
      .filter(Boolean);
    slides.push(`## Slide ${slideNumber}\n${paragraphs.join("\n")}`);
  }
  if (slides.length === 0) throw new QuestionnaireDocumentError("unreadable");
  return slides.join("\n\n");
};

const readXmlEntry = async (bytes: Uint8Array, entryName: string) => {
  try {
    const entry = await readZipEntry(bytes, entryName);
    return entry ? new TextDecoder().decode(entry) : undefined;
  } catch {
    throw new QuestionnaireDocumentError("unreadable");
  }
};

const readTextRuns = (xml: string, tagName: string) =>
  [
    ...xml.matchAll(
      new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, "g"),
    ),
  ]
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

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
};
