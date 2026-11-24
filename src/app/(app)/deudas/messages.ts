import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Deudas e impuestos", eyebrow: "Lo que debes y lo que tienes que apartar", add: "+ Agregar deuda", addAria: "Agregar deuda",
    soonTitle: "Esta sección llega pronto", soonText: "Por ahora no está disponible. Sigue con tu plan desde Inicio.", goHome: "Ir a Inicio",
    proTitle: "Sal de deudas con fecha", proBullets: ["Cuándo terminas cada deuda y cuánto pagas de interés", "Simulador: qué pasa si pagas un poco más", "Apartado para impuestos y cuenta con tu empresa"],
    category: "Deudas",

    newTitle: "Nueva deuda", newSub: "Préstamo, tarjeta, compra a cuotas o lo que le debes a alguien.", kindAria: "Tipo de deuda",
    kinds: { loan: "Préstamo", card: "Tarjeta de crédito", bnpl: "{bnpl}", personal: "Le debo a alguien", other: "Otra" },
    name: "Nombre", namePh: "Ej. Préstamo personal", balanceToday: "Saldo que debes hoy", payment: "Cuota mensual", rate: "Tasa de interés anual", ratePh: "0.0 %",
    first: "Primer pago", count: "Número de cuotas", countPh: "Ej. 2", bnplTotal: "Total de la compra", bnplDate: "Día de la compra",
    bnplHint: "Se paga en 4 partes iguales cada 2 semanas; la primera, el día de la compra. La app arma el calendario.",
    toPlan: "Agregar la cuota a mi Plan anual", toPlanSub: "Crea la línea en \"{category}\" solo en los meses que dure.", saveNew: "Guardar deuda",

    sumAria: "Totales de deuda", sumTotal: "Deuda pendiente", sumTotalShort: "Pendiente total", sumMonthly: "Cuotas este mes", ofIncome: "{pct} de tus ingresos", ofIncomeShort: "{pct} de ingresos",
    sumPaid: "Pagado en {year}", sumFree: "Libre de deudas", freeNever: "Con estas cuotas, no", freeMissing: "Falta el saldo de {n}", freeMissingOne: "Falta el saldo de 1 deuda", freeNone: "Sin deudas",

    payBtn: "Registrar pago", edit: "Editar", editing: "Editando", closeEdit: "Cerrar",
    progress: "Progreso de pago", balance: "Saldo", quota: "Cuota", rateShort: "Tasa", ends: "Termina", paidYear: "Pagado {year}", planYear: "Cuota {year}",
    variable: "Variable", never: "Nunca, con esta cuota", noBalance: "Falta el saldo", cardSub: "{kind} · saldo variable",
    noBalanceText: "Escribe cuánto debes hoy para ver cuándo terminas y cuánto pagas de interés.", writeBalance: "Escribir el saldo",
    interest: "Con esta cuota pagas {amount} en intereses.", perFreq: { monthly: "al mes", fortnightly: "cada 2 semanas", weekly: "a la semana" },
    addPlan: "Agregar al plan", noPlan: "No está en tu plan",
    sched: "Calendario de pagos", schedPaid: "Pagado", schedPending: "Pendiente", schedN: "Pago {n} de {total}",
    simTitle: "¿Y si pagas más?", simLabel: "Si pagas esto más al mes", simHint: "Escribe un monto para ver cuándo terminarías.",
    simResult: "Terminas en {date}, {months} antes.", simResultSame: "Terminas en {date}.", simRescue: "Con eso sí terminas: en {date}.", simInterest: "Te ahorras {amount} de interés.",
    simNever: "Con ese monto todavía no alcanza para cubrir el interés.", months: "{n} meses", oneMonth: "1 mes",

    editTitle: "Editar {name}", balancePending: "Saldo pendiente", paymentEach: "Cuota", freq: "Cada cuánto", freqs: { monthly: "Mensual", fortnightly: "Quincenal", weekly: "Semanal" },
    nextDue: "Próximo pago", remove: "Eliminar deuda", removeConfirm: "Toca otra vez para eliminar", removeHint: "Se borran la deuda y sus pagos. Si tiene línea en tu plan, la línea se queda: quítala desde el Plan anual si ya no va.",

    payAria: "Tipo de pago", modes: { cuota: "Cuota del mes", abono: "Abono extra", total: "Pagar todo" }, cardModes: { abono: "Pagué una parte", cuota: "Pago mínimo", total: "Pagué todo" },
    amountPaid: "Monto pagado", totalNote: "Se registra el saldo completo ({amount}) y la deuda queda saldada.",
    cardNote: "Si la pagas desde tu cuenta, cuenta como transferencia entre tus cuentas, no como gasto.", bnplNote: "Pago {n} de {total} · {date}", register: "Registrar",

    settledTitle: "Deudas saldadas", settledToday: "Saldada hoy · liberas {amount} al mes", settledOn: "Saldada el {date} · liberas {amount} al mes", settledNoQuota: "Saldada el {date}",
    ask: "¿Quito su cuota de tu Plan anual desde el próximo mes?", askYes: "Sí, quitarla", askNo: "Dejarla",
    doneYes: "Listo: quitamos la cuota de tu plan. Ese dinero queda libre en tu Proyección.", doneNo: "La cuota se queda en tu plan.",

    emptyTitle: "No tienes deudas registradas", emptyText: "Agrega tus préstamos, tarjetas o compras a cuotas para saber cuándo terminas y cuánto pagas de interés.", emptyCta: "Agregar una deuda",
    tCreated: "Deuda guardada.", tCreatedPlan: "Deuda guardada. Su cuota ya está en tu plan.", tSaved: "Cambios guardados.", tDeleted: "Deuda eliminada.", tPlan: "La cuota quedó en tu plan.",
    tPaid: "Pago registrado: {amount}.", tPaidOff: "¡{name}, saldada! Una deuda menos.",
    errBalanceFirst: "Escribe primero el saldo de esta deuda.", errRate: "La tasa va de 0 a 100 %.", errCount: "El número de cuotas va de 1 a 120.",
    errBnpl: "Falta el total de la compra.", errPlanExists: "Esta deuda ya tiene su línea en el plan.", errNoPayment: "Falta la cuota.", errNoYear: "Esta deuda no tiene pagos este año.",

    // Impuestos
    taxTitle: "Apartado para impuestos ({freelance})", taxSub: "Si cobras con {freelance}, nadie te descuenta impuestos ni {retirement}.",
    taxQ: "¿Recibes pagos con {freelance}?", taxYes: "Sí, configurar", taxIgnore: "Si no, puedes ignorar esta sección.",
    monthIncome: "Cobraste con {freelance} este mes", pct: "% que quieres apartar", pctPh: "Ej. 25", pctSave: "Guardar %", setAside: "Aparta este mes",
    taxWarn: "El % correcto depende de tus ingresos totales, otros impuestos y {retirement}. Pregúntale a tu contador qué % usar; la app solo te ayuda a apartarlo cada mes.",
    needPct: "Escribe el % que te dio tu contador para calcular cuánto apartar.",
    yIncome: "Cobrado en {year}", yShould: "Deberías tener apartado", yHave: "Tienes apartado", yMissing: "Te falta apartar", yOk: "Vas al día",
    taxReg: "Registrar", taxKindAria: "Qué quieres registrar", taxKinds: { ingreso: "Cobro con {freelance}", apartado: "Dinero apartado", pago: "Pago a {taxOffice}" },
    amount: "Monto", date: "Fecha", note: "Nota", notePh: "Opcional", taxRecent: "Últimos registros", taxNone: "Aún no registras cobros. Cada vez que te paguen con {freelance}, anótalo aquí.",
    taxOff: "Desactivar esta sección", delEntry: "Eliminar", delEntryConfirm: "¿Eliminar?",
    tTaxOn: "Listo. Escribe el % que te dio tu contador.", tPct: "Guardamos el %.", tEntry: "Registrado.", tTaxOff: "Sección desactivada.", tEntryDel: "Registro eliminado.", errPct: "Escribe un % entre 0 y 100.",

    // Empresa
    coSummary: "Avanzado: cuenta con tu empresa", coSummaryNamed: "Avanzado: cuenta con tu empresa ({name})", coDefault: "Tu empresa ({company})", coSub: "Cuenta entre tú y tu empresa",
    coUnclassified: "{amount} sin clasificar", coIn: "Aportaste", coInSub: "Lo que pusiste de tu bolsillo", coOut: "Te pagaste", coOutSub: "Retiros hacia tu cuenta", coNet: "Neto {year}",
    netMore: "Más retiros que aportes", netLess: "Más aportes que retiros", netEven: "Parejo",
    classes: {
      sueldo: { t: "Sueldo", d: "Con impuestos retenidos y {retirement}" }, dividendo: { t: "Dividendo", d: "Reparto de utilidades" },
      devolucion: { t: "Devolución de aportes", d: "Lo que pusiste antes en la empresa" }, prestamo: { t: "Préstamo de la empresa a ti", d: "Sujeto a reglas de {taxOffice}" },
    },
    unclassified: "Sin clasificar", classifyTitle: "Clasifica tus retiros", classifyNone: "Todos tus retiros tienen tipo.", classifyAria: "Tipo del retiro de {amount} del {date}", classifyBtn: "Clasificar", pickClass: "Elige el tipo",
    coReg: "Registrar un movimiento", coKindAria: "Tipo de movimiento", coKinds: { aporte: "Aporte a la empresa", retiro: "Retiro hacia ti" }, coClass: "Tipo de retiro",
    coRecent: "Últimos movimientos", coNone: "Aún no registras aportes ni retiros con tu empresa.",
    co7a: "Como {name} es una {company}, cada retiro debe tener un tipo. Los retiros sin documentar pueden tratarse como préstamo bajo la Division 7A. La app no da asesoría fiscal: confírmalo con tu contador.",
    coYours: "tu empresa", coNoAdvice: "La app no da asesoría fiscal: confirma con tu contador cómo clasificar cada retiro.",
    tClassified: "Retiro clasificado.",
  },
  en: {
    title: "Debts & taxes", eyebrow: "What you owe and what you need to set aside", add: "+ Add debt", addAria: "Add debt",
    soonTitle: "This section is coming soon", soonText: "It isn't available yet. Keep going with your plan from Home.", goHome: "Go to Home",
    proTitle: "Get out of debt with a date", proBullets: ["When each debt ends and how much interest you pay", "Simulator: what happens if you pay a bit more", "Tax set-aside and your company account"],
    category: "Debts",

    newTitle: "New debt", newSub: "A loan, a card, a purchase in instalments or what you owe someone.", kindAria: "Type of debt",
    kinds: { loan: "Loan", card: "Credit card", bnpl: "{bnpl}", personal: "I owe someone", other: "Other" },
    name: "Name", namePh: "E.g. Personal loan", balanceToday: "Balance you owe today", payment: "Monthly repayment", rate: "Yearly interest rate", ratePh: "0.0 %",
    first: "First payment", count: "Number of payments", countPh: "E.g. 2", bnplTotal: "Purchase total", bnplDate: "Purchase date",
    bnplHint: "Paid in 4 equal parts every 2 weeks; the first on the purchase date. The app builds the schedule.",
    toPlan: "Add the repayment to my yearly plan", toPlanSub: "Creates the line in \"{category}\" only for the months it lasts.", saveNew: "Save debt",

    sumAria: "Debt totals", sumTotal: "Debt owing", sumTotalShort: "Total owing", sumMonthly: "Repayments this month", ofIncome: "{pct} of your income", ofIncomeShort: "{pct} of income",
    sumPaid: "Paid in {year}", sumFree: "Debt-free", freeNever: "Not with these repayments", freeMissing: "{n} balances missing", freeMissingOne: "1 balance missing", freeNone: "No debts",

    payBtn: "Log payment", edit: "Edit", editing: "Editing", closeEdit: "Close",
    progress: "Repayment progress", balance: "Balance", quota: "Repayment", rateShort: "Rate", ends: "Ends", paidYear: "Paid {year}", planYear: "Repayment {year}",
    variable: "Variable", never: "Never, with this repayment", noBalance: "Balance missing", cardSub: "{kind} · variable balance",
    noBalanceText: "Write how much you owe today to see when you'll finish and how much interest you'll pay.", writeBalance: "Write the balance",
    interest: "With this repayment you pay {amount} in interest.", perFreq: { monthly: "a month", fortnightly: "every 2 weeks", weekly: "a week" },
    addPlan: "Add to plan", noPlan: "Not in your plan",
    sched: "Payment schedule", schedPaid: "Paid", schedPending: "Pending", schedN: "Payment {n} of {total}",
    simTitle: "What if you pay more?", simLabel: "If you pay this much more a month", simHint: "Type an amount to see when you'd finish.",
    simResult: "You finish in {date}, {months} sooner.", simResultSame: "You finish in {date}.", simRescue: "With that you do finish: in {date}.", simInterest: "You save {amount} in interest.",
    simNever: "That amount still doesn't cover the interest.", months: "{n} months", oneMonth: "1 month",

    editTitle: "Edit {name}", balancePending: "Balance owing", paymentEach: "Repayment", freq: "How often", freqs: { monthly: "Monthly", fortnightly: "Fortnightly", weekly: "Weekly" },
    nextDue: "Next payment", remove: "Delete debt", removeConfirm: "Tap again to delete", removeHint: "The debt and its payments are deleted. If it has a line in your plan, the line stays: remove it from the yearly plan if you no longer need it.",

    payAria: "Type of payment", modes: { cuota: "This month's repayment", abono: "Extra payment", total: "Pay it all" }, cardModes: { abono: "Paid part of it", cuota: "Minimum payment", total: "Paid it all" },
    amountPaid: "Amount paid", totalNote: "The full balance ({amount}) is logged and the debt is paid off.",
    cardNote: "If you pay it from your account, it counts as a transfer between your accounts, not as spending.", bnplNote: "Payment {n} of {total} · {date}", register: "Log",

    settledTitle: "Paid-off debts", settledToday: "Paid off today · frees up {amount} a month", settledOn: "Paid off on {date} · frees up {amount} a month", settledNoQuota: "Paid off on {date}",
    ask: "Remove its repayment from your yearly plan from next month?", askYes: "Yes, remove it", askNo: "Keep it",
    doneYes: "Done: we removed the repayment from your plan. That money is now free in your Forecast.", doneNo: "The repayment stays in your plan.",

    emptyTitle: "You have no debts logged", emptyText: "Add your loans, cards or instalment purchases to know when you'll finish and how much interest you pay.", emptyCta: "Add a debt",
    tCreated: "Debt saved.", tCreatedPlan: "Debt saved. Its repayment is now in your plan.", tSaved: "Changes saved.", tDeleted: "Debt deleted.", tPlan: "The repayment is now in your plan.",
    tPaid: "Payment logged: {amount}.", tPaidOff: "{name}, paid off! One debt less.",
    errBalanceFirst: "Write this debt's balance first.", errRate: "The rate goes from 0 to 100 %.", errCount: "The number of payments goes from 1 to 120.",
    errBnpl: "The purchase total is missing.", errPlanExists: "This debt already has its line in the plan.", errNoPayment: "The repayment is missing.", errNoYear: "This debt has no payments this year.",

    taxTitle: "Tax set-aside ({freelance})", taxSub: "If you're paid as {freelance}, nobody withholds tax or {retirement} for you.",
    taxQ: "Do you get paid as {freelance}?", taxYes: "Yes, set it up", taxIgnore: "If not, you can ignore this section.",
    monthIncome: "Paid as {freelance} this month", pct: "% you want to set aside", pctPh: "E.g. 25", pctSave: "Save %", setAside: "Set aside this month",
    taxWarn: "The right % depends on your total income, other taxes and {retirement}. Ask your accountant which % to use; the app only helps you set it aside every month.",
    needPct: "Write the % your accountant gave you to work out how much to set aside.",
    yIncome: "Earned in {year}", yShould: "You should have set aside", yHave: "You have set aside", yMissing: "Still to set aside", yOk: "You're on track",
    taxReg: "Log", taxKindAria: "What do you want to log", taxKinds: { ingreso: "Payment as {freelance}", apartado: "Money set aside", pago: "Payment to {taxOffice}" },
    amount: "Amount", date: "Date", note: "Note", notePh: "Optional", taxRecent: "Latest entries", taxNone: "No payments logged yet. Every time you're paid as {freelance}, note it here.",
    taxOff: "Turn this section off", delEntry: "Delete", delEntryConfirm: "Delete?",
    tTaxOn: "Done. Write the % your accountant gave you.", tPct: "We saved the %.", tEntry: "Logged.", tTaxOff: "Section turned off.", tEntryDel: "Entry deleted.", errPct: "Write a % between 0 and 100.",

    coSummary: "Advanced: your company account", coSummaryNamed: "Advanced: your company account ({name})", coDefault: "Your company ({company})", coSub: "Account between you and your company",
    coUnclassified: "{amount} unclassified", coIn: "You put in", coInSub: "What you paid from your own pocket", coOut: "You paid yourself", coOutSub: "Withdrawals to your account", coNet: "Net {year}",
    netMore: "More withdrawals than contributions", netLess: "More contributions than withdrawals", netEven: "Even",
    classes: {
      sueldo: { t: "Salary", d: "With tax withheld and {retirement}" }, dividendo: { t: "Dividend", d: "Profit distribution" },
      devolucion: { t: "Repaid contributions", d: "What you put into the company before" }, prestamo: { t: "Loan from the company to you", d: "Subject to {taxOffice} rules" },
    },
    unclassified: "Unclassified", classifyTitle: "Classify your withdrawals", classifyNone: "All your withdrawals have a type.", classifyAria: "Type of the {amount} withdrawal on {date}", classifyBtn: "Classify", pickClass: "Pick the type",
    coReg: "Log a movement", coKindAria: "Type of movement", coKinds: { aporte: "Contribution to the company", retiro: "Withdrawal to you" }, coClass: "Withdrawal type",
    coRecent: "Latest movements", coNone: "No contributions or withdrawals with your company logged yet.",
    co7a: "Because {name} is a {company}, every withdrawal needs a type. Undocumented withdrawals can be treated as a loan under Division 7A. The app doesn't give tax advice: check with your accountant.",
    coYours: "your company", coNoAdvice: "The app doesn't give tax advice: check with your accountant how to classify each withdrawal.",
    tClassified: "Withdrawal classified.",
  },
} satisfies Messages<unknown>;
export type DeudasMessages = (typeof M)["es"];
