import type { ProjectFile } from "@/lib/project-store";
import { analyzeDomain, applyDomainAnalysis, type DomainAnalysis } from "@/lib/domain-analysis";

export type AppCategory =
  | "crm"
  | "ecommerce"
  | "fitness"
  | "booking"
  | "ai-content"
  | "restaurant"
  | "social"
  | "analytics"
  | "marketplace"
  | "creator"
  | "custom";

export type AppType = "SaaS dashboard" | "marketplace" | "social app" | "AI tool" | "internal tool";

export type AppPlan = {
  productName: string;
  category: AppCategory;
  appType: AppType;
  problem: string;
  audience: string;
  monetization: string;
  visualDirection: string;
  layout: "kanban" | "catalog" | "calendar" | "studio" | "feed" | "metrics" | "tracker" | "ordering";
  palette: {
    surface: string;
    primary: string;
    secondary: string;
    accent: string;
    ink: string;
  };
  routes: Array<{ path: string; label: string; purpose: string }>;
  dataModels: Array<{ name: string; fields: string[] }>;
  relationships: Array<{ from: string; to: string; type: "one-to-many" | "many-to-one"; via: string }>;
  apiEndpoints: Array<{ method: "GET" | "POST" | "PATCH"; path: string; purpose: string }>;
  navigation: string[];
  features: string[];
  interactions: Array<{ label: string; type: "create" | "update" | "delete" | "transition"; target: string; result: string }>;
  truthSpec: {
    realUsers: boolean;
    realActions: boolean;
    realData: boolean;
    realStateChanges: boolean;
    blocksShallowMode: boolean;
    rejectionReasons: string[];
  };
  forms: Array<{ name: string; fields: string[]; action: string }>;
  seedData: Array<{ label: string; value: string; status: string }>;
  domainAnalysis?: DomainAnalysis;
};

type Blueprint = Omit<AppPlan, "productName" | "problem" | "appType" | "truthSpec"> & {
  productNames: string[];
  signals: string[];
  problemTemplate: string;
};

