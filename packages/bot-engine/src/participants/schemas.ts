import { z } from "zod";

/** Link parameter carrying the participant's unique token: …/bot?pid=k7Q2xR9f */
export const participantLinkParameter = "pid";

export const participantStatuses = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
] as const;
export type ParticipantStatus = (typeof participantStatuses)[number];

export const participantStatusLabels: Record<ParticipantStatus, string> = {
  NOT_STARTED: "Non iniziato",
  IN_PROGRESS: "In corso",
  COMPLETED: "Completato",
};

/** List settings: which list column feeds which bot variable. */
export const participantPanelColumnsSchema = z.object({
  mappings: z.array(
    z.object({
      column: z.string(),
      variableName: z.string().nullable(),
    }),
  ),
  /** Without a personal link the bot shows an error (respondents can't start anonymously). */
  isLinkRequired: z.boolean().default(true),
});
export type ParticipantPanelColumns = z.infer<
  typeof participantPanelColumnsSchema
>;

export const participantAirtableSchema = z.object({
  baseId: z.string(),
  tableId: z.string(),
  tableName: z.string().optional(),
  /** First column of the table (e.g. "Name"): receives the participant ID. */
  primaryFieldName: z.string().optional(),
  /** Fields of the table when last checked: only these are written. */
  fieldNames: z.array(z.string()),
  /**
   * Bot variable → Airtable header (short question title, e.g. A1 →
   * "Lavoro e stile di vita"). Variables without one use their own name.
   */
  fieldMap: z.record(z.string(), z.string()).optional(),
  /** Bot variable → Airtable field id: follows a field across renames. */
  fieldIds: z.record(z.string(), z.string()).optional(),
  /**
   * The participants are the records of this view of an existing table (e.g.
   * the recruitment table): answers go into those records.
   */
  linkedView: z.string().optional(),
  /** Names of the standard fields when they differ from the defaults. */
  standardFieldNames: z
    .object({
      id: z.string(),
      link: z.string(),
      status: z.string(),
      checkpoint: z.string(),
      lastActivity: z.string(),
    })
    .partial()
    .optional(),
});
export type ParticipantAirtable = z.infer<typeof participantAirtableSchema>;

export const airtableTokenSchema = z.object({ token: z.string().min(1) });

/** A row of the uploaded list: column → cell text. */
export const participantRowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);

/** Standard fields of the Airtable dashboard. */
export const airtableStandardFields = {
  id: "ID",
  link: "Link",
  status: "Stato",
  checkpoint: "Checkpoint",
  lastActivity: "Ultima attività",
} as const;

/** Standard fields in a table that already has its own columns (recruitment). */
export const linkedTableStandardFieldNames = {
  link: "Link Chatbot",
  status: "Stato Chatbot",
  checkpoint: "Checkpoint Chatbot",
  lastActivity: "Ultima attività Chatbot",
} as const;

/** Standard field names of a connected table. */
export const getAirtableStandardFields = (
  airtable: Pick<ParticipantAirtable, "standardFieldNames"> | undefined,
) => ({ ...airtableStandardFields, ...airtable?.standardFieldNames });

export const parseParticipantPanelColumns = (value: unknown) =>
  participantPanelColumnsSchema.safeParse(value).data ?? {
    mappings: [],
    isLinkRequired: true,
  };

export const parseParticipantAirtable = (value: unknown) =>
  participantAirtableSchema.safeParse(value).data;

/** Values of the list row for the mapped bot variables. */
export const getParticipantVariables = (
  data: unknown,
  columns: ParticipantPanelColumns,
) => {
  const row = participantRowSchema.safeParse(data).data ?? {};
  return Object.fromEntries(
    columns.mappings.flatMap((mapping) => {
      const value = row[mapping.column];
      return mapping.variableName && value !== undefined && value !== null
        ? [[mapping.variableName, String(value)]]
        : [];
    }),
  );
};
