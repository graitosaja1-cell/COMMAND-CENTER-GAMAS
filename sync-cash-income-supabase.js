/* ================================================================
   GAMAS 2026 — SYNC "DATA UANG MASUK" (db.cashIncome) KE SUPABASE
   ================================================================
   Ini pelengkap dari sync-supabase.js (yang sinkron Bank Data Penjualan /
   db.sales) dan sync-per-sales-supabase.js (yang sinkron tab Per Sales).
   Tanpa file ini, db.cashIncome HANYA tersimpan lokal per device, jadi
   "Piutang Tempo" & "Cash Dropping" di dashboard-laporan.html selalu 0
   walau Bank Data Penjualan sudah sync — karena keduanya dihitung dari
   gabungan db.sales + db.cashIncome.

   Bentuk data db.cashIncome: 1 dokumen per BULAN, contoh
     { id, bulan: '2026-07', data: [ {tanggal:'25-07', ...}, ... ], tanggal }
   Jadi sync-nya per-bulan (bukan per-baris seperti sales, bukan juga satu
   snapshot tunggal seperti Per Sales) — tiap bulan = 1 baris di Supabase,
   di-upsert berdasarkan kolom `bulan`.

   Cara kerja:
     - PUSH : setiap kali saveCashData() dipanggil (dan juga tiap kali
               runFullSync jalan), file ini membandingkan isi SEMUA bulan
               di db.cashIncome dengan snapshot terakhir yang sudah
               dikirim; hanya bulan yang isinya berubah yang dikirim ulang.
               PENTING: sebelum dikirim, data bulan tsb SELALU digabung
               dulu per-hari dengan versi TERBARU di cloud (bukan sekadar
               menimpa satu dokumen bulan penuh) — supaya device yang baru
               online lagi setelah lama offline TIDAK menghapus/menimpa
               hari-hari yang sudah ditambahkan device lain sementara ia
               offline. Hasil gabungan ini juga ditulis balik ke lokal.
     - PULL : setiap kali halaman dibuka (loadCashData() dipanggil), file
               ini menarik bulan-bulan yang berubah di cloud sejak sync
               terakhir (pakai updated_at), lalu menuliskannya ke
               db.cashIncome LOKAL (supaya persist walau di-refresh) dan
               ke cashDataMap (supaya langsung tampil tanpa perlu pindah
               tab).
     - Offline-safe: gagal push/pull di-catch, data lokal tidak terganggu.

   PENTING — sebelum dipakai, buat dulu tabel di Supabase (SQL Editor):
   lihat file setup-cash-income-supabase.sql yang menyertai file ini.

   Cara pasang: taruh SETELAH sync-supabase.js, SEBELUM </body>, di KEDUA
   file dashboard-kerja.html dan dashboard-laporan.html:
       <script src="sync-supabase.js"></script>
       <script src="sync-cash-income-supabase.js"></script>
   File ini mengandalkan variabel/fungsi global dari script utama:
   db (IndexedDB wrapper dengan db.cashIncome), cashDataMap, cashBulan,
   saveCashData, loadCashData, showToast (opsional), renderPemasukan
   (opsional), ptRefresh (opsional), refreshPiutangUangMasuk (opsional).
================================================================= */
(function () {
    'use strict';

    // ── KONFIGURASI SUPABASE (project sama dengan sync-supabase.js) ──
    const SUPABASE_URL = 'https://vrrmpuckjhxkgrcbhezt.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Ba-4bYHy4cOrwMFe7n2ZWw_sUFt7aA0';
    const REST = SUPABASE_URL + '/rest/v1';
    const TABLE = 'cash_income';

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

    // ── IndexedDB kecil KHUSUS bookkeeping sync cash income (terpisah
    //    dari DB app utama) ──
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
    const LASTPULL_KEY = 'cashIncome_lastPull';
    const SNAPSHOT_KEY = 'cashIncome_pushSnapshot';

    // ── Snapshot isi terakhir yang SUDAH dikirim ke cloud, per bulan
    //    (dipakai buat tahu bulan mana yang berubah = perlu dikirim lagi).
    //    Sengaja TIDAK ikut membandingkan device_id/updated_at, supaya
    //    pull dari device lain tidak dianggap "berubah" dan dikirim balik
    //    tanpa perlu. ──
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

    // ── Ambil versi TERBARU satu bulan langsung dari cloud (bukan dari
    //    cache/snapshot lokal), dipakai untuk merge sebelum push supaya
    //    tidak menimpa hari-hari yang sudah ditambahkan device lain. ──
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
    //    hilang: kalau tanggal yang sama ada di keduanya, versi LOKAL yang
    //    dipakai (asumsi: perubahan lokal yang sedang mau dikirim ini
    //    lebih baru/lebih diniatkan oleh user); kalau suatu tanggal cuma
    //    ada di cloud (misal ditambahkan device lain yang belum sempat
    //    ditarik device ini), tetap DIPERTAHANKAN, tidak ikut terhapus. ──
    function mergeHariByTanggal(localData, cloudData) {
        const map = new Map();
        (cloudData || []).forEach(hari => { if (hari && hari.tanggal) map.set(hari.tanggal, hari); });
        (localData || []).forEach(hari => { if (hari && hari.tanggal) map.set(hari.tanggal, hari); });
        // Urutkan berdasarkan tanggal supaya tampilannya rapi (format 'DD-MM').
        return Array.from(map.values()).sort((a, b) => {
            const ka = (a.tanggal || '').split('-').reverse().join('-');
            const kb = (b.tanggal || '').split('-').reverse().join('-');
            return ka.localeCompare(kb);
        });
    }

    // ================================================================
    // PUSH: kirim HANYA bulan yang isinya berubah ke cloud — SELALU
    // digabung dulu dengan versi cloud terbaru per-hari, supaya push
    // dari device yang datanya belum lengkap (misal baru online lagi
    // setelah lama offline) TIDAK menimpa/menghapus hari-hari yang sudah
    // ditambahkan device lain.
    // ================================================================
    async function pushCashDeltaToCloud() {
        if (!db || !db.cashIncome) return { sent: 0 };
        await loadPushSnapshot();

        const localRecords = await db.cashIncome.toArray();
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
            catch (e) { console.warn('[sync-cash-income] gagal ambil versi cloud, skip merge utk bulan ' + r.bulan + ':', e); continue; }

            const gabungan = mergeHariByTanggal(r.data, cloudData);

            const resp = await fetch(REST + '/' + TABLE + '?on_conflict=bulan', {
                method: 'POST',
                headers: supaHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
                body: JSON.stringify([{ bulan: r.bulan, data: gabungan, device_id: DEVICE_ID }])
            });
            if (!resp.ok) {
                const t = await resp.text().catch(() => '');
                throw new Error('Push cash income ke cloud gagal (' + resp.status + '): ' + t);
            }

            // Simpan HASIL GABUNGAN ini juga ke lokal (bukan cuma cloud),
            // supaya device ini pun tidak "lupa" hari-hari yang tadinya
            // cuma ada di cloud, dan supaya cashDataMap ikut terupdate.
            await db.cashIncome.update(r.id, { data: gabungan, tanggal: new Date().toISOString() });
            if (typeof cashDataMap === 'object' && cashDataMap) cashDataMap[r.bulan] = gabungan;

            pushSnapshot.set(r.bulan, snapshotBody(r.bulan, gabungan));
            dikirim.push(r.bulan);
        }
        await persistPushSnapshot();
        try { if (typeof _cashAllCacheTime !== 'undefined') _cashAllCacheTime = 0; } catch (e) {}
        return { sent: dikirim.length, bulans: dikirim };
    }

    // ================================================================
    // PULL: tarik bulan yang berubah di cloud sejak sync terakhir, lalu
    // tuliskan ke db.cashIncome LOKAL + cashDataMap (kalau ada)
    // ================================================================
    async function pullCashFromCloud() {
        if (!db || !db.cashIncome) return { pulled: 0 };
        const lastPull = (await metaGet(LASTPULL_KEY)) || '1970-01-01T00:00:00Z';
        await loadPushSnapshot();

        const url = REST + '/' + TABLE + '?select=*&updated_at=gt.' + encodeURIComponent(lastPull) +
            '&order=updated_at.asc';
        const resp = await fetch(url, { headers: supaHeaders() });
        if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            throw new Error('Pull cash income dari cloud gagal (' + resp.status + '): ' + t);
        }
        const rows = await resp.json();
        if (!rows.length) return { pulled: 0 };

        let maxSeen = lastPull;
        const bulanBerubah = [];
        for (const c of rows) {
            if (c.updated_at && c.updated_at > maxSeen) maxSeen = c.updated_at;
            const data = Array.isArray(c.data) ? c.data : [];

            const existing = await db.cashIncome.where('bulan').equals(c.bulan).first();
            if (existing) {
                await db.cashIncome.update(existing.id, { data: data, tanggal: new Date().toISOString() });
            } else {
                await db.cashIncome.add({ bulan: c.bulan, data: data, tanggal: new Date().toISOString() });
            }

            if (typeof cashDataMap === 'object' && cashDataMap) cashDataMap[c.bulan] = data;
            pushSnapshot.set(c.bulan, snapshotBody(c.bulan, data));
            bulanBerubah.push(c.bulan);
        }

        if (maxSeen !== lastPull) await metaSet(LASTPULL_KEY, maxSeen);
        await persistPushSnapshot();

        // Cache 30-detik di script utama (ambilSemuaCashIncomeCached) harus
        // dianggap basi sekarang, supaya tab yang lagi dibuka tidak baca
        // data lama dari memori.
        try { if (typeof _cashAllCacheTime !== 'undefined') _cashAllCacheTime = 0; } catch (e) {}

        return { pulled: rows.length, bulans: bulanBerubah };
    }

    // ================================================================
    // ORKESTRASI: pull lalu push, dipanggil saat halaman dibuka & saat
    // ada perubahan lokal (lewat saveCashData)
    // ================================================================
    let syncing = false;
    async function runCashFullSync(manual) {
        if (syncing) return;
        if (!navigator.onLine) return;
        syncing = true;
        try {
            const pullRes = await pullCashFromCloud();
            if (pullRes.pulled > 0) {
                console.log('[sync-cash-income] ditarik dari cloud: ' + pullRes.bulans.join(', '));
                if (typeof renderPemasukan === 'function') { try { renderPemasukan(); } catch (e) {} }
                if (typeof refreshPiutangUangMasuk === 'function') { try { refreshPiutangUangMasuk(); } catch (e) {} }
                if (typeof ptRefresh === 'function') { try { await ptRefresh(false); } catch (e) {} }
                if (manual && typeof showToast === 'function') {
                    showToast('☁️ Data Uang Masuk diperbarui dari cloud (' + pullRes.bulans.length + ' bulan).', 'info');
                }
            }
            const pushRes = await pushCashDeltaToCloud();
            if (pushRes.sent > 0) {
                console.log('[sync-cash-income] dikirim ke cloud (tergabung per-hari): ' + pushRes.bulans.join(', '));
                if (typeof renderPemasukan === 'function') { try { renderPemasukan(); } catch (e) {} }
                if (typeof refreshPiutangUangMasuk === 'function') { try { refreshPiutangUangMasuk(); } catch (e) {} }
            }
            if (manual && typeof showToast === 'function' && pullRes.pulled === 0 && pushRes.sent === 0) {
                showToast('☁️ Data Uang Masuk sudah sinkron.', 'success');
            }
        } catch (e) {
            console.warn('[sync-cash-income] gagal:', e);
            if (manual && typeof showToast === 'function') {
                showToast('⚠️ Sync Data Uang Masuk gagal: ' + e.message, 'warning');
            }
        } finally {
            syncing = false;
        }
    }

    window.addEventListener('online', () => runCashFullSync(false));

    // ── AUTO-SYNC BERKALA ────────────────────────────────────────────
    // Data Uang Masuk otomatis dicek ulang tiap 20 detik, supaya
    // komputer lain ikut melihat perubahan tanpa perlu refresh manual.
    setInterval(() => runCashFullSync(false), 20000);

    // ── PERINGATAN SEBELUM MENUTUP TAB SAAT SYNC MASIH BERJALAN ─────
    window.addEventListener('beforeunload', function (e) {
        if (syncing) {
            e.preventDefault();
            e.returnValue = 'Data Uang Masuk sedang disinkronkan ke cloud. Mohon tunggu sebentar sebelum menutup halaman.';
            return e.returnValue;
        }
    });

    // ================================================================
    // PASANG KE FUNGSI YANG SUDAH ADA (tanpa ubah file utama)
    // ================================================================
    function wireUp() {
        if (typeof saveCashData !== 'function' || typeof loadCashData !== 'function') {
            setTimeout(wireUp, 200);
            return;
        }

        const _origSave = saveCashData;
        saveCashData = async function () {
            const result = await _origSave.apply(this, arguments);
            try { await pushCashDeltaToCloud(); }
            catch (e) { console.warn('[sync-cash-income] push gagal setelah saveCashData:', e); }
            return result;
        };

        const _origLoad = loadCashData;
        loadCashData = async function () {
            const result = await _origLoad.apply(this, arguments);
            runCashFullSync(false); // tidak perlu await, biar tidak memperlambat render awal
            return result;
        };

        // Jalankan sync pertama di sini juga, mengantisipasi loadCashData()
        // sudah kadung dipanggil sebelum baris ini sempat jalan (race
        // condition), sama seperti pola di sync-supabase.js.
        runCashFullSync(false);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        wireUp();
    } else {
        document.addEventListener('DOMContentLoaded', wireUp);
    }
})();