const blueprints: Blueprint[] = [
  {
    category: "crm",
    productNames: ["DealPilot", "ClientGrid", "PipelineOS"],
    signals: ["crm", "client", "lead", "pipeline", "sales", "account"],
    problemTemplate: "Turns scattered client follow-up into a focused revenue pipeline with visible next actions.",
    audience: "founders, agencies, and customer-facing teams",
    monetization: "seat-based CRM plan with pipeline automation upgrades",
    visualDirection: "dense B2B console with kanban lanes, account health, and compact deal tables",
    layout: "kanban",
    palette: { surface: "#f6f8fb", primary: "#155e75", secondary: "#0f172a", accent: "#22c55e", ink: "#0f172a" },
    routes: [
      { path: "/", label: "Dashboard", purpose: "Pipeline overview and daily revenue actions" },
      { path: "/clients", label: "Clients", purpose: "Account list, owners, and renewal risk" },
      { path: "/pipeline", label: "Pipeline", purpose: "Drag-style deal stage board" },
      { path: "/analytics", label: "Analytics", purpose: "Win-rate and SLA trend reporting" },
    ],
    dataModels: [
      { name: "Client", fields: ["name", "owner", "health", "renewalDate", "notes"] },
      { name: "Deal", fields: ["clientId", "stage", "value", "probability", "nextStep"] },
      { name: "Task", fields: ["dealId", "title", "status", "createdAt", "completedAt"] },
    ],
    relationships: [
      { from: "Client", to: "Deal", type: "one-to-many", via: "clientId" },
      { from: "Deal", to: "Task", type: "one-to-many", via: "dealId" },
    ],
    apiEndpoints: [
      { method: "GET", path: "/api/clients", purpose: "List accounts" },
      { method: "POST", path: "/api/deals", purpose: "Create deal" },
      { method: "PATCH", path: "/api/deals/[id]", purpose: "Move deal stage" },
    ],
    navigation: ["Dashboard", "Clients", "Pipeline", "Analytics"],
    features: ["Kanban pipeline", "Client search", "Renewal risk scoring", "Next-step capture", "CSV export"],
    interactions: [
      { label: "Create deal", type: "create", target: "Deal", result: "Adds a deal to the first pipeline stage" },
      { label: "Advance stage", type: "transition", target: "Deal", result: "Moves Lead -> In Progress -> Review -> Done" },
      { label: "Delete task", type: "delete", target: "Task", result: "Removes completed task from the deal" },
    ],
    forms: [{ name: "New deal", fields: ["Client", "Value", "Stage", "Next step"], action: "Adds deal to active pipeline" }],
    seedData: [
      { label: "Northstar Labs", value: "$18.4k", status: "Proposal" },
      { label: "Brightline Studio", value: "$7.2k", status: "Renewal risk" },
      { label: "Atlas Supply", value: "$24.9k", status: "Closing" },
    ],
  },
  {
    category: "ecommerce",
    productNames: ["CartLoom", "ShelfSpark", "RetailKit"],
    signals: ["ecommerce", "shop", "store", "cart", "checkout", "product"],
    problemTemplate: "Launches a polished storefront with product discovery, cart actions, and checkout readiness.",
    audience: "small brands and productized service sellers",
    monetization: "transaction fees plus premium merchandising analytics",
    visualDirection: "commerce catalog with filters, product cards, cart summary, and trust strips",
    layout: "catalog",
    palette: { surface: "#f8fafc", primary: "#0f766e", secondary: "#111827", accent: "#f59e0b", ink: "#111827" },
    routes: [
      { path: "/", label: "Storefront", purpose: "Featured products and conversion content" },
      { path: "/products", label: "Products", purpose: "Filterable product grid" },
      { path: "/cart", label: "Cart", purpose: "Cart review and quantity changes" },
      { path: "/checkout", label: "Checkout", purpose: "Customer and payment-intent form" },
    ],
    dataModels: [
      { name: "Product", fields: ["title", "price", "inventory", "category", "rating"] },
      { name: "Order", fields: ["items", "customerEmail", "total", "status"] },
      { name: "CartItem", fields: ["productId", "orderId", "quantity", "price"] },
    ],
    relationships: [
      { from: "Product", to: "CartItem", type: "one-to-many", via: "productId" },
      { from: "Order", to: "CartItem", type: "one-to-many", via: "orderId" },
    ],
    apiEndpoints: [
      { method: "GET", path: "/api/products", purpose: "List products" },
      { method: "POST", path: "/api/cart", purpose: "Add cart item" },
      { method: "POST", path: "/api/checkout", purpose: "Create order" },
    ],
    navigation: ["Storefront", "Products", "Cart", "Checkout"],
    features: ["Product filters", "Cart drawer", "Checkout form", "Inventory badges", "Order confirmation"],
    interactions: [
      { label: "Add to cart", type: "create", target: "CartItem", result: "Adds product to cart and updates total" },
      { label: "Checkout", type: "transition", target: "Order", result: "Moves Cart -> Review -> Paid -> Fulfilled" },
      { label: "Remove item", type: "delete", target: "CartItem", result: "Removes item and recalculates total" },
    ],
    forms: [{ name: "Checkout", fields: ["Email", "Shipping ZIP", "Payment note"], action: "Creates a pending order" }],
    seedData: [
      { label: "Launch Kit", value: "$79", status: "In stock" },
      { label: "Founder Bundle", value: "$149", status: "Best seller" },
      { label: "Ops Template", value: "$39", status: "Low stock" },
    ],
  },
  {
    category: "booking",
    productNames: ["SlotWise", "BookBoard", "ReserveFlow"],
    signals: ["booking", "calendar", "appointment", "availability", "schedule", "reservation"],
    problemTemplate: "Coordinates availability, booking requests, and admin review without messy back-and-forth.",
    audience: "consultants, clinics, studios, and local service teams",
    monetization: "monthly booking SaaS with paid reminders and team calendars",
    visualDirection: "calendar-heavy scheduling workspace with availability blocks and request queue",
    layout: "calendar",
    palette: { surface: "#f7fee7", primary: "#3f6212", secondary: "#1f2937", accent: "#06b6d4", ink: "#172554" },
    routes: [
      { path: "/", label: "Calendar", purpose: "Weekly availability and booking load" },
      { path: "/booking", label: "Booking", purpose: "Public request flow" },
      { path: "/availability", label: "Availability", purpose: "Admin slot rules" },
      { path: "/admin", label: "Admin", purpose: "Review requests and confirmations" },
    ],
    dataModels: [
      { name: "Slot", fields: ["startsAt", "endsAt", "capacity", "status"] },
      { name: "Booking", fields: ["slotId", "customerName", "email", "status", "notes"] },
      { name: "StaffMember", fields: ["name", "role", "timezone", "active"] },
    ],
    relationships: [
      { from: "StaffMember", to: "Slot", type: "one-to-many", via: "staffMemberId" },
      { from: "Slot", to: "Booking", type: "one-to-many", via: "slotId" },
    ],
    apiEndpoints: [
      { method: "GET", path: "/api/slots", purpose: "List open slots" },
      { method: "POST", path: "/api/bookings", purpose: "Request booking" },
      { method: "PATCH", path: "/api/bookings/[id]", purpose: "Confirm booking" },
    ],
    navigation: ["Calendar", "Booking", "Availability", "Admin"],
    features: ["Availability grid", "Booking form", "Request approvals", "Capacity badges", "Reminder queue"],
    interactions: [
      { label: "Request booking", type: "create", target: "Booking", result: "Adds booking request to admin queue" },
      { label: "Confirm booking", type: "transition", target: "Booking", result: "Moves Requested -> Confirmed -> Completed" },
      { label: "Cancel booking", type: "delete", target: "Booking", result: "Frees slot capacity" },
    ],
    forms: [{ name: "Booking request", fields: ["Name", "Email", "Preferred slot", "Notes"], action: "Adds a request to admin queue" }],
    seedData: [
      { label: "Monday 9:00", value: "3 seats", status: "Open" },
      { label: "Tuesday 14:00", value: "1 seat", status: "Almost full" },
      { label: "Friday 11:30", value: "5 seats", status: "Open" },
    ],
  },
  {
    category: "fitness",
    productNames: ["LiftLoop", "PulseTrack", "HabitSet"],
    signals: ["fitness", "workout", "habit", "nutrition", "health", "tracker"],
    problemTemplate: "Keeps workouts, habits, and progress signals in one motivating daily tracker.",
    audience: "coaches, fitness communities, and self-directed athletes",
    monetization: "coach plan with paid client tracking and progress reports",
    visualDirection: "mobile-first progress dashboard with streak cards, workout logs, and coach notes",
    layout: "tracker",
    palette: { surface: "#fefce8", primary: "#854d0e", secondary: "#18181b", accent: "#ef4444", ink: "#1c1917" },
    routes: [
      { path: "/", label: "Today", purpose: "Daily workout and habit targets" },
      { path: "/workouts", label: "Workouts", purpose: "Exercise log and plan builder" },
      { path: "/progress", label: "Progress", purpose: "Measurements and streaks" },
      { path: "/coach", label: "Coach", purpose: "Feedback and weekly review" },
    ],
    dataModels: [
      { name: "Workout", fields: ["title", "sets", "duration", "intensity", "completedAt"] },
      { name: "Habit", fields: ["name", "streak", "target", "status"] },
      { name: "CheckIn", fields: ["workoutId", "habitId", "effort", "notes", "createdAt"] },
    ],
    relationships: [
      { from: "Workout", to: "CheckIn", type: "one-to-many", via: "workoutId" },
      { from: "Habit", to: "CheckIn", type: "one-to-many", via: "habitId" },
    ],
    apiEndpoints: [
      { method: "GET", path: "/api/workouts", purpose: "List workouts" },
      { method: "POST", path: "/api/checkins", purpose: "Save workout check-in" },
      { method: "PATCH", path: "/api/habits/[id]", purpose: "Update habit status" },
    ],
    navigation: ["Today", "Workouts", "Progress", "Coach"],
    features: ["Workout log", "Habit streaks", "Progress charts", "Coach notes", "Weekly recap"],
    interactions: [
      { label: "Log workout", type: "create", target: "CheckIn", result: "Adds workout check-in and updates streak" },
      { label: "Complete habit", type: "transition", target: "Habit", result: "Moves Planned -> Complete and increases streak" },
      { label: "Remove check-in", type: "delete", target: "CheckIn", result: "Removes mistaken entry" },
    ],
    forms: [{ name: "Workout check-in", fields: ["Workout", "Duration", "Effort", "Notes"], action: "Updates daily score" }],
    seedData: [
      { label: "Strength session", value: "42 min", status: "Planned" },
      { label: "Hydration", value: "6/8", status: "On pace" },
      { label: "Mobility", value: "12 min", status: "Complete" },
    ],
  },
  {
    category: "marketplace",
    productNames: ["VendorLoop", "MarketDesk", "SupplyHub"],
    signals: ["marketplace", "vendor", "seller", "buyer", "listing", "products"],
    problemTemplate: "Connects buyers and sellers through searchable listings, trust signals, and seller operations.",
    audience: "niche marketplace founders and operator-led communities",
    monetization: "take-rate marketplace with seller subscriptions",
    visualDirection: "two-sided marketplace with listing grid, trust badges, and seller dashboard",
    layout: "catalog",
    palette: { surface: "#f5f3ff", primary: "#6d28d9", secondary: "#111827", accent: "#14b8a6", ink: "#1e1b4b" },
    routes: [
      { path: "/", label: "Marketplace", purpose: "Listings and demand signals" },
      { path: "/products", label: "Listings", purpose: "Searchable offer catalog" },
      { path: "/seller", label: "Seller", purpose: "Seller performance and inventory" },
      { path: "/checkout", label: "Checkout", purpose: "Inquiry and purchase intent" },
    ],
    dataModels: [
      { name: "Listing", fields: ["sellerId", "title", "price", "trustScore", "availability"] },
      { name: "Seller", fields: ["name", "rating", "responseTime", "verified"] },
      { name: "Inquiry", fields: ["listingId", "buyerEmail", "budget", "status"] },
    ],
    relationships: [
      { from: "Seller", to: "Listing", type: "one-to-many", via: "sellerId" },
      { from: "Listing", to: "Inquiry", type: "one-to-many", via: "listingId" },
    ],
    apiEndpoints: [
      { method: "GET", path: "/api/listings", purpose: "Search listings" },
      { method: "POST", path: "/api/inquiries", purpose: "Send buyer inquiry" },
      { method: "PATCH", path: "/api/listings/[id]", purpose: "Update listing" },
    ],
    navigation: ["Marketplace", "Listings", "Seller", "Checkout"],
    features: ["Listing search", "Seller cards", "Trust scoring", "Inquiry form", "Seller analytics"],
    interactions: [
      { label: "Send inquiry", type: "create", target: "Inquiry", result: "Adds buyer inquiry to seller queue" },
      { label: "Qualify inquiry", type: "transition", target: "Inquiry", result: "Moves New -> Qualified -> Closed" },
      { label: "Remove listing", type: "delete", target: "Listing", result: "Archives listing from marketplace" },
    ],
    forms: [{ name: "Buyer inquiry", fields: ["Need", "Budget", "Timeline"], action: "Creates qualified lead" }],
    seedData: [
      { label: "Verified design partner", value: "$2.4k", status: "Top rated" },
      { label: "Ops automation pack", value: "$899", status: "Fast reply" },
      { label: "Launch advisor", value: "$150/hr", status: "Verified" },
    ],
  },
];

