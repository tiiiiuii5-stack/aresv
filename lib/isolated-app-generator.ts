import type { AppCategory, AppPlan } from "@/lib/app-planning-engine";
import type { ProjectFile } from "@/lib/project-store";

type RuntimeSeed = {
  records: Array<{ id: string; label: string; value: string; status: string; meta: string; parentId?: string }>;
  events: Array<{ message: string; createdAt: string }>;
};

type AppRecipe = {
  componentName: string;
  libName: string;
  primaryApi: string;
  extraRoutes: string[];
  cssMode: string;
  interaction: string;
};

const recipes: Record<AppCategory, AppRecipe> = {
  crm: {
    componentName: "PipelineCommandCenter",
    libName: "pipeline-engine",
    primaryApi: "clients",
    extraRoutes: ["clients", "pipeline", "analytics"],
    cssMode: "kanban-board",
    interaction: "move deal",
  },
  booking: {
    componentName: "AvailabilityCalendar",
    libName: "availability-engine",
    primaryApi: "book",
    extraRoutes: ["owner", "instructor", "member", "schedule"],
    cssMode: "calendar-grid",
    interaction: "bookSession",
  },
  ecommerce: {
    componentName: "CommerceStorefront",
    libName: "cart-engine",
    primaryApi: "cart",
    extraRoutes: ["products", "cart", "checkout"],
    cssMode: "catalog-grid",
    interaction: "add to cart",
  },
  analytics: {
    componentName: "MetricsWarRoom",
    libName: "metric-engine",
    primaryApi: "metrics",
    extraRoutes: ["funnels", "retention", "alerts"],
    cssMode: "metric-deck",
    interaction: "create alert",
  },
  fitness: {
    componentName: "TrainingTracker",
    libName: "training-engine",
    primaryApi: "checkins",
    extraRoutes: ["workouts", "progress", "coach"],
    cssMode: "tracker-stack",
    interaction: "log workout",
  },
  "ai-content": {
    componentName: "ContentStudio",
    libName: "content-engine",
    primaryApi: "drafts",
    extraRoutes: ["calendar", "assets", "analytics"],
    cssMode: "studio-rail",
    interaction: "create brief",
  },
  restaurant: {
    componentName: "KitchenOrderBoard",
    libName: "kitchen-engine",
    primaryApi: "orders",
    extraRoutes: ["order", "kitchen", "admin"],
    cssMode: "ordering-board",
    interaction: "send order",
  },
  social: {
    componentName: "CommunityFeed",
    libName: "community-engine",
    primaryApi: "posts",
    extraRoutes: ["members", "moderation", "events"],
    cssMode: "feed-stack",
    interaction: "publish post",
  },
  marketplace: {
    componentName: "MarketplaceDesk",
    libName: "market-engine",
    primaryApi: "inquiries",
    extraRoutes: ["products", "seller", "checkout"],
    cssMode: "market-grid",
    interaction: "send inquiry",
  },
  creator: {
    componentName: "CreatorRevenueHub",
    libName: "creator-engine",
    primaryApi: "offers",
    extraRoutes: ["offers", "subscribers", "launches"],
    cssMode: "revenue-grid",
    interaction: "launch offer",
  },
  custom: {
    componentName: "WorkflowConsole",
    libName: "workflow-engine",
    primaryApi: "records",
    extraRoutes: ["workflow", "records", "settings"],
    cssMode: "workflow-grid",
    interaction: "create record",
  },
};

