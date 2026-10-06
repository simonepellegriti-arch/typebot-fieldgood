import type { BubbleBlockType } from "@typebot.io/blocks-bubbles/constants";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { VariableWithValue } from "@typebot.io/variables/schemas";
import type { JSX } from "react";
import { FileLinks } from "../components/FileLinks";

export const parseCellContent = (
  content: VariableWithValue["value"],
  blockType?: InputBlockType | BubbleBlockType.VIDEO,
): { element?: JSX.Element; plainText: string } => {
  if (!content) return { element: undefined, plainText: "" };
  if (Array.isArray(content)) {
    const itemKeyCounts = new Map<string, number>();
    return {
      element: (
        <div className="flex flex-col gap-2">
          {content.map((item, idx) => {
            const key = getRepeatedKey(String(item ?? ""), itemKeyCounts);
            return (
              <p key={key}>
                {idx + 1}. {item}
              </p>
            );
          })}
        </div>
      ),
      plainText: content.join(", "),
    };
  }
  if (blockType === InputBlockType.SIGNATURE && typeof content === "string")
    return {
      element: (
        <a href={content} target="_blank" rel="noreferrer">
          <img
            src={content}
            alt="Signature"
            className="h-10 w-auto rounded border border-gray-6 bg-white"
          />
        </a>
      ),
      plainText: content,
    };
  if (blockType === InputBlockType.PHOTO && typeof content === "string") {
    const photoUrls = content
      .split(",")
      .map((url) => url.trim())
      .filter(Boolean);
    return {
      element: (
        <div className="flex flex-wrap gap-1">
          {photoUrls.map((photoUrl, index) => (
            <a key={photoUrl} href={photoUrl} target="_blank" rel="noreferrer">
              <img
                src={photoUrl}
                alt={`${index + 1}`}
                className="h-10 w-10 rounded border border-gray-6 object-cover"
              />
            </a>
          ))}
        </div>
      ),
      plainText: content,
    };
  }
  return blockType === InputBlockType.FILE
    ? { element: <FileLinks fileNamesStr={content} />, plainText: content }
    : { plainText: content.toString() };
};

const getRepeatedKey = (value: string, counts: Map<string, number>) => {
  const count = counts.get(value) ?? 0;
  counts.set(value, count + 1);
  return count === 0 ? value : `${value}-${count}`;
};
