"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { ConfirmButton, Switch, useToast } from "@/components/ui/client";
import type { Result } from "@/server/action";
import type { HabitPrefKey } from "@/lib/engine/habito";
import { saveCategories, saveHabitPrefs, saveMarketing, savePersonal, savePrefs, saveRegion, saveTerms, spendWildcard } from "./actions";
import { CHANNELS, CLOSE_DAYS, CURRENCIES, isCurrency, PAY_FREQUENCIES, TERM_KEYS, type NotifyKey, type NotifyPrefs, type PayFrequency, type TermKey } from "./lib";
import type { PerfilMessages } from "./messages";
import css from "./perfil.module.css";

/** Ejecuta una acción del servidor, muestra el error o el aviso, y refresca la pantalla. */
export function useAct() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const act = <T,>(fn: () => Promise<Result<T>>, onOk?: (data: T) => void, msg?: string) => start(async () => {
    setError("");
    const r = await fn();
    if (!r.ok) return setError(r.error);
    onOk?.(r.data);
    if (msg) toast(msg, r.points);
    router.refresh();
  });
  return { pending, error, setError, act };
}

export const Alert = ({ text }: { text: string }) => (text ? <p role="alert" className={css.alert}>{text}</p> : null);

// ───────── Racha: usar el comodín (se avisa antes; el usuario decide) ─────────
export function WildcardButton({ week, m }: { week: string; m: PerfilMessages }) {
  const { error, act } = useAct();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
      <ConfirmButton className="btn btn-yellow" label={m.streak.use} confirmLabel={m.streak.confirm} onConfirm={() => act(() => spendWildcard(week), undefined, m.streak.used)} />
      <Alert text={error} />
    </div>
  );
}

// ───────── Datos personales ─────────
export function PersonalForm({ m, name, lastName, phone, email, verified, pendingEmail, initial }: { m: PerfilMessages; name: string; lastName: string; phone: string; email: string; verified: boolean; pendingEmail: string | null; initial: string }) {
  const [f, setF] = useState({ name, lastName, phone, email });
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { pending, error, act } = useAct();
  return (
    <form className={css.section} onSubmit={(e) => { e.preventDefault(); act(() => savePersonal(f), (d) => setSentTo(d.emailSent), m.saved); }}>
      <span aria-hidden="true" className={css.avatar}>{initial}</span>
      <div className={css.grid2}>
        <div className="field"><label htmlFor="p-name">{m.name}</label><input id="p-name" className={css.input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoComplete="given-name" maxLength={80} required /></div>
        <div className="field"><label htmlFor="p-last">{m.lastName}</label><input id="p-last" className={css.input} value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} autoComplete="family-name" maxLength={80} /></div>
        <div className="field">
          <label htmlFor="p-email">{m.email}</label>
          <input id="p-email" type="email" className={css.input} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" maxLength={200} required />
          <span className="xs" style={{ fontWeight: 600, color: verified ? "var(--verde-fuerte)" : "var(--ambar-texto)" }}>{verified ? m.verified : m.unverified}</span>
          {pendingEmail || sentTo ? <span className="xs muted">{fill(m.emailPending, { email: sentTo ?? pendingEmail ?? "" })}</span> : null}
        </div>
        <div className="field"><label htmlFor="p-phone">{m.phone}</label><input id="p-phone" type="tel" className={css.input} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder={m.phonePh} autoComplete="tel" maxLength={30} /></div>
      </div>
      {sentTo ? <p role="status" className={css.ok}>{fill(m.emailSent, { email: sentTo })}</p> : null}
      <Alert text={error} />
      <button className="btn" disabled={pending} style={{ alignSelf: "flex-start", minHeight: 46 }}>{pending ? m.saving : m.save}</button>
    </form>
  );
}

