import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Inversiones", eyebrow: "Dónde está tu dinero invertido y cuánto vale", eyebrowShort: "Dónde está tu dinero", add: "+ Agregar inversión", addAria: "Agregar inversión",
    soonTitle: "Esta sección llega pronto", soonText: "Por ahora no está disponible. Sigue con tu plan desde Inicio.", goHome: "Ir a Inicio",
    proTitle: "Todo tu dinero invertido en un solo lugar", proBullets: ["Lo que pusiste frente a lo que vale hoy", "Cómo ha cambiado mes a mes", "Unida a tu Plan anual"],
    category: "Ahorro e inversión",

    totals: "Totales", worth: "Vale hoy", put: "Has puesto", result: "Resultado", planYear: "Aportaste en {year} (plan)", ofIncome: "{pct} de lo que entró",

    newTitle: "Agregar inversión", newSub: "Cualquier lugar donde tengas dinero invertido. Tú le pones el nombre.",
    name: "Nombre (app, fondo o plataforma)", namePh: "Ej. AustralianSuper, CommSec, Binance", link: "Vincular a una línea de tu plan", noLink: "Ninguna", newLine: "Crear una línea nueva en \"{category}\"",
    monthly: "Cuánto aportas al mes", monthlyHint: "La línea va desde este mes hasta diciembre.", contributed: "Cuánto has puesto en total", value: "Cuánto vale hoy", type: "Tipo",
    types: { etf: "Acciones y ETF", fondos: "Fondos", cripto: "Cripto", super: "{retirement}", ahorro: "Ahorro con interés", propiedad: "Propiedad", otro: "Otro" },

    share: "{pct}% del total", resultEmpty: "Completa ambos valores", saveValue: "Guardar", valueAria: "Cuánto vale hoy {name}",
    linked: "Vinculada a \"{line}\" de tu plan ({amount} en {year}).", updated: "Actualizado: {date}",
    register: "Registrar", history: "Historial", hideHistory: "Ocultar historial", edit: "Editar", editing: "Editando",
    kindAria: "Qué quieres registrar", kinds: { aporte: "Aporte", retiro: "Retiro", valor: "Valor de hoy" }, kindsPast: { aporte: "Aporte", retiro: "Retiro", valor: "Valor" },
    amount: "Monto", date: "Fecha", noHistory: "Sin registros todavía.",
    editTitle: "Editar {name}", archive: "Archivar", archiveConfirm: "Toca otra vez para archivar", archiveHint: "Archivar la quita de tus totales sin borrar su historial.",
    archived: "Archivadas ({n})", restore: "Restaurar",

    chart: "Cómo ha cambiado lo que vale", chartAria: "Evolución de lo que valen tus inversiones", chartEmpty: "Cada vez que escribas cuánto vale hoy una inversión, aquí verás cómo cambia. Hace falta al menos dos fechas distintas.",
    chartPoint: "{date}: {amount}",
    dist: "Cómo está repartido", distEmpty: "Escribe cuánto vale hoy cada inversión y aquí verás cómo está repartido tu dinero.",
    superNote1: "¿Tienes {retirement}?", superNote2: "Casi todos en Australia tienen uno, y a veces más de uno. Agrégalo para ver todo tu dinero invertido en un solo lugar.",
    tracking: "Solo para seguimiento: la app no recomienda dónde invertir. Los valores los actualizas tú, sin dar acceso a tus cuentas.",

    emptyTitle: "Aún no registras inversiones", emptyText: "Agrega dónde tienes dinero invertido: lo que pusiste y cuánto vale hoy. Tú actualizas los valores.", emptyCta: "Agregar una inversión",
    tCreated: "Inversión agregada.", tSaved: "Cambios guardados.", tArchived: "Inversión archivada.", tRestored: "Inversión restaurada.", tEntry: "Registrado.", tValue: "Valor actualizado.",
    errName: "Falta el nombre.", errMonthly: "Falta cuánto aportas al mes.", errLine: "Esa línea ya no está en tu plan.", errRetiro: "No puedes retirar más de lo que vale.",
  },
  en: {
    title: "Investments", eyebrow: "Where your money is invested and what it's worth", eyebrowShort: "Where your money is", add: "+ Add investment", addAria: "Add investment",
    soonTitle: "This section is coming soon", soonText: "It isn't available yet. Keep going with your plan from Home.", goHome: "Go to Home",
    proTitle: "All your invested money in one place", proBullets: ["What you put in against what it's worth today", "How it has changed month by month", "Linked to your yearly plan"],
    category: "Savings & investing",

    totals: "Totals", worth: "Worth today", put: "You've put in", result: "Result", planYear: "You put in during {year} (plan)", ofIncome: "{pct} of what came in",

    newTitle: "Add investment", newSub: "Anywhere you have money invested. You give it a name.",
    name: "Name (app, fund or platform)", namePh: "E.g. AustralianSuper, CommSec, Binance", link: "Link to a line in your plan", noLink: "None", newLine: "Create a new line in \"{category}\"",
    monthly: "How much you put in a month", monthlyHint: "The line runs from this month to December.", contributed: "How much you've put in overall", value: "What it's worth today", type: "Type",
    types: { etf: "Shares & ETFs", fondos: "Funds", cripto: "Crypto", super: "{retirement}", ahorro: "Interest savings", propiedad: "Property", otro: "Other" },

    share: "{pct}% of the total", resultEmpty: "Fill in both values", saveValue: "Save", valueAria: "What {name} is worth today",
    linked: "Linked to \"{line}\" in your plan ({amount} in {year}).", updated: "Updated: {date}",
    register: "Log", history: "History", hideHistory: "Hide history", edit: "Edit", editing: "Editing",
    kindAria: "What do you want to log", kinds: { aporte: "Contribution", retiro: "Withdrawal", valor: "Today's value" }, kindsPast: { aporte: "Contribution", retiro: "Withdrawal", valor: "Value" },
    amount: "Amount", date: "Date", noHistory: "No entries yet.",
    editTitle: "Edit {name}", archive: "Archive", archiveConfirm: "Tap again to archive", archiveHint: "Archiving removes it from your totals without deleting its history.",
    archived: "Archived ({n})", restore: "Restore",

    chart: "How its worth has changed", chartAria: "How your investments' worth has changed", chartEmpty: "Every time you write what an investment is worth today, you'll see here how it changes. It needs at least two different dates.",
    chartPoint: "{date}: {amount}",
    dist: "How it's spread", distEmpty: "Write what each investment is worth today and you'll see here how your money is spread.",
    superNote1: "Do you have {retirement}?", superNote2: "Almost everyone in Australia has one, sometimes more than one. Add it to see all your invested money in one place.",
    tracking: "For tracking only: the app doesn't recommend where to invest. You update the values yourself, without giving access to your accounts.",

    emptyTitle: "You haven't logged investments yet", emptyText: "Add where you have money invested: what you put in and what it's worth today. You update the values.", emptyCta: "Add an investment",
    tCreated: "Investment added.", tSaved: "Changes saved.", tArchived: "Investment archived.", tRestored: "Investment restored.", tEntry: "Logged.", tValue: "Value updated.",
    errName: "The name is missing.", errMonthly: "How much you put in a month is missing.", errLine: "That line is no longer in your plan.", errRetiro: "You can't withdraw more than it's worth.",
  },
} satisfies Messages<unknown>;
export type InversionesMessages = (typeof M)["es"];
