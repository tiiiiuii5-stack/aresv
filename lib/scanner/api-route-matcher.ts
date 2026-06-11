export function apiRouteFromFilePath(path: string) {
  const normalized = path.replace(/\\/g, "/");
  const appRoute = normalized.match(/(?:^|\/)app\/api\/(.+)\/route\.(?:ts|tsx|js|jsx|mjs|cjs)$/i);
  if (appRoute?.[1]) return normalizeApiRoute(`/api/${appRoute[1]}`);

  const pagesRoute = normalized.match(/(?:^|\/)pages\/api\/(.+)\.(?:ts|tsx|js|jsx|mjs|cjs)$/i);
  if (pagesRoute?.[1]) return normalizeApiRoute(`/api/${pagesRoute[1].replace(/\/index$/i, "")}`);

  return null;
}

export function apiPathMatchesRoute(routePath: string, apiPath: string) {
  const routeParts = apiParts(routePath);
  const requestParts = apiParts(apiPath);

  for (let index = 0; index < routeParts.length; index += 1) {
    const routePart = routeParts[index];
    const requestPart = requestParts[index];

    if (isOptionalCatchAllRoutePart(routePart)) return requestParts.length >= index;
    if (isCatchAllRoutePart(routePart)) return requestParts.length > index;
    if (!requestPart) return false;
    if (isDynamicRoutePart(routePart) || isDynamicRequestPart(requestPart)) continue;
    if (routePart !== requestPart) return false;
  }

  return routeParts.length === requestParts.length;
}

export function apiDynamicPrefixMatchesRoute(routePath: string, apiPrefix: string) {
  if (apiPathMatchesRoute(routePath, apiPrefix)) return true;

  const routeParts = apiParts(routePath);
  const prefixParts = apiParts(apiPrefix);
  if (prefixParts.length >= routeParts.length) return false;

  for (let index = 0; index < prefixParts.length; index += 1) {
    const routePart = routeParts[index];
    const prefixPart = prefixParts[index];
    if (!routePart || !prefixPart) return false;
    if (isDynamicRoutePart(routePart) || isDynamicRequestPart(prefixPart)) continue;
    if (routePart !== prefixPart) return false;
  }

  const nextRoutePart = routeParts[prefixParts.length];
  return isDynamicRoutePart(nextRoutePart) || isCatchAllRoutePart(nextRoutePart) || isOptionalCatchAllRoutePart(nextRoutePart);
}

export function normalizeApiRoute(value: string) {
  const withoutQuery = value.split(/[?#]/)[0] || "";
  const normalized = withoutQuery
    .replace(/\\/g, "/")
    .replace(/\/route\.(?:ts|tsx|js|jsx|mjs|cjs)$/i, "")
    .replace(/\/index$/i, "")
    .replace(/\/+/g, "/");
  const parts = normalized.split("/").filter((part) => part && !isRouteGroup(part));
  const route = `/${parts.join("/")}`;
  return route === "/" ? "" : route.replace(/\/+$/, "");
}

export function isDynamicApiExpression(source: string, matchEnd: number) {
  return /^\s*(?:\+|\.replace\s*\(|\.concat\s*\(|\.toString\s*\()/.test(source.slice(matchEnd, matchEnd + 80));
}

function apiParts(value: string) {
  const normalized = normalizeApiRoute(value);
  return normalized.split("/").filter(Boolean);
}

function isRouteGroup(value: string) {
  return /^\(.+\)$/.test(value);
}

function isDynamicRoutePart(value: string | undefined) {
  return Boolean(value && value.startsWith("[") && value.endsWith("]"));
}

function isCatchAllRoutePart(value: string | undefined) {
  return Boolean(value?.startsWith("[...") && value.endsWith("]"));
}

function isOptionalCatchAllRoutePart(value: string | undefined) {
  return Boolean(value?.startsWith("[[...") && value.endsWith("]]"));
}

function isDynamicRequestPart(value: string | undefined) {
  return Boolean(value && (/^\$\{[^}]+\}$/.test(value) || /^:[A-Za-z0-9_]+$/.test(value)));
}