export function generateIsolatedAppFiles(plan: AppPlan, projectId: string): ProjectFile[] {
  const recipe = recipes[plan.category] || recipes.custom;
  const files: ProjectFile[] = [
    f("README.md", readme(plan, recipe)),
    f("package.json", JSON.stringify(packageJson(plan), null, 2)),
    f("tsconfig.json", JSON.stringify(tsconfig(), null, 2)),
    f("next.config.js", "const nextConfig = {};\nmodule.exports = nextConfig;\n"),
    f(".env.example", "DATABASE_URL=\nNEXT_PUBLIC_APP_URL=\n"),
    f("schema.prisma", prismaSchema(plan)),
    f("app/layout.tsx", layout(plan)),
    f("app/globals.css", css(plan, recipe)),
    f("app/page.tsx", page(plan, recipe)),
    f(`components/${recipe.componentName}.tsx`, component(plan, recipe)),
    f(`features/${recipe.primaryApi}/interactions.ts`, featureModule(plan, recipe)),
    f(`db/${plan.category}-schema.ts`, dbModule(plan)),
    f(`api/${recipe.primaryApi}/handlers.ts`, apiHandlerModule(plan, recipe)),
    f("architecture/database-schema.json", JSON.stringify(databaseSchemaMap(plan), null, 2)),
    f("architecture/api-map.json", JSON.stringify(apiMap(plan), null, 2)),
    f("architecture/state-graph.json", JSON.stringify(stateGraph(plan), null, 2)),
    f("architecture/event-system.json", JSON.stringify(eventSystem(plan), null, 2)),
    f("architecture/job-system.json", JSON.stringify(jobSystem(plan), null, 2)),
    f("architecture/execution-binding.json", JSON.stringify(executionBinding(plan, recipe), null, 2)),
    f("architecture/runtime-factory.json", JSON.stringify(runtimeFactory(plan, recipe), null, 2)),
    f("architecture/README.md", architectureReadme(plan)),
    f(`lib/${recipe.libName}.ts`, engine(plan, recipe)),
    f(`app/api/${recipe.primaryApi}/route.ts`, apiRoute(plan, recipe)),
    f("preview/index.html", previewHtml(plan, recipe, projectId)),
  ];

  for (const route of recipe.extraRoutes) {
    files.push(f(`app/${route}/page.tsx`, routePage(plan, recipe, route)));
  }
  for (const endpoint of plan.apiEndpoints) {
    const clean = endpoint.path.replace(/^\/api\//, "").replace(/\[id\]/g, "[id]");
    if (!files.some((file) => file.path === `app/api/${clean}/route.ts`) && !clean.includes("/")) {
      files.push(f(`app/api/${clean}/route.ts`, apiRoute(plan, recipe, endpoint.path)));
    }
  }
  return files;
}

export function isolatedStructuralSignature(plan: AppPlan, files: ProjectFile[]) {
  const routeTree = files.filter((file) => file.path.startsWith("app/") && file.path.endsWith("page.tsx")).map((file) => file.path).sort().join("|");
  const apiTree = files.filter((file) => file.path.startsWith("app/api/")).map((file) => file.path).sort().join("|");
  const components = files.filter((file) => file.path.startsWith("components/")).map((file) => file.path).sort().join("|");
  const schema = plan.dataModels.map((model) => `${model.name}:${model.fields.join(",")}`).join("|");
  const relations = plan.relationships.map((relation) => `${relation.from}->${relation.to}:${relation.via}`).join("|");
  const interactions = plan.interactions.map((interaction) => `${interaction.type}:${interaction.target}:${interaction.result}`).join("|");
  return `${plan.category}::${plan.layout}::${routeTree}::${apiTree}::${components}::${schema}::${relations}::${interactions}`;
}

export function runtimeSeed(plan: AppPlan): RuntimeSeed {
  return {
    records: plan.seedData.map((item, index) => ({
      id: `${plan.category}-${index + 1}`,
      label: item.label,
      value: item.value,
      status: item.status,
      meta: plan.features[index % plan.features.length] || plan.category,
      parentId: index === 0 ? undefined : `${plan.category}-1`,
    })),
    events: [{ message: `${plan.productName} runtime initialized`, createdAt: new Date().toISOString() }],
  };
}

function f(path: string, content: string): ProjectFile {
  return { path, content };
}

function packageJson(plan: AppPlan) {
  return {
    name: plan.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    version: "1.0.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: { next: "16.2.6", react: "19.2.6", "react-dom": "19.2.6" },
    devDependencies: { typescript: "^6.0.3", "@types/node": "20.14.10", "@types/react": "^19.2.15", "@types/react-dom": "^19.2.3" },
  };
}

function tsconfig() {
  return {
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "dom.iterable", "esnext"],
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      paths: { "@/*": ["./*"] },
    },
    include: ["**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"],
  };
}

function readme(plan: AppPlan, recipe: AppRecipe) {
  return `# ${plan.productName}

${plan.problem}

This is an isolated ${plan.category} application. It does not depend on a shared app shell.

## Classification
- App type: ${plan.appType}
- Real users: ${plan.truthSpec.realUsers ? "yes" : "no"}
- Real actions: ${plan.truthSpec.realActions ? "yes" : "no"}
- Real data: ${plan.truthSpec.realData ? "yes" : "no"}
- Real state changes: ${plan.truthSpec.realStateChanges ? "yes" : "no"}

## Runtime behavior
- Component: ${recipe.componentName}
- State engine: lib/${recipe.libName}.ts
- Primary API: /api/${recipe.primaryApi}
- Interaction: ${recipe.interaction}

## Routes
${plan.routes.map((route) => `- ${route.path}: ${route.purpose}`).join("\n")}

## Schema
${plan.dataModels.map((model) => `- ${model.name}: ${model.fields.join(", ")}`).join("\n")}

## Relationships
${plan.relationships.map((relation) => `- ${relation.from} ${relation.type} ${relation.to} via ${relation.via}`).join("\n")}

## Functional interactions
${plan.interactions.map((interaction) => `- ${interaction.label}: ${interaction.result}`).join("\n")}

## Architecture maps
- architecture/database-schema.json: relational model graph
- architecture/api-map.json: action-to-backend endpoint map
- architecture/state-graph.json: state transition graph
- architecture/event-system.json: event trigger map
- architecture/job-system.json: async/background job policy
- architecture/execution-binding.json: UI action to API to data to state to UI proof
- architecture/runtime-factory.json: build, boot, interaction, preview, heal, and deploy gates
`;
}

