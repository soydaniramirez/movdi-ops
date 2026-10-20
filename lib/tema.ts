// Tema de la app: claro | oscuro | sistema (2026-10-19).
// La preferencia vive en localStorage (por navegador, no en BD) y el tema
// resuelto se pinta en <html data-theme="light|dark">; globals.css hace el resto.
export type PreferenciaTema = 'claro' | 'oscuro' | 'sistema'
export const CLAVE_TEMA = 'movdi-tema'

// Script inline del <head>: corre ANTES del primer pintado para que no haya
// flash de tema equivocado. Debe ser autocontenido (no importa nada).
export const SCRIPT_TEMA = `(function(){try{
var p=localStorage.getItem('${CLAVE_TEMA}')||'sistema';
var m=window.matchMedia('(prefers-color-scheme: light)');
function r(){var t=p==='claro'?'light':p==='oscuro'?'dark':(m.matches?'light':'dark');document.documentElement.setAttribute('data-theme',t);}
r();
}catch(e){}})();`
