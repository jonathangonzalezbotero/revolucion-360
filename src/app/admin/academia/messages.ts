import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Academia", eyebrow: "Etapas, cursos, clases y puntos", newCourse: "+ Nuevo curso", courses: "Cursos",
    states: { draft: "Borrador", published: "Publicado", scheduled: "Programado · {date}" },
    lessonsN: "{n} clases", lessonsOne: "1 clase",
    empty: "Aún no hay cursos", emptySub: "Crea el primero: título, etapa y portada. Nace como borrador.",

    // Curso seleccionado
    schedule: "Programar publicación", reschedule: "Cambiar fecha", publish: "Publicar", publishNow: "Publicar ahora",
    toDraft: "Pasar a borrador", toDraftConfirm: "Sí, pasar a borrador", editCourse: "Editar curso",
    toDraftHelp: "En borrador nadie lo ve en la Academia. El avance de los alumnos se guarda.",
    scheduledFor: "Se libera el {date} a las {time} (tu hora).", openInApp: "Ver en la app ›",
    published: "Curso publicado.", scheduled: "Publicación programada.", drafted: "Curso pasado a borrador.",

    // Módulos y clases
    module: "MÓDULO {n} · {title}", noModule: "SIN MÓDULO", addLesson: "+ Clase", addModule: "+ Módulo",
    moduleTitle: "Nombre del módulo", modulePh: "Ej. Arranca", newModule: "Nuevo módulo", renameModule: "Renombrar módulo", renameModuleOf: "Renombrar {title}",
    moduleCreated: "Módulo creado.", moduleRenamed: "Módulo renombrado.",
    moveUp: "Subir {title}", moveDown: "Bajar {title}", moved: "Orden guardado.",
    noLessons: "Este curso aún no tiene clases", noLessonsSub: "Agrega la primera clase. Los alumnos ven \"Las clases llegan pronto\" mientras tanto.",
    newLesson: "Nueva clase", lessonTitle: "Título de la clase", lessonTitlePh: "Ej. Haz tu primer cierre de mes", lessonCreated: "Clase creada.", inModule: "Módulo",
    create: "Crear",

    // Editar clase
    editLesson: "Editar clase {n}: {title}", titleField: "Título", duration: "Duración (MM:SS)", durationPh: "8:30",
    video: "Video", videoPh: "Enlace de Vimeo, Mux o YouTube no listado",
    videoHelp: "YouTube tiene que ser \"no listado\": los videos privados no se pueden insertar.",
    cta: "Botón \"Hazlo ahora en la app\" lleva a", ctaNone: "Ninguna",
    screens: {
      "/asistente": "Asistente", "/plan": "Plan anual", "/movimientos": "Movimientos", "/cuentas": "Cuentas", "/metas": "Metas", "/proyeccion": "Proyección",
      "/analisis": "Análisis", "/deudas": "Deudas", "/inversiones": "Inversiones", "/cierre": "Cierre de mes", "/diagnostico": "Diagnóstico",
    } as Record<string, string>,
    points: "Puntos al completarla",
    about: "Sobre esta clase", required: "Obligatoria para avanzar a la siguiente clase", requiredLabel: "Obligatoria para avanzar",
    saveLesson: "Guardar clase", lessonSaved: "Clase guardada.",

    // Comentarios
    comments: "Comentarios de esta clase", commentsEmpty: "Nadie ha comentado esta clase todavía.", hidden: "Oculto", visible: "Visible",
    hide: "Ocultar", show: "Mostrar", hideOf: "Ocultar el comentario de {name}", showOf: "Mostrar el comentario de {name}",
    commentHidden: "Comentario oculto.", commentShown: "Comentario visible otra vez.", anon: "Alumno",

    // Formulario del curso
    newCourseTitle: "Nuevo curso", courseTitle: "Título", courseTitlePh: "Ej. Sal de deudas con método", stage: "Etapa", number: "Número",
    description: "Descripción", cover: "Portada", coverPh: "/cursos/curso-01.jpg", coverHelp: "Una imagen de /cursos/ o un enlace https.",
    visibleFor: "Visible para", visibleAll: "Todos", visibleGroup: "Solo un grupo de alumnos", pickGroup: "Grupo", noGroups: "Aún no hay grupos.", createGroup: "Crear uno en Grupos",
    visibleHelp: "Un curso de grupo solo lo ven sus miembros (y los administradores). Los demás no lo ven en la Academia.", onlyGroup: "Solo {name}",
    priority: "Prioridad del diagnóstico", priorityHelp: "Se recomienda a quien tenga este indicador como prioridad.", priorityNone: "Ninguna",
    indicators: { surplus: "Lo que te sobra", saving: "Ahorro", debt: "Deudas", emergency: "Fondo de emergencia", dependency: "Dependencia de un ingreso" } as Record<string, string>,
    slug: "Enlace en la app: /academia/{slug}", slugNew: "El enlace sale del título y no cambia después.",
    createCourse: "Crear curso", saveCourse: "Guardar curso", courseCreated: "Curso creado como borrador.", courseSaved: "Curso guardado.",

    // Programar
    scheduleTitle: "Programar publicación", day: "Día", time: "Hora", tzNote: "Hora de {tz}. Hasta ese momento los alumnos ven la portada y la cuenta regresiva.",
    scheduleBtn: "Programar",

    // Puntos y niveles
    ptsTitle: "Puntos y niveles", ptsLesson: "Por clase", ptsCourse: "Por curso", ptsClosure: "Por cierre de mes", ptsWeek: "Por semana de racha",
    ptsHelp: "\"Por clase\" es el valor de las clases nuevas; cada clase guarda sus propios puntos.",
    levels: "Niveles: {list}", levelsEdit: "(editables)", savePts: "Guardar puntos", ptsSaved: "Puntos guardados.",

    errors: {
      title: "Falta el título.", group: "Elige el grupo que puede ver el curso.", groupPending: "Para limitar un curso a un grupo falta aplicar la migración 20261125000029_un_plan.sql.", duration: "Escribe la duración como 8:30.", video: "Ese enlace no se puede mostrar. Usa YouTube no listado, Vimeo, Mux o un archivo .mp4.",
      cover: "La portada tiene que ser una ruta como /cursos/curso-01.jpg o un enlace https.", points: "Escribe puntos entre 0 y 1,000.", number: "Escribe un número entre 1 y 999.",
      date: "Elige un día y una hora después de ahora.", slug: "Ya hay un curso con ese nombre. Cambia el título.", cta: "Elige una pantalla de la lista.",
      module: "Falta el nombre del módulo.", missing: "Ese curso o clase ya no existe.",
    },
  },
  en: {
    title: "Academy", eyebrow: "Stages, courses, lessons and points", newCourse: "+ New course", courses: "Courses",
    states: { draft: "Draft", published: "Published", scheduled: "Scheduled · {date}" },
    lessonsN: "{n} lessons", lessonsOne: "1 lesson",
    empty: "No courses yet", emptySub: "Create the first one: title, stage and cover. It starts as a draft.",

    schedule: "Schedule publishing", reschedule: "Change date", publish: "Publish", publishNow: "Publish now",
    toDraft: "Move to draft", toDraftConfirm: "Yes, move to draft", editCourse: "Edit course",
    toDraftHelp: "As a draft nobody sees it in the Academy. Students' progress is kept.",
    scheduledFor: "Goes live on {date} at {time} (your time).", openInApp: "See it in the app ›",
    published: "Course published.", scheduled: "Publishing scheduled.", drafted: "Course moved to draft.",

    module: "MODULE {n} · {title}", noModule: "NO MODULE", addLesson: "+ Lesson", addModule: "+ Module",
    moduleTitle: "Module name", modulePh: "E.g. Get started", newModule: "New module", renameModule: "Rename module", renameModuleOf: "Rename {title}",
    moduleCreated: "Module created.", moduleRenamed: "Module renamed.",
    moveUp: "Move {title} up", moveDown: "Move {title} down", moved: "Order saved.",
    noLessons: "This course has no lessons yet", noLessonsSub: "Add the first lesson. Meanwhile students see \"Lessons coming soon\".",
    newLesson: "New lesson", lessonTitle: "Lesson title", lessonTitlePh: "E.g. Do your first month close", lessonCreated: "Lesson created.", inModule: "Module",
    create: "Create",

    editLesson: "Edit lesson {n}: {title}", titleField: "Title", duration: "Length (MM:SS)", durationPh: "8:30",
    video: "Video", videoPh: "Vimeo, Mux or unlisted YouTube link",
    videoHelp: "YouTube has to be \"unlisted\": private videos can't be embedded.",
    cta: "\"Do it now in the app\" button goes to", ctaNone: "None",
    screens: {
      "/asistente": "Setup", "/plan": "Yearly plan", "/movimientos": "Transactions", "/cuentas": "Accounts", "/metas": "Goals", "/proyeccion": "Forecast",
      "/analisis": "Analysis", "/deudas": "Debts", "/inversiones": "Investments", "/cierre": "Month close", "/diagnostico": "Check-up",
    } as Record<string, string>,
    points: "Points for finishing it",
    about: "About this lesson", required: "Required to move on to the next lesson", requiredLabel: "Required to move on",
    saveLesson: "Save lesson", lessonSaved: "Lesson saved.",

    comments: "Comments on this lesson", commentsEmpty: "Nobody has commented on this lesson yet.", hidden: "Hidden", visible: "Visible",
    hide: "Hide", show: "Show", hideOf: "Hide {name}'s comment", showOf: "Show {name}'s comment",
    commentHidden: "Comment hidden.", commentShown: "Comment visible again.", anon: "Student",

    newCourseTitle: "New course", courseTitle: "Title", courseTitlePh: "E.g. Get out of debt with a method", stage: "Stage", number: "Number",
    description: "Description", cover: "Cover", coverPh: "/cursos/curso-01.jpg", coverHelp: "An image from /cursos/ or an https link.",
    visibleFor: "Visible to", visibleAll: "Everyone", visibleGroup: "Only one student group", pickGroup: "Group", noGroups: "There are no groups yet.", createGroup: "Create one in Groups",
    visibleHelp: "A group course is only seen by its members (and administrators). Everyone else doesn't see it in the Academy.", onlyGroup: "Only {name}",
    priority: "Check-up priority", priorityHelp: "Recommended to whoever has this indicator as their priority.", priorityNone: "None",
    indicators: { surplus: "What you have left", saving: "Saving", debt: "Debts", emergency: "Emergency fund", dependency: "Reliance on one income" } as Record<string, string>,
    slug: "Link in the app: /academia/{slug}", slugNew: "The link comes from the title and doesn't change later.",
    createCourse: "Create course", saveCourse: "Save course", courseCreated: "Course created as a draft.", courseSaved: "Course saved.",

    scheduleTitle: "Schedule publishing", day: "Day", time: "Time", tzNote: "{tz} time. Until then students see the cover and the countdown.",
    scheduleBtn: "Schedule",

    ptsTitle: "Points and levels", ptsLesson: "Per lesson", ptsCourse: "Per course", ptsClosure: "Per month close", ptsWeek: "Per streak week",
    ptsHelp: "\"Per lesson\" is the value for new lessons; each lesson keeps its own points.",
    levels: "Levels: {list}", levelsEdit: "(editable)", savePts: "Save points", ptsSaved: "Points saved.",

    errors: {
      title: "The title is missing.", group: "Pick the group that can see the course.", groupPending: "To limit a course to a group, migration 20261125000029_un_plan.sql still has to be applied.", duration: "Write the length like 8:30.", video: "That link can't be shown. Use unlisted YouTube, Vimeo, Mux or an .mp4 file.",
      cover: "The cover has to be a path like /cursos/curso-01.jpg or an https link.", points: "Enter points between 0 and 1,000.", number: "Enter a number between 1 and 999.",
      date: "Pick a day and time after now.", slug: "There's already a course with that name. Change the title.", cta: "Pick a screen from the list.",
      module: "The module name is missing.", missing: "That course or lesson no longer exists.",
    },
  },
} satisfies Messages<unknown>;

export type AcadAdminText = (typeof M)["es"];