function prismaSchema(plan: AppPlan) {
  const fieldsByModel = new Map(plan.dataModels.map((model) => [model.name, model.fields]));
  return `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

${plan.dataModels
  .map(
    (model) => `model ${model.name.replace(/[^A-Za-z0-9]/g, "")} {
  id        String   @id @default(cuid())
${model.fields.map((field) => `  ${field.replace(/[^A-Za-z0-9]/g, "") || "value"} String`).join("\n")}
${plan.relationships
  .filter((relation) => relation.from === model.name)
  .map((relation) => `  ${relation.to.replace(/[^A-Za-z0-9]/g, "")} ${relation.to.replace(/[^A-Za-z0-9]/g, "")}[]`)
  .join("\n")}
${plan.relationships
  .filter((relation) => relation.to === model.name && !fieldsByModel.get(model.name)?.includes(relation.via))
  .map((relation) => `  ${relation.via.replace(/[^A-Za-z0-9]/g, "")} String`)
  .join("\n")}
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`,
  )
  .join("\n\n")}
`;
}

function layout(plan: AppPlan) {
  return `import "./globals.css";

export const metadata = {
  title: "${safe(plan.productName)}",
  description: "${safe(plan.problem)}",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
`;
}

function css(plan: AppPlan, recipe: AppRecipe) {
  return `:root{--surface:${plan.palette.surface};--primary:${plan.palette.primary};--accent:${plan.palette.accent};--ink:${plan.palette.ink}}
*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,sans-serif}
button,input,textarea{font:inherit}.app{min-height:100vh}.top{position:sticky;top:0;background:rgba(255,255,255,.9);backdrop-filter:blur(14px);border-bottom:1px solid #e2e8f0}
.wrap{max-width:1180px;margin:0 auto;padding:18px 20px}.hero{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px}.panel{background:white;border:1px solid #e2e8f0;border-radius:16px;padding:20px;box-shadow:0 18px 45px rgba(15,23,42,.08)}
.${recipe.cssMode}{display:grid;gap:12px;${layoutCss(plan.layout)}}.card{border:1px solid #e2e8f0;background:#f8fafc;border-radius:14px;padding:16px}.primary{border:0;border-radius:12px;background:var(--primary);color:white;padding:12px 14px;font-weight:800;cursor:pointer}
@media(max-width:840px){.hero{grid-template-columns:1fr}.${recipe.cssMode}{grid-template-columns:1fr!important}}
`;
}

function page(_plan: AppPlan, recipe: AppRecipe) {
  return `import { ${recipe.componentName} } from "@/components/${recipe.componentName}";

export default function Page() {
  return <${recipe.componentName} />;
}
`;
}

function routePage(plan: AppPlan, recipe: AppRecipe, route: string) {
  const match = plan.routes.find((item) => item.path.replace("/", "") === route);
  return `import { ${recipe.componentName} } from "@/components/${recipe.componentName}";

export default function ${pascal(route)}Page() {
  return <${recipe.componentName} initialView="${match?.label || route}" />;
}
`;
}

function component(plan: AppPlan, recipe: AppRecipe) {
  const seed = JSON.stringify(runtimeSeed(plan).records, null, 2);
  const transitions = JSON.stringify(statusFlow(plan));
  const storageKey = `${plan.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:records`;
  return `"use client";

import { useEffect, useMemo, useState } from "react";

const initialRecords = ${seed};
const views = ${JSON.stringify(plan.navigation)};
const transitions = ${transitions};
const storageKey = ${JSON.stringify(storageKey)};

export function ${recipe.componentName}({ initialView = views[0] }: { initialView?: string }) {
  const [view, setView] = useState(initialView);
  const [records, setRecords] = useState(initialRecords);
  const [input, setInput] = useState("");
  const [events, setEvents] = useState<string[]>(["${safe(plan.productName)} ready"]);
  const visible = useMemo(() => records.filter((record) => view === views[0] || record.status.toLowerCase().includes(view.toLowerCase()) || record.meta.toLowerCase().includes(view.toLowerCase())), [records, view]);
  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);
    if (stored) setRecords(JSON.parse(stored));
  }, []);
  function persist(nextRecords: typeof initialRecords) {
    window.localStorage.setItem(storageKey, JSON.stringify(nextRecords));
    setRecords(nextRecords);
  }
  async function mutate(payload: { action: "create" | "transition" | "delete"; id?: string; label?: string; value?: string; status?: string }) {
    const response = await fetch("/api/${recipe.primaryApi}", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, records }),
    });
    if (!response.ok) {
      setEvents((current) => ["Backend mutation failed", ...current]);
      return;
    }
    const data = await response.json() as { records: typeof initialRecords; record?: (typeof initialRecords)[number] };
    window.localStorage.setItem(storageKey, JSON.stringify(data.records));
    setRecords(data.records);
    setEvents((current) => [payload.action + " persisted through /api/${recipe.primaryApi}", ...current]);
    if (payload.action === "create") setInput("");
  }
  return (
    <main className="app">
      <header className="top"><div className="wrap" style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}><strong>${safe(plan.productName)}</strong><nav style={{display:"flex",gap:8,overflowX:"auto"}}>{views.map((item) => <a key={item} href={"#"+item} onClick={(event) => { event.preventDefault(); setView(item); }} className="primary" style={{background:item===view?"var(--primary)":"#e2e8f0",color:item===view?"white":"#0f172a",textDecoration:"none"}}>{item}</a>)}</nav></div></header>
      <section className="wrap hero">
        <div className="panel">
          <p style={{fontWeight:900,textTransform:"uppercase",letterSpacing:".16em",fontSize:12,color:"var(--primary)"}}>${plan.category}</p>
          <h1 style={{fontSize:48,lineHeight:1,margin:"10px 0"}}>${safe(plan.productName)}</h1>
          <p style={{lineHeight:1.7,color:"#475569"}}>${safe(plan.problem)}</p>
          <div className="${recipe.cssMode}" style={{marginTop:18}}>{visible.map((record) => <article key={record.id || record.label} className="card"><strong>{record.label}</strong><p style={{fontSize:28,fontWeight:850,margin:"8px 0"}}>{record.value}</p><span>{record.status}</span><div style={{display:"flex",gap:8,marginTop:12}}><button data-action="transition" data-api="/api/${recipe.primaryApi}" data-db-change="update-status" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "transition", id: record.id })} className="primary" style={{padding:"8px 10px"}}>${safe(plan.interactions.find((item) => item.type === "transition")?.label || "Advance")}</button><button data-action="delete" data-api="/api/${recipe.primaryApi}" data-db-change="delete-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "delete", id: record.id })} className="primary" style={{padding:"8px 10px",background:"#fee2e2",color:"#991b1b"}}>${safe(plan.interactions.find((item) => item.type === "delete")?.label || "Delete")}</button></div></article>)}</div>
        </div>
        <aside className="panel">
          <h2>${safe(plan.forms[0]?.name || recipe.interaction)}</h2>
          <p>${safe(plan.forms[0]?.action || recipe.interaction)}</p>
          <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="${safe((plan.forms[0]?.fields || ["Name"]).join(", "))}" style={{width:"100%",minHeight:110,border:"1px solid #cbd5e1",borderRadius:12,padding:12}} />
          <button data-action="create" data-api="/api/${recipe.primaryApi}" data-db-change="insert-record" data-state-update="setRecords" data-ui-refresh="records-list" onClick={() => mutate({ action: "create", label: input || "${safe(plan.forms[0]?.name || "New item")}", value: "New", status: transitions[0] || "Created" })} className="primary" style={{width:"100%",marginTop:10}}>${safe(recipe.interaction)}</button>
          <div style={{display:"grid",gap:8,marginTop:16}}>{events.map((event) => <div key={event} className="card">{event}</div>)}</div>
        </aside>
      </section>
    </main>
  );
}
`;
}

function featureModule(plan: AppPlan, recipe: AppRecipe) {
  return `export const interactionMap = ${JSON.stringify(plan.interactions, null, 2)} as const;
export const relationshipMap = ${JSON.stringify(plan.relationships, null, 2)} as const;

export function validate${pascal(recipe.primaryApi)}Relationships(record: { parentId?: string }, existingIds: string[]) {
  if (!relationshipMap.length) throw new Error("Generated app requires relational data models.");
  return !record.parentId || existingIds.includes(record.parentId);
}
`;
}

function dbModule(plan: AppPlan) {
  return `export const models = ${JSON.stringify(plan.dataModels, null, 2)} as const;
export const relationships = ${JSON.stringify(plan.relationships, null, 2)} as const;

export function assertRelationalSchema() {
  if (relationships.length < 2) throw new Error("Relational schema is required.");
  return relationships.map((relation) => relation.from + " -> " + relation.to);
}
`;
}

function apiHandlerModule(plan: AppPlan, recipe: AppRecipe) {
  return `import { apply${pascal(recipe.primaryApi)}Mutation, remove${pascal(recipe.primaryApi)}Record, transition${pascal(recipe.primaryApi)}Record } from "@/lib/${recipe.libName}";

export const statusFlow = ${JSON.stringify(statusFlow(plan), null, 2)} as const;

export function handle${pascal(recipe.primaryApi)}Action(records: Array<{ id: string; label: string; value: string; status: string; meta?: string; parentId?: string }>, body: { action?: string; id?: string; label?: string; value?: string; status?: string }) {
  if (body.action === "transition" && body.id) return transition${pascal(recipe.primaryApi)}Record(records, body.id, [...statusFlow]);
  if (body.action === "delete" && body.id) return remove${pascal(recipe.primaryApi)}Record(records, body.id);
  return apply${pascal(recipe.primaryApi)}Mutation(records, { label: body.label || "${safe(plan.forms[0]?.name || "Record")}", value: body.value || "New", status: body.status || statusFlow[0] || "Created" });
}
`;
}

function databaseSchemaMap(plan: AppPlan) {
  return {
    appType: plan.appType,
    domainEntities: plan.domainAnalysis?.entities || plan.dataModels,
    roles: plan.domainAnalysis?.roles || [],
    businessRules: plan.domainAnalysis?.businessRules || [],
    models: plan.dataModels.map((model) => ({
      name: model.name,
      fields: model.fields,
      owns: plan.relationships.filter((relation) => relation.from === model.name).map((relation) => ({ model: relation.to, via: relation.via, type: relation.type })),
      belongsTo: plan.relationships.filter((relation) => relation.to === model.name).map((relation) => ({ model: relation.from, via: relation.via, type: relation.type })),
    })),
    relationships: plan.relationships,
    invariants: [
      "Every generated app has at least two relational links.",
      "Child records carry a foreign key defined by relationship.via.",
      "Deletes cascade dependent runtime rows through parentId in preview runtime.",
    ],
  };
}

function apiMap(plan: AppPlan) {
  return {
    backendRequired: true,
    domainActions: plan.domainAnalysis?.actions || [],
    endpoints: plan.apiEndpoints.map((endpoint) => ({
      ...endpoint,
      hitsBackend: true,
      requestBody: endpoint.method === "GET" ? null : { action: "create | transition | delete", id: "optional record id", label: "optional user value" },
      responseShape: { ok: true, records: "updated domain records" },
    })),
    actionBindings: plan.interactions.map((interaction, index) => ({
      action: interaction.label,
      type: interaction.type,
      target: interaction.target,
      backend: plan.apiEndpoints[index % plan.apiEndpoints.length],
      mustPersist: true,
      executionChain: ["uiAction", "apiRoute", "databaseChange", "stateUpdate", "uiRefresh"],
    })),
  };
}

function stateGraph(plan: AppPlan) {
  if (plan.domainAnalysis?.stateMachines.length) {
    return {
      domainStateMachines: plan.domainAnalysis.stateMachines,
      initialStates: plan.domainAnalysis.stateMachines.flatMap((machine) => machine.states.slice(0, 1)),
      transitions: plan.domainAnalysis.stateMachines.flatMap((machine) => machine.transitions.map((transition) => ({ entity: machine.entity, ...transition }))),
      mutations: plan.interactions.map((interaction) => ({
        action: interaction.label,
        changes: interaction.result,
        target: interaction.target,
      })),
    };
  }
  const flow = statusFlow(plan);
  return {
    initialStates: [...new Set(plan.seedData.map((item) => item.status))],
    transitions: flow.map((state, index) => ({
      from: state,
      to: flow[Math.min(index + 1, flow.length - 1)],
      terminal: index === flow.length - 1,
      triggeredBy: plan.interactions.find((interaction) => interaction.type === "transition")?.label || "Advance state",
    })),
    mutations: plan.interactions.map((interaction) => ({
      action: interaction.label,
      changes: interaction.result,
      target: interaction.target,
    })),
  };
}

function eventSystem(plan: AppPlan) {
  return {
    domainEvents: plan.domainAnalysis?.actions.map((action) => ({
      name: action.name,
      role: action.role,
      api: action.api,
      result: action.result,
    })) || [],
    events: plan.interactions.map((interaction) => ({
      name: `${pascal(plan.category)}${pascal(interaction.type)}${pascal(interaction.target)}`,
      trigger: interaction.label,
      payload: { target: interaction.target, result: interaction.result, timestamp: "ISO-8601" },
      sideEffects: [
        interaction.type === "create" ? "append record" : "",
        interaction.type === "transition" || interaction.type === "update" ? "update record status" : "",
        interaction.type === "delete" ? "remove record and dependents" : "",
        "prepend audit event",
      ].filter(Boolean),
    })),
    delivery: "in-process runtime event log plus API response payload",
  };
}

function jobSystem(plan: AppPlan) {
  const asyncNeeded = plan.category === "ai-content" || plan.category === "analytics" || plan.interactions.some((interaction) => /export|approve|publish|checkout|alert|AI/i.test(`${interaction.label} ${interaction.result}`));
  return {
    asyncNeeded,
    queuePolicy: asyncNeeded ? "Use queued job for long-running generation, publishing, checkout, export, alerting, or AI work." : "Handle request-time mutations only; enqueue if action exceeds serverless timeout budget.",
    jobs: plan.interactions
      .filter((interaction) => asyncNeeded || /export|approve|publish|checkout|alert|AI/i.test(`${interaction.label} ${interaction.result}`))
      .map((interaction) => ({
        name: `${pascal(plan.category)}${pascal(interaction.type)}Job`,
        trigger: interaction.label,
        mode: asyncNeeded ? "async" : "sync-safe",
        retry: { maxAttempts: 3, backoff: "exponential" },
        idempotencyKey: `${plan.category}:${interaction.type}:${interaction.target}:recordId`,
      })),
  };
}

function executionBinding(plan: AppPlan, recipe: AppRecipe) {
  return {
    rule: "UI ACTION -> API ROUTE -> DATABASE CHANGE -> STATE UPDATE -> UI REFRESH",
    blockBuildIfAnyStepMissing: true,
    apiRoute: `/api/${recipe.primaryApi}`,
    domainValidation: plan.domainAnalysis ? {
      persistence: plan.domainAnalysis.persistence,
      errors: plan.domainAnalysis.errorCases,
      validationChecks: plan.domainAnalysis.validationChecks,
    } : null,
    bindings: plan.interactions.map((interaction) => ({
      uiAction: {
        label: interaction.label,
        selector: `[data-action="${interaction.type}"]`,
        event: "click",
      },
      apiRoute: {
        method: "POST",
        path: `/api/${recipe.primaryApi}`,
        requestAction: interaction.type,
      },
      databaseChange: {
        target: interaction.target,
        operation: interaction.type === "delete" ? "delete" : interaction.type === "transition" || interaction.type === "update" ? "update" : "insert",
        persisted: true,
      },
      stateUpdate: {
        clientStateSetter: "setRecords",
        source: "API response records",
      },
      uiRefresh: {
        region: "records-list",
        mechanism: "React state re-render",
      },
    })),
  };
}

function runtimeFactory(plan: AppPlan, recipe: AppRecipe) {
  return {
    pipeline: "REAL RUNTIME APPLICATION FACTORY",
    runtimeType: "fullstack",
    domainAnalysis: plan.domainAnalysis || null,
    phases: {
      intentToSpec: {
        appType: plan.appType,
        structuredSpec: true,
        domainEntities: plan.domainAnalysis?.entities || plan.dataModels,
        roles: plan.domainAnalysis?.roles || [],
        businessRules: plan.domainAnalysis?.businessRules || [],
        stateMachines: plan.domainAnalysis?.stateMachines || [],
        routes: plan.routes,
        databaseSchema: plan.dataModels,
        uiScreens: plan.routes.map((route) => ({ path: route.path, screen: route.label, wiredToBackend: true })),
        requiredIntegrations: integrationList(plan),
        unclearSpecPolicy: "block generation and ask questions",
      },
      codeGeneration: {
        realFileTree: true,
        backendRoutes: plan.apiEndpoints.map((endpoint) => endpoint.path),
        frontendPages: plan.routes.map((route) => route.path),
        databaseSchema: "schema.prisma",
        environmentVariables: [".env.example"],
        noPlaceholderButtons: true,
        noStaticMockDataUnlessMarkedMock: true,
      },
      buildInstall: {
        requiredCommands: ["npm install", "npm run build", "npm run type-check", "npm run lint"],
        maxRepairLoops: 3,
        invalidIfBuildFails: true,
      },
      runtimeBootstrap: {
        startCommand: "npm run start",
        healthChecks: ["GET /", `GET /api/${recipe.primaryApi}`],
        databaseCheck: "assertRelationalSchema",
        brokenIfAnyFail: true,
      },
      interactionTesting: {
        clickEveryButton: true,
        submitEveryForm: true,
        navigateEveryRoute: true,
        testApiEndpoints: true,
        blockFakeUi: true,
      },
      previewGeneration: {
        realOnly: true,
        requiresServerRunning: true,
        requiresRoutesRespond: true,
        requiresJsExecuting: true,
        requiresBackendAlive: true,
        requiresDatabaseConnected: true,
        noStaticPreviewModeEver: true,
      },
      selfHeal: {
        loop: "build -> run -> test -> fail -> fix -> rebuild",
        maxLoops: 5,
        stopOnlyWhen: ["zero runtime errors", "all routes respond", "UI is interactive", "backend is connected"],
      },
      deploymentGate: {
        buildSuccess: true,
        runtimeSuccess: true,
        testSuccess: true,
        noFakeUiDetected: true,
      },
    },
  };
}

function integrationList(plan: AppPlan) {
  const integrations = ["database", "project runtime API"];
  if (plan.category === "ecommerce" || /checkout|payment|order/i.test(plan.features.join(" "))) integrations.push("stripe-ready checkout boundary");
  if (plan.category === "ai-content") integrations.push("AI provider boundary");
  if (/admin|account|client|seller|member/i.test(plan.navigation.join(" "))) integrations.push("auth-ready protected routes");
  return integrations;
}

function architectureReadme(plan: AppPlan) {
  return `# ${plan.productName} Architecture

## Database schema
See \`database-schema.json\` for models and real relationships.

## API map
See \`api-map.json\`. Every listed action is bound to a backend endpoint and must persist state.

## State graph
See \`state-graph.json\`. Transitions define what changes what.

## Event system
See \`event-system.json\`. Events describe trigger, payload, and side effects.

## Job system
See \`job-system.json\`. Async work is queued when the action is long-running or externally dependent.

## Execution binding
See \`execution-binding.json\`. Every button must complete: UI action -> API route -> database change -> state update -> UI refresh.

## Runtime factory
See \`runtime-factory.json\`. Preview and deployment are blocked unless build, runtime, interaction, and fake-UI checks pass.
`;
}

function engine(_plan: AppPlan, recipe: AppRecipe) {
  return `type RecordItem = { id: string; label: string; value: string; status: string; meta?: string; parentId?: string };

export function apply${pascal(recipe.primaryApi)}Mutation(records: RecordItem[], input: Pick<RecordItem, "label" | "value" | "status">) {
  const created = { id: crypto.randomUUID?.() || String(Date.now()), ...input, meta: "${recipe.interaction}", parentId: records[0]?.id };
  return {
    records: [created, ...records],
    event: "${recipe.interaction}: " + created.label,
  };
}

export function transition${pascal(recipe.primaryApi)}Record(records: RecordItem[], id: string, flow: string[]) {
  let changed = "No record changed";
  const nextRecords = records.map((record) => {
    if (record.id !== id) return record;
    const index = flow.indexOf(record.status);
    const status = flow[Math.min(index + 1, flow.length - 1)] || "Done";
    changed = record.label + " moved to " + status;
    return { ...record, status };
  });
  return { records: nextRecords, event: changed };
}

export function remove${pascal(recipe.primaryApi)}Record(records: RecordItem[], id: string) {
  const target = records.find((record) => record.id === id);
  return {
    records: records.filter((record) => record.id !== id && record.parentId !== id),
    event: target ? "Removed " + target.label : "Removed record",
  };
}
`;
}

function apiRoute(plan: AppPlan, recipe: AppRecipe, endpoint = recipe.primaryApi) {
  const seed = JSON.stringify(runtimeSeed(plan).records, null, 2);
  const flow = JSON.stringify(statusFlow(plan));
  if (plan.domainAnalysis && plan.category === "booking") return bookingApiRoute(plan, recipe, endpoint, seed);
  return `const seedRecords = ${seed};
const statusFlow = ${flow};

export async function GET() {
  return Response.json({ records: seedRecords, endpoint: "${endpoint}", persistence: "client-localStorage" });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const currentRecords = Array.isArray(body.records) ? body.records : seedRecords;
  if (body.action === "transition" && body.id) {
    const records = currentRecords.map((record) => record.id === body.id ? { ...record, status: statusFlow[Math.min(statusFlow.indexOf(record.status) + 1, statusFlow.length - 1)] || "Done" } : record);
    return Response.json({ ok: true, records, persistence: "client-localStorage" });
  }
  if (body.action === "delete" && body.id) {
    const records = currentRecords.filter((record) => record.id !== body.id && record.parentId !== body.id);
    return Response.json({ ok: true, records, persistence: "client-localStorage" });
  }
  const record = { id: crypto.randomUUID(), label: body.label || "${safe(plan.forms[0]?.name || "Record")}", value: body.value || "New", status: body.status || statusFlow[0] || "Created", meta: "${recipe.interaction}", parentId: currentRecords[0]?.id };
  const records = [record, ...currentRecords];
  return Response.json({ ok: true, record, records, persistence: "client-localStorage" }, { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => ({}));
  const currentRecords = Array.isArray(body.records) ? body.records : seedRecords;
  const records = currentRecords.map((record) => record.id === body.id ? { ...record, status: body.status || "Done" } : record);
  return Response.json({ ok: true, records, persistence: "client-localStorage" });
}

export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const currentRecords = Array.isArray(body.records) ? body.records : seedRecords;
  const records = currentRecords.filter((record) => record.id !== body.id && record.parentId !== body.id);
  return Response.json({ ok: true, records, persistence: "client-localStorage" });
}
`;
}

function bookingApiRoute(plan: AppPlan, _recipe: AppRecipe, endpoint: string, seed: string) {
  return `const seedRecords = ${seed};

type StudioRecord = { id: string; label: string; value: string; status: string; meta?: string; parentId?: string };

export async function GET(request: Request) {
  const url = new URL(request.url);
  return Response.json({
    records: seedRecords,
    endpoint: "${endpoint}",
    persistence: "client-localStorage",
    instructor: url.searchParams.get("instructor"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const records: StudioRecord[] = Array.isArray(body.records) ? body.records : seedRecords;
  if (body.action === "delete" || body.action === "cancelBooking") return cancelBooking(records, body.id);
  if (body.action === "transition" || body.action === "markAttendance") return markAttendance(records, body.id, body.attendanceStatus || "present");
  if (body.action === "publishTimeSlot") return publishTimeSlot(records, body.id);
  return bookSession(records, body);
}

function bookSession(records: StudioRecord[], body: { label?: string; value?: string; status?: string }) {
  const target = records.find((record) => /seat|full|published/i.test(record.value + " " + record.status));
  const capacity = capacityFrom(target?.value || "0 seats left");
  if (!target || capacity <= 0) return Response.json({ ok: false, error: "Class is full", records }, { status: 409 });
  const updated = records.map((record) => record.id === target.id ? { ...record, value: String(capacity - 1) + " seats left", status: "confirmed" } : record);
  const booking = { id: crypto.randomUUID(), label: body.label || target.label + " booking", value: target.label, status: "confirmed", meta: "Booking", parentId: target.id };
  return Response.json({ ok: true, record: booking, records: [booking, ...updated], persistence: "client-localStorage" }, { status: 201 });
}

function cancelBooking(records: StudioRecord[], id?: string) {
  const booking = records.find((record) => record.id === id);
  if (!booking) return Response.json({ ok: false, error: "Booking not found", records }, { status: 404 });
  if (booking.status !== "confirmed") return Response.json({ ok: false, error: "Cannot cancel past classes", records }, { status: 409 });
  const updated = records.map((record) => record.id === booking.parentId ? { ...record, value: String(capacityFrom(record.value) + 1) + " seats left" } : record.id === id ? { ...record, status: "cancelled" } : record);
  return Response.json({ ok: true, records: updated, persistence: "client-localStorage" });
}

function markAttendance(records: StudioRecord[], id?: string, attendanceStatus = "present") {
  const updated = records.map((record) => record.id === id ? { ...record, status: attendanceStatus === "present" ? "attended" : attendanceStatus } : record);
  return Response.json({ ok: true, records: updated, persistence: "client-localStorage" });
}

function publishTimeSlot(records: StudioRecord[], id?: string) {
  const updated = records.map((record) => record.id === id ? { ...record, status: "published" } : record);
  return Response.json({ ok: true, records: updated, persistence: "client-localStorage" });
}

function capacityFrom(value: string) {
  return Number(value.match(/\\d+/)?.[0] || 0);
}
`;
}

function previewHtml(plan: AppPlan, recipe: AppRecipe, projectId: string) {
  const seed = JSON.stringify(runtimeSeed(plan).records);
  const views = JSON.stringify(plan.navigation);
  const flow = JSON.stringify(statusFlow(plan));
  const transitionLabel = JSON.stringify(plan.interactions.find((item) => item.type === "transition")?.label || "Advance");
  const deleteLabel = JSON.stringify(plan.interactions.find((item) => item.type === "delete")?.label || "Delete");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${safe(plan.productName)}</title><style>${inlineCss(plan, recipe)}</style></head>
<body><main class="app"><header><strong>${safe(plan.productName)}</strong><nav id="nav"></nav></header><section class="hero"><div class="panel"><p class="eyebrow">${plan.category} runtime</p><h1>${safe(plan.productName)}</h1><p>${safe(plan.problem)}</p><div id="records" class="${recipe.cssMode}"></div></div><aside class="panel"><h2>${safe(plan.forms[0]?.name || recipe.interaction)}</h2><textarea id="input" placeholder="${safe((plan.forms[0]?.fields || ["Name"]).join(", "))}"></textarea><button id="submit" data-action="create" data-api="/api/projects/${projectId}/runtime" data-db-change="insert-record" data-state-update="records=data.state.records" data-ui-refresh="render">${safe(recipe.interaction)}</button><div id="events"></div></aside></section></main>
<script>
const projectId=${JSON.stringify(projectId)};const views=${views};const statusFlow=${flow};const transitionLabel=${transitionLabel};const deleteLabel=${deleteLabel};const storageKey=${JSON.stringify(`${plan.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}:preview-records`)};const seedRecords=${seed};let records=JSON.parse(localStorage.getItem(storageKey)||"null")||seedRecords;let active=views[0];const nav=document.getElementById("nav");const root=document.getElementById("records");const events=document.getElementById("events");const input=document.getElementById("input");
async function load(){try{const res=await fetch("/api/projects/"+projectId+"/runtime");if(res.ok){const data=await res.json();records=data.state.records||records;log("Loaded isolated runtime state");}}catch(error){log("Runtime API unavailable; using bundled state");}render();}
function render(){localStorage.setItem(storageKey,JSON.stringify(records));nav.innerHTML="";views.forEach(view=>{const b=document.createElement("a");b.href="#"+view;b.textContent=view;b.className=view===active?"active":"";b.onclick=(event)=>{event.preventDefault();active=view;log("Opened "+view);render();};nav.appendChild(b)});root.innerHTML="";records.forEach(record=>{const card=document.createElement("article");card.className="card";card.innerHTML="<strong>"+record.label+"</strong><div class='value'>"+record.value+"</div><span>"+record.status+"</span><div class='actions'><button data-action='transition' data-api='/api/projects/"+projectId+"/runtime' data-db-change='update-status' data-state-update='records=data.state.records' data-ui-refresh='render' data-id='"+record.id+"'>"+transitionLabel+"</button><button data-action='delete' data-api='/api/projects/"+projectId+"/runtime' data-db-change='delete-record' data-state-update='records=data.state.records' data-ui-refresh='render' data-id='"+record.id+"'>"+deleteLabel+"</button></div>";card.onclick=()=>log("Selected "+record.label);card.querySelector("[data-action='transition']").onclick=(event)=>{event.stopPropagation();mutate({action:"transition",id:record.id});};card.querySelector("[data-action='delete']").onclick=(event)=>{event.stopPropagation();mutate({action:"delete",id:record.id});};root.appendChild(card);});}
function log(message){const item=document.createElement("div");item.className="event";item.textContent=message;events.prepend(item);}
async function mutate(payload){const res=await fetch("/api/projects/"+projectId+"/runtime",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({type:${JSON.stringify(recipe.interaction)},...payload})});if(res.ok){const data=await res.json();records=data.state.records;log("Runtime mutation persisted: "+(payload.action||"create"));render();}else if(payload.action==="transition"){records=records.map(record=>record.id===payload.id?{...record,status:statusFlow[Math.min(statusFlow.indexOf(record.status)+1,statusFlow.length-1)]||"Done"}:record);log("Transition saved locally");render();}else if(payload.action==="delete"){records=records.filter(record=>record.id!==payload.id&&record.parentId!==payload.id);log("Delete saved locally");render();}}
document.getElementById("submit").onclick=async()=>{const label=input.value.trim()||${JSON.stringify(recipe.interaction)};await mutate({action:"create",label,value:"New",status:statusFlow[0]||"Created"});input.value="";};
load();
</script></body></html>`;
}

function inlineCss(plan: AppPlan, recipe: AppRecipe) {
  return `:root{--surface:${plan.palette.surface};--primary:${plan.palette.primary};--accent:${plan.palette.accent};--ink:${plan.palette.ink}}*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--ink);font-family:Inter,system-ui,sans-serif}header{position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 20px;background:rgba(255,255,255,.92);border-bottom:1px solid #e2e8f0;backdrop-filter:blur(14px)}nav{display:flex;gap:8px;overflow:auto}button,nav a{border:0;border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer;text-decoration:none}nav a{background:#e2e8f0;color:#334155}.active,#submit{background:var(--primary)!important;color:white}.hero{max-width:1180px;margin:0 auto;padding:24px 20px;display:grid;grid-template-columns:minmax(0,1fr)340px;gap:18px}.panel{background:white;border:1px solid #e2e8f0;border-radius:16px;padding:22px;box-shadow:0 18px 45px rgba(15,23,42,.08)}h1{font-size:clamp(34px,5vw,58px);line-height:1;margin:8px 0}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font-size:12px;font-weight:900;color:var(--primary)}.${recipe.cssMode}{display:grid;gap:12px;${layoutCss(plan.layout)}}.card,.event{background:#f8fafc;border:1px solid #e2e8f0;border-radius:13px;padding:14px}.value{font-size:28px;font-weight:850;margin:8px 0}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.actions button:first-child{background:var(--primary);color:white}.actions button:last-child{background:#fee2e2;color:#991b1b}textarea{width:100%;min-height:120px;border:1px solid #cbd5e1;border-radius:12px;padding:12px;font:inherit}#submit{width:100%;margin-top:10px}.event{margin-top:10px;color:#047857}@media(max-width:840px){.hero{grid-template-columns:1fr}.${recipe.cssMode}{grid-template-columns:1fr!important}header{align-items:flex-start;flex-direction:column}}`;
}