export function planApp(prompt: string, requestedCategory = "custom", existingPlans: AppPlan[] = []): AppPlan {
  const source = `${prompt} ${requestedCategory}`.toLowerCase();
  const direct = blueprints.find((item) => item.category === requestedCategory);
  const specialized = inferFallback(source);
  const matched = direct || (specialized.category !== "custom" ? specialized : blueprints.find((item) => item.signals.some((signal) => source.includes(signal))) || specialized);
  const name = chooseName(matched.productNames, existingPlans);
  const plan = applyDomainAnalysis({
    ...matched,
    appType: classifyAppType(source, matched.category),
    productName: name,
    problem: prompt.length > 24 ? prompt : matched.problemTemplate,
  }, analyzeDomain(prompt, matched.category));
  return { ...plan, truthSpec: extractTruthSpec(plan) };
}

export function classifyAppType(source: string, category: AppCategory): AppType {
  if (category === "marketplace" || /\bmarketplace|seller|buyer|vendor|listing\b/.test(source)) return "marketplace";
  if (category === "social" || /\bsocial|community|feed|member|moderation\b/.test(source)) return "social app";
  if (category === "ai-content" || /\bai|agent|prompt|model|llm|content generation\b/.test(source)) return "AI tool";
  if (category === "crm" || category === "analytics" || /\bdashboard|analytics|saas|metrics|kpi\b/.test(source)) return "SaaS dashboard";
  return "internal tool";
}

export function extractTruthSpec(plan: Omit<AppPlan, "truthSpec">): AppPlan["truthSpec"] {
  const realUsers = Boolean(plan.audience && plan.audience.length > 8);
  const realActions = plan.interactions.some((interaction) => interaction.type === "create") && plan.interactions.some((interaction) => interaction.type === "transition" || interaction.type === "update" || interaction.type === "delete");
  const realData = plan.dataModels.length >= 2 && plan.relationships.length >= 1 && plan.seedData.length >= 1;
  const realStateChanges = plan.interactions.some((interaction) => ["create", "update", "delete", "transition"].includes(interaction.type)) && plan.apiEndpoints.some((endpoint) => endpoint.method === "POST" || endpoint.method === "PATCH");
  const domain = plan.domainAnalysis;
  const hasDomainRoles = !domain || domain.roles.length >= 1;
  const hasDomainRules = !domain || domain.businessRules.length >= 1;
  const hasDomainStates = !domain || domain.stateMachines.length >= 1;
  const rejectionReasons = [
    !realUsers ? "Truth spec failed: app must define real users." : "",
    !realActions ? "Truth spec failed: app must define real user actions." : "",
    !realData ? "Truth spec failed: app must define relational data." : "",
    !realStateChanges ? "Truth spec failed: app must define state-changing API behavior." : "",
    !hasDomainRoles ? "Domain analysis failed: app must define real roles." : "",
    !hasDomainRules ? "Domain analysis failed: app must define business rules." : "",
    !hasDomainStates ? "Domain analysis failed: app must define state machines." : "",
    plan.dataModels.length < 2 ? "BLOCK shallow mode: no database-grade model set." : "",
    plan.apiEndpoints.length < 2 ? "BLOCK UI-only mode: no API surface." : "",
    !plan.interactions.some((interaction) => ["create", "update", "delete", "transition"].includes(interaction.type)) ? "INVALID: no state changes." : "",
  ].filter(Boolean);

  return {
    realUsers,
    realActions,
    realData,
    realStateChanges,
    blocksShallowMode: rejectionReasons.length > 0,
    rejectionReasons,
  };
}

