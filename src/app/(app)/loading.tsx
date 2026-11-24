// Nunca un gráfico vacío: mientras carga, la forma de la pantalla.
export default function Loading() {
  const block = (h: number): React.CSSProperties => ({ height: h, borderRadius: 14, background: "var(--linea-2)" });
  return (
    <div className="page" aria-busy="true" aria-label="Cargando">
      <div style={{ ...block(40), width: 220 }} />
      <div style={block(190)} />
      <div className="grid-auto"><div style={block(210)} /><div style={block(210)} /></div>
    </div>
  );
}
