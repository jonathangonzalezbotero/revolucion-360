import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Inversiones", eyebrow: "Qué tienes, dónde y cuánto vale", eyebrowShort: "Qué tienes y cuánto vale", add: "+ Agregar activo", addAria: "Agregar activo",
    soonTitle: "Esta sección llega pronto", soonText: "Por ahora no está disponible. Sigue con tu plan desde Inicio.", goHome: "Ir a Inicio",
    category: "Ahorro e inversión",

    totals: "Totales", worth: "Vale hoy", count: "{n} activos", countOne: "1 activo", put: "Has puesto", putShort: "Puesto", result: "Resultado", dividends: "Dividendos recibidos",

    newTitle: "Agregar un activo", newSub: "Una acción, un ETF, una cripto, un fondo o tu {retirement}. Después registras tus compras.",
    name: "Símbolo o nombre", namePh: "Ej. VOO, BTC, AustralianSuper", type: "Tipo", platform: "Plataforma (opcional)", platformPh: "Ej. Stake, CommSec, Binance",
    kinds: { etf: "ETF", stocks: "Acciones", crypto: "Cripto", fund: "Fondo", retirement: "{retirement}", property: "Propiedad", other: "Otro" },

    views: "Agrupar inversiones", viewAsset: "Por activo", viewPlatform: "Por plataforma", viewKind: "Por tipo", list: "Tus activos", listSection: "Tus inversiones",
    noPlatform: "Sin plataforma", assets: "{n} activos", assetOne: "1 activo", balance: "Saldo",
    inPlatform: "{type} · en {platform}",

    has: "Tienes", unitShares: "acciones", unitUnits: "unidades", avg: "Costo promedio {price}", div: "Dividendos",
    priceUnit: "Precio de hoy (por unidad)", priceBalance: "Saldo de hoy", savePrice: "Guardar",
    updated: "Actualizado: {date} · lo escribes tú, sin conectar tu cuenta", notUpdated: "Sin precio todavía · lo escribes tú, sin conectar tu cuenta",
    noPriceNote: "Mientras no escribas el precio, vale lo que pusiste.",
    recurring: "Recurrente: {kind} {amount} cada mes · vinculada a \"{line}\" de tu plan", recBuy: "Compra", recAdd: "Aporte",
    recNeedsPrice: "Escribe el precio de hoy para que la compra recurrente se sume sola.",

    ops: "Operaciones", addOp: "+ Operación", opKind: "Tipo", opKinds: { buy: "Compra", sell: "Venta", dividend: "Dividendo" }, opKindsBalance: { buy: "Aporte", sell: "Retiro", dividend: "Dividendo" },
    date: "Fecha", qty: "Cantidad", priceOrAmount: "Precio por unidad o monto", amount: "Monto",
    detCash: "Pago en efectivo", detAmount: "Monto", detMigrated: "Lo que habías puesto", detRecurring: "Recurrente", noOps: "Sin operaciones todavía. Registra tu primera compra.",
    removeOp: "Quitar", removeOpConfirm: "¿Quitar?", removeOpAria: "Quitar {kind} del {date}", removeOpConfirmAria: "Toca otra vez para quitar {kind} del {date}",

    edit: "Editar", editTitle: "Editar {name}", link: "Compra recurrente: línea de tu plan", noLink: "Ninguna", newLine: "Crear una línea nueva en \"{category}\"",
    monthly: "Cuánto pones al mes", monthlyHint: "La línea va desde este mes hasta diciembre. Se suma sola cada mes desde hoy.",
    archive: "Archivar", archiveConfirm: "Toca otra vez para archivar", archiveHint: "Archivar lo quita de tus totales sin borrar sus operaciones.",
    archived: "Archivados ({n})", restore: "Restaurar",

    dist: "Por tipo", distEmpty: "Cuando tus activos valgan algo, aquí verás cómo está repartido tu dinero.",
    tracking: "Solo para seguimiento: la app no recomienda qué comprar ni vender. Los precios los escribes tú, sin dar acceso a tus cuentas. Las compras recurrentes vinculadas a tu plan se suman solas cada mes.",

    emptyTitle: "Aún no registras activos", emptyText: "Agrega lo que tienes: un ETF, una cripto, un fondo o tu {retirement}. Después registras tus compras y escribes el precio de hoy.", emptyCta: "Agregar un activo",

    tCreated: "Activo agregado.", tSaved: "Cambios guardados.", tArchived: "Activo archivado.", tRestored: "Activo restaurado.", tPrice: "Valor actualizado.",
    tOp: { buy: "Compra registrada.", sell: "Venta registrada.", dividend: "Dividendo registrado." }, tOpBalance: { buy: "Aporte registrado.", sell: "Retiro registrado.", dividend: "Dividendo registrado." },
    tOpRemoved: "Operación quitada.",
    errName: "Falta el símbolo o nombre.", errQty: "Falta la cantidad.", errPrice: "Falta el precio por unidad.", errAmount: "Falta el monto.", errDate: "La fecha no puede ser después de hoy.",
    errOversold: "No puedes vender más de lo que tienes en esa fecha.", errOverdraw: "No puedes retirar más de lo que vale.", errMonthly: "Falta cuánto pones al mes.", errLine: "Esa línea ya no está en tu plan.", errLineTaken: "Esa línea ya está ligada a otro activo.", errRetirementPlan: "Tu jubilación la aporta tu empleador: no va en tu plan, solo aquí.",
  },
  en: {
    title: "Investments", eyebrow: "What you own, where, and what it's worth", eyebrowShort: "What you own and what it's worth", add: "+ Add asset", addAria: "Add asset",
    soonTitle: "This section is coming soon", soonText: "It isn't available yet. Keep going with your plan from Home.", goHome: "Go to Home",
    category: "Savings & investing",

    totals: "Totals", worth: "Worth today", count: "{n} assets", countOne: "1 asset", put: "You've put in", putShort: "Put in", result: "Result", dividends: "Dividends received",

    newTitle: "Add an asset", newSub: "A share, an ETF, a crypto, a fund or your {retirement}. Then you log your buys.",
    name: "Ticker or name", namePh: "E.g. VOO, BTC, AustralianSuper", type: "Type", platform: "Platform (optional)", platformPh: "E.g. Stake, CommSec, Binance",
    kinds: { etf: "ETF", stocks: "Shares", crypto: "Crypto", fund: "Fund", retirement: "{retirement}", property: "Property", other: "Other" },

    views: "Group investments", viewAsset: "By asset", viewPlatform: "By platform", viewKind: "By type", list: "Your assets", listSection: "Your investments",
    noPlatform: "No platform", assets: "{n} assets", assetOne: "1 asset", balance: "Balance",
    inPlatform: "{type} · on {platform}",

    has: "You hold", unitShares: "shares", unitUnits: "units", avg: "Average cost {price}", div: "Dividends",
    priceUnit: "Today's price (per unit)", priceBalance: "Today's balance", savePrice: "Save",
    updated: "Updated: {date} · you type it, without connecting your account", notUpdated: "No price yet · you type it, without connecting your account",
    noPriceNote: "Until you type the price, it's worth what you put in.",
    recurring: "Recurring: {kind} {amount} every month · linked to \"{line}\" in your plan", recBuy: "Buy", recAdd: "Contribution",
    recNeedsPrice: "Type today's price so the recurring buy adds itself.",

    ops: "Transactions", addOp: "+ Transaction", opKind: "Type", opKinds: { buy: "Buy", sell: "Sell", dividend: "Dividend" }, opKindsBalance: { buy: "Contribution", sell: "Withdrawal", dividend: "Dividend" },
    date: "Date", qty: "Quantity", priceOrAmount: "Price per unit or amount", amount: "Amount",
    detCash: "Cash payment", detAmount: "Amount", detMigrated: "What you had put in", detRecurring: "Recurring", noOps: "No transactions yet. Log your first buy.",
    removeOp: "Remove", removeOpConfirm: "Remove?", removeOpAria: "Remove {kind} on {date}", removeOpConfirmAria: "Tap again to remove {kind} on {date}",

    edit: "Edit", editTitle: "Edit {name}", link: "Recurring buy: line in your plan", noLink: "None", newLine: "Create a new line in \"{category}\"",
    monthly: "How much you put in a month", monthlyHint: "The line runs from this month to December. It adds itself every month from today.",
    archive: "Archive", archiveConfirm: "Tap again to archive", archiveHint: "Archiving removes it from your totals without deleting its transactions.",
    archived: "Archived ({n})", restore: "Restore",

    dist: "By type", distEmpty: "Once your assets are worth something, you'll see here how your money is spread.",
    tracking: "For tracking only: the app doesn't recommend what to buy or sell. You type the prices yourself, without giving access to your accounts. Recurring buys linked to your plan add themselves every month.",

    emptyTitle: "You haven't added assets yet", emptyText: "Add what you own: an ETF, a crypto, a fund or your {retirement}. Then log your buys and type today's price.", emptyCta: "Add an asset",

    tCreated: "Asset added.", tSaved: "Changes saved.", tArchived: "Asset archived.", tRestored: "Asset restored.", tPrice: "Value updated.",
    tOp: { buy: "Buy logged.", sell: "Sell logged.", dividend: "Dividend logged." }, tOpBalance: { buy: "Contribution logged.", sell: "Withdrawal logged.", dividend: "Dividend logged." },
    tOpRemoved: "Transaction removed.",
    errName: "The ticker or name is missing.", errQty: "The quantity is missing.", errPrice: "The price per unit is missing.", errAmount: "The amount is missing.", errDate: "The date can't be after today.",
    errOversold: "You can't sell more than you hold on that date.", errOverdraw: "You can't withdraw more than it's worth.", errMonthly: "How much you put in a month is missing.", errLine: "That line is no longer in your plan.", errLineTaken: "That line is already linked to another asset.", errRetirementPlan: "Your employer pays into your retirement fund: it stays here, not in your plan.",
  },
} satisfies Messages<unknown>;
export type InversionesMessages = (typeof M)["es"];
