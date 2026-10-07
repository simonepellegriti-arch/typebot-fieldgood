import { authenticatedProcedure } from "@typebot.io/config/orpc/builder/middlewares";
import {
  connectAirtableInputSchema,
  handleConnectAirtable,
} from "./handleConnectAirtable";
import {
  createAirtableFieldsInputSchema,
  handleCreateAirtableFields,
} from "./handleCreateAirtableFields";
import {
  deleteParticipantsInputSchema,
  handleDeleteParticipants,
} from "./handleDeleteParticipants";
import {
  getParticipantsInputSchema,
  handleGetParticipants,
} from "./handleGetParticipants";
import {
  handleImportAirtableView,
  importAirtableViewInputSchema,
} from "./handleImportAirtableView";
import {
  handleImportParticipants,
  importParticipantsInputSchema,
} from "./handleImportParticipants";
import {
  handleSendParticipantsToAirtable,
  sendParticipantsToAirtableInputSchema,
} from "./handleSendParticipantsToAirtable";
import {
  handleUpdateParticipantPanel,
  updateParticipantPanelInputSchema,
} from "./handleUpdateParticipantPanel";

/** Respondent lists: unique links, resume and Airtable dashboard. */
export const participantsRouter = {
  getParticipants: authenticatedProcedure
    .input(getParticipantsInputSchema)
    .handler(handleGetParticipants),
  importParticipants: authenticatedProcedure
    .input(importParticipantsInputSchema)
    .handler(handleImportParticipants),
  updatePanel: authenticatedProcedure
    .input(updateParticipantPanelInputSchema)
    .handler(handleUpdateParticipantPanel),
  deleteParticipants: authenticatedProcedure
    .input(deleteParticipantsInputSchema)
    .handler(handleDeleteParticipants),
  connectAirtable: authenticatedProcedure
    .input(connectAirtableInputSchema)
    .handler(handleConnectAirtable),
  createAirtableFields: authenticatedProcedure
    .input(createAirtableFieldsInputSchema)
    .handler(handleCreateAirtableFields),
  importAirtableView: authenticatedProcedure
    .input(importAirtableViewInputSchema)
    .handler(handleImportAirtableView),
  sendToAirtable: authenticatedProcedure
    .input(sendParticipantsToAirtableInputSchema)
    .handler(handleSendParticipantsToAirtable),
};
