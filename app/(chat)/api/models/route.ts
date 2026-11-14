import { getCapabilities } from "@/lib/ai/models";
import { getEnabledModels } from "@/lib/ai/providers";

/** Modelos habilitados (según las API keys configuradas) y sus capacidades. */
export function GET() {
  const models = getEnabledModels();

  return Response.json(
    { capabilities: getCapabilities(models), models },
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
