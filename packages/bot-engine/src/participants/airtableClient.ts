import { z } from "zod";

const apiUrl = "https://api.airtable.com/v0";

/** Airtable REST calls with a personal access token; errors carry Airtable's message. */
export const airtableRequest = async (
  token: string,
  path: string,
  { method = "GET", body }: { method?: string; body?: unknown } = {},
) => {
  const response = await fetch(`${apiUrl}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = airtableErrorSchema.safeParse(json).data?.error;
    const message =
      typeof error === "string"
        ? error
        : (error?.message ?? error?.type ?? response.statusText);
    throw new AirtableError(response.status, message);
  }
  return json;
};

export class AirtableError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(`Airtable (${status}): ${message}`);
  }
}

const airtableErrorSchema = z.object({
  error: z.union([
    z.string(),
    z.object({
      type: z.string().optional(),
      message: z.string().optional(),
    }),
  ]),
});

const tablesSchema = z.object({
  tables: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      primaryFieldId: z.string().optional(),
      fields: z.array(z.object({ id: z.string(), name: z.string() })),
    }),
  ),
});

/** The table (by id or name) with its field names. */
export const getAirtableTable = async (
  token: string,
  { baseId, table }: { baseId: string; table: string },
) => {
  const { tables } = tablesSchema.parse(
    await airtableRequest(token, `meta/bases/${baseId}/tables`),
  );
  const found = tables.find(
    (candidate) =>
      candidate.id === table ||
      candidate.name.trim().toLowerCase() === table.trim().toLowerCase(),
  );
  if (!found)
    throw new AirtableError(404, `tabella "${table}" non trovata nella base`);
  return {
    id: found.id,
    name: found.name,
    fieldNames: found.fields.map((field) => field.name),
    fields: found.fields,
    primaryFieldName: found.fields.find(
      (field) => field.id === found.primaryFieldId,
    )?.name,
  };
};

/** Creates a long-text field; returns its id. */
export const createAirtableField = async (
  token: string,
  { baseId, tableId, name }: { baseId: string; tableId: string; name: string },
) =>
  createdFieldSchema.safeParse(
    await airtableRequest(
      token,
      `meta/bases/${baseId}/tables/${tableId}/fields`,
      { method: "POST", body: { name, type: "multilineText" } },
    ),
  ).data?.id;

const createdFieldSchema = z.object({ id: z.string() });

export const renameAirtableField = (
  token: string,
  {
    baseId,
    tableId,
    fieldId,
    name,
  }: { baseId: string; tableId: string; fieldId: string; name: string },
) =>
  airtableRequest(
    token,
    `meta/bases/${baseId}/tables/${tableId}/fields/${fieldId}`,
    { method: "PATCH", body: { name } },
  );

const recordsSchema = z.object({
  records: z.array(z.object({ id: z.string() })),
});

/** Creates records 10 at a time (Airtable limit); returns their ids in order. */
export const createAirtableRecords = async (
  token: string,
  { baseId, tableId }: { baseId: string; tableId: string },
  records: Record<string, string>[],
) => {
  const ids: string[] = [];
  for (let start = 0; start < records.length; start += 10) {
    const { records: created } = recordsSchema.parse(
      await airtableRequest(token, `${baseId}/${tableId}`, {
        method: "POST",
        body: {
          records: records
            .slice(start, start + 10)
            .map((fields) => ({ fields })),
          typecast: true,
        },
      }),
    );
    ids.push(...created.map((record) => record.id));
    // 5 requests per second per base.
    if (start + 10 < records.length)
      await new Promise((resolve) => setTimeout(resolve, 220));
  }
  return ids;
};

const listedRecordsSchema = z.object({
  records: z.array(
    z.object({ id: z.string(), fields: z.record(z.string(), z.unknown()) }),
  ),
  offset: z.string().optional(),
});

/** Every record of a view (or of the table), only the fields asked for. */
export const listAirtableRecords = async (
  token: string,
  {
    baseId,
    tableId,
    view,
    fieldNames,
  }: { baseId: string; tableId: string; view?: string; fieldNames: string[] },
) => {
  const records: z.infer<typeof listedRecordsSchema>["records"] = [];
  let offset: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (view) query.set("view", view);
    for (const name of fieldNames) query.append("fields[]", name);
    if (offset) query.set("offset", offset);
    const page = listedRecordsSchema.parse(
      await airtableRequest(token, `${baseId}/${tableId}?${query}`),
    );
    records.push(...page.records);
    offset = page.offset;
    if (offset) await new Promise((resolve) => setTimeout(resolve, 220));
  } while (offset);
  return records;
};

/** Updates records 10 at a time (Airtable limit). */
export const updateAirtableRecords = async (
  token: string,
  { baseId, tableId }: { baseId: string; tableId: string },
  records: { id: string; fields: Record<string, string> }[],
) => {
  for (let start = 0; start < records.length; start += 10) {
    await airtableRequest(token, `${baseId}/${tableId}`, {
      method: "PATCH",
      body: { records: records.slice(start, start + 10), typecast: true },
    });
    if (start + 10 < records.length)
      await new Promise((resolve) => setTimeout(resolve, 220));
  }
};

export const updateAirtableRecord = (
  token: string,
  {
    baseId,
    tableId,
    recordId,
  }: { baseId: string; tableId: string; recordId: string },
  fields: Record<string, string>,
) =>
  airtableRequest(token, `${baseId}/${tableId}/${recordId}`, {
    method: "PATCH",
    body: { fields, typecast: true },
  });
