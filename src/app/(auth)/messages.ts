import type { Messages } from "@/i18n";

export const M = {
  es: {
    hero1: "Tu año entero de plata,", hero2: "en un solo lugar.",
    quote: "[Frase tuya en tus palabras. Ej.: Esta es la misma hoja con la que yo ordené mi plata en Australia, ahora en tu celular.]",
    quoteBy: "Jonathan · Revolución del Dinero", photoAlt: "Foto de Jonathan (por agregar)", photo: "[foto]",
    trust: [
      ["Cifrado de punta a punta", "Tus datos viajan y se guardan cifrados, en servidores en Sydney."],
      ["Nunca entramos a tu banco", "Tú escribes o importas tus movimientos. Nadie más los ve."],
      ["Verificación en 2 pasos", "Un código en tu celular cada vez que entras desde un equipo nuevo."],
    ],
    endorsement: "Una herramienta de", footMobile: "Datos cifrados · servidores en Sydney", terms: "Términos", privacy: "Privacidad", help: "Ayuda",
    or: "o con tu correo", name: "Tu nombre", namePh: "Como quieres que te llamemos", email: "Correo", emailPh: "tu@correo.com",
    password: "Contraseña", show: "Mostrar", hide: "Ocultar",
    pwHint: "Mínimo 8 caracteres. Mejor si es una frase larga, ej. \"mi-viaje-a-cali-2027\".",
    pwLevels: ["Escribe una contraseña", "Muy corta", "Débil", "Buena", "Muy segura"],
    reg: { title: "Crea tu cuenta", sub: "Tu primer mes cuesta {first} USD. Tu plan del año listo en 10 minutos.", accept1: "Acepto los", accept2: "términos", accept3: "y la", accept4: "política de privacidad", accept5: ". Tus datos son tuyos: nunca los vendemos.", cta: "Crear mi cuenta", have: "¿Ya tienes cuenta?", signIn: "Entrar", invite: "Código de invitación", invitePh: "Si eres alumno, escríbelo aquí", optional: "opcional" },
    in: { title: "Hola de nuevo", sub: "Entra para seguir con tu plan.", forgot: "Olvidé mi contraseña", cta: "Entrar", first: "¿Primera vez?", create: "Crea tu cuenta" },
    rec: { title: "Recupera tu acceso", sub: "Escribe tu correo y te mandamos un enlace para crear una contraseña nueva.", cta: "Enviar enlace", back: "‹ Volver a entrar" },
    mail: {
      titleReg: "Confirma tu correo", textReg: "Abre el correo que te enviamos y toca el botón para activar tu cuenta. El enlace dura 24 horas.",
      titleRec: "Te enviamos un enlace", textRec: "Si existe una cuenta con ese correo, te llegó un enlace para crear una contraseña nueva. Dura 30 minutos.",
      sentTo: "Enviado a", yourEmail: "tu correo", noArrive: "¿No llega? Revisa spam o promociones. Puedes pedir otro en 60 segundos.", resend: "Reenviar correo", resent: "Listo, te lo enviamos de nuevo.", other: "‹ Usar otro correo",
    },
    code: {
      title: "Escribe tu código", sub: "Abre tu app de autenticación (Google Authenticator, 1Password, Authy) y escribe los 6 números.", label: "Código de 6 números",
      cta: "Entrar", wait: "Escribe los 6 números", backup: "Usar un código de respaldo", back: "‹ Volver",
      lost: "¿Perdiste tu celular? Usa uno de los 10 códigos de respaldo que guardaste al activar los 2 pasos, o escríbenos a soporte.",
      backupTitle: "Usa un código de respaldo", backupSub: "Escribe uno de los 10 códigos que guardaste. Al usarlo, los 2 pasos se desactivan para que los configures de nuevo desde Mi perfil.", backupLabel: "Código de respaldo", backupCta: "Entrar con el código", useApp: "‹ Usar mi app de autenticación",
    },
    neu: { title: "Crea tu contraseña nueva", sub: "Por seguridad, cerraremos tu sesión en los demás dispositivos.", label: "Contraseña nueva", cta: "Guardar y entrar" },
    errors: {
      terms: "Acepta los términos para continuar.", weak: "Revisa tu correo y usa una contraseña más segura.", both: "Escribe tu correo y tu contraseña.", emailOnly: "Escribe el correo con el que te registraste.",
      invalid: "El correo o la contraseña no coinciden.", unconfirmed: "Falta confirmar tu correo. Te enviamos el enlace otra vez.", exists: "Ya hay una cuenta con ese correo. Entra o recupera tu acceso.",
      code: "Ese código no es. Revisa los 6 números.", backup: "Ese código de respaldo no sirve.", locked: "Demasiados intentos. Espera 15 minutos.", rate: "Espera un momento antes de intentar de nuevo.", link: "Ese enlace ya venció o ya se usó. Pide uno nuevo.", suspended: "Tu cuenta está suspendida. Escríbenos a soporte.", generic: "Algo no salió bien. Intenta de nuevo.", name: "Falta tu nombre.",
    },
  },
  en: {
    hero1: "Your whole year of money,", hero2: "in one place.",
    quote: "[Your own words here. E.g.: This is the same sheet I used to sort out my money in Australia, now on your phone.]",
    quoteBy: "Jonathan · Revolución del Dinero", photoAlt: "Photo of Jonathan (to be added)", photo: "[photo]",
    trust: [
      ["Encrypted end to end", "Your data travels and is stored encrypted, on servers in Sydney."],
      ["We never access your bank", "You type or import your transactions. No one else sees them."],
      ["Two-step verification", "A code on your phone whenever you sign in from a new device."],
    ],
    endorsement: "A tool by", footMobile: "Encrypted data · servers in Sydney", terms: "Terms", privacy: "Privacy", help: "Help",
    or: "or with your email", name: "Your name", namePh: "What should we call you", email: "Email", emailPh: "you@email.com",
    password: "Password", show: "Show", hide: "Hide",
    pwHint: "At least 8 characters. A long phrase is better, e.g. \"my-trip-to-cali-2027\".",
    pwLevels: ["Type a password", "Too short", "Weak", "Good", "Very strong"],
    reg: { title: "Create your account", sub: "Your first month costs {first} USD. Your yearly plan ready in 10 minutes.", accept1: "I accept the", accept2: "terms", accept3: "and the", accept4: "privacy policy", accept5: ". Your data is yours: we never sell it.", cta: "Create my account", have: "Already have an account?", signIn: "Sign in", invite: "Invite code", invitePh: "If you're a student, type it here", optional: "optional" },
    in: { title: "Welcome back", sub: "Sign in to continue with your plan.", forgot: "I forgot my password", cta: "Sign in", first: "First time?", create: "Create your account" },
    rec: { title: "Recover your access", sub: "Type your email and we'll send you a link to create a new password.", cta: "Send link", back: "‹ Back to sign in" },
    mail: {
      titleReg: "Confirm your email", textReg: "Open the email we sent you and tap the button to activate your account. The link lasts 24 hours.",
      titleRec: "We sent you a link", textRec: "If an account exists with that email, you got a link to create a new password. It lasts 30 minutes.",
      sentTo: "Sent to", yourEmail: "your email", noArrive: "Not there? Check spam or promotions. You can request another in 60 seconds.", resend: "Resend email", resent: "Done, we sent it again.", other: "‹ Use another email",
    },
    code: {
      title: "Enter your code", sub: "Open your authenticator app (Google Authenticator, 1Password, Authy) and type the 6 digits.", label: "6-digit code",
      cta: "Sign in", wait: "Type the 6 digits", backup: "Use a backup code", back: "‹ Back",
      lost: "Lost your phone? Use one of the 10 backup codes you saved when you turned on two-step, or write to support.",
      backupTitle: "Use a backup code", backupSub: "Type one of the 10 codes you saved. Using it turns two-step off so you can set it up again from My profile.", backupLabel: "Backup code", backupCta: "Sign in with the code", useApp: "‹ Use my authenticator app",
    },
    neu: { title: "Create your new password", sub: "For security, we'll sign you out on your other devices.", label: "New password", cta: "Save and sign in" },
    errors: {
      terms: "Accept the terms to continue.", weak: "Check your email and use a stronger password.", both: "Type your email and your password.", emailOnly: "Type the email you signed up with.",
      invalid: "The email or password doesn't match.", unconfirmed: "Your email isn't confirmed yet. We sent the link again.", exists: "There's already an account with that email. Sign in or recover your access.",
      code: "That's not the code. Check the 6 digits.", backup: "That backup code doesn't work.", locked: "Too many attempts. Wait 15 minutes.", rate: "Wait a moment before trying again.", link: "That link expired or was already used. Request a new one.", suspended: "Your account is suspended. Write to support.", generic: "Something went wrong. Try again.", name: "Your name is missing.",
    },
  },
} satisfies Messages<unknown>;
export type AuthMessages = (typeof M)["es"];
