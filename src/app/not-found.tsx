import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page" style={{ margin: "0 auto", maxWidth: 560, minHeight: "100dvh", justifyContent: "center" }}>
      <h1>No encontramos esa página</h1>
      <p className="muted">Puede que el enlace esté viejo o que la sección aún no esté disponible.</p>
      <div><Link href="/inicio" className="btn">Ir al inicio</Link></div>
    </main>
  );
}
