"use client";
import { useEffect, useSyncExternalStore } from "react";
import { tabFromHash, type Tab } from "./lib";
import css from "./perfil.module.css";

// La pestaña vive en el ancla de la URL (#seguridad, #insignias, #racha, #privacidad…): el servidor no la ve.
const EVENT = "r360-hash";
const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  window.addEventListener(EVENT, cb);
  return () => { window.removeEventListener("hashchange", cb); window.removeEventListener(EVENT, cb); };
};
const getHash = () => window.location.hash;

export function ProfileTabs({ tabs, labels, label, gamification, panels }: { tabs: Tab[]; labels: Record<Tab, string>; label: string; gamification: boolean; panels: Partial<Record<Tab, React.ReactNode>> }) {
  const hash = useSyncExternalStore(subscribe, getHash, () => "");
  const active = tabFromHash(hash, gamification);

  // Si el ancla apunta a algo dentro de la pestaña (#racha, #insignias), se lleva a la vista.
  useEffect(() => {
    const id = hash.replace(/^#/, "");
    if (!id || (tabs as string[]).includes(id)) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, [hash, tabs]);

  const pick = (t: Tab) => {
    window.history.replaceState(null, "", `#${t}`);
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <>
      <div role="tablist" aria-label={label} className={css.tabs}>
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" id={`tab-${t}`} aria-controls={`panel-${t}`} aria-selected={active === t} tabIndex={active === t ? 0 : -1} className={css.tab}
            onClick={() => pick(t)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              const i = tabs.indexOf(t) + (e.key === "ArrowRight" ? 1 : -1);
              const next = tabs[(i + tabs.length) % tabs.length];
              pick(next);
              document.getElementById(`tab-${next}`)?.focus();
            }}>
            {labels[t]}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t} role="tabpanel" id={`panel-${t}`} aria-labelledby={`tab-${t}`} hidden={active !== t} className={css.panel}>
          {panels[t]}
        </div>
      ))}
    </>
  );
}
