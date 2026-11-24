import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Cierre de mes", eyebrow: "{month} {year} · unos 5 minutos", eyebrowShort: "{month} · 5 minutos", close: "Cerrar",
    soonTitle: "El cierre de mes no está disponible", soonText: "Por ahora esta sección está apagada.", goHome: "Volver al inicio",
    pro: { title: "Cierra tu mes en 5 minutos", text: "El cierre es el hábito que mantiene tu plan vivo.", bullets: ["Revisa qué quedó pendiente y qué pagaste de más", "Compara tu plan con lo que pasó, categoría por categoría", "Ajusta el mes siguiente y anota tus saldos", "Te recordamos el cierre cada mes y sumas puntos"] },
    readOnly: "Tu cuenta está en solo lectura: puedes ver el cierre, pero no guardar cambios.",
    steps: ["Revisa", "Compara", "Ajusta {next}", "Saldos"], stepsAria: "Pasos", stepOf: "Paso {n} de 4",
    // 1. Revisa
    reviewTitle: "¿Qué quedó pendiente en {month}?",
    toReview: "{n} movimientos sin categoría", toReviewOne: "1 movimiento sin categoría",
    unplanned: "{n} movimientos sin línea del plan", unplannedOne: "1 movimiento sin línea del plan",
    whatHappened: "¿Qué pasó con {name}?", opts: { paid: "Ya la pagué", move: "Pasar a {next}", skip: "No aplica" },
    partialSub: "Pagaste {paid} de {planned}", pendingSub: "Pendiente", undo: "Deshacer", done: { paid: "Marcada como pagada.", move: "Pasó a {next}.", skip: "Quedó fuera de {month}." },
    overTitle: "Pagaste de más", overLine: "+{amount} sobre el plan",
    allClear: "Nada pendiente en {month}. Todo lo del plan quedó pagado.", noPlanTitle: "Aún no tienes plan para {month}", noPlanText: "Arma tu plan y el cierre te mostrará qué quedó pendiente.", noPlanCta: "Arma tu plan",
    // 2. Compara
    compareTitle: "Tu plan vs. lo que pasó", plannedLeft: "Planeaste que te sobrara", plannedShort: "Planeaste que te faltara", realLeft: "Te sobró de verdad", realShort: "Te faltó de verdad",
    inOut: "Entró {in} · salió {out}", inOutPlan: "Entra {in} · sale {out}",
    deviationTitle: "Donde más te desviaste", over: "+{amount} sobre el plan", under: "-{amount} bajo el plan", noDeviation: "Todo salió como lo planeaste.",
    compareNote: "No es para sentirte mal: es para que el plan de {next} sea más realista.",
    // 3. Ajusta
    adjustTitle: "Ajusta {next}", adjustBar: "Entra {in} · sale {out}", adjustNeg: "Así planeado, en {next} te falta. Baja alguna línea hasta que no quede en negativo.",
    adjustEmpty: "Tu plan de {next} no tiene gastos", adjustEmptyText: "Agrégalos en el Plan anual y vuelve a este paso.", seeNext: "Ver {next} completo en el Plan anual ›", badAmount: "Revisa el monto de {name}.",
    // 4. Saldos
    balTitle: "Anota tus saldos de hoy", balText: "Un minuto. Con esto la Proyección y tus Inversiones quedan al día.", cardSuffix: " (lo que debes)", invLabel: "{name} · vale hoy", lastValue: "Último valor: {amount} el {date}",
    balEmpty: "Aún no tienes cuentas", balEmptyText: "Agrega tus cuentas para anotar su saldo en cada cierre. Puedes cerrar el mes igual.", balEmptyCta: "Agregar una cuenta",
    gapMissing: "Te faltan {amount} por registrar.", gapExtra: "Registraste {amount} de más.", gapOk: "Cuadra con tus movimientos.", lastBal: "Último saldo: {amount} el {date}", balHint: "Si lo dejas vacío, queda como está.", badBalance: "Revisa el saldo de {name}.",
    // Navegación
    back: "‹ Atrás", next: "Siguiente", finish: "Terminar cierre", saving: "Guardando…",
    // Éxito
    doneTitle: "Cierre de {month} listo", streak: "Llevas {n} cierres seguidos.", streakOne: "Es tu primer cierre seguido.", remind: "Te recordamos el de {next} el día {date}.",
    toastDone: "{month}, cerrado.", points: "+{n} puntos.", seeDiag: "Ver mi diagnóstico actualizado", backHome: "Volver al inicio",
    // Mes cerrado
    closedTitle: "{month} {year} ya está cerrado", closedOn: "Lo cerraste el {date}.", closedPlan: "Planeado", closedReal: "Real",
    left: "Te sobró", short: "Te faltó", balancesAt: "Saldos al cerrar",
    reopen: "Reabrir el mes", reopenConfirm: "Sí, reabrir", reopenWarn: "Puedes reabrirlo para corregirlo. Los puntos del cierre no se vuelven a dar.", reopened: "{month} quedó abierto. Corrígelo y ciérralo de nuevo.",
    reopenedBanner: "Reabriste este mes. Al cerrarlo de nuevo se actualiza su resumen, sin puntos nuevos.",
    // Lista
    listTitle: "Meses cerrados de {year}", listEmpty: "Aún no cierras ningún mes de {year}.", closedPill: "Cerrado", reopenedPill: "Reabierto", see: "Ver ›", current: "Este cierre",
    planLink: "Ver {month} en el Plan anual ›",
  },
  en: {
    title: "Month close", eyebrow: "{month} {year} · about 5 minutes", eyebrowShort: "{month} · 5 minutes", close: "Close",
    soonTitle: "Month close isn't available", soonText: "This section is turned off for now.", goHome: "Back to home",
    pro: { title: "Close your month in 5 minutes", text: "The month close is the habit that keeps your plan alive.", bullets: ["See what's still pending and what you overpaid", "Compare your plan with what happened, category by category", "Adjust next month and write down your balances", "We remind you every month and you earn points"] },
    readOnly: "Your account is read-only: you can see the close, but not save changes.",
    steps: ["Review", "Compare", "Adjust {next}", "Balances"], stepsAria: "Steps", stepOf: "Step {n} of 4",
    reviewTitle: "What was left pending in {month}?",
    toReview: "{n} transactions without a category", toReviewOne: "1 transaction without a category",
    unplanned: "{n} transactions outside your plan", unplannedOne: "1 transaction outside your plan",
    whatHappened: "What happened with {name}?", opts: { paid: "I paid it", move: "Move to {next}", skip: "Doesn't apply" },
    partialSub: "You paid {paid} of {planned}", pendingSub: "Pending", undo: "Undo", done: { paid: "Marked as paid.", move: "Moved to {next}.", skip: "Left out of {month}." },
    overTitle: "You overpaid", overLine: "+{amount} over plan",
    allClear: "Nothing pending in {month}. Everything in the plan got paid.", noPlanTitle: "You don't have a plan for {month} yet", noPlanText: "Build your plan and the close will show you what's pending.", noPlanCta: "Build your plan",
    compareTitle: "Your plan vs. what happened", plannedLeft: "You planned to have left", plannedShort: "You planned to be short", realLeft: "You actually had left", realShort: "You were actually short",
    inOut: "In {in} · out {out}", inOutPlan: "In {in} · out {out}",
    deviationTitle: "Where you drifted most", over: "+{amount} over plan", under: "-{amount} under plan", noDeviation: "Everything went as planned.",
    compareNote: "It's not to make you feel bad: it's so your {next} plan is more realistic.",
    adjustTitle: "Adjust {next}", adjustBar: "In {in} · out {out}", adjustNeg: "Planned like this, you're short in {next}. Lower a line until it's not negative.",
    adjustEmpty: "Your {next} plan has no expenses", adjustEmptyText: "Add them in the yearly plan and come back to this step.", seeNext: "See all of {next} in the yearly plan ›", badAmount: "Check the amount for {name}.",
    balTitle: "Write down today's balances", balText: "One minute. This keeps your Forecast and Investments up to date.", cardSuffix: " (what you owe)", invLabel: "{name} · worth today", lastValue: "Last value: {amount} on {date}",
    balEmpty: "You don't have accounts yet", balEmptyText: "Add your accounts to write their balance at every close. You can still close the month.", balEmptyCta: "Add an account",
    gapMissing: "You have {amount} left to log.", gapExtra: "You logged {amount} too much.", gapOk: "Matches your transactions.", lastBal: "Last balance: {amount} on {date}", balHint: "Leave it empty to keep it as is.", badBalance: "Check the balance for {name}.",
    back: "‹ Back", next: "Next", finish: "Finish close", saving: "Saving…",
    doneTitle: "{month} close done", streak: "You've closed {n} months in a row.", streakOne: "This is your first close in a row.", remind: "We'll remind you about {next} on {date}.",
    toastDone: "{month}, closed.", points: "+{n} points.", seeDiag: "See my updated check-up", backHome: "Back to home",
    closedTitle: "{month} {year} is already closed", closedOn: "You closed it on {date}.", closedPlan: "Planned", closedReal: "Actual",
    left: "Left over", short: "Short", balancesAt: "Balances at close",
    reopen: "Reopen the month", reopenConfirm: "Yes, reopen", reopenWarn: "You can reopen it to fix it. Close points aren't given again.", reopened: "{month} is open. Fix it and close it again.",
    reopenedBanner: "You reopened this month. Closing it again updates its summary, with no new points.",
    listTitle: "Closed months in {year}", listEmpty: "You haven't closed any month in {year} yet.", closedPill: "Closed", reopenedPill: "Reopened", see: "View ›", current: "This close",
    planLink: "See {month} in the yearly plan ›",
  },
} satisfies Messages<unknown>;
export type CierreText = (typeof M)["es"];
