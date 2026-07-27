/* ================================================================
   GAMAS 2026 — SYNC SALES KE SUPABASE (multi-device)
   ================================================================
   ⚠️ VERSI PERBAIKAN (25/07/2026) — memperbaiki bug duplikasi data.

   BUG YANG DIPERBAIKI:
   Sebelumnya, kode identitas tiap baris (_syncId) baru dibuat SETELAH
   data disimpan ke penyimpanan lokal (IndexedDB), dan TIDAK PERNAH ikut
   tersimpan balik ke lokal. Akibatnya, setiap kali halaman dibuka/
   refresh, seluruh baris dianggap "belum punya ID" lagi -> dibuatkan ID
   baru -> dikirim ke Supabase sebagai baris BARU yang berbeda, padahal
   isinya sama persis dengan yang sudah pernah dikirim sebelumnya.
   Ini menyebabkan data terduplikasi setiap kali dashboard dibuka.

   PERBAIKAN: _syncId sekarang dijamin dibuat & disimpan ke lokal
   SEBELUM proses kirim (push) ke cloud berjalan, baik saat menyimpan
   data baru (saveSalesData) maupun saat memuat data lama yang belum
   pernah diberi ID (loadSalesData - proses "backfill" sekali jalan).

   Cara kerja lain TIDAK BERUBAH dari versi sebelumnya:
   - Data tetap tersimpan lokal di IndexedDB tiap device (offline-first).
   - PUSH: kirim HANYA baris yang berubah (delta) ke Supabase.
   - PULL: tarik HANYA baris yang berubah di cloud sejak sync terakhir.
   - Tidak pakai realtime listener, cukup sync saat buka/refresh halaman.
   - Kalau offline: push/pull gagal dengan tenang, data lokal tetap aman.

   Cara pasang: taruh 1 baris ini SEBELUM </body>, SETELAH script utama:
       <script src="sync-supabase.js"></script>
   File ini mengandalkan variabel/fungsi global dari script utama:
   salesData, saveSalesData, loadSalesData, showToast (opsional).
================================================================= */
(function () {
    'use strict';

    // ── KONFIGURASI SUPABASE ──────────────────────────────────────
    const SUPABASE_URL = 'https://vrrmpuckjhxkgrcbhezt.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Ba-4bYHy4cOrwMFe7n2ZWw_sUFt7aA0';
    const REST = SUPABASE_URL + '/rest/v1';
    const PAGE_SIZE = 1000;

    function supaHeaders(extra) {
        return Object.assign({
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json'
        }, extra || {});
    }

    // ── ID unik per device (cuma buat info/debug, bukan buat auth) ──
    const DEVICE_ID = (function () {
        let id = localStorage.getItem('gm2026_device_id');
        if (!id) {
            id = 'dev-' + Math.random().toString(36).slice(2, 10);
            localStorage.setItem('gm2026_device_id', id);
        }
        return id;
    })();

    function uuid() {
        if (crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }

    // ── IndexedDB kecil KHUSUS bookkeeping sync (terpisah dari DB app
    //    utama, supaya tidak perlu ubah/upgrade DB app yang sudah ada) ──
    const SYNC_DB_NAME = 'GamasSyncMeta';
    const SYNC_STORE = 'meta';
    function openSyncDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(SYNC_DB_NAME, 1);
            req.onupgradeneeded = () => { req.result.createObjectStore(SYNC_STORE); };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
    async function metaGet(key) {
        const dbi = await openSyncDb();
        return new Promise((resolve, reject) => {
            const rq = dbi.transaction(SYNC_STORE, 'readonly').objectStore(SYNC_STORE).get(key);
            rq.onsuccess = () => resolve(rq.result);
            rq.onerror = () => reject(rq.error);
        });
    }
    async function metaSet(key, val) {
        const dbi = await openSyncDb();
        return new Promise((resolve, reject) => {
            const rq = dbi.transaction(SYNC_STORE, 'readwrite').objectStore(SYNC_STORE).put(val, key);
            rq.onsuccess = () => resolve();
            rq.onerror = () => reject(rq.error);
        });
    }

    // ── Snapshot isi terakhir yang SUDAH dikirim ke cloud, per baris
    //    (dipakai buat tahu baris mana yang berubah = perlu dikirim lagi) ──
    let pushSnapshot = null; // Map: sync_id -> JSON string (tanpa updated_at)
    async function loadPushSnapshot() {
        if (pushSnapshot) return pushSnapshot;
        const saved = await metaGet('pushSnapshot');
        pushSnapshot = new Map(saved ? Object.entries(saved) : []);
        return pushSnapshot;
    }
    async function persistPushSnapshot() {
        const obj = {};
        pushSnapshot.forEach((v, k) => { obj[k] = v; });
        await metaSet('pushSnapshot', obj);
    }

    // ── Konversi bentuk baris lokal <-> baris tabel Supabase ──
    function num(v) { return (v === '' || v === null || v === undefined || isNaN(v)) ? null : Number(v); }

    function rowSyncId(r) {
        if (!r._syncId) r._syncId = uuid(); // baris lama/legacy yang belum punya syncId, dikasih sekali di sini
        return r._syncId;
    }

    // ================================================================
    // PERBAIKAN BUG: pastikan SEMUA baris di salesData sudah punya
    // _syncId SEBELUM disimpan/dikirim. Mengembalikan true kalau ada
    // baris yang baru saja diberi ID (artinya perlu di-persist).
    // ================================================================
    function ensureAllRowsHaveSyncId() {
        if (!Array.isArray(salesData)) return false;
        let changed = false;
        salesData.forEach(r => {
            if (!r._syncId) { r._syncId = uuid(); changed = true; }
        });
        return changed;
    }

    function toCloudRow(r) {
        return {
            sync_id: rowSyncId(r),
            tanggal: r.Tanggal || null,
            no_faktur: r['No.Faktur'] || null,
            produk: r.Produk || null,
            jumlah: num(r.Jumlah),
            satuan: r.Satuan || null,
            harga_jual: num(r['Harga Jual']),
            disc: num(r.Disc),
            total: num(r.Total),
            sales: r.Sales || null,
            customer: r.Customer || null,
            alamat: r.Alamat || null,
            pembayaran: r.Pembayaran || null,
            harga_beli: num(r['Harga Beli']),
            profit: num(r.Profit),
            is_deleted: false,
            device_id: DEVICE_ID
        };
    }
    function fromCloudRow(c) {
        return {
            _syncId: c.sync_id,
            Tanggal: c.tanggal || '',
            'No.Faktur': c.no_faktur || '',
            Produk: c.produk || '',
            Jumlah: c.jumlah === null ? '' : c.jumlah,
            Satuan: c.satuan || '',
            'Harga Jual': c.harga_jual === null ? '' : c.harga_jual,
            Disc: c.disc === null ? 0 : c.disc,
            Total: c.total === null ? 0 : c.total,
            Sales: c.sales || '',
            Customer: c.customer || '',
            Alamat: c.alamat || '',
            Pembayaran: c.pembayaran || 'Tempo',
            'Harga Beli': c.harga_beli === null ? '' : c.harga_beli,
            Profit: c.profit === null ? '' : c.profit
        };
    }

    // ================================================================
    // PUSH: kirim HANYA baris yang berubah (baru/edit/hapus) ke cloud
    // ================================================================
    async function pushSalesDeltaToCloud() {
        if (!Array.isArray(salesData)) return { sent: 0, deleted: 0 };
        await loadPushSnapshot();

        const currentIds = new Set();
        const toSend = [];
        salesData.forEach(r => {
            const id = rowSyncId(r);
            currentIds.add(id);
            const cloud = toCloudRow(r);
            const json = JSON.stringify(cloud);
            if (pushSnapshot.get(id) !== json) toSend.push({ id, cloud, json });
        });

        // Baris yang ADA di snapshot tapi SUDAH TIDAK ADA di salesData
        // sekarang = dihapus/dipindah ke sampah secara lokal -> kirim
        // tombstone (is_deleted:true) supaya device lain ikut menghapusnya.
        const toDelete = [];
        pushSnapshot.forEach((_, id) => { if (!currentIds.has(id)) toDelete.push(id); });

        let sent = 0, deleted = 0;
        const chunks = [];
        toSend.forEach(x => chunks.push(x.cloud));
        toDelete.forEach(id => chunks.push({ sync_id: id, is_deleted: true, device_id: DEVICE_ID }));

        for (let i = 0; i < chunks.length; i += 500) {
            const batch = chunks.slice(i, i + 500);
            const resp = await fetch(REST + '/sales?on_conflict=sync_id', {
                method: 'POST',
                headers: supaHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                body: JSON.stringify(batch)
            });
            if (!resp.ok) {
                const t = await resp.text().catch(() => '');
                throw new Error('Push ke cloud gagal (' + resp.status + '): ' + t);
            }
        }

        toSend.forEach(x => { pushSnapshot.set(x.id, x.json); sent++; });
        toDelete.forEach(id => { pushSnapshot.delete(id); deleted++; });
        await persistPushSnapshot();
        return { sent, deleted };
    }

    // ================================================================
    // PULL: tarik HANYA baris yang berubah di cloud sejak sync terakhir
    // ================================================================
    async function pullSalesFromCloud() {
        if (!Array.isArray(salesData)) return { pulled: 0 };
        const lastPull = (await metaGet('lastPull')) || '1970-01-01T00:00:00Z';

        // Catatan: kalau tabel `sales` di Supabase pernah kena bug duplikasi
        // versi lama, jumlah baris sejak 1970 bisa sangat besar untuk device
        // baru (lastPull kosong). Supaya UI tidak "Tidak ada data" berlama-
        // lama sampai SEMUA halaman selesai ditarik, kita:
        //   1) render tabel setelah SETIAP halaman (bukan cuma di akhir), dan
        //   2) checkpoint lastPull per halaman ke pageMaxSeen -- kalau
        //      koneksi putus di tengah, pull berikutnya lanjut dari sana,
        //      tidak mengulang dari 1970 lagi.
        let offset = 0;
        let maxSeen = lastPull;
        let pulled = 0;
        const byId = new Map(salesData.map(r => [rowSyncId(r), r]));
        await loadPushSnapshot();

        for (;;) {
            const url = REST + '/sales?select=*&updated_at=gt.' + encodeURIComponent(lastPull) +
                '&order=updated_at.asc,sync_id.asc&limit=' + PAGE_SIZE + '&offset=' + offset;
            let resp;
            try {
                resp = await fetch(url, { headers: supaHeaders() });
            } catch (e) {
                // Gagal jaringan di tengah halaman ke-N: simpan progres yang
                // sudah didapat sejauh ini, jangan lempar sampai membatalkan
                // semuanya (biar tidak mulai dari 1970 lagi di percobaan berikutnya).
                // PENTING: checkpoint lastPull HANYA boleh maju kalau data yang
                // sudah ditarik juga BENAR-BENAR sudah tersimpan ke lokal --
                // kalau tidak, data itu akan "hilang" (checkpoint bilang sudah
                // diambil, padahal belum tersimpan permanen).
                if (maxSeen !== lastPull) {
                    if (typeof saveSalesData === 'function') {
                        try { await saveSalesData(); } catch (e2) { console.warn('[sync-supabase] gagal simpan data parsial ke lokal:', e2); }
                    }
                    await metaSet('lastPull', maxSeen);
                }
                await persistPushSnapshot();
                throw e;
            }
            if (!resp.ok) {
                const t = await resp.text().catch(() => '');
                if (maxSeen !== lastPull) {
                    if (typeof saveSalesData === 'function') {
                        try { await saveSalesData(); } catch (e2) { console.warn('[sync-supabase] gagal simpan data parsial ke lokal:', e2); }
                    }
                    await metaSet('lastPull', maxSeen);
                }
                await persistPushSnapshot();
                throw new Error('Pull dari cloud gagal (' + resp.status + '): ' + t);
            }
            const rows = await resp.json();
            if (!rows.length) break;

            rows.forEach(c => {
                if (c.updated_at && c.updated_at > maxSeen) maxSeen = c.updated_at;
                const existing = byId.get(c.sync_id);
                if (c.is_deleted) {
                    if (existing) {
                        const idx = salesData.indexOf(existing);
                        if (idx !== -1) salesData.splice(idx, 1);
                        byId.delete(c.sync_id);
                    }
                    pushSnapshot.delete(c.sync_id);
                } else if (existing) {
                    Object.assign(existing, fromCloudRow(c)); // update di tempat (jaga identitas objek)
                    pushSnapshot.set(c.sync_id, JSON.stringify(toCloudRow(existing)));
                } else {
                    const baru = fromCloudRow(c);
                    salesData.push(baru);
                    byId.set(c.sync_id, baru);
                    pushSnapshot.set(c.sync_id, JSON.stringify(toCloudRow(baru)));
                }
                pulled++;
            });

            // Render progresif: begitu 1 halaman (maks 1000 baris) selesai
            // diproses, langsung tampilkan ke tabel supaya user tidak melihat
            // "Tidak ada data" selagi masih menarik halaman-halaman berikutnya.
            if (typeof renderSales === 'function') {
                try { renderSales(); } catch (e) { /* abaikan error render sementara */ }
            }
            // PENTING: simpan ke lokal per halaman juga (bukan cuma di akhir),
            // supaya kalau tab ditutup/koneksi putus di tengah, data yang
            // sudah masuk tidak hilang begitu saja.
            if (typeof saveSalesData === 'function') {
                try { await saveSalesData(); } catch (e) { console.warn('[sync-supabase] gagal simpan progres ke lokal:', e); }
            }
            setBadge('syncing', '🔄 Sinkronisasi... (' + pulled + ' baris)');

            if (rows.length < PAGE_SIZE) break;
            offset += PAGE_SIZE;
        }

        if (maxSeen !== lastPull) await metaSet('lastPull', maxSeen);
        await persistPushSnapshot();
        return { pulled };
    }

    // ================================================================
    // STATUS BADGE KECIL (pojok kanan bawah) + tombol "Sync Sekarang"
    // ================================================================
    function ensureBadge() {
        let el = document.getElementById('gmCloudSyncBadge');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'gmCloudSyncBadge';
        el.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:99999;' +
            'font-family:system-ui,sans-serif;font-size:12.5px;padding:8px 14px;' +
            'border-radius:20px;box-shadow:0 2px 10px rgba(0,0,0,.18);cursor:pointer;' +
            'background:#e5e7eb;color:#374151;transition:background .2s,color .2s;user-select:none;';
        el.textContent = '🔄 Sync';
        document.body.appendChild(el);
        el.addEventListener('click', () => runFullSync(true));
        return el;
    }
    function setBadge(state, text) {
        const el = ensureBadge();
        const styles = {
            idle: ['#e5e7eb', '#374151'],
            syncing: ['#fef3c7', '#92400e'],
            ok: ['#d1fae5', '#065f46'],
            error: ['#fee2e2', '#991b1b'],
            offline: ['#e5e7eb', '#6b7280']
        }[state] || ['#e5e7eb', '#374151'];
        el.style.background = styles[0];
        el.style.color = styles[1];
        el.textContent = text;
    }

    let syncing = false;
    async function runFullSync(manual) {
        if (syncing) return;
        if (!navigator.onLine) { setBadge('offline', '📴 Offline — pakai data lokal'); return; }
        syncing = true;
        setBadge('syncing', '🔄 Sinkronisasi...');
        try {
            const pullRes = await pullSalesFromCloud();
            // PENTING: baris yang baru ditarik dari cloud tadi baru ada di memori
            // (variabel salesData). Kalau tidak ditulis ke IndexedDB lokal (db.sales)
            // di sini, begitu halaman di-refresh datanya akan hilang lagi -- padahal
            // "penanda terakhir sync" (lastPull) sudah kadung maju, jadi pull
            // berikutnya tidak akan menariknya ulang. Simpan ke lokal supaya persist.
            if (pullRes.pulled > 0 && typeof saveSalesData === 'function') {
                try { await saveSalesData(); }
                catch (e) { console.warn('[sync-supabase] gagal simpan hasil pull ke lokal:', e); }
            }
            if (typeof rebuildSalesFilterOptions === 'function') rebuildSalesFilterOptions();
            if (typeof renderSales === 'function') renderSales();
            const pushRes = await pushSalesDeltaToCloud();
            const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            setBadge('ok', '☁️ Sinkron · ' + now);
            if (manual && typeof showToast === 'function') {
                showToast('✅ Sync selesai. Ambil ' + pullRes.pulled + ', kirim ' + pushRes.sent + ' baris.', 'success');
            }
        } catch (e) {
            console.warn('[sync-supabase] gagal:', e);
            setBadge('error', '⚠️ Sync gagal (data lokal aman)');
            if (manual && typeof showToast === 'function') {
                showToast('⚠️ Sync ke cloud gagal: ' + e.message, 'warning');
            }
        } finally {
            syncing = false;
        }
    }

    window.addEventListener('online', () => runFullSync(false));
    window.addEventListener('offline', () => setBadge('offline', '📴 Offline — pakai data lokal'));

    // ── AUTO-SYNC BERKALA ────────────────────────────────────────────
    // Supaya data Bank Data Penjualan selalu segar tanpa perlu klik
    // refresh manual — device lain akan otomatis "terlihat" perubahan
    // dalam waktu maksimal 20 detik, walau tidak ada aksi save/refresh.
    setInterval(() => runFullSync(false), 20000);

    // ── PERINGATAN SEBELUM MENUTUP TAB SAAT SYNC MASIH BERJALAN ─────
    // Mencegah user pindah komputer / tutup tab tepat saat proses
    // kirim data ke cloud belum selesai (supaya tidak ada data yang
    // "tanggung" cuma tersimpan lokal tapi belum sempat terkirim).
    window.addEventListener('beforeunload', function (e) {
        if (syncing) {
            e.preventDefault();
            e.returnValue = 'Data sedang disinkronkan ke cloud. Mohon tunggu sebentar sebelum menutup halaman.';
            return e.returnValue;
        }
    });

    // ================================================================
    // PASANG KE FUNGSI YANG SUDAH ADA (tanpa ubah file utama)
    // ================================================================
    function wireUp() {
        if (typeof saveSalesData !== 'function' || typeof loadSalesData !== 'function') {
            // Script utama belum siap; coba lagi sebentar lagi.
            setTimeout(wireUp, 200);
            return;
        }
        const _origSave = saveSalesData;
        saveSalesData = async function () {
            // ★ PERBAIKAN BUG DUPLIKASI ★
            // Pastikan setiap baris SUDAH punya _syncId SEBELUM disimpan ke
            // penyimpanan lokal (_origSave). Dengan begitu, ID ini ikut
            // tersimpan permanen ke IndexedDB dan TIDAK akan dibuat ulang
            // (yang sebelumnya menyebabkan baris yang sama dikirim sebagai
            // baris "baru" ke Supabase setiap kali halaman dibuka lagi).
            ensureAllRowsHaveSyncId();
            const ok = await _origSave.apply(this, arguments);
            if (ok) {
                try { await pushSalesDeltaToCloud(); setBadge('ok', '☁️ Tersimpan & sinkron'); }
                catch (e) {
                    console.warn('[sync-supabase] push gagal:', e);
                    setBadge('error', '⚠️ Tersimpan lokal, sync tertunda');
                }
            }
            return ok;
        };

        const _origLoad = loadSalesData;
        loadSalesData = async function () {
            await _origLoad.apply(this, arguments);
            // ★ PERBAIKAN BUG DUPLIKASI (backfill data lama) ★
            // Baris-baris LAMA yang tersimpan dari SEBELUM perbaikan ini
            // dipasang belum punya _syncId sama sekali. Di sini mereka
            // diberi ID satu kali, lalu SEGERA disimpan ke lokal (supaya ID
            // barunya permanen) SEBELUM proses sync (pull/push) berjalan.
            // Tanpa ini, baris lama akan terus-menerus dianggap "baru" dan
            // ikut terduplikasi lagi ke cloud setiap sesi.
            const adaYangBaruDiberiId = ensureAllRowsHaveSyncId();
            if (adaYangBaruDiberiId && typeof saveSalesData === 'function') {
                try { await saveSalesData(); }
                catch (e) { console.warn('[sync-supabase] gagal simpan backfill ID lokal:', e); }
            }
            await runFullSync(false);
        };

        ensureBadge();
        setBadge('idle', '🔄 Menyiapkan sync...');

        // Jangan cuma menunggu loadSalesData()/saveSalesData() dipanggil lagi --
        // di dashboard-kerja.html, loadSalesData() sudah dipanggil sekali oleh
        // startApp() SEBELUM baris ini sempat jalan (race condition), jadi sync
        // otomatis pertama bisa tidak pernah terpicu. Coba sync sendiri di sini.
        runFullSync(false);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        wireUp();
    } else {
        document.addEventListener('DOMContentLoaded', wireUp);
    }
})();