// ───────── Región, moneda, idioma y frecuencia de pago ─────────
type Country = { code: string; name: string; currency: string; timezone: string; payFrequency: string };
export function RegionForm({ m, countries, timezones, initial }: { m: PerfilMessages; countries: Country[]; timezones: string[]; initial: { country: string; currency: string; timezone: string; locale: "es" | "en"; payFrequency: PayFrequency } }) {
  const [f, setF] = useState(initial);
  const { pending, error, act } = useAct();
  const currencies = isCurrency(f.currency) ? CURRENCIES : [f.currency, ...CURRENCIES];
  const zones = timezones.includes(f.timezone) ? timezones : [f.timezone, ...timezones];
  const pickCountry = (code: string) => {
    // Al cambiar de país se sugieren su moneda y su zona horaria; el usuario puede cambiarlas.
    const c = countries.find((x) => x.code === code);
    setF({ ...f, country: code, currency: c && isCurrency(c.currency) ? c.currency : f.currency, timezone: c && timezones.includes(c.timezone) ? c.timezone : f.timezone });
  };
  return (
    <form className={css.section} onSubmit={(e) => { e.preventDefault(); act(() => saveRegion(f), undefined, m.saved); }}>
      <div className={css.grid2}>
        <div className="field"><label htmlFor="r-country">{m.country}</label>
          <select id="r-country" className={css.input} value={f.country} onChange={(e) => pickCountry(e.target.value)}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select></div>
        <div className="field"><label htmlFor="r-currency">{m.currency}</label>
          <select id="r-currency" className={css.input} value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })}>
            {currencies.map((c) => <option key={c} value={c}>{(m.currencies as Record<string, string>)[c] ?? c}</option>)}
          </select></div>
        <div className="field"><label htmlFor="r-tz">{m.timezone}</label>
          <select id="r-tz" className={css.input} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>
            {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
          </select></div>
        <div className="field"><label htmlFor="r-lang">{m.language}</label>
          <select id="r-lang" className={css.input} value={f.locale} onChange={(e) => setF({ ...f, locale: e.target.value === "en" ? "en" : "es" })}>
            <option value="es">{m.languages.es}</option><option value="en">{m.languages.en}</option>
          </select></div>
        <div className="field"><label htmlFor="r-pay">{m.payFrequency}</label>
          <select id="r-pay" className={css.input} value={f.payFrequency} onChange={(e) => setF({ ...f, payFrequency: e.target.value as PayFrequency })}>
            {PAY_FREQUENCIES.map((p) => <option key={p} value={p}>{m.frequencies[p]}</option>)}
          </select></div>
      </div>
      <p className={css.note}>{m.regionNote}</p>
      <Alert text={error} />
      <button className="btn" disabled={pending} style={{ alignSelf: "flex-start", minHeight: 46 }}>{pending ? m.saving : m.save}</button>
    </form>
  );
}

// ───────── Nombres: términos del país y categorías ─────────
type Cat = { id: string; name: string; original: string | null; isBasic: boolean };
export function NamesForm({ m, countryTerms, terms, categories, canEdit }: { m: PerfilMessages; countryTerms: Record<TermKey, string>; terms: Record<string, string>; categories: Cat[]; canEdit: boolean }) {
  const [t, setT] = useState<Record<TermKey, string>>(() => Object.fromEntries(TERM_KEYS.map((k) => [k, terms[k] ?? ""])) as Record<TermKey, string>);
  const [cats, setCats] = useState(categories);
  const { pending, error, act } = useAct();
  const changedCats = cats.filter((c) => { const o = categories.find((x) => x.id === c.id); return o && (o.name !== c.name.trim() || o.isBasic !== c.isBasic); });
  const save = () => act(async () => {
    const r = await saveTerms(t);
    if (!r.ok || !canEdit || changedCats.length === 0) return r;
    return saveCategories(changedCats.map((c) => ({ id: c.id, isBasic: c.isBasic, name: c.name.trim() })));
  }, undefined, m.saved);
  return (
    <form className={css.section} style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><h2 style={{ fontSize: 17 }}>{m.namesTitle}</h2><span className="small muted">{m.namesSub}</span></div>
      {TERM_KEYS.map((k) => (
        <div key={k} className={css.nameRow}>
          <label htmlFor={`term-${k}`} className={css.nameLabel}><strong style={{ fontSize: 14 }}>{countryTerms[k]}</strong><span className="xs muted">{m.termGroups[k]}</span></label>
          <input id={`term-${k}`} className={css.input} style={{ flex: "1 1 180px" }} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} placeholder={m.sameAsOriginal} maxLength={40} />
          <button type="button" className={css.textBtn} onClick={() => setT({ ...t, [k]: "" })} disabled={!t[k]}>{m.restore}</button>
        </div>
      ))}
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10 }}><h3 style={{ fontSize: 15 }}>{m.categoriesTitle}</h3><span className="xs muted">{canEdit ? m.basicHint : m.categoriesReadOnly}</span></div>
      {cats.map((c, i) => (
        <div key={c.id} className={css.nameRow}>
          <label htmlFor={`cat-${c.id}`} className={css.nameLabel}><strong style={{ fontSize: 14 }}>{categories[i].name}</strong><span className="xs muted">{m.categoryGroup}</span></label>
          <input id={`cat-${c.id}`} className={css.input} style={{ flex: "1 1 180px" }} value={c.name} disabled={!canEdit} maxLength={60}
            onChange={(e) => setCats(cats.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} />
          {c.original && canEdit ? <button type="button" className={css.textBtn} disabled={c.name.trim() === c.original} onClick={() => setCats(cats.map((x) => (x.id === c.id ? { ...x, name: x.original ?? x.name } : x)))}>{m.restore}</button> : null}
          <label className={css.basic}>
            <input type="checkbox" checked={c.isBasic} disabled={!canEdit} onChange={(e) => setCats(cats.map((x) => (x.id === c.id ? { ...x, isBasic: e.target.checked } : x)))} />
            {m.basic}
          </label>
        </div>
      ))}
      <Alert text={error} />
      <button className="btn" disabled={pending} style={{ alignSelf: "flex-start", minHeight: 46 }}>{pending ? m.saving : m.save}</button>
    </form>
  );
}