function statusFlow(plan: AppPlan) {
  if (plan.category === "crm") return ["Lead", "In Progress", "Review", "Done"];
  if (plan.category === "booking") return plan.domainAnalysis?.stateMachines.find((machine) => machine.entity === "Booking")?.states || ["draft", "confirmed", "cancelled", "attended"];
  if (plan.category === "ecommerce") return ["Cart", "Review", "Paid", "Fulfilled"];
  if (plan.category === "fitness") return ["Planned", "Complete", "Reviewed"];
  if (plan.category === "analytics") return ["Open", "Investigating", "Resolved"];
  const statuses = [...new Set(plan.seedData.map((item) => item.status).concat(["In Progress", "Done"]))];
  return statuses;
}

function layoutCss(layout: AppPlan["layout"]) {
  if (layout === "kanban") return "grid-template-columns:repeat(4,minmax(0,1fr));";
  if (layout === "calendar") return "grid-template-columns:repeat(7,minmax(0,1fr));";
  if (layout === "feed") return "grid-template-columns:1fr;";
  if (layout === "ordering") return "grid-template-columns:1.2fr .8fr;";
  if (layout === "tracker") return "grid-template-columns:repeat(2,minmax(0,1fr));";
  return "grid-template-columns:repeat(3,minmax(0,1fr));";
}

function safe(value: string) {
  return String(value).replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "\"": "&quot;" })[char] || char);
}

function pascal(value: string) {
  return value.replace(/(^|[-_/\s])([a-z])/g, (_match, _prefix, char: string) => char.toUpperCase()).replace(/[^A-Za-z0-9]/g, "");
}
