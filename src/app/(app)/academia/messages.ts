import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Academia", eyebrow: "Aprende a manejar tu dinero, a tu ritmo",
    headerPts: "Tienes {n} puntos · Nivel {level}", headerPtsShort: "{n} puntos · Nivel {level}",
    soonTitle: "La Academia llega pronto", soonText: "Estamos terminando los cursos. Te avisamos cuando estén listos.", goHome: "Ir a Inicio",
    noCourses: "Todavía no hay cursos publicados", noCoursesText: "Cuando se publique el primer curso lo vas a ver aquí.",

    // Continúa
    contLabel: "CONTINÚA DONDE TE QUEDASTE", startLabel: "EMPIEZA POR AQUÍ", yourCourse: "Tu curso · {pct}%",
    nextLesson: "Siguiente clase", nextLessonModule: "Siguiente clase · Módulo {n}", lessonsOf: "de {total} clases", pctDone: "{pct}% completado",
    allDoneTitle: "Terminaste todos los cursos disponibles", allDoneText: "Cuando se publique uno nuevo lo vas a ver aquí.",

    // Logros
    achievements: "TUS LOGROS", level: "Nivel {n} · {name}", levelRing: "Nivel {n}", points: "{n} puntos",
    toNext: "Te faltan {n} puntos para el nivel {next}", maxLevel: "Llegaste al nivel más alto.", levels: "Niveles",
    streak: "Racha de {n} semanas", streakOne: "Racha de 1 semana", streakNone: "Aún no tienes racha",
    weekCounts: "· esta semana ya cuenta", weekPending: "· esta semana aún no cuenta",
    streakText: "Una semana cuenta si registras un gasto, marcas un pago, ves una clase o haces tu cierre.",
    wildcardYes: "Tienes 1 comodín este mes por si una semana se complica.", wildcardNo: "Ya usaste el comodín de este mes.",
    weeksAria: "Últimas 7 semanas", weekOn: "Semana del {date}: cuenta", weekOff: "Semana del {date}: sin actividad",
    badges: "Insignias", badgesCount: "{n} de {total}", earnedOn: "Ganada el {date}", seeBadges: "Ver mis insignias y logros ›",
    badgeDesc: {
      play: "Viste tu primera clase de la Academia", grid: "Terminaste el asistente y creaste tu plan", check: "Hiciste tu primer cierre de mes",
      flame: "Tres meses cerrando sin fallar", unlock: "Llevaste una deuda a $0", shield: "Tu fondo de emergencia cubre un mes de gastos básicos",
      flag: "Llegaste al monto de una meta", cap: "Terminaste todas las clases de un curso", sprout: "Registraste tu primera inversión", star: "Doce cierres de mes seguidos",
    },
    badgeHint: {
      play: "Mira tu primera clase", grid: "Termina tu plan en el asistente", check: "Haz tu primer cierre de mes", flame: "{n} de 3 cierres",
      unlock: "Registra tus deudas y lleva una a $0", shieldAmt: "{a} de {b}", shield: "Escribe tus gastos básicos en el plan", flag: "Tu meta más avanzada: {pct}%", flagNone: "Crea una meta en Metas",
      cap: "{course}: {n} de {total} clases", capNone: "Termina un curso", sprout: "Agrega una inversión en Inversiones", star: "{n} de 12 cierres",
    },

    // Cursos
    stages: {
      "Domina la app": { label: "DOMINA LA APP", title: "Aprende a usar cada herramienta" },
      "Tu dinero": { label: "TU DINERO", title: "Aprende a manejar tu dinero" },
    } as Record<string, { label: string; title: string }>,
    lessonsN: "{n} clases", lessonsOne: "1 clase", progress: "Progreso", cover: "Portada del curso {title}",
    continue: "▸ Continuar", start: "→ Empezar", review: "Repasar", soon: "Pronto", cardSoon: "Las clases llegan pronto", completed: "Completado",

    // Recomendación y puntos
    recoLabel: "Según tu diagnóstico · {indicator}: prioridad", recoCourse: "Curso: {title}", plusPoints: "+{n} puntos",
    indicators: { surplus: "Lo que te sobra", saving: "Ahorro", debt: "Deudas", emergency: "Fondo de emergencia", dependency: "Dependencia de un ingreso" },
    howPoints: "Cómo ganas puntos", ptsLesson: "por clase", ptsCourse: "por curso", ptsClosure: "por cierre de mes", ptsWeek: "por semana de racha",
    ptsNote: "Los puntos premian lo que mejora tus finanzas, no el tiempo en la app.",

    // Curso
    backAcademia: "Volver a la Academia", backCourse: "Volver al curso", academia: "Academia",
    courseProgress: "{n} de {total} clases · {pct}%", module: "MÓDULO {n}", moduleTitle: "MÓDULO {n} · {title}", otherLessons: "OTRAS CLASES",
    st: { done: "Vista", next: "Siguiente", open: "Disponible", locked: "Bloqueada" },
    lockedBy: "Primero termina «{title}»", required: "Obligatoria para avanzar",
    courseSoonTitle: "Este curso llega pronto", courseSoonText: "Todavía no tiene clases publicadas. Te avisamos cuando esté listo.",

    // Clase
    play: "Reproducir", videoTitle: "Video: {title}", noVideo: "El video de esta clase llega pronto", noVideoText: "Mientras tanto, lee de qué se trata más abajo.",
    complete: "Completar y continuar", completing: "Guardando…", nextClass: "Siguiente clase ›", prevClass: "‹ Clase anterior", seen: "Vista", backToCourse: "Ir al curso ›",
    lockedTitle: "Esta clase todavía está bloqueada", lockedText: "Primero termina «{title}». Las clases obligatorias van en orden.", goToLesson: "Ir a esa clase",
    doNow: "Hazlo ahora en la app", doNowText: "Abre {screen} y sigue la clase paso a paso.",
    screens: { "/asistente": "el asistente", "/plan": "tu Plan anual", "/cierre": "tu Cierre de {month}", "/movimientos": "Movimientos", "/proyeccion": "tu Proyección" } as Record<string, string>,
    screenOther: "esa pantalla",
    about: "Sobre esta clase", more: "Ver más", less: "Ver menos", noDescription: "Esta clase todavía no tiene descripción.",
    rateQ: "¿Qué tan útil te pareció esta clase?", rateGroup: "Calificación", rateStar: "{n} de 5", rateAfter: "Califícala cuando la termines.", rated: "Gracias por calificar la clase.",
    toastSeen: "Clase vista.", toastCourse: "Curso completado: {title}.", errLocked: "Primero termina la clase anterior.", errNotSeen: "Califícala cuando la termines.",
    nextUp: "LO PRÓXIMO PARA TI", newCourse: "Curso nuevo · {stage}", releasesAt: "Se libera el {date} a las {time}", releasesOn: "Se libera el {date}",
    cd: { d: "DÍAS", h: "HORAS", m: "MIN", s: "SEG" }, cdAria: "Faltan {d} días, {h} horas y {m} minutos", comingSoon: "Próximamente", released: "Ya está disponible. Recarga la página para verlo.",
    courseUpcomingTitle: "Este curso se libera el {date}", courseUpcomingText: "Las clases se abren el {date} a las {time}. Te avisamos cuando esté listo.",
    comments: "Comentarios", commentLabel: "Escribe un comentario", commentPh: "Comparte una duda o lo que aprendiste…", send: "Comentar", sending: "Enviando…",
    noComments: "Todavía no hay comentarios en esta clase.", deleteC: "Borrar", deleteConfirm: "¿Borrar? Toca otra vez", commentReadOnly: "Tu cuenta está en solo lectura: puedes leer los comentarios, pero no escribir.",
    commentEmpty: "Escribe tu comentario.", commentTooLong: "Máximo 2,000 caracteres.", commentAdded: "Comentario publicado.", commentDeleted: "Comentario borrado.", you: "Tú", charCount: "{n} de 2,000",
    dur: { h: "h", min: "min", s: "s" },
  },
  en: {
    title: "Academy", eyebrow: "Learn to manage your money, at your own pace",
    headerPts: "You have {n} points · Level {level}", headerPtsShort: "{n} points · Level {level}",
    soonTitle: "The Academy is coming soon", soonText: "We're finishing the courses. We'll let you know when they're ready.", goHome: "Go to Home",
    noCourses: "No courses published yet", noCoursesText: "When the first course goes live you'll see it here.",

    contLabel: "PICK UP WHERE YOU LEFT OFF", startLabel: "START HERE", yourCourse: "Your course · {pct}%",
    nextLesson: "Next lesson", nextLessonModule: "Next lesson · Module {n}", lessonsOf: "of {total} lessons", pctDone: "{pct}% done",
    allDoneTitle: "You finished every course available", allDoneText: "When a new one goes live you'll see it here.",

    achievements: "YOUR PROGRESS", level: "Level {n} · {name}", levelRing: "Level {n}", points: "{n} points",
    toNext: "{n} points to reach {next}", maxLevel: "You reached the top level.", levels: "Levels",
    streak: "{n}-week streak", streakOne: "1-week streak", streakNone: "No streak yet",
    weekCounts: "· this week already counts", weekPending: "· this week doesn't count yet",
    streakText: "A week counts when you log an expense, mark a payment, watch a lesson or close your month.",
    wildcardYes: "You have 1 wildcard this month in case a week gets tricky.", wildcardNo: "You already used this month's wildcard.",
    weeksAria: "Last 7 weeks", weekOn: "Week of {date}: counts", weekOff: "Week of {date}: no activity",
    badges: "Badges", badgesCount: "{n} of {total}", earnedOn: "Earned {date}", seeBadges: "See my badges and achievements ›",
    badgeDesc: {
      play: "You watched your first Academy lesson", grid: "You finished the wizard and built your plan", check: "You did your first month close",
      flame: "Three months closing in a row", unlock: "You took a debt to $0", shield: "Your emergency fund covers one month of basic expenses",
      flag: "You reached a goal's amount", cap: "You finished every lesson of a course", sprout: "You logged your first investment", star: "Twelve month closes in a row",
    },
    badgeHint: {
      play: "Watch your first lesson", grid: "Finish your plan in the wizard", check: "Do your first month close", flame: "{n} of 3 closes",
      unlock: "Add your debts and take one to $0", shieldAmt: "{a} of {b}", shield: "Add your basic expenses to the plan", flag: "Your closest goal: {pct}%", flagNone: "Create a goal in Goals",
      cap: "{course}: {n} of {total} lessons", capNone: "Finish a course", sprout: "Add an investment in Investments", star: "{n} of 12 closes",
    },

    stages: {
      "Domina la app": { label: "MASTER THE APP", title: "Learn to use every tool" },
      "Tu dinero": { label: "YOUR MONEY", title: "Learn to manage your money" },
    } as Record<string, { label: string; title: string }>,
    lessonsN: "{n} lessons", lessonsOne: "1 lesson", progress: "Progress", cover: "Cover of the course {title}",
    continue: "▸ Continue", start: "→ Start", review: "Review", soon: "Soon", cardSoon: "Lessons coming soon", completed: "Completed",

    recoLabel: "From your check-up · {indicator}: priority", recoCourse: "Course: {title}", plusPoints: "+{n} points",
    indicators: { surplus: "What you have left", saving: "Saving", debt: "Debts", emergency: "Emergency fund", dependency: "Reliance on one income" },
    howPoints: "How you earn points", ptsLesson: "per lesson", ptsCourse: "per course", ptsClosure: "per month close", ptsWeek: "per streak week",
    ptsNote: "Points reward what improves your finances, not time spent in the app.",

    backAcademia: "Back to the Academy", backCourse: "Back to the course", academia: "Academy",
    courseProgress: "{n} of {total} lessons · {pct}%", module: "MODULE {n}", moduleTitle: "MODULE {n} · {title}", otherLessons: "OTHER LESSONS",
    st: { done: "Watched", next: "Next", open: "Available", locked: "Locked" },
    lockedBy: "First finish “{title}”", required: "Required to move on",
    courseSoonTitle: "This course is coming soon", courseSoonText: "It has no lessons published yet. We'll let you know when it's ready.",

    play: "Play", videoTitle: "Video: {title}", noVideo: "This lesson's video is coming soon", noVideoText: "Meanwhile, read what it's about below.",
    complete: "Complete and continue", completing: "Saving…", nextClass: "Next lesson ›", prevClass: "‹ Previous lesson", seen: "Watched", backToCourse: "Go to the course ›",
    lockedTitle: "This lesson is still locked", lockedText: "First finish “{title}”. Required lessons go in order.", goToLesson: "Go to that lesson",
    doNow: "Do it now in the app", doNowText: "Open {screen} and follow the lesson step by step.",
    screens: { "/asistente": "the wizard", "/plan": "your Yearly plan", "/cierre": "your {month} close", "/movimientos": "Transactions", "/proyeccion": "your Forecast" } as Record<string, string>,
    screenOther: "that screen",
    about: "About this lesson", more: "See more", less: "See less", noDescription: "This lesson has no description yet.",
    rateQ: "How useful was this lesson?", rateGroup: "Rating", rateStar: "{n} of 5", rateAfter: "Rate it once you finish it.", rated: "Thanks for rating the lesson.",
    toastSeen: "Lesson watched.", toastCourse: "Course completed: {title}.", errLocked: "First finish the previous lesson.", errNotSeen: "Rate it once you finish it.",
    nextUp: "COMING UP FOR YOU", newCourse: "New course · {stage}", releasesAt: "Opens on {date} at {time}", releasesOn: "Opens on {date}",
    cd: { d: "DAYS", h: "HOURS", m: "MIN", s: "SEC" }, cdAria: "{d} days, {h} hours and {m} minutes to go", comingSoon: "Coming soon", released: "It's available now. Reload the page to see it.",
    courseUpcomingTitle: "This course opens on {date}", courseUpcomingText: "Lessons open on {date} at {time}. We'll let you know when it's ready.",
    comments: "Comments", commentLabel: "Write a comment", commentPh: "Share a question or what you learned…", send: "Comment", sending: "Sending…",
    noComments: "No comments on this lesson yet.", deleteC: "Delete", deleteConfirm: "Delete? Tap again", commentReadOnly: "Your account is read-only: you can read comments, but not write.",
    commentEmpty: "Write your comment.", commentTooLong: "2,000 characters max.", commentAdded: "Comment posted.", commentDeleted: "Comment deleted.", you: "You", charCount: "{n} of 2,000",
    dur: { h: "h", min: "min", s: "s" },
  },
} satisfies Messages<unknown>;
export type AcadMessages = (typeof M)["es"];
