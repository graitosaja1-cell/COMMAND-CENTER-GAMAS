/* ================================================================
   GAMAS 2026 — SYNC "PENGELUARAN" (db.pengeluaran / Kas Kecil) KE SUPABASE
   ================================================================
   Pelengkap dari sync-supabase.js (db.sales), sync-per-sales-supabase.js
   (tab Per Sales), dan sync-cash-income-supabase.js (db.cashIncome).
   Tanpa file ini, db.pengeluaran HANYA tersimpan lokal per device —
   input pengeluaran di 1 device tidak akan pernah terlihat di device lain.

   Bentuk data db.pengeluaran: 1 dokumen per BULAN, sama persis strukturnya
   dengan db.cashIncome:
     { id, bulan: '2026-07', data: [ {tanggal:'2026-07-25', transaksi:[...], ...}, ... ], tanggal }
   Jadi sync-nya per-bulan, 1 baris di Supabase per bulan, di-upsert
   berdasarkan kolom `bulan` — SAMA seperti cash_income.

   Cara kerja (identik dengan sync-cash-income-supabase.js, supaya
   perilakunya konsisten & tidak mengulang bug "device offline menimpa
   data bulan penuh" yang pernah terjadi di cash income):
     - PUSH : bandingkan isi semua bulan lokal dengan snapshot terakhir
              yang sudah dikirim; bulan yang berubah SELALU digabung dulu
              per-hari (union berdasarkan `tanggal`) dengan versi TERBARU
              di cloud sebelum di-upsert — supaya device yang baru online
              lagi setelah lama offline TIDAK menghapus/menimpa hari-hari
              yang sudah ditambahkan device lain. Hasil gabungan ditulis
              balik ke lokal juga.
     - PULL : tarik bulan yang berubah di cloud sejak sync terakhir, tulis
              ke db.pengeluaran lokal + pengeluaranDataMap, lalu render ulang.
     - Offline-safe: gagal push/pull di-catch, data lokal tidak terganggu.

   PENTING — sebelum dipakai, jalankan dulu setup-pengeluaran-supabase.sql
   di Supabase (SQL Editor).

   Cara pasang: taruh SETELAH sync-cash-income-supabase.js, SEBELUM
   </body>, di dashboard-kerja.html (tab Pengeluaran cuma ada di sini):
       <script src="sync-cash-income-supabase.js"></script>
       <script src="sync-pengeluaran-supabase.js"></script>
   File ini mengandalkan variabel/fungsi global dari script utama:
   db (dengan db.pengeluaran), pengeluaranDataMap, pengeluaranBulan,
   savePengeluaranData, loadPengeluaranData, showToast (opsional),
   renderPengeluaran (opsional), pgHitungUlangSaldoBulan (opsional).
================================================================= */
(function () {
    'use strict';

    // ── KONFIGURASI SUPABASE (project sama dengan sync-supabase.js) ──
    const SUPABASE_URL = 'https://vrrmpuckjhxkgrcbhezt.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Ba-4bYHy4cOrwMFe7n2ZWw_sUFt7aA0';
    const REST = SUPABASE_URL + '/rest/v1';
    const TABLE = 'pengeluaran';

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

    // ── IndexedDB kecil KHUSUS bookkeeping sync pengeluaran (terpisah
    //    dari DB app utama, dan terpisah dari bookkeeping cash income) ──
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
    const LASTPULL_KEY = 'pengeluaran_lastPull';
    const SNAPSHOT_KEY = 'pengeluaran_pushSnapshot';

    // ── Snapshot isi terakhir yang SUDAH dikirim ke cloud, per bulan ──
    let pushSnapshot = null; // Map: bulan -> JSON string { bulan, data }
    async function loadPushSnapshot() {
        if (pushSnapshot) return pushSnapshot;
        const saved = await metaGet(SNAPSHOT_KEY);
        pushSnapshot = new Map(saved ? Object.entries(saved) : []);
        return pushSnapshot;
    }
    async function persistPushSnapshot() {
        const obj = {};
        pushSnapshot.forEach((v, k) => { obj[k] = v; });
        await metaSet(SNAPSHOT_KEY, obj);
    }
    function snapshotBody(bulan, data) {
        return JSON.stringify({ bulan: bulan, data: data || [] });
    }

    // ── Ambil versi TERBARU satu bulan langsung dari cloud, dipakai utk
    //    merge sebelum push (supaya tidak menimpa hari yang ditambahkan
    //    device lain sementara device ini offline). ──
    async function fetchCloudRecordByBulan(bulan) {
        const url = REST + '/' + TABLE + '?bulan=eq.' + encodeURIComponent(bulan) + '&select=data&limit=1';
        const resp = await fetch(url, { headers: supaHeaders() });
        if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            throw new Error('Gagal ambil versi cloud utk merge (' + resp.status + '): ' + t);
        }
        const rows = await resp.json();
        return (rows.length && Array.isArray(rows[0].data)) ? rows[0].data : [];
    }

    // ── Gabung dua array "hari" (per tanggal) jadi satu, TIDAK ADA yang
    //    hilang: tanggal yang sama di keduanya -> versi LOKAL yang
    //    dipakai; tanggal yang cuma ada di cloud tetap DIPERTAHANKAN. ──
    function mergeHariByTanggal(localData, cloudData) {
        const map = new Map();
        (cloudData || []).forEach(hari => { if (hari && hari.tanggal) map.set(hari.tanggal, hari); });
        (localData || []).forEach(hari => { if (hari && hari.tanggal) map.set(hari.tanggal, hari); });
        return Array.from(map.values()).sort((a, b) => String(a.tanggal || '').localeCompare(String(b.tanggal || '')));
    }

    // ================================================================
    // PUSH: kirim HANYA bulan yang isinya berubah, selalu digabung dulu
    // per-hari dengan versi cloud terbaru sebelum di-upsert.
    // ================================================================
    async function pushPengeluaranDeltaToCloud() {
        if (!db || !db.pengeluaran) return { sent: 0 };
        await loadPushSnapshot();

        const localRecords = await db.pengeluaran.toArray();
        const kandidat = [];
        localRecords.forEach(r => {
            if (!r || !r.bulan) return;
            const body = snapshotBody(r.bulan, r.data);
            if (pushSnapshot.get(r.bulan) !== body) kandidat.push(r);
        });
        if (!kandidat.length) return { sent: 0 };

        const dikirim = [];
        for (const r of kandidat) {
            let cloudData = [];
            try { cloudData = await fetchCloudRecordByBulan(r.bulan); }
            catch (e) { console.warn('[sync-pengeluaran] gagal ambil versi cloud, skip merge utk bulan ' + r.bulan + ':', e); continue; }

            const gabungan = mergeHariByTanggal(r.data, cloudData);

            const resp = await fetch(REST + '/' + TABLE + '?on_conflict=bulan', {
                method: 'POST',
                headers: supaHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                body: JSON.stringify([{ bulan: r.bulan, data: gabungan, device_id: DEVICE_ID }])
            });
            if (!resp.ok) {
                const t = await resp.text().catch(() => '');
                throw new Error('Push pengeluaran ke cloud gagal (' + resp.status + '): ' + t);
            }

            await db.pengeluaran.update(r.id, { data: gabungan, tanggal: new Date().toISOString() });
            if (typeof pengeluaranDataMap === 'object' && pengeluaranDataMap) pengeluaranDataMap[r.bulan] = gabungan;
            if (typeof pgHitungUlangSaldoBulan === 'function') { try { pgHitungUlangSaldoBulan(r.bulan); } catch (e) {} }

            pushSnapshot.set(r.bulan, snapshotBody(r.bulan, gabungan));
            dikirim.push(r.bulan);
        }
        await persistPushSnapshot();
        return { sent: dikirim.length, bulans: dikirim };
    }

    // ================================================================
    // PULL: tarik bulan yang berubah di cloud sejak sync terakhir
    // ================================================================
    async function pullPengeluaranFromCloud() {
        if (!db || !db.pengeluaran) return { pulled: 0 };
        const lastPull = (await metaGet(LASTPULL_KEY)) || '1970-01-01T00:00:00Z';
        await loadPushSnapshot();

        const url = REST + '/' + TABLE + '?select=*&updated_at=gt.' + encodeURIComponent(lastPull) +
            '&order=updated_at.asc';
        const resp = await fetch(url, { headers: supaHeaders() });
        if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            throw new Error('Pull pengeluaran dari cloud gagal (' + resp.status + '): ' + t);
        }
        const rows = await resp.json();
        if (!rows.length) return { pulled: 0 };

        let maxSeen = lastPull;
        const bulanBerubah = [];
        for (const c of rows) {
            if (c.updated_at && c.updated_at > maxSeen) maxSeen = c.updated_at;
            const data = Array.isArray(c.data) ? c.data : [];

            const existing = await db.pengeluaran.where('bulan').equals(c.bulan).first();
            if (existing) {
                await db.pengeluaran.update(existing.id, { data: data, tanggal: new Date().toISOString() });
            } else {
                await db.pengeluaran.add({ bulan: c.bulan, data: data, tanggal: new Date().toISOString() });
            }

            if (typeof pengeluaranDataMap === 'object' && pengeluaranDataMap) pengeluaranDataMap[c.bulan] = data;
            if (typeof pgHitungUlangSaldoBulan === 'function') { try { pgHitungUlangSaldoBulan(c.bulan); } catch (e) {} }
            pushSnapshot.set(c.bulan, snapshotBody(c.bulan, data));
            bulanBerubah.push(c.bulan);
        }

        if (maxSeen !== lastPull) await metaSet(LASTPULL_KEY, maxSeen);
        await persistPushSnapshot();
        return { pulled: rows.length, bulans: bulanBerubah };
    }

    // ================================================================
    // ORKESTRASI: pull lalu push, dipanggil saat halaman dibuka & saat
    // ada perubahan lokal (lewat savePengeluaranData)
    // ================================================================
    let syncing = false;
    async function runPengeluaranFullSync(manual) {
        if (syncing) return;
        if (!navigator.onLine) return;
        syncing = true;
        try {
            const pullRes = await pullPengeluaranFromCloud();
            if (pullRes.pulled > 0) {
                console.log('[sync-pengeluaran] ditarik dari cloud: ' + pullRes.bulans.join(', '));
                if (typeof renderPengeluaran === 'function') { try { renderPengeluaran(); } catch (e) {} }
                if (manual && typeof showToast === 'function') {
                    showToast('☁️ Data Pengeluaran diperbarui dari cloud (' + pullRes.bulans.length + ' bulan).', 'info');
                }
            }
            const pushRes = await pushPengeluaranDeltaToCloud();
            if (pushRes.sent > 0) {
                console.log('[sync-pengeluaran] dikirim ke cloud (tergabung per-hari): ' + pushRes.bulans.join(', '));
                if (typeof renderPengeluaran === 'function') { try { renderPengeluaran(); } catch (e) {} }
            }
            if (manual && typeof showToast === 'function' && pullRes.pulled === 0 && pushRes.sent === 0) {
                showToast('☁️ Data Pengeluaran sudah sinkron.', 'success');
            }
        } catch (e) {
            console.warn('[sync-pengeluaran] gagal:', e);
            if (manual && typeof showToast === 'function') {
                showToast('⚠️ Sync Data Pengeluaran gagal: ' + e.message, 'warning');
            }
        } finally {
            syncing = false;
        }
    }

    window.addEventListener('online', () => runPengeluaranFullSync(false));

    // ── AUTO-SYNC BERKALA ────────────────────────────────────────────
    // Data Pengeluaran otomatis dicek ulang tiap 20 detik, supaya
    // komputer lain ikut melihat perubahan tanpa perlu refresh manual.
    setInterval(() => runPengeluaranFullSync(false), 20000);

    // ── PERINGATAN SEBELUM MENUTUP TAB SAAT SYNC MASIH BERJALAN ─────
    window.addEventListener('beforeunload', function (e) {
        if (syncing) {
            e.preventDefault();
            e.returnValue = 'Data Pengeluaran sedang disinkronkan ke cloud. Mohon tunggu sebentar sebelum menutup halaman.';
            return e.returnValue;
        }
    });

    // ================================================================
    // PASANG KE FUNGSI YANG SUDAH ADA (tanpa ubah file utama)
    // ================================================================
    function wireUp() {
        if (typeof savePengeluaranData !== 'function' || typeof loadPengeluaranData !== 'function') {
            setTimeout(wireUp, 200);
            return;
        }

        const _origSave = savePengeluaranData;
        savePengeluaranData = async function () {
            const result = await _origSave.apply(this, arguments);
            try { await pushPengeluaranDeltaToCloud(); }
            catch (e) { console.warn('[sync-pengeluaran] push gagal setelah savePengeluaranData:', e); }
            return result;
        };

        const _origLoad = loadPengeluaranData;
        loadPengeluaranData = async function () {
            const result = await _origLoad.apply(this, arguments);
            runPengeluaranFullSync(false);
            return result;
        };

        runPengeluaranFullSync(false);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        wireUp();
    } else {
        document.addEventListener('DOMContentLoaded', wireUp);
    }
})();