export function generateAppFiles(plan: AppPlan): ProjectFile[] {
  const data = JSON.stringify(plan.seedData, null, 2);
  const routes = JSON.stringify(plan.routes, null, 2);
  return [
    file("README.md", readme(plan)),
    file("package.json", JSON.stringify(packageJson(plan), null, 2)),
    file("tsconfig.json", JSON.stringify(tsconfig(), null, 2)),
    file("next.config.js", "const nextConfig = {};\nmodule.exports = nextConfig;\n"),
    file(".env.example", "DATABASE_URL=\nNEXT_PUBLIC_APP_URL=\n"),
    file("schema.prisma", prismaSchema(plan)),
    file("app/layout.tsx", layoutFile(plan)),
    file("app/globals.css", cssFile(plan)),
    file("app/page.tsx", pageFile()),
    file("app/api/items/route.ts", apiFile(plan, data)),
    file("components/AppShell.tsx", shellFile(plan, routes)),
    file("components/InteractiveWorkspace.tsx", workspaceFile(plan, data)),
    file("lib/app-plan.ts", `export const appPlan = ${JSON.stringify(plan, null, 2)} as const;\n`),
    file("preview/index.html", previewHtml(plan)),
  ];
}

export function scoreUniqueness(plan: AppPlan, files: ProjectFile[], existingPlans: AppPlan[]) {
  const routeSignature = plan.routes.map((route) => route.path).join("|");
  const featureSignature = plan.features.join("|");
  const schemaSignature = plan.dataModels.map((model) => `${model.name}:${model.fields.join(",")}`).join("|");
  const relationships = plan.relationships || [];
  const relationshipSignature = relationships.map((relation) => `${relation.from}->${relation.to}:${relation.via}`).join("|");
  const componentSignature = files.map((item) => item.path).join("|");
  const current = `${plan.category}|${plan.layout}|${routeSignature}|${featureSignature}|${schemaSignature}|${relationshipSignature}|${componentSignature}`;
  const overlap = existingPlans.reduce((max, existing) => {
    const existingRelationships = existing.relationships || [];
    const existingSet = new Set([...existing.routes.map((route) => route.path), ...existing.features, ...existing.dataModels.map((model) => model.name), ...existingRelationships.map((relation) => `${relation.from}->${relation.to}`)]);
    const currentSet = [...plan.routes.map((route) => route.path), ...plan.features, ...plan.dataModels.map((model) => model.name), ...relationships.map((relation) => `${relation.from}->${relation.to}`)];
    const shared = currentSet.filter((item) => existingSet.has(item)).length;
    return Math.max(max, shared / Math.max(1, currentSet.length));
  }, 0);
  return {
    score: Math.max(35, Math.round(100 - overlap * 55)),
    signature: current,
    routeSignature,
    featureSignature,
    schemaSignature,
    relationshipSignature,
    componentSignature,
  };
}

