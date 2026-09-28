/**
 * Minimal, dependency-free writer for SPSS system files (.sav), uncompressed, UTF-8.
 * Format reference: GNU PSPP "System File Format" documentation.
 *
 * Supported: numeric / string / datetime variables, variable labels, numeric value labels,
 * discrete numeric missing values, measurement level, column width & alignment,
 * long variable names, very long strings (> 255 bytes), multiple response sets.
 */

export type SavVariable =
  | {
      name: string;
      label?: string;
      type: "numeric";
      decimals?: number;
      measure?: SavMeasure;
      valueLabels?: { value: number; label: string }[];
      missingValues?: number[];
    }
  | {
      name: string;
      label?: string;
      type: "datetime";
      measure?: SavMeasure;
    }
  | {
      name: string;
      label?: string;
      type: "string";
      /** Width in bytes (UTF-8). Computed from data when omitted. */
      width?: number;
      measure?: SavMeasure;
    };

export type SavMeasure = "nominal" | "ordinal" | "scale";

/** Cell values: numbers, strings, Date (datetime variables, wall-clock time) or null (missing). */
export type SavCell = number | string | Date | null;

export type SavMultipleResponseSet = {
  name: string;
  label: string;
  type: "dichotomies" | "categories";
  countedValue?: number;
  variableNames: string[];
};

export const writeSavFile = ({
  variables,
  rows,
  fileLabel = "",
  multipleResponseSets = [],
  now = new Date(),
}: {
  variables: SavVariable[];
  rows: SavCell[][];
  fileLabel?: string;
  multipleResponseSets?: SavMultipleResponseSet[];
  now?: Date;
}): Uint8Array => {
  const layout = computeLayout(variables, rows);
  const writer = new ByteWriter();

  writeHeader(writer, {
    caseSize: layout.totalSegments,
    caseCount: rows.length,
    fileLabel,
    now,
  });

  for (const variableLayout of layout.variables)
    writeVariableRecords(writer, variableLayout);

  writeValueLabelRecords(writer, layout);
  writeMachineIntegerInfo(writer);
  writeMachineFloatInfo(writer);
  writeMultipleResponseSets(writer, layout, multipleResponseSets);
  writeVariableDisplayParameters(writer, layout);
  writeLongVariableNames(writer, layout);
  writeVeryLongStringWidths(writer, layout);
  writeEncoding(writer);

  writer.int32(999);
  writer.int32(0);

  for (const row of rows) writeCase(writer, layout, row);

  return writer.toUint8Array();
};

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const SEGMENT_BYTES = 252;
const MAX_SHORT_STRING = 255;
const MAX_STRING_WIDTH = 32767;
const SPSS_EPOCH_OFFSET_SECONDS = 12_219_379_200; // 1582-10-14 → 1970-01-01

type VariableLayout = {
  variable: SavVariable;
  index: number;
  longName: string;
  /** Width in bytes for strings, 0 for numeric. */
  width: number;
  /** One entry per dictionary variable record (very long strings have several). */
  segments: {
    shortName: string;
    width: number;
    /** 1-based dictionary index (counting 8-byte units) */
    dictionaryIndex: number;
  }[];
};

type Layout = {
  variables: VariableLayout[];
  totalSegments: number;
};

const encoder = new TextEncoder();

const computeLayout = (variables: SavVariable[], rows: SavCell[][]): Layout => {
  const usedShortNames = new Set<string>();
  let nextDictionaryIndex = 1;
  const variableLayouts = variables.map<VariableLayout>((variable, index) => {
    const width =
      variable.type === "string"
        ? Math.min(
            MAX_STRING_WIDTH,
            Math.max(
              1,
              variable.width ??
                rows.reduce((maxWidth, row) => {
                  const cell = row[index];
                  return typeof cell === "string"
                    ? Math.max(maxWidth, encoder.encode(cell).length)
                    : maxWidth;
                }, 1),
            ),
          )
        : 0;
    const segmentWidths =
      width > MAX_SHORT_STRING
        ? splitVeryLongString(width)
        : [variable.type === "string" ? width : 0];
    const baseShortName = createShortName(variable.name, usedShortNames);
    const segments = segmentWidths.map((segmentWidth, segmentIndex) => {
      const shortName =
        segmentIndex === 0
          ? baseShortName
          : createSegmentShortName(baseShortName, segmentIndex, usedShortNames);
      const segment = {
        shortName,
        width: segmentWidth,
        dictionaryIndex: nextDictionaryIndex,
      };
      nextDictionaryIndex += unitsForWidth(segmentWidth);
      return segment;
    });
    return {
      variable,
      index,
      longName: variable.name,
      width,
      segments,
    };
  });
  return {
    variables: variableLayouts,
    totalSegments: nextDictionaryIndex - 1,
  };
};

