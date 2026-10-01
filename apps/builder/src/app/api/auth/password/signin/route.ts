import { handlePasswordSignIn } from "@/features/auth/api/handlePasswordSignIn";

export const runtime = "nodejs";

export const POST = (request: Request) => handlePasswordSignIn(request);
