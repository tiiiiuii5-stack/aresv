import { NextResponse } from "next/server";

import { integrationModuleService } from "@/lib/services/integrationModules";
import { compileTrust } from "@/lib/trust/compiler";

export async function GET(request: Request) {
  await compileTrust(request, { mode: "publicRead", reason: "integration module catalog" });
  const modules = await integrationModuleService.listModules();
  const validation = await integrationModuleService.validateModules(modules);
  return NextResponse.json({
    ok: true,
    validation,
    modules: modules.map((integration) => ({
      name: integration.name,
      version: integration.version || "1.0.0",
      category: integration.category,
      description: integration.description,
      validationScore: integration.validationScore,
      immutable: integration.immutable ?? true,
      humanReviewedAt: integration.humanReviewedAt || null,
      files: integration.codeTemplate.files.map((file) => file.path),
      dependencies: integration.codeTemplate.dependencies,
      testCases: integration.testCases,
    })),
  });
}

export async function POST(request: Request) {
  try {
    await compileTrust(request, { mode: "admin" });
    const result = await integrationModuleService.seedDefaults();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to seed integration modules.";
    const status = message === "UNAUTHORIZED" ? 401 : /FORBIDDEN/.test(message) ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
