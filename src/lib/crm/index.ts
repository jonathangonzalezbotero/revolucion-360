// CRM: piezas puras (sin base de datos ni red). El motor y las funciones de servidor viven en src/server/crm.
// Las firmas de webhooks (node:crypto) NO van aquí: importa "@/lib/crm/sign" solo en el servidor.
// Componentes de cliente: mejor "@/lib/crm/schema" y "@/lib/crm/labels".
export * from "./schema";
export * from "./rules";
export * from "./time";
export * from "./phone";
export * from "./flow";
export * from "./render";
export * from "./labels";
export * from "./rate";
