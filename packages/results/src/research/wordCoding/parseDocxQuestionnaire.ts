import { extractDocxLines } from "./extractDocxLines";
import { parseQuestionnaireCoding } from "./parseQuestionnaireCoding";
import { readZipEntry } from "./readZipEntry";

/** Reads a Word .docx questionnaire and recognizes its questions and codes. */
export const parseDocxQuestionnaire = async (docxBytes: Uint8Array) => {
  const documentXmlBytes = await readZipEntry(docxBytes, "word/document.xml");
  if (!documentXmlBytes)
    throw new Error("Not a Word .docx file (word/document.xml is missing)");
  const lines = extractDocxLines(new TextDecoder().decode(documentXmlBytes));
  return { lines, questions: parseQuestionnaireCoding(lines) };
};
