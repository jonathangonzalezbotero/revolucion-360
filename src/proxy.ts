import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC = ["/entrar", "/registro", "/recuperar", "/nueva-clave", "/verificar", "/auth", "/legal", "/api/stripe/webhook", "/api/cron", "/sin-conexion"];

// Refresca la sesión y hace el primer filtro. La autorización real la imponen la base de datos y cada página.
export async function proxy(request: NextRequest) {
  // Ruta pedida para requireUser (la puerta "Activa tu cuenta"). Se sobrescribe siempre: el navegador no puede fijarla.
  // Va en la petición ANTES de crear la respuesta: setAll (cookies) vuelve a crear NextResponse.next({ request }) y la conserva.
  request.headers.set("x-r360-path", request.nextUrl.pathname);
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(p + "/"));

  if (!signedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/entrar";
    url.search = path !== "/" ? `?ir=${encodeURIComponent(path)}` : "";
    return NextResponse.redirect(url);
  }
  if (signedIn && ["/entrar", "/registro"].includes(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|insignias/|cursos/|ilustraciones/|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
