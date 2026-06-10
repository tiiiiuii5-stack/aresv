import { planApp } from "@/lib/app-planning-engine";
import { generateProject } from "@/lib/project-store";
import { buildMutationService } from "@/lib/services/buildMutation";
import { runtimeFactoryService } from "@/lib/services/runtimeFactory";

export class AgentOrchestratorService {
  async parseIntent(prompt: string, category = "custom") {
    return planApp(prompt, category);
  }

  async generate(input: { prompt: string; category?: string; userId?: string }) {
    const modelUsed = buildMutationService.randomizeModel(0);
    const temperature = buildMutationService.randomizeTemperature();
    const promptHash = buildMutationService.generatePromptHash(input.prompt);
    const job = {
      id: promptHash,
      action: "generate",
      userId: input.userId || "system",
      prompt: input.prompt,
      model: modelUsed,
      modelUsed,
      temperature,
      promptHash,
      mutationCount: 0,
      mutationHistory: [],
    };
    const project = await generateProject(input.prompt, input.category || "custom", input.userId);
    const runtime = await runtimeFactoryService.inspectProject(project.id);
    return { job, project, runtime, memories: [] };
  }
}

export const agentOrchestratorService = new AgentOrchestratorService();
export const agentOrchestrator = agentOrchestratorService;
