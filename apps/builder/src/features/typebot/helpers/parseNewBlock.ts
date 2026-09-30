import { createId } from "@paralleldrive/cuid2";
import { blockTypeHasItems } from "@typebot.io/blocks-core/helpers";
import type { ItemV6 } from "@typebot.io/blocks-core/schemas/items/schema";
import type {
  BlockV6,
  BlockWithItems,
} from "@typebot.io/blocks-core/schemas/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { LogicBlockType } from "@typebot.io/blocks-logic/constants";

const parseDefaultItems = (type: BlockWithItems["type"]): ItemV6[] => {
  switch (type) {
    case InputBlockType.CHOICE:
    case InputBlockType.PICTURE_CHOICE:
    case LogicBlockType.CONDITION:
      return [{ id: createId() }];
    case InputBlockType.CARDS:
      return [
        {
          id: createId(),
          paths: [{ id: createId() }],
        },
      ];
    case LogicBlockType.AB_TEST:
      return [
        { id: createId(), path: "a" },
        { id: createId(), path: "b" },
      ];
  }
};

/** A new matrix starts with 3 rows and a 5-point scale, all with codes. */
const parseDefaultMatrixOptions = () => ({
  rows: [1, 2, 3].map((code) => ({ id: createId(), value: String(code) })),
  columns: [1, 2, 3, 4, 5].map((code) => ({
    id: createId(),
    label: String(code),
    value: String(code),
  })),
});

export const parseNewBlock = (type: BlockV6["type"]) =>
  ({
    id: createId(),
    type,
    ...(type === InputBlockType.MATRIX
      ? { options: parseDefaultMatrixOptions() }
      : undefined),

    ...(blockTypeHasItems(type)
      ? { items: parseDefaultItems(type) }
      : undefined),
  }) as BlockV6;
