import {NextResponse} from 'next/server';
import {authorize,apiError} from './lib/security';
// Vinext runs this inside the Node server. A root middleware.ts is separately
// auto-detected by Vercel's Other-framework builder as CDN routing middleware.
export async function proxy(request:Request){try{await authorize(request);const r=NextResponse.next();r.headers.set('X-Content-Type-Options','nosniff');r.headers.set('X-Frame-Options','DENY');r.headers.set('Referrer-Policy','same-origin');r.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');return r;}catch(e){return apiError(e);}}
export const config={matcher:['/((?!_next|@vite|node_modules).*)']};
