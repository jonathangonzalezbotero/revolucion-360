import type { Messages } from "@/i18n";

export const M = {
  es: {
    title: "Grupos", eyebrow: "Cohortes para dar o quitar acceso a muchas personas a la vez", create: "+ Crear grupo",
    newTitle: "Nuevo grupo", name: "Nombre", namePh: "Ej. Bootcamp marzo 2027", note: "Nota (opcional)", notePh: "Ej. Alumnos de la cohorte de marzo", createBtn: "Crear grupo", created: "Grupo creado.",
    help: "Un grupo sirve para dar o quitar acceso a muchas personas a la vez, y para ver cómo usa la app cada cohorte.",
    empty: "Aún no hay grupos", emptySub: "Crea uno para tu próxima cohorte y dale acceso a todos con un clic.",
    colName: "Grupo", colMembers: "Personas", colCreated: "Creado", members: "{n} personas", membersOne: "1 persona", see: "Ver miembros", hide: "Ocultar",
    rename: "Renombrar", renameLabel: "Nuevo nombre de {name}", renamed: "Grupo renombrado.", del: "Borrar", delConfirm: "Sí, borrar grupo", deleted: "Grupo borrado. Sus personas conservan su acceso.",
    delHelp: "Borrar el grupo no quita el acceso a nadie.", membersTitle: "Miembros de {name}", membersEmpty: "Este grupo aún no tiene personas.", more: "y {n} personas más",
    add: "Sumar personas", addPh: "Pega uno o varios correos, separados por coma", addBtn: "Sumar", addedN: "{n} personas sumadas.", notFound: "No encontramos: {list}",
    remove: "Quitar a {name}", removed: "Quitado del grupo.", grantTitle: "Dar acceso a todo el grupo", grantedN: "Listo: {n} personas con acceso gratis.", manage: "Gestionar",
    errName: "Falta el nombre.", errEmails: "Pega al menos un correo.",
  },
  en: {
    title: "Groups", eyebrow: "Cohorts to give or remove access for many people at once", create: "+ Create group",
    newTitle: "New group", name: "Name", namePh: "E.g. March 2027 bootcamp", note: "Note (optional)", notePh: "E.g. March cohort students", createBtn: "Create group", created: "Group created.",
    help: "A group lets you give or remove access for many people at once, and see how each cohort uses the app.",
    empty: "No groups yet", emptySub: "Create one for your next cohort and give everyone access in one click.",
    colName: "Group", colMembers: "People", colCreated: "Created", members: "{n} people", membersOne: "1 person", see: "See members", hide: "Hide",
    rename: "Rename", renameLabel: "New name for {name}", renamed: "Group renamed.", del: "Delete", delConfirm: "Yes, delete group", deleted: "Group deleted. Its people keep their access.",
    delHelp: "Deleting the group doesn't remove anyone's access.", membersTitle: "Members of {name}", membersEmpty: "This group has nobody yet.", more: "and {n} more people",
    add: "Add people", addPh: "Paste one or more emails, separated by commas", addBtn: "Add", addedN: "{n} people added.", notFound: "Not found: {list}",
    remove: "Remove {name}", removed: "Removed from the group.", grantTitle: "Give access to the whole group", grantedN: "Done: {n} people have free access.", manage: "Manage",
    errName: "The name is missing.", errEmails: "Paste at least one email.",
  },
} satisfies Messages<unknown>;
export type GroupsText = (typeof M)["es"];
