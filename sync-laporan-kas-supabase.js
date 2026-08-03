/* ================================================================
   GAMAS 2026 — SYNC TAB "LAPORAN KAS" KE SUPABASE (multi-device)
   ================================================================
   Sama seperti sync-per-sales-supabase.js: tab ini isinya sebuah FORM
   (bukan tabel baris-per-baris), jadi seluruh isinya (saldo awal/akhir,
   pemasukan, pengeluaran, piutang/stok/hutang) disimpan sebagai SATU
   baris "snapshot" JSON di Supabase, bukan per-baris.

   Cara kerja:
     - PUSH : setiap kali user selesai edit sebuah card / nilai extra di
              tab Laporan Kas, event 'laporanKasDataChanged' tertangkap
              di sini, lalu seluruh isi form (lewat
              window.__laporanKasTabGetData()) dikirim (upsert) ke
              Supabase.
     - PULL : setiap kali halaman dibuka / tab ini diaktifkan / tiap 20
              detik, file ini cek apakah ada snapshot di cloud yang
              lebih baru dari yang terakhir diterapkan di device ini.
              Kalau ada, data cloud diterapkan ke form lewat
              window.__laporanKasTabSetData(payload).
     - Offline-safe: kalau gagal (device offline / request error), data
       lokal (di layar) tidak diubah/terganggu, cuma sync-nya tertunda.
       CATATAN: form ini TIDAK disimpan ke IndexedDB lokal, hanya di
       DOM + Supabase — jadi kalau device benar-benar offline saat
       pertama kali buka tab ini, form akan kosong (0) sampai online
       lagi dan berhasil pull.

   PENTING — sebelum dipakai, buat dulu tabel di Supabase (SQL Editor).
   Lihat file setup-laporan-kas-supabase.sql yang menyertai file ini.

   Cara pasang: taruh SETELAH sync-supabase.js, SEBELUM </body>:
       <script src="sync-laporan-kas-supabase.js"></script>
   File ini mengandalkan hook global dari tab Laporan Kas:
   window.__laporanKasTabGetData(), window.__laporanKasTabSetData(payload),
   dan event 'laporanKasDataChanged'. showToast (opsional).
================================================================= */
(function () {
    'use strict';

    // ── KONFIGURASI SUPABASE (pakai project yang sama dengan sync-supabase.js) ──
    const SUPABASE_URL = 'https://vrrmpuckjhxkgrcbhezt.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Ba-4bYHy4cOrwMFe7n2ZWw_sUFt7aA0';
    const REST = SUPABASE_URL + '/rest/v1';
    const TABLE = 'laporan_kas_snapshot';
    const ROW_ID = 'main'; // satu snapshot bersama untuk semua device

    function supaHeaders(extra) {
        return Object.assign({
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json'
        }, extra || {});
    }

    const LAST_APPLIED_KEY = 'laporanKasSync_lastAppliedAt';
    let justAppliedRemote = false; // supaya hasil pull tidak langsung ke-push balik

    function getLastApplied() {
        try { return localStorage.getItem(LAST_APPLIED_KEY) || ''; } catch (e) { return ''; }
    }
    function setLastApplied(ts) {
        try { localStorage.setItem(LAST_APPLIED_KEY, ts); } catch (e) {}
    }

    // ================================================================
    // PULL: tarik snapshot terbaru dari cloud (kalau lebih baru dari lokal)
    // ================================================================
    async function pullLaporanKasFromCloud() {
        const url = REST + '/' + TABLE + '?id=eq.' + ROW_ID + '&select=payload,updated_at&limit=1';
        const resp = await fetch(url, { headers: supaHeaders() });
        if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            throw new Error('Pull Laporan Kas gagal (' + resp.status + '): ' + t);
        }
        const rows = await resp.json();
        if (!rows.length) return { applied: false };

        const remote = rows[0];
        const lastApplied = getLastApplied();
        if (lastApplied && remote.updated_at <= lastApplied) {
            return { applied: false }; // data lokal sudah sama/lebih baru
        }

        if (typeof window.__laporanKasTabSetData === 'function') {
            justAppliedRemote = true;
            window.__laporanKasTabSetData(remote.payload || {});
            setLastApplied(remote.updated_at);
            return { applied: true };
        }
        return { applied: false };
    }

    // ================================================================
    // PUSH: kirim seluruh isi form Laporan Kas ke cloud (upsert 1 baris)
    // ================================================================
    async function pushLaporanKasToCloud() {
        if (typeof window.__laporanKasTabGetData !== 'function') return { sent: false };
        const payload = window.__laporanKasTabGetData();
        const now = new Date().toISOString();

        const resp = await fetch(REST + '/' + TABLE + '?on_conflict=id', {
            method: 'POST',
            headers: supaHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify([{ id: ROW_ID, payload: payload, updated_at: now }])
        });
        if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            throw new Error('Push Laporan Kas gagal (' + resp.status + '): ' + t);
        }
        setLastApplied(now);
        return { sent: true };
    }

    // ================================================================
    // ORKESTRASI: pull saat halaman dibuka / tiap 20 detik, push saat
    // ada perubahan lokal (event laporanKasDataChanged)
    // ================================================================
    let busy = false;

    async function runLaporanKasFullSync(manual) {
        if (!navigator.onLine) {
            if (manual && typeof showToast === 'function') {
                showToast('📴 Offline — Laporan Kas belum bisa disinkronkan.', 'warning');
            }
            return;
        }
        if (busy) return;
        busy = true;
        try {
            const res = await pullLaporanKasFromCloud();
            if (res.applied) {
                console.log('[sync-laporan-kas] data cloud diterapkan.');
                if (manual && typeof showToast === 'function') {
                    showToast('☁️ Laporan Kas diperbarui dari cloud.', 'info');
                }
            } else if (manual && typeof showToast === 'function') {
                showToast('☁️ Laporan Kas sudah sinkron.', 'success');
            }
        } catch (e) {
            console.warn('[sync-laporan-kas] sync gagal:', e);
            if (manual && typeof showToast === 'function') {
                showToast('⚠️ Sync Laporan Kas gagal: ' + e.message, 'warning');
            }
        } finally {
            busy = false;
        }
    }
    // Dipakai oleh tombol refresh di tab Laporan Kas (lihat lk_script_scoped.js)
    window.runLaporanKasFullSync = runLaporanKasFullSync;

    async function handleLocalChange() {
        if (justAppliedRemote) {
            // Perubahan ini akibat kita sendiri menerapkan data dari cloud
            // barusan (lewat __laporanKasTabSetData), bukan edit baru dari
            // user -> jangan langsung dikirim balik ke cloud.
            justAppliedRemote = false;
            return;
        }
        if (!navigator.onLine) return;
        try {
            await pushLaporanKasToCloud();
            console.log('[sync-laporan-kas] terkirim ke cloud.');
        } catch (e) {
            console.warn('[sync-laporan-kas] push gagal (data di layar tetap aman):', e);
            if (typeof showToast === 'function') {
                showToast('⚠️ Sync Laporan Kas ke cloud gagal, data di layar tetap aman.', 'warning');
            }
        }
    }

    window.addEventListener('laporanKasDataChanged', handleLocalChange);
    window.addEventListener('online', () => runLaporanKasFullSync(false));

    // ── AUTO-SYNC BERKALA ───────────────────────────────
    // Tab Laporan Kas dicek ulang ke cloud tiap 20 detik, supaya
    // komputer lain ikut melihat perubahan terbaru tanpa perlu refresh.
    setInterval(() => runLaporanKasFullSync(false), 20000);

    // ── PERINGATAN SEBELUM MENUTUP TAB SAAT SYNC MASIH BERJALAN ─────
    window.addEventListener('beforeunload', function (e) {
        if (busy) {
            e.preventDefault();
            e.returnValue = 'Laporan Kas sedang disinkronkan ke cloud. Mohon tunggu sebentar sebelum menutup halaman.';
            return e.returnValue;
        }
    });

    function waitAndPull() {
        if (typeof window.__laporanKasTabGetData !== 'function' || typeof window.__laporanKasTabSetData !== 'function') {
            setTimeout(waitAndPull, 200);
            return;
        }
        runLaporanKasFullSync(false);
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        waitAndPull();
    } else {
        document.addEventListener('DOMContentLoaded', waitAndPull);
    }
})();
