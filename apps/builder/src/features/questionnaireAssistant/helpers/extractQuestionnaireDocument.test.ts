import { describe, expect, it } from "bun:test";
import { createZipArchive } from "@/features/results/helpers/createZipArchive";
import {
  extractQuestionnaireDocument,
  QuestionnaireDocumentError,
} from "./extractQuestionnaireDocument";

const zip = (files: Record<string, string>) =>
  createZipArchive(
    Object.entries(files).map(([fileName, content]) => ({
      fileName,
      content: new TextEncoder().encode(content),
    })),
  );

describe("extractQuestionnaireDocument", () => {
  it("reads Word paragraphs and tables", async () => {
    const document = await extractQuestionnaireDocument({
      fileName: "q.docx",
      bytes: zip({
        "word/document.xml":
          "<w:document><w:body><w:p><w:r><w:t>D1. Sesso</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Uomo &amp; altro</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>",
      }),
    });
    expect(document).toEqual({
      fileName: "q.docx",
      kind: "text",
      text: "D1. Sesso\n1\tUomo & altro",
    });
  });

  it("reads Excel sheets with shared and inline strings", async () => {
    const document = await extractQuestionnaireDocument({
      fileName: "q.xlsx",
      bytes: zip({
        "xl/sharedStrings.xml":
          "<sst><si><t>Codice</t></si><si><t>Domanda</t></si><si><r><t>Quanti </t></r><r><t>anni hai?</t></r></si></sst>",
        "xl/worksheets/sheet1.xml":
          '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>S1</t></is></c><c r="B2" t="s"><v>2</v></c><c r="C2"><v>18</v></c></row></sheetData></worksheet>',
      }),
    });
    expect(document.kind === "text" && document.text).toBe(
      "## Sheet 1\nCodice\tDomanda\nS1\tQuanti anni hai?\t18",
    );
  });

  it("reads PowerPoint slides", async () => {
    const document = await extractQuestionnaireDocument({
      fileName: "q.pptx",
      bytes: zip({
        "ppt/slides/slide1.xml":
          "<p:sld><a:p><a:r><a:t>D1. Ti piace?</a:t></a:r></a:p><a:p><a:r><a:t>1. Sì</a:t></a:r></a:p></p:sld>",
        "ppt/slides/slide2.xml":
          "<p:sld><a:p><a:r><a:t>Grazie</a:t></a:r></a:p></p:sld>",
      }),
    });
    expect(document.kind === "text" && document.text).toBe(
      "## Slide 1\nD1. Ti piace?\n1. Sì\n\n## Slide 2\nGrazie",
    );
  });

  it("sends PDF as files and refuses old formats", async () => {
    const pdf = await extractQuestionnaireDocument({
      fileName: "q.PDF",
      bytes: new TextEncoder().encode("%PDF-1.4"),
    });
    expect(pdf).toEqual({
      fileName: "q.PDF",
      kind: "pdf",
      base64: btoa("%PDF-1.4"),
    });
    await expect(
      extractQuestionnaireDocument({
        fileName: "q.doc",
        bytes: new Uint8Array(),
      }),
    ).rejects.toBeInstanceOf(QuestionnaireDocumentError);
  });
});