function inferFallback(source: string): Blueprint {
  if (source.includes("restaurant") || source.includes("order") || source.includes("menu")) {
    return {
      ...blueprints[2],
      category: "restaurant",
      productNames: ["TableFlow", "MenuPilot", "OrderNest"],
      problemTemplate: "Runs menu browsing, order intake, kitchen queue, and pickup readiness from one ordering app.",
      audience: "restaurants, food trucks, and ghost kitchens",
      visualDirection: "ordering-first interface with menu cards, kitchen queue, and status updates",
      layout: "ordering",
      monetization: "monthly restaurant SaaS plus online ordering fee",
      routes: [
        { path: "/", label: "Menu", purpose: "Browse menu and featured bundles" },
        { path: "/order", label: "Order", purpose: "Build a cart and submit order" },
        { path: "/kitchen", label: "Kitchen", purpose: "Track prep queue" },
        { path: "/admin", label: "Admin", purpose: "Update menu and fulfillment status" },
      ],
      dataModels: [
        { name: "MenuItem", fields: ["name", "price", "station", "available", "prepTime"] },
        { name: "KitchenTicket", fields: ["items", "customerName", "status", "pickupTime"] },
        { name: "OrderLine", fields: ["ticketId", "menuItemId", "quantity", "notes"] },
      ],
      relationships: [
        { from: "KitchenTicket", to: "OrderLine", type: "one-to-many", via: "ticketId" },
        { from: "MenuItem", to: "OrderLine", type: "one-to-many", via: "menuItemId" },
      ],
      apiEndpoints: [
        { method: "GET", path: "/api/menu", purpose: "List menu items" },
        { method: "POST", path: "/api/orders", purpose: "Submit order" },
        { method: "PATCH", path: "/api/kitchen/[id]", purpose: "Update prep status" },
      ],
      navigation: ["Menu", "Order", "Kitchen", "Admin"],
      features: ["Menu browsing", "Cart builder", "Kitchen queue", "Pickup status", "Menu admin"],
      interactions: [
        { label: "Send order", type: "create", target: "KitchenTicket", result: "Adds order to kitchen queue" },
        { label: "Advance prep", type: "transition", target: "KitchenTicket", result: "Moves New -> Prep -> Ready -> Picked up" },
        { label: "Remove line", type: "delete", target: "OrderLine", result: "Removes item from order" },
      ],
      forms: [{ name: "Order item", fields: ["Customer", "Item", "Pickup time", "Notes"], action: "Adds ticket to kitchen queue" }],
      seedData: [
        { label: "Spicy noodle bowl", value: "$14", status: "Hot station" },
        { label: "Citrus salad", value: "$11", status: "Ready fast" },
        { label: "Family dinner pack", value: "$42", status: "Popular" },
      ],
    };
  }
  if (source.includes("creator")) {
    return {
      ...blueprints[4],
      category: "creator",
      productNames: ["CreatorVault", "OfferLoop", "FanLedger"],
      problemTemplate: "Helps creators package offers, manage subscribers, track revenue, and ship paid drops.",
      audience: "independent creators, educators, and paid community owners",
      monetization: "creator subscription operating system with paid offer analytics",
      visualDirection: "monetization workspace with offer cards, subscriber table, revenue ledger, and launch checklist",
      layout: "metrics",
      palette: { surface: "#f0fdfa", primary: "#0f766e", secondary: "#111827", accent: "#f97316", ink: "#134e4a" },
      routes: [
        { path: "/", label: "Revenue", purpose: "Revenue, subscribers, and paid offer status" },
        { path: "/offers", label: "Offers", purpose: "Paid products, tiers, and bundles" },
        { path: "/subscribers", label: "Subscribers", purpose: "Audience segments and retention risk" },
        { path: "/launches", label: "Launches", purpose: "Campaign calendar and drop readiness" },
      ],
      dataModels: [
        { name: "Offer", fields: ["title", "price", "tier", "conversionRate", "status"] },
        { name: "Subscriber", fields: ["email", "tier", "lifetimeValue", "risk", "joinedAt"] },
        { name: "Purchase", fields: ["offerId", "subscriberId", "amount", "status"] },
      ],
      relationships: [
        { from: "Offer", to: "Purchase", type: "one-to-many", via: "offerId" },
        { from: "Subscriber", to: "Purchase", type: "one-to-many", via: "subscriberId" },
      ],
      apiEndpoints: [
        { method: "GET", path: "/api/offers", purpose: "List paid offers" },
        { method: "POST", path: "/api/subscribers", purpose: "Add subscriber" },
        { method: "PATCH", path: "/api/offers/[id]", purpose: "Update launch status" },
      ],
      navigation: ["Revenue", "Offers", "Subscribers", "Launches"],
      features: ["Offer builder", "Subscriber CRM", "Revenue ledger", "Launch calendar", "Retention alerts"],
      interactions: [
        { label: "Launch offer", type: "create", target: "Offer", result: "Adds paid offer to launch board" },
        { label: "Convert subscriber", type: "transition", target: "Purchase", result: "Moves Interested -> Purchased -> Retained" },
        { label: "Cancel subscriber", type: "delete", target: "Subscriber", result: "Marks subscriber inactive" },
      ],
      forms: [{ name: "New offer", fields: ["Offer name", "Price", "Tier", "Launch date"], action: "Adds a paid offer to the launch board" }],
      seedData: [
        { label: "Pro community", value: "$8.4k MRR", status: "Growing" },
        { label: "Template bundle", value: "$1.9k", status: "Launching" },
        { label: "VIP coaching", value: "12 seats", status: "Limited" },
      ],
    };
  }
  if (source.includes("content") || source.includes("ai")) {
    return {
      ...blueprints[3],
      category: source.includes("creator") ? "creator" : "ai-content",
      productNames: ["PromptDesk", "ContentPilot", "StudioGrid"],
      problemTemplate: "Turns content ideas into briefs, drafts, approvals, and publishing performance.",
      audience: "content teams, creators, and AI-powered marketing teams",
      monetization: "workspace SaaS with AI generation credits",
      visualDirection: "editor studio with prompt queue, content calendar, and approval rail",
      layout: "studio",
      palette: { surface: "#fdf2f8", primary: "#be185d", secondary: "#111827", accent: "#8b5cf6", ink: "#111827" },
      routes: [
        { path: "/", label: "Studio", purpose: "Drafts, prompts, and publishing status" },
        { path: "/calendar", label: "Calendar", purpose: "Publishing schedule" },
        { path: "/assets", label: "Assets", purpose: "Reusable creative assets" },
        { path: "/analytics", label: "Analytics", purpose: "Content performance" },
      ],
      dataModels: [
        { name: "ContentBrief", fields: ["topic", "channel", "status", "owner", "publishDate"] },
        { name: "Asset", fields: ["title", "format", "usageRights", "performance"] },
        { name: "Draft", fields: ["briefId", "assetId", "body", "status"] },
      ],
      relationships: [
        { from: "ContentBrief", to: "Draft", type: "one-to-many", via: "briefId" },
        { from: "Asset", to: "Draft", type: "one-to-many", via: "assetId" },
      ],
      apiEndpoints: [
        { method: "GET", path: "/api/briefs", purpose: "List content briefs" },
        { method: "POST", path: "/api/drafts", purpose: "Create AI-assisted draft" },
        { method: "PATCH", path: "/api/briefs/[id]", purpose: "Move approval stage" },
      ],
      navigation: ["Studio", "Calendar", "Assets", "Analytics"],
      features: ["Prompt queue", "Draft approvals", "Publishing calendar", "Asset library", "Performance notes"],
      interactions: [
        { label: "Create brief", type: "create", target: "ContentBrief", result: "Adds a content brief to draft queue" },
        { label: "Approve draft", type: "transition", target: "Draft", result: "Moves Draft -> Review -> Approved -> Published" },
        { label: "Archive asset", type: "delete", target: "Asset", result: "Archives unused asset" },
      ],
      forms: [{ name: "New brief", fields: ["Topic", "Channel", "Audience", "Call to action"], action: "Creates a draft-ready content brief" }],
      seedData: [
        { label: "Launch thread", value: "Today", status: "Drafting" },
        { label: "Case study email", value: "Thu", status: "Review" },
        { label: "Webinar clips", value: "8 assets", status: "Scheduled" },
      ],
    };
  }
  if (source.includes("social") || source.includes("community")) {
    return {
      ...blueprints[4],
      category: "social",
      productNames: ["CircleWire", "MemberLoop", "SignalClub"],
      problemTemplate: "Creates a community feed with profiles, posts, moderation, and engagement rituals.",
      audience: "community builders and member-led groups",
      visualDirection: "feed-first social workspace with member cards and moderation queue",
      layout: "feed",
      dataModels: [
        { name: "Post", fields: ["author", "body", "visibility", "reactionCount", "status"] },
        { name: "Member", fields: ["name", "role", "cohort", "trustLevel"] },
        { name: "Comment", fields: ["postId", "memberId", "body", "status"] },
      ],
      relationships: [
        { from: "Post", to: "Comment", type: "one-to-many", via: "postId" },
        { from: "Member", to: "Comment", type: "one-to-many", via: "memberId" },
      ],
      apiEndpoints: [
        { method: "GET", path: "/api/feed", purpose: "List posts" },
        { method: "POST", path: "/api/posts", purpose: "Create post" },
        { method: "PATCH", path: "/api/moderation/[id]", purpose: "Resolve report" },
      ],
      navigation: ["Feed", "Members", "Moderation", "Events"],
      features: ["Activity feed", "Member profiles", "Moderation queue", "Event rituals", "Engagement prompts"],
      interactions: [
        { label: "Publish post", type: "create", target: "Post", result: "Adds post to community feed" },
        { label: "Moderate comment", type: "transition", target: "Comment", result: "Moves Flagged -> Reviewed -> Resolved" },
        { label: "Remove comment", type: "delete", target: "Comment", result: "Removes comment from feed" },
      ],
      forms: [{ name: "Create post", fields: ["Post", "Visibility", "Topic"], action: "Publishes a community update" }],
      seedData: [
        { label: "Founder AMA", value: "42 replies", status: "Live" },
        { label: "New member intro", value: "18 welcomes", status: "Pinned" },
        { label: "Launch meetup", value: "63 going", status: "Upcoming" },
      ],
      routes: [
        { path: "/", label: "Feed", purpose: "Posts and community activity" },
        { path: "/members", label: "Members", purpose: "Profiles and cohorts" },
        { path: "/moderation", label: "Moderation", purpose: "Review queue and reports" },
        { path: "/events", label: "Events", purpose: "Upcoming rituals and gatherings" },
      ],
    };
  }
  if (source.includes("analytics") || source.includes("dashboard") || source.includes("saas")) {
    return {
      ...blueprints[0],
      category: "analytics",
      productNames: ["MetricOS", "SignalBoard", "SaaSIntel"],
      problemTemplate: "Turns SaaS product signals into executive metrics, alerts, and retention insights.",
      audience: "SaaS founders and revenue teams",
      visualDirection: "executive analytics dashboard with dense KPI bands and alert tables",
      layout: "metrics",
      dataModels: [
        { name: "Metric", fields: ["name", "value", "delta", "segment", "period"] },
        { name: "Alert", fields: ["metricId", "severity", "message", "owner"] },
        { name: "Cohort", fields: ["metricId", "name", "period", "retention"] },
      ],
      relationships: [
        { from: "Metric", to: "Alert", type: "one-to-many", via: "metricId" },
        { from: "Metric", to: "Cohort", type: "one-to-many", via: "metricId" },
      ],
      apiEndpoints: [
        { method: "GET", path: "/api/metrics", purpose: "List KPI metrics" },
        { method: "POST", path: "/api/alerts", purpose: "Create metric alert" },
        { method: "PATCH", path: "/api/alerts/[id]", purpose: "Acknowledge alert" },
      ],
      navigation: ["Overview", "Funnels", "Retention", "Alerts"],
      features: ["KPI bands", "Funnel analysis", "Retention cohorts", "Alert queue", "Executive export"],
      interactions: [
        { label: "Create alert", type: "create", target: "Alert", result: "Adds metric alert to owner queue" },
        { label: "Resolve alert", type: "transition", target: "Alert", result: "Moves Open -> Investigating -> Resolved" },
        { label: "Delete cohort", type: "delete", target: "Cohort", result: "Removes stale cohort analysis" },
      ],
      forms: [{ name: "Create alert", fields: ["Metric", "Threshold", "Owner"], action: "Adds alert to monitoring queue" }],
      seedData: [
        { label: "Activation", value: "64%", status: "+8%" },
        { label: "Net retention", value: "112%", status: "Healthy" },
        { label: "Churn risk", value: "17", status: "Watch" },
      ],
      routes: [
        { path: "/", label: "Overview", purpose: "Executive KPI summary" },
        { path: "/funnels", label: "Funnels", purpose: "Activation and conversion analysis" },
        { path: "/retention", label: "Retention", purpose: "Cohorts and churn risk" },
        { path: "/alerts", label: "Alerts", purpose: "Operational warnings" },
      ],
    };
  }
  return {
    ...blueprints[0],
    category: "custom",
    productNames: ["LaunchBoard", "VentureKit", "ProductOS"],
    problemTemplate: "Turns the requested workflow into a structured, editable business application.",
    audience: "operators and founders",
    visualDirection: "custom product workspace with dashboard, records, workflow, and settings",
    layout: "metrics",
  };
}

