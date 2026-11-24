"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { fill } from "@/i18n";
import { Icon } from "@/components/ui/Icon";
import { mfaConfirm, mfaStart } from "@/app/(auth)/actions";
import css from "../onboarding.module.css";
import { createSpace, startBlank } from "./actions";
import { CURRENCIES, GOAL_KEYS, type GoalKey } from "./lib";
import type { WelcomeMessages } from "./messages";

const BLUE_BG = "color-mix(in srgb, var(--azul) 16%, var(--blanco))";
const GOAL_LOOK: Record<GoalKey, { bg: string; fg: string; shape: string }> = {
  debts: { bg: "var(--rojo-fondo)", fg: "var(--naranja)", shape: "4px" },
  trip: { bg: "var(--ambar-fondo)", fg: "var(--amarillo-oscuro)", shape: "50%" },
  emergency: { bg: BLUE_BG, fg: "var(--azul)", shape: "4px 4px 50% 50%" },
  clarity: { bg: "var(--verde-fondo)", fg: "var(--tinta)", shape: "50%" },
  invest: { bg: "var(--verde-fondo)", fg: "var(--verde-texto)", shape: "2px" },
  business: { bg: BLUE_BG, fg: "var(--azul-oscuro)", shape: "50% 4px" },
};
const PERK_LOOK = [{ bg: "var(--verde-fondo)", fg: "var(--tinta)" }, { bg: "var(--ambar-fondo)", fg: "var(--amarillo-oscuro)" }, { bg: BLUE_BG, fg: "var(--azul)" }];
const BARS = [40, 62, 50, 78, 55, 70, 46, 84, 60, 72, 66, 90];
const TILT = ["-6deg", "4deg", "-2deg", "5deg", "-5deg", "3deg"];
const DONE = 4;
const SHADOW = "0 20px 40px color-mix(in srgb, var(--oscuro-1) 45%, transparent)";

type Props = {
  m: WelcomeMessages; created: boolean; canEdit: boolean; readOnlyText: string; name: string; country: string; currency: string;
  countries: { code: string; name: string; currency: string }[]; chosen: GoalKey[]; mfaOn: boolean;
};
type Enroll = { state: "idle" | "loading" | "failed" } | { state: "ready"; factorId: string; qr: string; secret: string };

