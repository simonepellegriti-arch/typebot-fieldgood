/**
 * Text lines of a Word document.xml, in reading order. One line per paragraph;
 * table rows become one line with their cells separated by tabs, so "1 | Uomo"
 * tables read like "1\tUomo". Automatic Word numbering is not in the XML text:
 * questionnaires usually type their codes, which is what the parser relies on.
 */
export const extractDocxLines = (documentXml: string): string[] => {
  const body = documentXml.match(/<w:body[\s>][\s\S]*<\/w:body>/)?.[0] ?? "";
  const lines: string[] = [];
  const blockPattern = /<w:tbl[\s>][\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g;
  for (const [block] of body.matchAll(blockPattern)) {
    if (block.startsWith("<w:tbl")) {
      for (const [row] of block.matchAll(/<w:tr[\s>][\s\S]*?<\/w:tr>/g)) {
        const cells = [...row.matchAll(/<w:tc[\s>][\s\S]*?<\/w:tc>/g)].map(
          ([cell]) =>
            [...cell.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)]
              .map(([paragraph]) => readParagraphText(paragraph))
              .join(" ")
              .trim(),
        );
        const rowText = cells.join("\t").trim();
        if (rowText) lines.push(rowText);
      }
      continue;
    }
    for (const line of readParagraphText(block).split("\n")) {
      const trimmedLine = line.trim();
      if (trimmedLine) lines.push(trimmedLine);
    }
  }
  return lines;
};

const readParagraphText = (paragraphXml: string) =>
  [
    ...paragraphXml.matchAll(
      /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g,
    ),
  ]
    .map(([token, text]) => {
      if (token === "<w:tab/>") return "\t";
      if (token === "<w:br/>" || token === "<w:cr/>") return "\n";
      return decodeXmlEntities(text ?? "");
    })
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
