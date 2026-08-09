/* ================================================================
   GAMAS 2026 — Service Worker (dasar)
   ================================================================
   Tujuan file ini SEDERHANA & SENGAJA MINIMAL:
   1. Supaya browser (Chrome) menganggap situs ini sebagai PWA yang
      "layak dipercaya" -> menaikkan peluang navigator.storage.persist()
      dikabulkan, sehingga IndexedDB (data sales, dsb) tidak gampang
      dihapus otomatis oleh browser.
   2. TIDAK melakukan caching agresif terhadap data. Semua request ke
      Supabase (*.supabase.co) maupun HTML halaman SELALU diambil
      langsung dari network (tidak di-cache), supaya data yang tampil
      selalu yang terbaru -- PWA offline caching yang agresif justru
      berbahaya untuk aplikasi seperti ini (bisa menampilkan data basi
      atau bentrok dengan sistem sync yang sudah ada di sync-*.js).

   Kalau nanti mau dukungan offline penuh, ini bisa dikembangkan lagi
   -- tapi untuk sekarang, fokusnya cuma "syarat administratif" PWA.
================================================================= */

const CACHE_NAME = 'gamas2026-shell-v1';

// Cuma cache aset statis yang jarang berubah (bukan HTML dashboard,
// bukan data). Kalau file-file ini belum ada di server, baris fetch-nya
// akan gagal diam-diam saat install (tidak menghentikan instalasi SW).
const SHELL_ASSETS = [
  '/COMMAND-CENTER-GAMAS/manifest.json',
  '/COMMAND-CENTER-GAMAS/icon-192.png',
  '/COMMAND-CENTER-GAMAS/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => {
            // Diam-diam abaikan kalau salah satu aset gagal di-cache
            // (misal belum sempat di-upload) -- jangan sampai
            // menggagalkan instalasi service worker secara keseluruhan.
          })
        )
      );
    })
  );
  // CATATAN: sengaja TIDAK memanggil self.skipWaiting() otomatis di sini.
  // dashboard-kerja.html sudah punya logika update sendiri (baris ~13260)
  // yang mengirim pesan 'SKIP_WAITING' secara eksplisit ke service worker
  // baru saat siap, lalu reload sekali via 'controllerchange'. Kalau kita
  // skipWaiting otomatis di sini, itu akan bentrok dengan alur tersebut.
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // JANGAN pernah cache/intercept request ke Supabase -- data harus
  // selalu real-time dari network, tidak boleh disajikan dari cache.
  if (url.includes('supabase.co')) {
    return; // biarkan browser handle langsung seperti biasa
  }

  // Untuk navigasi HTML (buka/refresh halaman): selalu coba network
  // dulu (supaya dashboard selalu versi terbaru), baru fallback ke
  // cache kalau benar-benar offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // Untuk aset statis di daftar SHELL_ASSETS: cache-first supaya cepat,
  // tapi tetap update cache di background dari network.
  if (SHELL_ASSETS.some((asset) => url.endsWith(asset))) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Revalidate di background TANPA mempengaruhi respons yang
          // sudah dikembalikan ke halaman (hindari clone() dobel yang
          // menyebabkan error 'Response body is already used').
          fetch(event.request)
            .then((resp) => {
              if (resp && resp.ok) {
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resp));
              }
            })
            .catch(() => {});
          return cached;
        }
        return fetch(event.request).then((resp) => {
          if (resp && resp.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resp.clone()));
          }
          return resp;
        });
      })
    );
    return;
  }

  // Selain itu (script/css lain, dll): biarkan lewat network seperti biasa.
});