// ───────── Preferencias de notificaciones (se guardan al tocar) ─────────
/**
 * Una sola lista en el orden del mockup (Perfil › Notificaciones). Cada interruptor guarda donde siempre: los de
 * `prefs.notify` con `savePrefs` y los del hábito (Hoy puedes gastar, Repaso semanal, Metas y retos = `prefs.habit`
 * daily / weekly / goal) con `saveHabitPrefs`. "Logros" no está en el mockup: se conserva porque ya existía.
 */
type PrefRow = { from: "notify"; k: NotifyKey } | { from: "habit"; k: HabitPrefKey };
const PREF_ROWS: readonly PrefRow[] = [
  { from: "notify", k: "close" }, { from: "notify", k: "payments" }, { from: "notify", k: "academy" },
  { from: "habit", k: "daily" }, { from: "habit", k: "weekly" }, { from: "habit", k: "goal" },
  { from: "notify", k: "achievements" }, { from: "notify", k: "news" },
];

/**
 * `marketing`: consentimiento de marketing guardado en el CRM. Cuando existe, el interruptor "Novedades de Revolución del
 * Dinero" (mismo texto del mockup) es ESE consentimiento (única fuente de verdad); `prefs.notify.news` ya no se usa.
 * Sin CRM disponible (migración aún sin aplicar), queda como antes.
 */
export function PrefsForm({ m, initial, habit: habitInitial, marketing }: { m: PerfilMessages; initial: NotifyPrefs; habit: Record<HabitPrefKey, boolean>; marketing?: { email: boolean } | null }) {
  const [p, setP] = useState(initial);
  const [habit, setHabit] = useState(habitInitial);
  const [news, setNews] = useState(marketing?.email ?? false);
  const { error, act } = useAct();
  const save = (patch: Partial<NotifyPrefs>, next: NotifyPrefs) => { setP(next); act(() => savePrefs(patch), undefined, m.saved); };
  const row = (key: string, t: string, d: string, checked: boolean, onChange: (v: boolean) => void) => (
    <div key={key} className={css.switchRow}>
      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 14 }}>{t}</strong><span className="xs muted">{d}</span></span>
      <Switch checked={checked} label={t} onChange={onChange} />
    </div>
  );
  return (
    <section className={css.section} style={{ gap: 4 }}>
      {PREF_ROWS.map((r) => {
        if (r.from === "habit") {
          const k = r.k;
          return row(`habit-${k}`, m.habit.items[k].t, m.habit.items[k].d, habit[k], (v) => { setHabit({ ...habit, [k]: v }); act(() => saveHabitPrefs({ [k]: v }), undefined, m.saved); });
        }
        const k = r.k;
        if (k === "news" && marketing) {
          return row(k, m.notify.news.t, `${m.notify.news.d}. ${m.marketing.emailNote}`, news, (v) => { const before = news; setNews(v); act(() => saveMarketing({ email: v }).then((res) => { if (!res.ok) setNews(before); return res; }), undefined, m.saved); });
        }
        return row(k, m.notify[k].t, m.notify[k].d, p.notify[k], (v) => save({ notify: { ...p.notify, [k]: v } }, { ...p, notify: { ...p.notify, [k]: v } }));
      })}
      <div className={css.grid2} style={{ marginTop: 12 }}>
        <div className="field"><label htmlFor="n-day">{m.closeDay}</label>
          <select id="n-day" className={css.input} value={p.closeDay} onChange={(e) => { const v = e.target.value as NotifyPrefs["closeDay"]; save({ closeDay: v }, { ...p, closeDay: v }); }}>
            {CLOSE_DAYS.map((d) => <option key={d} value={d}>{m.closeDays[d]}</option>)}
          </select></div>
        <div className="field"><label htmlFor="n-channel">{m.channel}</label>
          <select id="n-channel" className={css.input} value={p.channel} onChange={(e) => { const v = e.target.value as NotifyPrefs["channel"]; save({ channel: v }, { ...p, channel: v }); }}>
            {CHANNELS.map((c) => <option key={c} value={c}>{m.channels[c]}</option>)}
          </select></div>
      </div>
      <p className="xs muted" style={{ margin: "8px 0 0", lineHeight: 1.5 }}>{m.habit.note}</p>
      <Alert text={error} />
    </section>
  );
}
