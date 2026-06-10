export type VentureOSAssetIdInput = {
  publicAssetId: string;
  createdAt: string | Date;
};

export function ventureOsIdForAsset(input: VentureOSAssetIdInput) {
  const year = yearFromDate(input.createdAt);
  const numeric = stableNumericHash(`${year}:${input.publicAssetId}`) % 1_000_000;
  return `VOS-${year}-${String(numeric).padStart(6, "0")}`;
}

export function looksLikeVentureOSId(value: string) {
  return /^VOS-\d{4}-\d{6}$/i.test(value.trim());
}

function yearFromDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().getUTCFullYear();
  return date.getUTCFullYear();
}

function stableNumericHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
