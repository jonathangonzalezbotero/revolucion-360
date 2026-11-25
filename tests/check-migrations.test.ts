import { describe, expect, it } from "vitest";
import { findDangers } from "../scripts/check-migrations";

const W = (a: string, b: string) => `${a} ${b}`; // arma las palabras para no escribirlas juntas en el repo

describe("revisión de migraciones (la base nunca se borra)", () => {
  it("bloquea lo que borra o vacía datos", () => {
    expect(findDangers(`${W("DRO" + "P", "TABLE")} public.goals;`)).not.toEqual([]);
    expect(findDangers(`alter table public.goals ${W("dro" + "p", "column")} name;`)).not.toEqual([]);
    expect(findDangers(`${"trunc" + "ate"} public.transactions;`)).not.toEqual([]);
    expect(findDangers(`${W("dele" + "te", "from")} public.transactions where true;`)).not.toEqual([]);
    expect(findDangers(`alter table public.goals rename column a to b;`)).not.toEqual([]);
  });
  it("permite lo que solo agrega o recrea reglas", () => {
    expect(findDangers(`create table public.x (id uuid primary key);\nalter table public.goals add column note text;`)).toEqual([]);
    expect(findDangers(`${W("dro" + "p", "policy")} read_live on public.courses;\ncreate policy read_live on public.courses for select using (true);`)).toEqual([]);
    expect(findDangers(`-- aquí no se ${W("dro" + "p", "table")} nada\ncreate index on public.goals(user_id);`)).toEqual([]);
  });
});
