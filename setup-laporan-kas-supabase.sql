-- ================================================================
-- GAMAS 2026 — Setup tabel Supabase untuk tab "Laporan Kas"
-- Jalankan sekali di Supabase SQL Editor (project yang sama dengan
-- tabel lain: per_sales_snapshot, cash_income, dst).
-- ================================================================

create table if not exists laporan_kas_snapshot (
  id text primary key default 'main',
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table laporan_kas_snapshot enable row level security;

create policy "laporan_kas_snapshot_all" on laporan_kas_snapshot
  for all using (true) with check (true);

-- Catatan: policy di atas mengizinkan semua akses (sama seperti
-- per_sales_snapshot). Kalau tabel lain di project ini sudah pakai
-- policy yang lebih ketat/auth, sesuaikan policy ini juga supaya
-- konsisten.
