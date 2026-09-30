import type {
  ContinueChatResponse,
  CustomEmbedBubble,
} from "@typebot.io/chat-api/schemas";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import type { Prisma } from "@typebot.io/prisma/types";
import type {
  AnswerDetails,
  AnswerOtherTexts,
  AnswerResearchValue,
  AnswerValueLabel,
} from "@typebot.io/results/schemas/answers";
import type {
  SetVariableHistoryItem,
  VariableWithUnknowValue,
} from "@typebot.io/variables/schemas";

export type ExecuteLogicResponse = {
  outgoingEdgeId: string | undefined | null;
  newSessionState?: SessionState;
  newSetVariableHistory?: SetVariableHistoryItem[];
} & Pick<ContinueChatResponse, "clientSideActions" | "logs">;

export type ExecuteIntegrationResponse = {
  outgoingEdgeId: string | undefined | null;
  newSessionState?: SessionState;
  startTimeShouldBeUpdated?: boolean;
  customEmbedBubble?: CustomEmbedBubble;
  newSetVariableHistory?: SetVariableHistoryItem[];
} & Pick<ContinueChatResponse, "clientSideActions" | "logs">;

/**
 * Research representation of a parsed reply.
 * `value` is what is stored in the dataset (codes), `label` is what the respondent saw.
 * Multiple choice replies are always arrays.
 */
export type StructuredAnswer = {
  value: AnswerResearchValue;
  label?: AnswerValueLabel;
  /** "Other, please specify" open answers by option code. */
  otherTexts?: AnswerOtherTexts;
  /** Overrides what is stored in the block variable (e.g. JSON for matrices). */
  variableValue?: string;
  /** Score of the answer, separate from the codes. null = no scored option selected. */
  score?: number | null;
  details?: AnswerDetails;
};

export type SuccessReply = {
  status: "success";
  content: string;
  outgoingEdgeId?: string;
  variablesToUpdate?: VariableWithUnknowValue[];
  structuredAnswer?: StructuredAnswer;
};

export type SkipReply = {
  status: "skip";
};

type FailReply = {
  status: "fail";
};

export type ParsedReply = SuccessReply | SkipReply | FailReply;

export type ContinueBotFlowResponse = ContinueChatResponse & {
  newSessionState: SessionState;
  visitedEdges: Prisma.VisitedEdge[];
  setVariableHistory: SetVariableHistoryItem[];
};