function chooseName(names: string[], existingPlans: AppPlan[]) {
  const used = new Set(existingPlans.map((plan) => plan.productName));
  return names.find((name) => !used.has(name)) || `${names[0]} ${used.size + 1}`;
}

function file(path: string, content: string): ProjectFile {
  return { path, content };
}

function packageJson(plan: AppPlan) {
  return {
    name: plan.productName.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    version: "1.0.0",
    private: true,
    scripts: { dev: "next dev", build: "next build", start: "next start", lint: "next lint" },
    dependencies: { next: "16.2.6", react: "19.2.6", "react-dom": "19.2.6", "lucide-react": "^1.16.0" },
    devDependencies: { typescript: "^6.0.3", "@types/node": "20.14.10", "@types/react": "^19.2.15", "@types/react-dom": "^19.2.3" },
  };
}

function tsconfig() {
  return {
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "preserve",
      incremental: true,
      paths: { "@/*": ["./*"] },
    },
    include: ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
    exclude: ["node_modules"],
  };
}

function readme(plan: AppPlan) {
  return `# ${plan.productName}

${plan.problem}

## Product plan
- Category: ${plan.category}
- Audience: ${plan.audience}
- Monetization: ${plan.monetization}
- Layout: ${plan.layout}

## Routes
${plan.routes.map((route) => `- ${route.path} - ${route.purpose}`).join("\n")}

## APIs
${plan.apiEndpoints.map((endpoint) => `- ${endpoint.method} ${endpoint.path} - ${endpoint.purpose}`).join("\n")}

## Data models
${plan.dataModels.map((model) => `- ${model.name}: ${model.fields.join(", ")}`).join("\n")}
`;
}

