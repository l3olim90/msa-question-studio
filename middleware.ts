import {NextResponse} from 'next/server';
import {authorize,apiError} from './lib/security';
export async function middleware(request:Request){try{await authorize(request);const r=NextResponse.next();r.headers.set('X-Content-Type-Options','nosniff');r.headers.set('X-Frame-Options','DENY');r.headers.set('Referrer-Policy','same-origin');r.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');return r;}catch(e){return apiError(e);}}
export const config={matcher:['/((?!_next|@vite|node_modules).*)']};
