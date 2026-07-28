export const RESIDENTIAL_UNIT_TYPES = [
  "apartment/flat",
  "self-contained (self-con)",
  "mini flat",
  "duplex",
  "bungalow",
  "terrace",
  "room and parlour",
  "storey building"
] as const;

export const COMMERCIAL_UNIT_TYPES = [
  "shop",
  "office",
  "warehouse",
  "showroom"
] as const;

export const ALL_UNIT_TYPES = [...RESIDENTIAL_UNIT_TYPES, ...COMMERCIAL_UNIT_TYPES] as const;

export type UnitType = typeof ALL_UNIT_TYPES[number];

export function getUnitTypesByPropertyType(propertyType: string): string[] {
  if (propertyType === "residential") {
    return [...RESIDENTIAL_UNIT_TYPES];
  }
  if (propertyType === "commercial") {
    return [...COMMERCIAL_UNIT_TYPES];
  }
  // Mixed or others
  return [...ALL_UNIT_TYPES];
}

export function isResidentialUnitType(unitType: string): boolean {
  return (RESIDENTIAL_UNIT_TYPES as readonly string[]).includes(unitType);
}
