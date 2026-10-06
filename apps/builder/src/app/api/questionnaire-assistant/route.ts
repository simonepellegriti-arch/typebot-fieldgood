import { handleQuestionnaireAssistantRequest } from "@/features/questionnaireAssistant/api/handleQuestionnaireAssistantRequest";

export const runtime = "nodejs";
/** Long questionnaires take one or two minutes to read. */
export const maxDuration = 300;

export const POST = (request: Request) =>
  handleQuestionnaireAssistantRequest(request);
