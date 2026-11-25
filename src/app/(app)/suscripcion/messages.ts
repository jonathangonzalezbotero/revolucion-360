import type { Messages } from "@/i18n";

// Suscripción (docs/mockup/Suscripcion*.dc.html). Un solo plan, todo incluido, en USD.
// {price}, {first}, {perMonth}: precios ya formateados ("$8", "$1", "$6.67"); el "USD" va en el texto.
export const M = {
  es: {
    title: "Suscripción", eyebrow: "Tu plan, tus pagos y tu método de pago", eyebrowShort: "Tu plan y tus pagos", back: "‹ Más",
    sello: "Revolución del Dinero",
    current: "Tu suscripción",
    view: {
      first: { tag: "Tu primer mes", title: "Primer mes por {first} USD", text: "Desde el {date}: {price} USD al mes. Te avisamos {days} días antes del cobro.", textNoDate: "Después: {price} USD al mes. Te avisamos {days} días antes del cobro.", cta: "Cambiar a anual y ahorrar" },
      monthly: { tag: "Mensual", title: "{price} USD al mes", text: "Próximo cobro: {date}.", textNoDate: "Tu suscripción está activa.", cta: "Cambiar a anual y ahorrar" },
      yearly: { tag: "Anual", title: "{price} USD al año", text: "Próximo cobro: {date}. Equivale a {perMonth} al mes.", textNoDate: "Equivale a {perMonth} al mes.", cta: "Cambiar a mensual" },
      ending: { text: "Tu suscripción termina el {date}. No se renueva.", textNoDate: "Tu suscripción termina al final del periodo pagado. No se renueva." },
      gift: { alumno: "Acceso de alumno", fundador: "Acceso fundador", title: "Todo incluido, sin costo", life: "Otorgado por Revolución del Dinero. De por vida.", until: "Otorgado por Revolución del Dinero. Hasta el {date}.", pay: "Pagar antes de que venza" },
      failed: { tag: "Pago pendiente", title: "No pudimos cobrar {price} USD", text: "Lo intentamos de nuevo en unos días. Mientras tanto todo sigue funcionando.", cta: "Actualizar mi tarjeta" },
      readOnly: { tag: "Solo lectura", title: "Tu suscripción terminó", titleGift: "Tu acceso terminó", text: "Ves todo y puedes exportar tus datos, pero no editar. Nada se borra.", cta: "Volver a activar por {price} USD", export: "Exportar mis datos" },
    },
    plan: {
      title: "Un solo plan, todo incluido", frequency: "Frecuencia de pago", monthly: "Mensual", yearly: "Anual", yearlyFree: "Anual · {n} meses gratis", yearlyFreeOne: "Anual · 1 mes gratis",
      perMonth: "USD al mes", perYear: "USD al año",
      lineFirst: "Tu primer mes cuesta {first} USD", lineMonthly: "Se cobra cada mes",
      lineYearly: "Equivale a {perMonth} al mes · {n} meses gratis", lineYearlyOne: "Equivale a {perMonth} al mes · 1 mes gratis", lineYearlyPlain: "Equivale a {perMonth} al mes",
      usd: "Se cobra en dólares americanos. Stripe te muestra el valor en tu moneda y tu banco puede cobrar una comisión por el cambio.",
      includes: ["Plan anual y asistente", "Movimientos a mano y con CSV", "Cuentas, metas, deudas e inversiones", "Proyección y análisis", "Cierre de mes y diagnóstico", "Academia completa", "Exportar tus datos siempre"],
      note: "Cancela cuando quieras.",
    },
    banners: {
      notActive: "Los pagos aún no están activos. El cobro se abrirá pronto.",
      refresh: "Actualizar",
    },
    method: {
      title: "Método de pago", cardBrand: "{brand} •••• {last4}", expires: "Vence {exp} · principal", change: "Cambiar", add: "+ Agregar método de pago",
      none: "Aún no tienes un método de pago. Lo agregas al activar tu cuenta.", unavailable: "No pudimos leer tus pagos en Stripe ahora. Intenta más tarde.",
      note: "Los pagos los procesa Stripe. Revolución 360 nunca ve ni guarda el número de tu tarjeta.", manage: "Ver facturas y gestionar en Stripe",
    },
    billing: {
      title: "Datos de facturación", name: "Nombre en la factura", taxId: "{term} o identificación fiscal (opcional)", taxIdPlain: "Identificación fiscal (opcional)", taxField: "ID fiscal",
      save: "Guardar", saving: "Guardando…", saved: "Datos de facturación guardados.", note: "Salen en tus próximas facturas de Stripe.",
    },
    history: {
      title: "Historial de pagos", date: "Fecha", concept: "Concepto", amount: "Monto", status: "Estado", invoice: "Factura", download: "Descargar",
      first: "Primer mes", month: "Mensual", year: "Anual", alumno: "Acceso de alumno", fundador: "Acceso fundador",
      st: { active: "Activo", expired: "Vencido", revoked: "Retirado", paid: "Pagado", open: "Pendiente", uncollectible: "Impago", void: "Anulado" },
      note: "Cada pago tiene su factura descargable.",
      empty: "Aún no hay pagos", emptyText: "Aquí verás cada cobro y su factura.",
    },
    cancel: {
      title: "Cancelar",
      text: "Si cancelas, sigues con todo hasta el final del periodo pagado. Después tu cuenta queda en solo lectura: ves tus datos y puedes exportarlos, pero no editar. Nada se borra.",
      open: "Cancelar suscripción", why: "¿Por qué te vas? (opcional)",
      reasons: { caro: "Es muy caro", no_uso: "No lo uso", falta: "Me falta algo" },
      confirm: "Confirmar cancelación", confirming: "Cancelando…", done: "Listo. Sigues con todo hasta el {date}.", doneNoDate: "Listo. Sigues con todo hasta el final del periodo.",
      pending: "Tu suscripción termina el {date}. Hasta entonces sigues con todo.", pendingNoDate: "Tu suscripción termina al final del periodo pagado.",
      resume: "Seguir con mi suscripción", resumed: "Tu suscripción sigue activa.",
    },
    errors: {
      notActive: "Los pagos aún no están activos.", badCoupon: "Ese cupón no existe o ya venció.", couponExpired: "Ese cupón ya venció.", couponMonthly: "Ese cupón es solo para el plan mensual. Elige mensual o quita el cupón.", couponYearly: "Ese cupón es solo para el plan anual. Elige anual o quita el cupón.",
      alreadyPro: "Ya tienes una suscripción activa. Gestiónala en Suscripción.", alreadyActive: "Tu cuenta ya está activa: no necesitas pagar.", noCustomer: "Aún no tienes pagos en Stripe.", noSub: "No tienes una suscripción activa.",
      name: "Falta el nombre.",
    },
  },
  en: {
    title: "Subscription", eyebrow: "Your plan, your payments and your payment method", eyebrowShort: "Your plan and payments", back: "‹ More",
    sello: "Revolución del Dinero",
    current: "Your subscription",
    view: {
      first: { tag: "Your first month", title: "First month for {first} USD", text: "From {date}: {price} USD a month. We'll let you know {days} days before the charge.", textNoDate: "After that: {price} USD a month. We'll let you know {days} days before the charge.", cta: "Switch to yearly and save" },
      monthly: { tag: "Monthly", title: "{price} USD a month", text: "Next charge: {date}.", textNoDate: "Your subscription is active.", cta: "Switch to yearly and save" },
      yearly: { tag: "Yearly", title: "{price} USD a year", text: "Next charge: {date}. Works out to {perMonth} a month.", textNoDate: "Works out to {perMonth} a month.", cta: "Switch to monthly" },
      ending: { text: "Your subscription ends on {date}. It won't renew.", textNoDate: "Your subscription ends at the end of the paid period. It won't renew." },
      gift: { alumno: "Student access", fundador: "Founder access", title: "Everything included, at no cost", life: "Granted by Revolución del Dinero. For life.", until: "Granted by Revolución del Dinero. Until {date}.", pay: "Pay before it ends" },
      failed: { tag: "Payment pending", title: "We couldn't charge {price} USD", text: "We'll try again in a few days. Everything keeps working in the meantime.", cta: "Update my card" },
      readOnly: { tag: "Read-only", title: "Your subscription ended", titleGift: "Your access ended", text: "You see everything and can export your data, but not edit. Nothing is deleted.", cta: "Reactivate for {price} USD", export: "Export my data" },
    },
    plan: {
      title: "One plan, everything included", frequency: "Billing frequency", monthly: "Monthly", yearly: "Yearly", yearlyFree: "Yearly · {n} months free", yearlyFreeOne: "Yearly · 1 month free",
      perMonth: "USD a month", perYear: "USD a year",
      lineFirst: "Your first month costs {first} USD", lineMonthly: "Charged every month",
      lineYearly: "Works out to {perMonth} a month · {n} months free", lineYearlyOne: "Works out to {perMonth} a month · 1 month free", lineYearlyPlain: "Works out to {perMonth} a month",
      usd: "Charged in US dollars. Stripe shows you the amount in your currency and your bank may charge a conversion fee.",
      includes: ["Yearly plan and wizard", "Transactions by hand and by CSV", "Accounts, goals, debts and investments", "Forecast and analysis", "Month close and check-up", "The whole Academy", "Export your data, always"],
      note: "Cancel any time.",
    },
    banners: {
      notActive: "Payments aren't active yet. Checkout opens soon.",
      refresh: "Refresh",
    },
    method: {
      title: "Payment method", cardBrand: "{brand} •••• {last4}", expires: "Expires {exp} · default", change: "Change", add: "+ Add payment method",
      none: "You don't have a payment method yet. You add it when you activate your account.", unavailable: "We couldn't read your payments from Stripe right now. Try again later.",
      note: "Payments are processed by Stripe. Revolución 360 never sees or stores your card number.", manage: "See invoices and manage in Stripe",
    },
    billing: {
      title: "Billing details", name: "Name on invoice", taxId: "{term} or tax ID (optional)", taxIdPlain: "Tax ID (optional)", taxField: "Tax ID",
      save: "Save", saving: "Saving…", saved: "Billing details saved.", note: "They appear on your next Stripe invoices.",
    },
    history: {
      title: "Payment history", date: "Date", concept: "Item", amount: "Amount", status: "Status", invoice: "Invoice", download: "Download",
      first: "First month", month: "Monthly", year: "Yearly", alumno: "Student access", fundador: "Founder access",
      st: { active: "Active", expired: "Expired", revoked: "Removed", paid: "Paid", open: "Pending", uncollectible: "Unpaid", void: "Void" },
      note: "Every payment has a downloadable invoice.",
      empty: "No payments yet", emptyText: "Each charge and its invoice will show up here.",
    },
    cancel: {
      title: "Cancel",
      text: "If you cancel, you keep everything until the end of the paid period. After that your account becomes read-only: you see your data and can export it, but not edit. Nothing is deleted.",
      open: "Cancel subscription", why: "Why are you leaving? (optional)",
      reasons: { caro: "It's too expensive", no_uso: "I don't use it", falta: "Something's missing" },
      confirm: "Confirm cancellation", confirming: "Cancelling…", done: "Done. You keep everything until {date}.", doneNoDate: "Done. You keep everything until the end of the period.",
      pending: "Your subscription ends on {date}. Until then you keep everything.", pendingNoDate: "Your subscription ends at the end of the paid period.",
      resume: "Keep my subscription", resumed: "Your subscription is still active.",
    },
    errors: {
      notActive: "Payments aren't active yet.", badCoupon: "That coupon doesn't exist or has expired.", couponExpired: "That coupon has expired.", couponMonthly: "That coupon is only for the monthly plan. Choose monthly or remove the coupon.", couponYearly: "That coupon is only for the yearly plan. Choose yearly or remove the coupon.",
      alreadyPro: "You already have an active subscription. Manage it in Subscription.", alreadyActive: "Your account is already active: you don't need to pay.", noCustomer: "You don't have payments in Stripe yet.", noSub: "You don't have an active subscription.",
      name: "The name is missing.",
    },
  },
} satisfies Messages<unknown>;

export type SubMessages = (typeof M)["es"];