function prismaSchema(plan: AppPlan) {
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
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}`,
  )
  .join("\n\n")}
`;
}

function layoutFile(plan: AppPlan) {
  return `import "./globals.css";

export const metadata = {
  title: "${plan.productName}",
  description: "${plan.problem.replace(/"/g, "'")}",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`;
}

function cssFile(plan: AppPlan) {
  return `:root {
  --surface: ${plan.palette.surface};
  --primary: ${plan.palette.primary};
  --secondary: ${plan.palette.secondary};
  --accent: ${plan.palette.accent};
  --ink: ${plan.palette.ink};
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--surface); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
button, input, select, textarea { font: inherit; }
a { color: inherit; text-decoration: none; }
`;
}

function pageFile() {
  return `import { AppShell } from "@/components/AppShell";
import { InteractiveWorkspace } from "@/components/InteractiveWorkspace";
import { appPlan } from "@/lib/app-plan";

export default function Page() {
  return (
    <AppShell plan={appPlan}>
      <InteractiveWorkspace plan={appPlan} />
    </AppShell>
  );
}
`;
}

function apiFile(_plan: AppPlan, data: string) {
  return `const records = ${data};

export async function GET() {
  return Response.json({ records });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  return Response.json({ ok: true, record: { ...body, status: "created" } }, { status: 201 });
}
`;
}

function shellFile(plan: AppPlan, routes: string) {
  return `"use client";

type Plan = typeof import("@/lib/app-plan").appPlan;
const routes = ${routes};

export function AppShell({ plan, children }: { plan: Plan; children: React.ReactNode }) {
  return (
    <main className="min-h-screen" style={{ background: "${plan.palette.surface}", color: "${plan.palette.ink}" }}>
      <header className="sticky top-0 z-10 border-b border-black/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-3">
          <strong className="text-lg">{plan.productName}</strong>
          <nav className="flex gap-2 overflow-x-auto">
            {routes.map((route: { path: string; label: string }) => (
              <a key={route.path} href={route.path} className="rounded-lg px-3 py-2 text-sm font-semibold hover:bg-black/5">{route.label}</a>
            ))}
          </nav>
        </div>
      </header>
      {children}
    </main>
  );
}
`;
}

function workspaceFile(plan: AppPlan, data: string) {
  return `"use client";

import { useMemo, useState } from "react";
type Plan = typeof import("@/lib/app-plan").appPlan;
const initialRecords = ${data};

export function InteractiveWorkspace({ plan }: { plan: Plan }) {
  const [records, setRecords] = useState(initialRecords);
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const visible = useMemo(() => records.filter((record) => record.label.toLowerCase().includes(query.toLowerCase()) || record.status.toLowerCase().includes(query.toLowerCase())), [records, query]);
  function submit() {
    const label = note.trim() || plan.forms[0]?.name || "New item";
    setRecords((current) => [{ label, value: "New", status: "Created" }, ...current]);
    setNote("");
  }
  return (
    <section className="mx-auto grid max-w-7xl gap-5 px-5 py-8 lg:grid-cols-[1fr_360px]">
      <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/10">
        <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: "${plan.palette.primary}" }}>{plan.category}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-normal">{plan.productName}</h1>
        <p className="mt-3 max-w-3xl leading-7 text-slate-600">{plan.problem}</p>
        <div className="mt-6 grid gap-3 md:grid-cols-3">
          {plan.features.slice(0, 3).map((feature) => <div key={feature} className="rounded-lg bg-slate-50 p-4 font-semibold">{feature}</div>)}
        </div>
        <div className="mt-6">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" className="w-full rounded-lg border border-slate-200 px-4 py-3 outline-none focus:ring-4 focus:ring-blue-100" />
        </div>
        <div className="${layoutClass(plan.layout)} mt-5">
          {visible.map((record) => <article key={record.label} className="rounded-lg bg-slate-50 p-4 ring-1 ring-slate-200"><p className="font-semibold">{record.label}</p><p className="mt-2 text-2xl font-semibold">{record.value}</p><span className="mt-3 inline-flex rounded-full px-2 py-1 text-xs font-bold" style={{ background: "${plan.palette.accent}22", color: "${plan.palette.primary}" }}>{record.status}</span></article>)}
        </div>
      </div>
      <aside className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-black/10">
        <h2 className="text-xl font-semibold">{plan.forms[0]?.name || "Create record"}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{plan.forms[0]?.action}</p>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={(plan.forms[0]?.fields || ["Name"]).join(", ")} className="mt-4 h-32 w-full resize-none rounded-lg border border-slate-200 p-3 outline-none focus:ring-4 focus:ring-blue-100" />
        <button onClick={submit} className="mt-3 w-full rounded-lg px-4 py-3 font-semibold text-white" style={{ background: "${plan.palette.primary}" }}>Save</button>
        <div className="mt-6 space-y-3">
          {plan.routes.map((route) => <div key={route.path} className="rounded-lg border border-slate-200 p-3"><p className="font-semibold">{route.label}</p><p className="mt-1 text-sm text-slate-600">{route.purpose}</p></div>)}
        </div>
      </aside>
    </section>
  );
}
`;
}

