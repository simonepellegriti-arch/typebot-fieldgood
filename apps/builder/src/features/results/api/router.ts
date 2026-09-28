import { authenticatedProcedure } from "@typebot.io/config/orpc/builder/middlewares";
import { logSchema } from "@typebot.io/logs/schemas";
import { resultWithAnswersSchema } from "@typebot.io/results/schemas/results";
import { z } from "zod";
import {
  deleteResultsInputSchema,
  handleDeleteResults,
} from "./handleDeleteResults";
import {
  exportResearchDatasetInputSchema,
  handleExportResearchDataset,
} from "./handleExportResearchDataset";
import {
  getExportJobStatusInputSchema,
  handleGetExportJobStatus,
} from "./handleGetExportJobStatus";
import { getResultInputSchema, handleGetResult } from "./handleGetResult";
import {
  getResultBlockFileInputSchema,
  handleGetResultBlockFile,
} from "./handleGetResultBlockFile";
import {
  getResultFileInputSchema,
  handleGetResultFile,
} from "./handleGetResultFile";
import {
  getResultLogsInputSchema,
  handleGetResultLogs,
} from "./handleGetResultLogs";
import { getResultsInputSchema, handleGetResults } from "./handleGetResults";
import {
  getResultTranscriptInputSchema,
  handleGetResultTranscript,
} from "./handleGetResultTranscript";
import {
  handleStartExportJob,
  startExportJobInputSchema,
} from "./handleStartExportJob";
import {
  handleTriggerSendExportResultsToEmail,
  triggerSendExportResultsToEmailInputSchema,
} from "./handleTriggerSendExportResultsToEmail";

export const resultsRouter = {
  getResults: authenticatedProcedure
    .route({
      method: "GET",
      path: "/v1/typebots/{typebotId}/results",
      operationId: "results-getResults",
      summary: "List results ordered by descending creation date",
      tags: ["Results"],
    })
    .input(getResultsInputSchema)
    .output(
      z.object({
        results: z.array(resultWithAnswersSchema),
        nextCursor: z.number().nullish(),
      }),
    )
    .handler(handleGetResults),

  getResult: authenticatedProcedure
    .route({
      method: "GET",
      path: "/v1/typebots/{typebotId}/results/{resultId}",
      operationId: "results-getResult",
      summary: "Get result by id",
      tags: ["Results"],
    })
    .input(getResultInputSchema)
    .output(
      z.object({
        result: resultWithAnswersSchema,
      }),
    )
    .handler(handleGetResult),

  getResultTranscript: authenticatedProcedure
    .route({
      method: "GET",
      path: "/v1/typebots/{typebotId}/results/{resultId}/transcript",
      operationId: "results-getResultTranscript",
      summary: "Get result transcript",
      tags: ["Results"],
    })
    .input(getResultTranscriptInputSchema)
    .output(
      z.object({
        transcript: z.array(
          z.object({
            role: z.enum(["bot", "user"]),
            type: z.enum(["text", "image", "video", "audio"]),
            text: z.string().optional(),
            image: z.string().optional(),
            video: z.string().optional(),
            audio: z.string().optional(),
          }),
        ),
      }),
    )
    .handler(handleGetResultTranscript),

  getResultLogs: authenticatedProcedure
    .route({
      method: "GET",
      path: "/v1/typebots/{typebotId}/results/{resultId}/logs",
      operationId: "results-getResultLogs",
      summary: "List result logs",
      tags: ["Results"],
    })
    .input(getResultLogsInputSchema)
    .output(z.object({ logs: z.array(logSchema) }))
    .handler(handleGetResultLogs),

  deleteResults: authenticatedProcedure
    .route({
      method: "DELETE",
      path: "/v1/typebots/{typebotId}/results",
      operationId: "results-deleteResults",
      summary: "Delete results",
      tags: ["Results"],
    })
    .input(deleteResultsInputSchema)
    .output(z.void())
    .handler(handleDeleteResults),
  getResultFile: authenticatedProcedure
    .route({
      method: "GET",
      path: "/typebots/{typebotId}/results/{resultId}/{fileName}",
      successStatus: 302,
      outputStructure: "detailed",
      deprecated: true,
    })
    .input(getResultFileInputSchema)
    .output(
      z.object({
        headers: z.object({
          location: z.string(),
        }),
      }),
    )
    .handler(handleGetResultFile),

  getResultBlockFile: authenticatedProcedure
    .route({
      method: "GET",
      path: "/typebots/{typebotId}/results/{resultId}/blocks/{blockId}/{fileName}",
      successStatus: 302,
      outputStructure: "detailed",
    })
    .input(getResultBlockFileInputSchema)
    .output(
      z.object({
        headers: z.object({
          location: z.string(),
        }),
      }),
    )
    .handler(handleGetResultBlockFile),

  exportResearchDataset: authenticatedProcedure
    .route({
      method: "POST",
      path: "/v1/typebots/{typebotId}/results/export-research",
      operationId: "results-exportResearchDataset",
      summary:
        "Export results as a research dataset (CSV or SPSS .sav + codebook)",
      description:
        "One row per interview with stable column names (variable names), interview status, ISO 8601 timestamps, questionnaire version, typed values, structured multiple choice and repeated answers.",
      tags: ["Results"],
    })
    .input(exportResearchDatasetInputSchema)
    .output(
      z.object({
        csvFileName: z.string(),
        codebookFileName: z.string(),
        savFileName: z.string(),
        csv: z.string(),
        savBase64: z
          .string()
          .optional()
          .describe(
            "SPSS system file, base64 encoded (when options.fileFormat is `sav`)",
          ),
        codebook: z.string(),
        rowCount: z.number(),
      }),
    )
    .handler(handleExportResearchDataset),

  startExportJob: authenticatedProcedure
    .input(startExportJobInputSchema)
    .handler(handleStartExportJob),

  getExportJobStatus: authenticatedProcedure
    .input(getExportJobStatusInputSchema)
    .handler(handleGetExportJobStatus),

  triggerSendExportResultsToEmail: authenticatedProcedure
    .output(
      z.object({
        message: z.string(),
      }),
    )
    .input(triggerSendExportResultsToEmailInputSchema)
    .handler(handleTriggerSendExportResultsToEmail),
};
