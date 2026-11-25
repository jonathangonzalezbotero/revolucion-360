import "server-only";
// CRM en el servidor. Para la app: `crmEvent`. Para el motor: `runCrm`. Para las pantallas del panel: ver admin.ts
// (firmas documentadas en docs/CRM.md).
export { crmEvent, type CrmTarget } from "./events";
export { runCrm } from "./engine";
export { countAudience } from "./audience";
export { untypedDb, crmDb } from "./db";
export * from "./admin";
export type { Db, ContactRow, CampaignRow, AutomationRow } from "./db";