function previewHtml(plan: AppPlan) {
  const data = JSON.stringify(plan.seedData);
  const routes = JSON.stringify(plan.routes);
  const features = JSON.stringify(plan.features);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${plan.productName}</title>
  <style>
    :root { --surface:${plan.palette.surface}; --primary:${plan.palette.primary}; --secondary:${plan.palette.secondary}; --accent:${plan.palette.accent}; --ink:${plan.palette.ink}; }
    * { box-sizing: border-box; } body { margin: 0; background: var(--surface); color: var(--ink); font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    header { position: sticky; top: 0; z-index: 3; background: rgba(255,255,255,.92); border-bottom: 1px solid rgba(15,23,42,.12); backdrop-filter: blur(14px); }
    .bar, .wrap { max-width: 1180px; margin: 0 auto; padding: 14px 20px; } .bar { display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    nav { display: flex; gap: 8px; overflow-x: auto; } nav button, .primary { border: 0; border-radius: 10px; padding: 10px 13px; font-weight: 800; cursor: pointer; }
    nav button { background: transparent; color: #334155; } nav button.active, .primary { background: var(--primary); color: white; }
    .hero { display: grid; grid-template-columns: minmax(0,1fr) 330px; gap: 18px; padding-top: 28px; } .panel { background: white; border: 1px solid rgba(15,23,42,.12); border-radius: 14px; padding: 22px; box-shadow: 0 10px 30px rgba(15,23,42,.06); }
    h1 { margin: 8px 0 0; font-size: clamp(32px, 5vw, 56px); line-height: 1; letter-spacing: 0; } p { line-height: 1.65; } .eyebrow { color: var(--primary); text-transform: uppercase; letter-spacing: .16em; font-size: 12px; font-weight: 900; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; margin-top: 18px; } .${plan.layout} { ${layoutCss(plan.layout)} }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; } .card strong { display: block; font-size: 17px; } .value { margin-top: 9px; font-size: 28px; font-weight: 850; }
    .pill { display: inline-flex; margin-top: 12px; border-radius: 999px; padding: 5px 8px; background: color-mix(in srgb, var(--accent), white 78%); color: var(--primary); font-size: 12px; font-weight: 900; }
    input, textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px; font: inherit; outline: none; } textarea { min-height: 104px; resize: vertical; } input:focus, textarea:focus { border-color: var(--primary); box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary), white 82%); }
    .log { margin-top: 14px; display: grid; gap: 8px; } .toast { border-radius: 10px; background: #ecfdf5; color: #047857; padding: 10px; font-weight: 750; }
    @media (max-width: 820px) { .hero { grid-template-columns: 1fr; } .grid { grid-template-columns: 1fr; } .bar { align-items: flex-start; flex-direction: column; } }
  </style>
</head>
<body>
  <header><div class="bar"><strong>${plan.productName}</strong><nav id="nav"></nav></div></header>
  <main class="wrap">
    <section class="hero">
      <div class="panel">
        <div class="eyebrow">${plan.category} / ${plan.layout}</div>
        <h1>${plan.productName}</h1>
        <p>${plan.problem}</p>
        <div id="features" class="grid"></div>
        <input id="search" placeholder="Search ${plan.dataModels[0]?.name || "records"}" />
        <div id="records" class="grid ${plan.layout}"></div>
      </div>
      <aside class="panel">
        <h2>${plan.forms[0]?.name || "Create record"}</h2>
        <p>${plan.forms[0]?.action || "Save a new record."}</p>
        <textarea id="note" placeholder="${(plan.forms[0]?.fields || ["Name"]).join(", ")}"></textarea>
        <button class="primary" id="save">Save</button>
        <div class="log" id="log"><div class="toast">Interactive preview ready.</div></div>
      </aside>
    </section>
  </main>
  <script>
    const routes = ${routes};
    const features = ${features};
    let records = ${data};
    const nav = document.getElementById("nav");
    const featureRoot = document.getElementById("features");
    const recordRoot = document.getElementById("records");
    const log = document.getElementById("log");
    const search = document.getElementById("search");
    const note = document.getElementById("note");
    routes.forEach((route, index) => {
      const button = document.createElement("button");
      button.textContent = route.label;
      if (index === 0) button.className = "active";
      button.onclick = () => {
        [...nav.children].forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        addLog("Opened " + route.label + ": " + route.purpose);
      };
      nav.appendChild(button);
    });
    features.slice(0, 3).forEach((feature) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = "<strong>" + feature + "</strong><span class='pill'>enabled</span>";
      featureRoot.appendChild(card);
    });
    function render() {
      const query = search.value.toLowerCase();
      recordRoot.innerHTML = "";
      records.filter((record) => record.label.toLowerCase().includes(query) || record.status.toLowerCase().includes(query)).forEach((record) => {
        const card = document.createElement("article");
        card.className = "card";
        card.innerHTML = "<strong>" + record.label + "</strong><div class='value'>" + record.value + "</div><span class='pill'>" + record.status + "</span>";
        card.onclick = () => addLog("Selected " + record.label);
        recordRoot.appendChild(card);
      });
    }
    function addLog(message) {
      const item = document.createElement("div");
      item.className = "toast";
      item.textContent = message;
      log.prepend(item);
    }
    search.oninput = render;
    document.getElementById("save").onclick = () => {
      const label = note.value.trim() || "${plan.forms[0]?.name || "New item"}";
      records.unshift({ label, value: "New", status: "Created" });
      note.value = "";
      render();
      addLog("Saved " + label);
    };
    render();
  </script>
</body>
</html>`;
}

function layoutClass(layout: AppPlan["layout"]) {
  if (layout === "kanban") return "grid gap-3 md:grid-cols-4";
  if (layout === "calendar") return "grid gap-3 md:grid-cols-7";
  if (layout === "feed") return "grid gap-3";
  return "grid gap-3 md:grid-cols-3";
}

function layoutCss(layout: AppPlan["layout"]) {
  if (layout === "kanban") return "grid-template-columns: repeat(4, minmax(0,1fr));";
  if (layout === "calendar") return "grid-template-columns: repeat(7, minmax(0,1fr));";
  if (layout === "feed") return "grid-template-columns: 1fr;";
  if (layout === "ordering") return "grid-template-columns: 1.2fr .8fr;";
  return "grid-template-columns: repeat(3, minmax(0,1fr));";
}