export function Welcome({ m, created, canEdit, readOnlyText, countries, mfaOn, ...init }: Props) {
  const [step, setStep] = useState(created ? DONE : 0);
  const [goals, setGoals] = useState<GoalKey[]>(init.chosen);
  const [name, setName] = useState(init.name);
  const [country, setCountry] = useState(init.country);
  const [currency, setCurrency] = useState(init.currency);
  const [code, setCode] = useState("");
  const [enroll, setEnroll] = useState<Enroll>({ state: "idle" });
  const [mfaDone, setMfaDone] = useState(mfaOn);
  const [backup, setBackup] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  const picked = countries.find((c) => c.code === country);
  const freeCurrency = country === "OTHER";
  const shownCurrency = freeCurrency ? currency : picked?.currency ?? currency;
  const currencyNames: Record<string, string> = m.account.currencies;

  /** Paso de seguridad: pide el código QR la primera vez que se llega. */
  const loadQr = () => {
    if (mfaDone || enroll.state !== "idle") return;
    setEnroll({ state: "loading" });
    mfaStart().then((r) => setEnroll(r.ok ? { state: "ready", factorId: r.factorId, qr: r.qr, secret: r.secret } : { state: "failed" }), () => setEnroll({ state: "failed" }));
  };
  const go = (n: number) => { setError(""); setStep(n); };
  const save = () => createSpace({ name, country, currency: shownCurrency, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, goals });

  /** "Crear mi espacio": confirma los 2 pasos (si escribió el código) y guarda el perfil. */
  const finish = (skipMfa: boolean) => start(async () => {
    setError("");
    if (!skipMfa && !mfaDone && enroll.state === "ready") {
      const digits = code.replace(/\D/g, "");
      if (digits.length !== 6) return setError(m.secure.needCode);
      const v = await mfaConfirm({ factorId: enroll.factorId, code: digits });
      if (!v.ok) return setError(v.error);
      setMfaDone(true);
      setBackup(v.backupCodes);
    }
    const r = await save();
    if (!r.ok) return setError(r.error);
    setStep(DONE);
  });

  const next = () => {
    if (step === 2) {
      if (!name.trim()) return setError(m.errors.name);
      if (!picked) return setError(m.errors.country);
      loadQr();
    }
    if (step === 3) return finish(false);
    go(step + 1);
  };
  const blank = () => start(async () => {
    setError("");
    const r = await startBlank();
    if (r && !r.ok) setError(r.error); // si sale bien, el servidor redirige a /plan
  });

  const stepText = (mobile: boolean) => (step === 0 ? (mobile ? m.stepWelcomeMobile : m.stepWelcome) : fill(m.stepOf, { n: Math.min(step, 4) }));
  const nm = name.trim();
  const nextLabel = pending ? m.nav.saving : step === 0 ? m.nav.start : step === 3 ? m.nav.create : m.nav.next;
  const logoBox = (size: number, radius: number, dot: number, border: number) => (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, background: "var(--blanco)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <span style={{ width: dot, height: dot, borderRadius: "50%", border: `${border}px solid var(--tinta)` }} />
    </span>
  );
  const goalIcon = (g: GoalKey, size: number, inner: number, radius: number) => (
    <span aria-hidden="true" style={{ width: size, height: size, borderRadius: radius, background: GOAL_LOOK[g].bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
      <span style={{ width: inner, height: inner, borderRadius: GOAL_LOOK[g].shape, background: GOAL_LOOK[g].fg }} />
    </span>
  );

  return (
    <div className={css.wrap}>
      {/* Escritorio: bloque oscuro con la idea de cada paso */}
      <aside className={css.aside}>
        <div aria-hidden="true" style={{ position: "absolute", right: -120, top: -120, width: 360, height: 360, borderRadius: "50%", border: "56px solid var(--oscuro-3)" }} />
        <div aria-hidden="true" style={{ position: "absolute", left: -80, bottom: -100, width: 260, height: 260, borderRadius: "50%", background: "var(--oscuro-3)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
          {logoBox(34, 11, 12, 3)}
          <span style={{ fontWeight: 600, fontSize: 19 }}>Revolución 360</span>
          <Image src="/brand/sello-dark.png" alt={m.brandAlt} width={40} height={40} style={{ marginLeft: "auto" }} />
        </div>
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 28 }}>
          {step === 0 || step === 2 ? (
            <div style={{ position: "relative", height: 340, maxWidth: 440 }}>
              <div style={{ position: "absolute", left: 0, top: 0, width: 270, background: "var(--blanco)", color: "var(--tinta)", borderRadius: 16, padding: 20, boxShadow: SHADOW, display: "flex", flexDirection: "column", gap: 14, transform: "rotate(-3deg)" }}>
                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--gris)" }}>{m.deco.plan}</span>
                <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(12, minmax(0, 1fr))", gap: 4, alignItems: "end", height: 90 }}>
                  {BARS.map((h, i) => <div key={i} style={{ borderRadius: "4px 4px 1px 1px", height: h, background: i === 11 ? "var(--amarillo-oscuro)" : i % 2 ? "var(--tinta)" : "var(--oscuro-texto)" }} />)}
                </div>
                <div aria-hidden="true" style={{ display: "flex", gap: 6 }}>
                  <span style={{ height: 8, flex: 3, borderRadius: 4, background: "var(--tinta)" }} /><span style={{ height: 8, flex: 2, borderRadius: 4, background: "var(--amarillo-oscuro)" }} /><span style={{ height: 8, flex: 1, borderRadius: 4, background: "var(--azul)" }} />
                </div>
              </div>
              <div style={{ position: "absolute", right: 0, top: 120, width: 210, background: "var(--blanco)", color: "var(--tinta)", borderRadius: 16, padding: 18, boxShadow: SHADOW, display: "flex", gap: 14, alignItems: "center", transform: "rotate(4deg)" }}>
                <div aria-hidden="true" style={{ width: 56, height: 56, borderRadius: "50%", background: "conic-gradient(var(--tinta) 0 68%, var(--verde-fondo) 68% 100%)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--blanco)" }} /></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}><span style={{ fontSize: 12, fontWeight: 500, color: "var(--gris)" }}>{m.deco.goal}</span><span style={{ fontSize: 15, fontWeight: 600 }}>{m.deco.goalName}</span></div>
              </div>
              <div style={{ position: "absolute", left: 40, bottom: 0, background: "var(--amarillo-oscuro)", color: "var(--tinta)", borderRadius: 999, padding: "12px 18px", fontSize: 14, fontWeight: 600, boxShadow: SHADOW }}>{m.deco.pill}</div>
            </div>
          ) : null}
          {step === 1 ? (
            <div aria-hidden="true" style={{ display: "grid", gridTemplateColumns: "repeat(3, 96px)", gap: 14 }}>
              {GOAL_KEYS.map((g, i) => (
                <div key={g} style={{ width: 96, height: 96, borderRadius: 26, background: GOAL_LOOK[g].bg, display: "flex", alignItems: "center", justifyContent: "center", transform: `rotate(${TILT[i]})` }}>
                  <div style={{ width: 30, height: 30, borderRadius: GOAL_LOOK[g].shape, background: GOAL_LOOK[g].fg }} />
                </div>
              ))}
            </div>
          ) : null}
          {step === 3 ? (
            <div aria-hidden="true" style={{ width: 180, height: 210, borderRadius: "90px 90px 100px 100px / 60px 60px 140px 140px", background: "var(--oscuro-3)", border: "3px solid var(--amarillo)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="lock" size={72} color="var(--amarillo)" />
            </div>
          ) : null}
          {step === DONE ? (
            <div aria-hidden="true" style={{ width: 150, height: 150, margin: 36, borderRadius: "50%", background: "var(--amarillo)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 0 18px var(--oscuro-3), 0 0 0 36px var(--oscuro-3)" }}>
              <Icon name="tick" size={70} color="var(--oscuro-2)" />
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 460 }}>
            <h1 style={{ fontSize: 40, lineHeight: 1.12 }}>{m.side[step][0]}</h1>
            <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--oscuro-texto-2)" }}>{m.side[step][1]}</p>
          </div>
        </div>
        <div style={{ position: "relative", display: "flex", flexWrap: "wrap", gap: 8 }}>
          {m.chips.map((c) => <span key={c} style={{ fontSize: 12, fontWeight: 600, padding: "8px 12px", borderRadius: 999, background: "var(--oscuro-3)", color: "var(--oscuro-texto-2)" }}>{c}</span>)}
        </div>
      </aside>

      {/* Móvil: el mismo mensaje, arriba */}
      <header className={css.mobileHeader}>
        <div aria-hidden="true" style={{ position: "absolute", right: -70, top: -70, width: 200, height: 200, borderRadius: "50%", border: "34px solid var(--oscuro-3)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>{logoBox(28, 9, 10, 2.5)}<span style={{ fontWeight: 600, fontSize: 16 }}>Revolución 360</span></div>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--oscuro-texto)" }}>{stepText(true)}</span>
        </div>
        <ol aria-label={m.stepsLabel} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 5, position: "relative" }}>
          {m.steps.map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined} style={{ flex: i === step ? 2 : 1, height: 5, borderRadius: 3, background: i <= step ? "var(--amarillo)" : "var(--oscuro-linea)" }}><span className="sr-only">{label}</span></li>)}
        </ol>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, position: "relative" }}>
          <h1 style={{ fontSize: 27, lineHeight: 1.15 }}>{m.sideMobile[step][0]}</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--oscuro-texto-2)" }}>{m.sideMobile[step][1]}</p>
        </div>
      </header>

      <main className={css.main}>
        <div className={css.col}>
          <div className={css.deskOnly} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <ol aria-label={m.stepsLabel} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", gap: 6, flex: 1 }}>
              {m.steps.map((label, i) => <li key={label} aria-current={i === step ? "step" : undefined} style={{ flex: i === step ? 2 : 1, height: 6, borderRadius: 3, background: i <= step ? "var(--tinta)" : "var(--linea-campo)" }}><span className="sr-only">{label}</span></li>)}
            </ol>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--gris)", whiteSpace: "nowrap" }}>{stepText(false)}</span>
          </div>

          {step === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              <span className={css.deskOnly} style={{ alignSelf: "flex-start", fontSize: 12, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", background: "var(--verde-fondo)", padding: "6px 12px", borderRadius: 999 }}>{m.welcome.badge}</span>
              <h2 className={`${css.h2hero} ${css.deskOnly}`}>{m.welcome.title}</h2>
              <p className={css.deskOnly} style={{ fontSize: 17, lineHeight: 1.6, color: "var(--oscuro-linea)" }}>{m.welcome.text}</p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {m.welcome.perks.map(([t, d], i) => (
                  <li key={t} style={{ display: "flex", gap: 14, alignItems: "center", background: "var(--blanco)", borderRadius: 16, padding: "14px 16px", border: "1px solid var(--linea)" }}>
                    <span aria-hidden="true" style={{ width: 40, height: 40, borderRadius: 12, background: PERK_LOOK[i % 3].bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}><Icon name="target" size={22} color={PERK_LOOK[i % 3].fg} /></span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><strong style={{ fontSize: 15 }}>{t}</strong><span style={{ fontSize: 13, color: "var(--gris)" }}>{d}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === 1 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <h2 className={`${css.h2} ${css.deskOnly}`}>{m.goals.title}</h2>
              <p className={css.deskOnly} style={{ fontSize: 15, color: "var(--gris)" }}>{m.goals.text}</p>
              <div role="group" aria-label={m.goals.group} className={css.goalGrid}>
                {GOAL_KEYS.map((g) => {
                  const on = goals.includes(g);
                  return (
                    <button key={g} type="button" role="checkbox" aria-checked={on} className={css.goalBtn} onClick={() => setGoals(on ? goals.filter((x) => x !== g) : [...goals, g])}>
                      <span style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                        {goalIcon(g, 36, 13, 11)}
                        <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${on ? "var(--tinta)" : "var(--oscuro-texto)"}`, background: on ? "var(--tinta)" : "var(--blanco)", color: "var(--blanco)", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{on ? "✓" : ""}</span>
                      </span>
                      <span className={css.goalName}>{m.goals.names[g]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <form onSubmit={(e) => { e.preventDefault(); next(); }} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <h2 className={`${css.h2} ${css.deskOnly}`}>{m.account.title}</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                <label htmlFor="o-nombre" style={{ fontSize: 14, fontWeight: 600 }}>{m.account.name}</label>
                <input id="o-nombre" className={css.big} type="text" autoComplete="given-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label htmlFor="o-pais" style={{ fontSize: 14, fontWeight: 600 }}>{m.account.country}</label>
                  <select id="o-pais" className={css.bigSel} value={country} onChange={(e) => setCountry(e.target.value)}>
                    {countries.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  <label htmlFor="o-mon" style={{ fontSize: 14, fontWeight: 600 }}>{m.account.currency}</label>
                  <select id="o-mon" className={css.bigSel} value={shownCurrency} disabled={!freeCurrency} onChange={(e) => setCurrency(e.target.value)}>
                    {(freeCurrency ? [...CURRENCIES] : [shownCurrency]).map((c) => <option key={c} value={c}>{currencyNames[c] ?? c}</option>)}
                  </select>
                </div>
              </div>
            </form>
          ) : null}

          {step === 3 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <h2 className={`${css.h2} ${css.deskOnly}`}>{m.secure.title}</h2>
              {mfaDone ? <p className={css.info}>{m.secure.already}</p> : enroll.state === "failed" ? <p className={css.info}>{m.secure.unavailable}</p> : (
                <>
                  <p className={css.deskOnly} style={{ fontSize: 15, color: "var(--oscuro-linea)", lineHeight: 1.6 }}>{m.secure.text}</p>
                  <div className={css.qrRow}>
                    <div role="img" aria-label={m.secure.qr} style={{ width: 150, height: 150, alignSelf: "center", borderRadius: 14, background: "var(--blanco)", border: "1px solid var(--linea)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--gris)", fontWeight: 600, flex: "none", overflow: "hidden" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- el QR llega como imagen en línea, no hay nada que optimizar */}
                      {enroll.state === "ready" ? <img src={enroll.qr} alt="" width={150} height={150} /> : m.secure.loading}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1, minWidth: 220 }}>
                      <label htmlFor="o-code" style={{ fontSize: 14, fontWeight: 600 }}><span className={css.deskOnly}>{m.secure.code}</span><span className={css.mobOnly}>{m.secure.codeMobile}</span></label>
                      <input id="o-code" className={css.code} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
                      {enroll.state === "ready" ? <span className="hint" style={{ overflowWrap: "anywhere" }}>{m.secure.secret} <strong className="num">{enroll.secret}</strong></span> : null}
                    </div>
                  </div>
                  <button type="button" className={css.textLink} disabled={pending} onClick={() => finish(true)}>{m.secure.skip}</button>
                </>
              )}
            </div>
          ) : null}

          {step === DONE ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <h2 className={css.h2done}><span className={css.deskOnly}>{nm ? fill(m.done.title, { name: nm }) : m.done.titleNoName}</span><span className={css.mobOnly}>{nm ? fill(m.done.titleMobile, { name: nm }) : m.done.titleMobileNoName}</span></h2>
              <p className={css.deskOnly} style={{ fontSize: 16, color: "var(--oscuro-linea)", lineHeight: 1.6 }}>{goals.length ? m.done.text : m.done.textNoGoals}</p>
              {backup.length ? (
                <div className="form-open" style={{ padding: 16, gap: 10 }}>
                  <strong style={{ fontSize: 15 }}>{m.done.backupTitle}</strong>
                  <span className="small muted">{m.done.backupText}</span>
                  <ul className="num" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 16px", fontSize: 14, fontWeight: 600 }}>{backup.map((c) => <li key={c}>{c}</li>)}</ul>
                </div>
              ) : null}
              {goals.length ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {GOAL_KEYS.filter((g) => goals.includes(g)).map((g) => (
                    <li key={g} style={{ display: "flex", alignItems: "center", gap: 12, background: "var(--blanco)", borderRadius: 16, padding: "14px 16px", border: "1px solid var(--linea)" }}>
                      {goalIcon(g, 36, 13, 11)}
                      <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{m.goals.names[g]}</span>
                      <span className={css.deskOnly} style={{ fontSize: 12, fontWeight: 500, color: "var(--gris)" }}>{m.done.pending}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {error ? <p role="alert" className={css.alert}>{error}</p> : null}
              <div className={css.twoCtas}>
                <Link href="/asistente" className={css.cta} style={{ fontSize: 15 }}>{m.done.cta}</Link>
                <button type="button" className={css.ctaSecondary} disabled={pending} onClick={blank}>{m.done.blank}</button>
              </div>
            </div>
          ) : null}

          {step !== DONE ? (
            <>
              {!canEdit ? <p role="alert" className={css.alert}>{readOnlyText}</p> : error ? <p role="alert" className={css.alert}>{error}</p> : null}
              <div className={css.nav}>
                <button type="button" className={css.back} onClick={() => go(step - 1)} aria-label={m.nav.back} disabled={pending} style={{ visibility: step === 0 ? "hidden" : "visible" }}>
                  <span aria-hidden="true">‹</span><span className={css.backText}> {m.nav.back}</span>
                </button>
                <button type="button" className={css.next} onClick={next} disabled={pending || !canEdit || (step === 3 && !mfaDone && enroll.state === "loading")}>{nextLabel}</button>
              </div>
            </>
          ) : null}
          <div className={css.foot}>
            <Image src="/brand/sello.png" alt={m.brandAlt} width={36} height={36} />
            <span>{m.foot}<span className={css.footLinks}> · <Link href="/legal/terminos">{m.terms}</Link> · <Link href="/legal/privacidad">{m.privacy}</Link></span></span>
          </div>
        </div>
      </main>
    </div>
  );
}
