// Cache static assets only. Authenticated pages and API data are never stored,
// so another user of the same device cannot see the previous user's dashboard.
const CACHE = 'nozha-static-v3';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
 const r=e.request,u=new URL(r.url);
 if(r.method!=='GET'||u.origin!==location.origin||!(u.pathname.startsWith('/_next/static/')||u.pathname.startsWith('/icon-')||u.pathname.startsWith('/fonts/')))return;
 e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok)caches.open(CACHE).then(c=>c.put(r,res.clone()));return res;})));
});
