import { describe, expect, it } from "bun:test";
import type { ConstantSumInputBlock } from "@typebot.io/blocks-inputs/constantSum/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { SignatureInputBlock } from "@typebot.io/blocks-inputs/signature/schema";
import type { SliderInputBlock } from "@typebot.io/blocks-inputs/slider/schema";
import { parseS3PublicBaseUrl } from "@typebot.io/lib/s3/parseS3PublicBaseUrl";
import { parseConstantSumReply } from "../constantSum/parseConstantSumReply";
import { parseSignatureReply } from "../signature/parseSignatureReply";
import { parseSliderReply } from "./parseSliderReply";

// Signatures must live in our storage, whatever its configuration in tests.
const storageBaseUrl = parseS3PublicBaseUrl();

const singleSlider: SliderInputBlock = {
  id: "slider",
  type: InputBlockType.SLIDER,
  options: { question: "Quanto ti piace?", unit: "%" },
};

const statementSliders: SliderInputBlock = {
  id: "sliders",
  type: InputBlockType.SLIDER,
  options: {
    rows: [
      { id: "s1", label: "Moderno", value: "1", variableId: "v_modern" },
      { id: "s2", label: "Costoso", value: "2" },
    ],
  },
};

const constantSum: ConstantSumInputBlock = {
  id: "sum",
  type: InputBlockType.CONSTANT_SUM,
  options: {
    items: [
      { id: "k1", label: "Prezzo", value: "1" },
      { id: "k2", label: "Qualità", value: "2", variableId: "v_quality" },
      { id: "k3", label: "Marca", value: "3" },
    ],
  },
};

const variables = [
  { id: "v_modern", name: "MODERNO" },
  { id: "v_quality", name: "QUALITA" },
];

describe("parseSliderReply", () => {
  it("stores a single slider as a plain number", () => {
    const reply = parseSliderReply(
      {
        text: "-35",
        structuredReply: { type: "slider", values: { slider: -35 } },
      },
      { block: singleSlider, variables },
    );
    expect(reply).toMatchObject({
      status: "success",
      content: "-35%",
      structuredAnswer: { value: -35, label: "-35%", variableValue: "-35" },
    });
  });

  it("accepts typed numbers from API / WhatsApp clients", () => {
    expect(
      parseSliderReply(
        { text: "75%", structuredReply: undefined },
        { block: singleSlider, variables },
      ),
    ).toMatchObject({ status: "success", structuredAnswer: { value: 75 } });
    expect(
      parseSliderReply(
        { text: "150", structuredReply: undefined },
        { block: singleSlider, variables },
      ).status,
    ).toBe("fail");
  });

  it("stores several statements by code and fills their variables", () => {
    const reply = parseSliderReply(
      {
        text: "",
        structuredReply: { type: "slider", values: { s1: 80, s2: -100 } },
      },
      { block: statementSliders, variables },
    );
    expect(reply).toMatchObject({
      status: "success",
      content: "Moderno: 80\nCostoso: -100",
      structuredAnswer: { value: { "1": 80, "2": -100 } },
      variablesToUpdate: [{ id: "v_modern", value: 80 }],
    });
    expect(
      parseSliderReply(
        { text: "1=80, 2=-100", structuredReply: undefined },
        { block: statementSliders, variables },
      ),
    ).toMatchObject({ structuredAnswer: { value: { "1": 80, "2": -100 } } });
  });

  it("refuses an answer missing a statement", () => {
    expect(
      parseSliderReply(
        { text: "", structuredReply: { type: "slider", values: { s1: 80 } } },
        { block: statementSliders, variables },
      ).status,
    ).toBe("fail");
  });
});

describe("parseConstantSumReply", () => {
  it("stores every category (0 when empty) adding up to 100", () => {
    const reply = parseConstantSumReply(
      {
        text: "",
        structuredReply: { type: "constantSum", values: { k1: 70, k2: 30 } },
      },
      { block: constantSum, variables },
    );
    expect(reply).toMatchObject({
      status: "success",
      content: "Prezzo: 70\nQualità: 30\nMarca: 0\nTotal: 100",
      structuredAnswer: { value: { "1": 70, "2": 30, "3": 0 } },
      variablesToUpdate: [{ id: "v_quality", value: 30 }],
    });
  });

  it("refuses a total different from 100", () => {
    expect(
      parseConstantSumReply(
        {
          text: "",
          structuredReply: { type: "constantSum", values: { k1: 70, k2: 20 } },
        },
        { block: constantSum, variables },
      ).status,
    ).toBe("fail");
  });

  it("accepts category=amount text from API / WhatsApp clients", () => {
    expect(
      parseConstantSumReply(
        { text: "prezzo=40, 2=60", structuredReply: undefined },
        { block: constantSum, variables },
      ),
    ).toMatchObject({
      structuredAnswer: { value: { "1": 40, "2": 60, "3": 0 } },
    });
  });
});

describe("parseSignatureReply", () => {
  const block: SignatureInputBlock = {
    id: "sign",
    type: InputBlockType.SIGNATURE,
    options: {},
  };

  it("accepts the JPEG uploaded to our storage", () => {
    const url = `${storageBaseUrl}/public/tmp/typebots/t/blocks/sign/a.jpg`;
    expect(parseSignatureReply(url, { block })).toMatchObject({
      status: "success",
      content: url,
      structuredAnswer: { value: url },
    });
  });

  it("refuses other links and files", () => {
    expect(
      parseSignatureReply("https://evil.example.com/a.jpg", { block }).status,
    ).toBe("fail");
    expect(
      parseSignatureReply(`${storageBaseUrl}/public/tmp/a.html`, {
        block,
      }).status,
    ).toBe("fail");
  });

  it("can be skipped only when not required", () => {
    expect(parseSignatureReply(undefined, { block }).status).toBe("fail");
    expect(
      parseSignatureReply(undefined, {
        block: { ...block, options: { isRequired: false } },
      }).status,
    ).toBe("skip");
  });
});
