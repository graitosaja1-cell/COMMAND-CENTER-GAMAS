/* ================================================================
   GAMAS 2026 — SYNC TAB "SALES / PER SALES" KE SUPABASE (multi-device)
   ================================================================
   Beda dengan sync-supabase.js (yang sinkron tabel Bank Data Penjualan
   utama baris-per-baris), tab "Per Sales" ini sifatnya UPLOAD FILE UTUH
   (setiap upload = replace semua data), jadi cara sync-nya lebih simpel:
   seluruh isi tab ini (allData + headers + nama file) disimpan sebagai
   SATU baris "snapshot" di Supabase, bukan per-baris.

   Cara kerja:
     - PUSH : setiap kali ada perubahan lokal (upload file baru / hapus
              data) di tab Per Sales, event 'perSalesDataChanged' akan
              tertangkap di sini, lalu seluruh data dikirim (upsert) ke
              tabel Supabase.
     - PULL : setiap kali halaman dibuka, file ini cek apakah ada
              snapshot di cloud yang lebih baru dari yang terakhir kita
              terapkan di device ini. Kalau ada (lebih baru / device ini
              belum pernah punya data), data cloud diterapkan ke tab ini.
     - Offline-safe: kalau gagal (device offline / request error), data
       lokal tidak diubah/terganggu, cuma sync-nya tertunda.

   PENTING — sebelum dipakai, buat dulu tabel di Supabase (SQL Editor):

     create table if not exists per_sales_snapshot (
       id text primary key default 'main',
       payload jsonb not null,
       updated_at timestamptz not null default now()
     );

     alter table per_sales_snapshot enable row level security;
     create policy "per_sales_snapshot_all" on per_sales_snapshot
       for all using (true) with check (true);

   (Kalau tabel Bank Data Penjualan utama pakai policy yang lebih ketat/
   auth, sesuaikan policy di atas juga supaya konsisten.)

   Cara pasang: taruh SETELAH sync-supabase.js, SEBELUM </body>:
       <script src="sync-per-sales-supabase.js"></script>
   File ini mengandalkan hook global dari tab Sales/Per Sales:
   window.__perSalesTabGetData(), window.__perSalesTabSetData(payload),
   dan event 'perSalesDataChanged'. showToast (opsional).
================================================================= */
(function () {
    'use strict';

    // ── KONFIGURASI SUPABASE (pakai project yang sama dengan sync-supabase.js) ──
    const SUPABASE_URL = 'https://vrrmpuckjhxkgrcbhezt.supabase.co';
    const SUPABASE_KEY = 'sb_publishable_Ba-4bYHy4cOrwMFe7n2ZWw_sUFt7aA0';
    const REST = SUPABASE_URL + '/rest/v1';
    const TABLE = 'per_sales_snapshot';
    const ROW_ID = 'main'; // satu snapshot bersama untuk semua device

    function supaHeaders(extra) {
        return Object.assign({
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json'
        }, extra || {});
    }

    const LAST_APPLIED_KEY = 'perSalesSync_lastAppliedAt';
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
    async function pullPerSalesFromCloud() {
        const url = REST + '/' + TABLE + '?id=eq.' + ROW_ID + '&select=payload,updated_at&limit=1';
        const resp = await fetch(url, { headers: supaHeaders() });
        if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            throw new Error('Pull snapshot Per Sales gagal (' + resp.status + '): ' + t);
        }
        const rows = await resp.json();
        if (!rows.length) return { applied: false };

        const remote = rows[0];
        const lastApplied = getLastApplied();
        if (lastApplied && remote.updated_at <= lastApplied) {
            return { applied: false }; // data lokal sudah sama/lebih baru
        }

        if (typeof window.__perSalesTabSetData === 'function') {
            justAppliedRemote = true;
            window.__perSalesTabSetData(remote.payload || {});
            setLastApplied(remote.updated_at);
            return { applied: true, jumlah: (remote.payload && remote.payload.allData || []).length };
        }
        return { applied: false };
    }

    // ================================================================
    // PUSH: kirim seluruh data tab Per Sales ke cloud (upsert 1 baris)
    // ================================================================
    async function pushPerSalesToCloud() {
        if (typeof window.__perSalesTabGetData !== 'function') return { sent: false };
        const payload = window.__perSalesTabGetData();
        const now = new Date().toISOString();

        const resp = await fetch(REST + '/' + TABLE + '?on_conflict=id', {
            method: 'POST',
            headers: supaHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
            body: JSON.stringify([{ id: ROW_ID, payload: payload, updated_at: now }])
        });
        if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            throw new Error('Push snapshot Per Sales gagal (' + resp.status + '): ' + t);
        }
        setLastApplied(now);
        return { sent: true, jumlah: (payload.allData || []).length };
    }

    // ================================================================
    // ORKESTRASI: pull saat halaman dibuka, push saat ada perubahan lokal
    // ================================================================
    let busy = false;

    async function runInitialPull() {
        if (!navigator.onLine) return;
        if (busy) return;
        busy = true;
        try {
            const res = await pullPerSalesFromCloud();
            if (res.applied) {
                console.log('[sync-per-sales] data cloud diterapkan (' + res.jumlah + ' baris).');
                if (typeof showToast === 'function') {
                    showToast('☁️ Data tab Per Sales diperbarui dari cloud (' + res.jumlah + ' baris).', 'info');
                }
            }
        } catch (e) {
            console.warn('[sync-per-sales] pull gagal:', e);
        } finally {
            busy = false;
        }
    }

    async function handleLocalChange() {
        if (justAppliedRemote) {
            // Perubahan ini akibat kita sendiri menerapkan data dari cloud
            // barusan (lewat loadData di dalam __perSalesTabSetData), bukan
            // edit baru dari user -> jangan langsung dikirim balik ke cloud.
            justAppliedRemote = false;
            return;
        }
        if (!navigator.onLine) return;
        try {
            const res = await pushPerSalesToCloud();
            if (res.sent) {
                console.log('[sync-per-sales] terkirim ke cloud (' + res.jumlah + ' baris).');
            }
        } catch (e) {
            console.warn('[sync-per-sales] push gagal (data lokal tetap aman):', e);
            if (typeof showToast === 'function') {
                showToast('⚠️ Sync tab Per Sales ke cloud gagal, data lokal tetap aman.', 'warning');
            }
        }
    }

    window.addEventListener('perSalesDataChanged', handleLocalChange);
    window.addEventListener('online', runInitialPull);

    // ── AUTO-SYNC BERKALA ───────────────────────────────
    // Tab Per Sales dicek ulang ke cloud tiap 20 detik, supaya
    // komputer lain ikut melihat snapshot terbaru tanpa perlu refresh.
    setInterval(runInitialPull, 20000);

    // ── PERINGATAN SEBELUM MENUTUP TAB SAAT SYNC MASIH BERJALAN ─────
    window.addEventListener('beforeunload', function (e) {
        if (busy) {
            e.preventDefault();
            e.returnValue = 'Data tab Per Sales sedang disinkronkan ke cloud. Mohon tunggu sebentar sebelum menutup halaman.';
            return e.returnValue;
        }
    });

    function waitAndPull() {
        if (typeof window.__perSalesTabGetData !== 'function' || typeof window.__perSalesTabSetData !== 'function') {
            setTimeout(waitAndPull, 200);
            return;
        }
        runInitialPull();
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        waitAndPull();
    } else {
        document.addEventListener('DOMContentLoaded', waitAndPull);
    }
})();