const splitVeryLongString = (width: number) => {
  const segmentCount = Math.ceil(width / SEGMENT_BYTES);
  return Array.from({ length: segmentCount }, (_, segmentIndex) =>
    segmentIndex < segmentCount - 1
      ? MAX_SHORT_STRING
      : width - SEGMENT_BYTES * (segmentCount - 1),
  );
};

/** Number of 8-byte units used by a variable of this width (0 = numeric). */
const unitsForWidth = (width: number) =>
  width === 0 ? 1 : Math.ceil(width / 8);

const createShortName = (longName: string, usedShortNames: Set<string>) => {
  const sanitizedName = longName
    .toUpperCase()
    .replace(/[^A-Z0-9_.@#$]/g, "_")
    .replace(/^[^A-Z@#$]/, "V");
  let shortName = sanitizedName.slice(0, 8) || "V";
  let suffix = 1;
  while (usedShortNames.has(shortName)) {
    const suffixText = String(suffix++);
    shortName = `${sanitizedName.slice(0, 8 - suffixText.length)}${suffixText}`;
  }
  usedShortNames.add(shortName);
  return shortName;
};

const createSegmentShortName = (
  baseShortName: string,
  segmentIndex: number,
  usedShortNames: Set<string>,
) => {
  let suffix = segmentIndex;
  let shortName = "";
  do {
    const suffixText = String(suffix++);
    shortName = `${baseShortName.slice(0, 8 - suffixText.length)}${suffixText}`;
  } while (usedShortNames.has(shortName));
  usedShortNames.add(shortName);
  return shortName;
};

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

const writeHeader = (
  writer: ByteWriter,
  {
    caseSize,
    caseCount,
    fileLabel,
    now,
  }: { caseSize: number; caseCount: number; fileLabel: string; now: Date },
) => {
  writer.fixedString("$FL2", 4);
  writer.fixedString("@(#) SPSS DATA FILE - FIELDBOT", 60);
  writer.int32(2); // layout code
  writer.int32(caseSize);
  writer.int32(0); // no compression
  writer.int32(0); // no weight variable
  writer.int32(caseCount);
  writer.float64(100); // compression bias
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const pad = (value: number) => String(value).padStart(2, "0");
  writer.fixedString(
    `${pad(now.getUTCDate())} ${monthNames[now.getUTCMonth()]} ${pad(now.getUTCFullYear() % 100)}`,
    9,
  );
  writer.fixedString(
    `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`,
    8,
  );
  writer.fixedString(fileLabel, 64);
  writer.zeros(3);
};

const writeVariableRecords = (
  writer: ByteWriter,
  variableLayout: VariableLayout,
) => {
  const { variable } = variableLayout;
  variableLayout.segments.forEach((segment, segmentIndex) => {
    const isFirstSegment = segmentIndex === 0;
    const label = isFirstSegment ? variable.label : undefined;
    const missingValues =
      isFirstSegment && variable.type === "numeric"
        ? (variable.missingValues ?? []).slice(0, 3)
        : [];
    const format = encodeFormat(variable, segment.width);

    writer.int32(2);
    writer.int32(segment.width);
    writer.int32(label ? 1 : 0);
    writer.int32(missingValues.length);
    writer.int32(format);
    writer.int32(format);
    writer.fixedString(segment.shortName, 8);
    if (label) {
      const labelBytes = truncateUtf8(label, 255);
      writer.int32(labelBytes.length);
      writer.bytes(labelBytes);
      writer.zeros((4 - (labelBytes.length % 4)) % 4);
    }
    for (const missingValue of missingValues) writer.float64(missingValue);

    // Continuation records for strings wider than 8 bytes
    for (let unit = 1; unit < unitsForWidth(segment.width); unit++) {
      writer.int32(2);
      writer.int32(-1);
      writer.int32(0);
      writer.int32(0);
      writer.int32(0);
      writer.int32(0);
      writer.fixedString("", 8);
    }
  });
};

const FORMAT_A = 1;
const FORMAT_F = 5;
const FORMAT_DATETIME = 22;

const encodeFormat = (variable: SavVariable, segmentWidth: number) => {
  switch (variable.type) {
    case "numeric": {
      const decimals = variable.decimals ?? 0;
      return (FORMAT_F << 16) | (Math.max(8, decimals + 3) << 8) | decimals;
    }
    case "datetime":
      return (FORMAT_DATETIME << 16) | (20 << 8) | 0;
    case "string":
      return (FORMAT_A << 16) | (Math.min(segmentWidth, 255) << 8) | 0;
  }
};

const writeValueLabelRecords = (writer: ByteWriter, layout: Layout) => {
  for (const variableLayout of layout.variables) {
    const { variable } = variableLayout;
    if (variable.type !== "numeric" || !variable.valueLabels?.length) continue;
    writer.int32(3);
    writer.int32(variable.valueLabels.length);
    for (const valueLabel of variable.valueLabels) {
      writer.float64(valueLabel.value);
      const labelBytes = truncateUtf8(valueLabel.label, 120);
      writer.uint8(labelBytes.length);
      writer.bytes(labelBytes);
      writer.zeros((8 - ((labelBytes.length + 1) % 8)) % 8);
    }
    writer.int32(4);
    writer.int32(1);
    writer.int32(variableLayout.segments[0]!.dictionaryIndex);
  }
};

const writeExtensionRecord = (
  writer: ByteWriter,
  subtype: number,
  elementSize: number,
  body: Uint8Array,
) => {
  writer.int32(7);
  writer.int32(subtype);
  writer.int32(elementSize);
  writer.int32(body.length / elementSize);
  writer.bytes(body);
};

const writeMachineIntegerInfo = (writer: ByteWriter) => {
  const body = new ByteWriter();
  body.int32(1); // version major
  body.int32(0); // version minor
  body.int32(0); // version revision
  body.int32(-1); // machine code
  body.int32(1); // floating point: IEEE 754
  body.int32(1); // compression code
  body.int32(2); // endianness: little-endian
  body.int32(65001); // character code: UTF-8
  writeExtensionRecord(writer, 3, 4, body.toUint8Array());
};

const writeMachineFloatInfo = (writer: ByteWriter) => {
  const body = new ByteWriter();
  body.float64(-Number.MAX_VALUE); // system missing
  body.float64(Number.MAX_VALUE); // highest
  body.bytes(new Uint8Array([0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xef, 0xff])); // lowest
  writeExtensionRecord(writer, 4, 8, body.toUint8Array());
};

const writeMultipleResponseSets = (
  writer: ByteWriter,
  layout: Layout,
  multipleResponseSets: SavMultipleResponseSet[],
) => {
  const shortNameByLongName = new Map(
    layout.variables.map((variableLayout) => [
      variableLayout.longName,
      variableLayout.segments[0]!.shortName,
    ]),
  );
  const lines = multipleResponseSets.flatMap((set) => {
    const variableNames = set.variableNames
      .map((variableName) => shortNameByLongName.get(variableName))
      .filter((variableName) => variableName !== undefined);
    if (variableNames.length === 0) return [];
    const setName = set.name.startsWith("$") ? set.name : `$${set.name}`;
    const label = new TextDecoder().decode(truncateUtf8(set.label, 255));
    const labelLength = encoder.encode(label).length;
    if (set.type === "dichotomies") {
      const countedValue = String(set.countedValue ?? 1);
      return [
        `${setName}=D${countedValue.length} ${countedValue} ${labelLength} ${label} ${variableNames.join(" ")}\n`,
      ];
    }
    return [
      `${setName}=C ${labelLength} ${label} ${variableNames.join(" ")}\n`,
    ];
  });
  if (lines.length === 0) return;
  writeExtensionRecord(writer, 7, 1, encoder.encode(lines.join("")));
};

const MEASURE_CODES: Record<SavMeasure, number> = {
  nominal: 1,
  ordinal: 2,
  scale: 3,
};

const writeVariableDisplayParameters = (writer: ByteWriter, layout: Layout) => {
  const body = new ByteWriter();
  for (const variableLayout of layout.variables) {
    const { variable } = variableLayout;
    const measure =
      variable.measure ?? (variable.type === "numeric" ? "scale" : "nominal");
    for (const segment of variableLayout.segments) {
      body.int32(MEASURE_CODES[measure]);
      body.int32(
        variable.type === "string"
          ? Math.min(Math.max(segment.width, 8), 40)
          : variable.type === "datetime"
            ? 20
            : 8,
      );
      body.int32(variable.type === "string" ? 0 : 1); // 0 left, 1 right
    }
  }
  writeExtensionRecord(writer, 11, 4, body.toUint8Array());
};

const writeLongVariableNames = (writer: ByteWriter, layout: Layout) => {
  const text = layout.variables
    .map(
      (variableLayout) =>
        `${variableLayout.segments[0]!.shortName}=${new TextDecoder().decode(truncateUtf8(variableLayout.longName, 64))}`,
    )
    .join("\t");
  writeExtensionRecord(writer, 13, 1, encoder.encode(text));
};

const writeVeryLongStringWidths = (writer: ByteWriter, layout: Layout) => {
  const entries = layout.variables
    .filter((variableLayout) => variableLayout.segments.length > 1)
    .map(
      (variableLayout) =>
        `${variableLayout.segments[0]!.shortName}=${variableLayout.width}\u0000\t`,
    );
  if (entries.length === 0) return;
  writeExtensionRecord(writer, 14, 1, encoder.encode(entries.join("")));
};

const writeEncoding = (writer: ByteWriter) =>
  writeExtensionRecord(writer, 20, 1, encoder.encode("UTF-8"));

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const writeCase = (writer: ByteWriter, layout: Layout, row: SavCell[]) => {
  for (const variableLayout of layout.variables) {
    const cell = row[variableLayout.index] ?? null;
    const { variable } = variableLayout;
    if (variable.type === "numeric") {
      writer.float64(
        typeof cell === "number" && Number.isFinite(cell)
          ? cell
          : -Number.MAX_VALUE,
      );
      continue;
    }
    if (variable.type === "datetime") {
      writer.float64(
        cell instanceof Date && !Number.isNaN(cell.getTime())
          ? cell.getTime() / 1000 + SPSS_EPOCH_OFFSET_SECONDS
          : -Number.MAX_VALUE,
      );
      continue;
    }
    const valueBytes = truncateUtf8(
      cell === null
        ? ""
        : cell instanceof Date
          ? cell.toISOString()
          : String(cell),
      variableLayout.width,
    );
    // Segments of a very long string are filled sequentially, 255 bytes each
    // (the segment count follows the 252-byte rule, as SPSS/ReadStat do).
    variableLayout.segments.forEach((segment, segmentIndex) => {
      const chunkStart = segmentIndex * MAX_SHORT_STRING;
      const chunk = valueBytes.subarray(
        Math.min(chunkStart, valueBytes.length),
        Math.min(chunkStart + segment.width, valueBytes.length),
      );
      const paddedLength = unitsForWidth(segment.width) * 8;
      writer.bytes(chunk.subarray(0, paddedLength));
      writer.spaces(Math.max(0, paddedLength - chunk.length));
    });
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Truncates to at most `maxBytes` UTF-8 bytes without splitting a character. */
const truncateUtf8 = (text: string, maxBytes: number): Uint8Array => {
  const bytes = encoder.encode(text);
  if (bytes.length <= maxBytes) return bytes;
  let end = maxBytes;
  // biome-ignore lint/style/noNonNullAssertion: index is within bounds
  while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end--;
  return bytes.subarray(0, end);
};

class ByteWriter {
  private chunks: Uint8Array[] = [];
  private length = 0;

  private push(chunk: Uint8Array) {
    this.chunks.push(chunk);
    this.length += chunk.length;
  }

  int32(value: number) {
    const buffer = new Uint8Array(4);
    new DataView(buffer.buffer).setInt32(0, value, true);
    this.push(buffer);
  }

  uint8(value: number) {
    this.push(new Uint8Array([value]));
  }

  float64(value: number) {
    const buffer = new Uint8Array(8);
    new DataView(buffer.buffer).setFloat64(0, value, true);
    this.push(buffer);
  }

  bytes(value: Uint8Array) {
    this.push(new Uint8Array(value));
  }

  zeros(count: number) {
    if (count > 0) this.push(new Uint8Array(count));
  }

  spaces(count: number) {
    if (count > 0) this.push(new Uint8Array(count).fill(0x20));
  }

  /** ASCII/UTF-8 text padded with spaces (or truncated) to exactly `size` bytes. */
  fixedString(text: string, size: number) {
    const bytes = truncateUtf8(text, size);
    this.bytes(bytes);
    this.spaces(size - bytes.length);
  }

  toUint8Array() {
    const output = new Uint8Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }
    return output;
  }
}
