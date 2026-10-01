import { findPasswordSetupTokenEmail } from "@typebot.io/auth/helpers/passwordSetupTokens";

/** GET: email of a valid link (to show it on the page). */
export const handleGetPasswordSetupLink = async (request: Request) => {
  const token = new URL(request.url).searchParams.get("token");
  const email = token ? await findPasswordSetupTokenEmail(token) : undefined;
  if (!email) return Response.json({ error: "invalid-link" }, { status: 404 });
  return Response.json({ email });
};
