-- ================================================================
-- GAMAS 2026 — Setup tabel Supabase untuk tab "Laporan Kas"
-- VERSI 2: sekarang tersimpan PER BULAN (kolom `bulan`), bukan satu
-- snapshot tunggal seperti versi sebelumnya.
-- ================================================================

-- Kalau sebelumnya SUDAH pernah menjalankan versi SQL yang LAMA (yang
-- bikin tabel dengan kolom `id text primary key default 'main'`),
-- jalankan dulu baris DROP ini supaya bisa dibuat ulang dengan skema
-- baru. Aman dijalankan walau tabelnya belum pernah dibuat sama
-- sekali — tidak akan error.
drop table if exists laporan_kas_snapshot;

create table if not exists laporan_kas_snapshot (
  bulan text primary key,        -- format 'YYYY-MM', mis. '2026-08'
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table laporan_kas_snapshot enable row level security;

create policy "laporan_kas_snapshot_all" on laporan_kas_snapshot
  for all using (true) with check (true);

-- Catatan: policy di atas mengizinkan semua akses (sama seperti
-- per_sales_snapshot / cash_income). Kalau tabel lain di project ini
-- sudah pakai policy yang lebih ketat/auth, sesuaikan policy ini juga
-- supaya konsisten.
