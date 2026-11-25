"use client";
import type { M } from "./messages";

/** Filtros del registro: viven en la dirección (GET), se aplican al elegir. Sin `admins` (no Dueño) no hay filtro de quién. */
export function FilterForm({ m, group, adminId, groups, admins }: { m: (typeof M)["es"]; group: string; adminId: string; groups: string[]; admins: { id: string; name: string }[] }) {
  const submit = (e: React.ChangeEvent<HTMLSelectElement>) => e.currentTarget.form?.requestSubmit();
  return (
    <form method="get" action="/admin/actividad" className="row wrap" style={{ gap: 8 }}>
      {admins.length > 0 ? (
        <>
          <label htmlFor="lg-a" className="sr-only">{m.adminLabel}</label>
          <select id="lg-a" name="admin" className="input" defaultValue={adminId} onChange={submit} style={{ width: "auto", maxWidth: "100%" }}>
            <option value="">{m.allAdmins}</option>
            {admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </>
      ) : null}
      <label htmlFor="lg-t" className="sr-only">{m.typeLabel}</label>
      <select id="lg-t" name="accion" className="input" defaultValue={group} onChange={submit} style={{ width: "auto", maxWidth: "100%" }}>
        {groups.map((g) => <option key={g} value={g}>{m.groups[g] ?? g}</option>)}
      </select>
      <noscript><button type="submit" className="btn btn-secondary">{m.filter}</button></noscript>
    </form>
  );
}
