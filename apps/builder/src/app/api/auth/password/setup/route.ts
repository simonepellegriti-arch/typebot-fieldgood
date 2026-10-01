import { handleGetPasswordSetupLink } from "@/features/auth/api/handleGetPasswordSetupLink";
import { handlePasswordSetup } from "@/features/auth/api/handlePasswordSetup";

export const runtime = "nodejs";

export const GET = (request: Request) => handleGetPasswordSetupLink(request);

export const POST = (request: Request) => handlePasswordSetup(request);
