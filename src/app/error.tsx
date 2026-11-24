"use client";

// Los errores se registran sin montos ni datos personales: aquí solo se muestra un mensaje y un código.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="page" style={{ margin: "0 auto", maxWidth: 560, minHeight: "100dvh", justifyContent: "center" }}>
      <h1>Algo no salió bien</h1>
      <p className="muted">No se perdió nada de lo que ya guardaste. Intenta de nuevo; si sigue pasando, escríbenos desde Ayuda.</p>
      {error.digest ? <p className="xs muted num">Código: {error.digest}</p> : null}
      <div className="row"><button type="button" className="btn" onClick={reset}>Intentar de nuevo</button><a href="/inicio" className="btn btn-secondary">Ir al inicio</a></div>
    </main>
  );
}
