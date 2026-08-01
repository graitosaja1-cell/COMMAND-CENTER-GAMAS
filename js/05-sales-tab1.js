        // FUNGSI SALES (Tab 1)
        // ================================================================
        async function loadSalesData() {
            try {
                const data = await db.sales.toArray();
                // Reset pelacak sinkronisasi setiap kali muat ulang dari server,
                // supaya salesDocIds & salesSyncedSnapshot selalu mencerminkan
                // persis apa yang ada di server SAAT INI (bukan sisa sesi lama).
                salesDocIds = new WeakMap();
                salesSyncedSnapshot = new Map();
                if (data.length > 0) {
                    salesData = data.map(({ id, ...rest }) => {
                        salesDocIds.set(rest, id);
                        salesSyncedSnapshot.set(id, JSON.stringify(rest));
                        return rest;
                    });
                } else { salesData = []; }
                // Urutkan TANGGAL TERTUA dulu. PENTING sejak pindah ke Firestore:
                // Firestore TIDAK menjamin urutan dokumen mengikuti urutan input
                // (beda dengan IndexedDB yang dulu kebetulan berurutan karena
                // auto-increment id). Sort ini di sumber data supaya SEMUA tabel
                // yang memakai salesData (Bank Data Penjualan, Cek Cash, Cek
                // Piutang, dst) otomatis ikut terurut, tidak perlu diurutkan
                // satu-satu di tiap tabel. (Catatan: sort cuma menukar URUTAN
                // elemen array, objek baris & referensinya tetap sama, jadi
                // salesDocIds (WeakMap per-objek) tetap valid setelah sort ini.)
                salesData.sort((a, b) => String(a.Tanggal || '').localeCompare(String(b.Tanggal || '')) ||
                    String(a['No.Faktur'] || '').localeCompare(String(b['No.Faktur'] || '')));
            } catch (e) { console.warn('Gagal muat sales:', e);
                salesData = []; }
        }

        async function saveSalesData() {
            try {
                // INKREMENTAL: hanya baris baru/berubah/dihapus yang dikirim ke
                // server (bukan hapus-semua-lalu-tulis-ulang-semua seperti dulu).
                // Jauh lebih cepat & tidak akan lagi kena error "Transaction too
                // big" karena jumlah operasi per save biasanya jauh di bawah 500,
                // kecuali memang lagi impor banyak baris sekaligus (yang tetap
                // aman karena syncRows() otomatis membaginya jadi beberapa batch).
                await db.sales.syncRows(salesData, salesDocIds, salesSyncedSnapshot);
                filterCache.clear();
                autoBackupSalesToLocalStorage();
                return true;
            } catch (e) {
                showToast('❌ Gagal simpan sales: ' + e.message, 'warning');
                return false;
            }
        }

        // ================================================================
        // DATA SAMPAH (Tab 1 -> Tab 8) & CATATAN PIUTANG (Tab 4)
        // ================================================================
        async function loadTrashData() {
            try { trashData = await db.trash.toArray(); } catch (e) { trashData = []; }
        }

        async function loadPiutangNotes() {
            try {
                const rows = await db.piutangNotes.toArray();
                piutangNotesMap = {};
                rows.forEach(r => { piutangNotesMap[r.noFaktur] = r.catatan || ''; });
            } catch (e) { piutangNotesMap = {}; }
        }

        async function savePiutangNote(noFaktur, catatan) {
            if (!noFaktur) return;
            try {
                const existing = await db.piutangNotes.where('noFaktur').equals(noFaktur).first();
                if (existing) { await db.piutangNotes.update(existing.id, { catatan, updatedAt: new Date().toISOString() }); } else {
                    await db.piutangNotes.add({ noFaktur, catatan, updatedAt: new Date().toISOString() });
                }
                piutangNotesMap[noFaktur] = catatan;
            } catch (e) { showToast('Gagal simpan catatan: ' + e.message, 'warning'); }
        }

        // Tanggal cetak tagihan terakhir per No.Faktur (Tab 4 - kolom TGL CETAK TAGIHAN)
        let cetakTagihanMap = {};

        async function loadCetakTagihanMap() {
            try {
                const rows = await db.cetakTagihanMap.toArray();
                cetakTagihanMap = {};
                rows.forEach(r => { cetakTagihanMap[r.noFaktur] = r.tanggalCetak || ''; });
            } catch (e) { cetakTagihanMap = {}; }
        }

        // ================================================================
        // RIWAYAT CETAK — log SETIAP KALI tombol cetak diklik (bukan cuma
        // menyimpan tanggal terakhir). Setiap klik menambah 1 baris baru
        // ke db.printHistory, lengkap dengan waktu klik, jenis cetakan,
        // ringkasan singkat, DAN detail lengkap (itemsJson) supaya semua
        // faktur/data yang dicetak pada momen itu bisa dibuka & dilihat
        // utuh lagi kapan saja — penting karena menyangkut uang.
        // ================================================================
        let _riwayatCetakRowsCache = [];

        async function catatRiwayatCetak(jenis, detail, itemsDetail) {
            try {
                await db.printHistory.add({
                    waktu: new Date().toISOString(),
                    jenis: jenis || '-',
                    detail: detail || '',
                    itemsJson: itemsDetail ? JSON.stringify(itemsDetail) : ''
                });
            } catch (e) {
                console.warn('Gagal mencatat riwayat cetak:', e);
            }
            try { await renderRiwayatCetak(); } catch (e) {}
            try {
                const c = await db.printHistory.count();
                const el = document.getElementById('sumPrint');
                if (el) el.textContent = c;
            } catch (e) {}
        }

        function fmtWaktuRiwayatCetak(iso) {
            const d = new Date(iso);
            if (isNaN(d.getTime())) return iso || '-';
            const pad = n => String(n).padStart(2, '0');
            return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
                ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        }

        function escHtmlRiwayatCetak(str) {
            return String(str == null ? '-' : str)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        }

        function tombolLihatDetailRiwayatCetak(r) {
            if (!r.itemsJson) return '';
            return `<button type="button" class="btn-lihat-riwayat-cetak" data-id="${r.id}" style="font-size:10px;padding:3px 10px;border:1px solid #1f4e78;background:#eaf1fa;color:#1f4e78;border-radius:4px;cursor:pointer;white-space:nowrap;">🔍 Lihat Detail</button>`;
        }

        async function renderRiwayatCetak() {
            let rows = [];
            try { rows = await db.printHistory.toArray(); } catch (e) { rows = []; }
            rows = (rows || []).slice().sort((a, b) => new Date(b.waktu) - new Date(a.waktu));
            _riwayatCetakRowsCache = rows;

            // --- Tabel lengkap di Tab 8 (Trash & Save) — semua jenis cetakan ---
            const tbody = document.getElementById('riwayatCetakTableBody');
            const countEl = document.getElementById('riwayatCetakCount');
            if (countEl) countEl.textContent = rows.length + ' log';
            if (tbody) {
                if (!rows.length) {
                    tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">🖨️ Belum ada riwayat cetak.</td></tr>';
                } else {
                    tbody.innerHTML = rows.map(r => `
                        <tr>
                            <td>${fmtWaktuRiwayatCetak(r.waktu)}</td>
                            <td>${escHtmlRiwayatCetak(r.jenis)}</td>
                            <td>${escHtmlRiwayatCetak(r.detail)}</td>
                            <td class="text-center">${tombolLihatDetailRiwayatCetak(r)}</td>
                        </tr>
                    `).join('');
                }
            }

            // --- Tabel ringkas di Tab 6 (Cetak Tagihan) — khusus jenis "Cetak Tagihan" ---
            const tgBody = document.getElementById('tagihanRiwayatCetakBody');
            const tgCountEl = document.getElementById('tagihanRiwayatCetakCount');
            if (tgBody) {
                const rowsTagihan = rows.filter(r => r.jenis === 'Cetak Tagihan');
                if (tgCountEl) tgCountEl.textContent = rowsTagihan.length + ' log';
                if (!rowsTagihan.length) {
                    tgBody.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:10px;color:#94a3b8;">Belum ada riwayat cetak.</td></tr>';
                } else {
                    tgBody.innerHTML = rowsTagihan.map(r => `
                        <tr>
                            <td style="padding:5px 10px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">${fmtWaktuRiwayatCetak(r.waktu)}</td>
                            <td style="padding:5px 10px;border-bottom:1px solid #f1f5f9;">${escHtmlRiwayatCetak(r.detail)}</td>
                            <td style="padding:5px 10px;border-bottom:1px solid #f1f5f9;text-align:center;white-space:nowrap;">${tombolLihatDetailRiwayatCetak(r)}</td>
                        </tr>
                    `).join('');
                }
            }
        }

        function cariRiwayatCetakById(id) {
            return _riwayatCetakRowsCache.find(r => String(r.id) === String(id));
        }

        function bukaDetailRiwayatCetak(id) {
            const r = cariRiwayatCetakById(id);
            if (!r || !r.itemsJson) { showToast('Detail lengkap tidak tersedia untuk log ini.', 'warning'); return; }
            let payload;
            try { payload = JSON.parse(r.itemsJson); } catch (e) { showToast('Gagal membaca detail riwayat cetak.', 'warning'); return; }

            document.getElementById('detailModalTitleGlobal').textContent =
                `🖨️ Detail Cetak — ${r.jenis || ''} — ${fmtWaktuRiwayatCetak(r.waktu)}`;

            let bodyHtml = `<div style="font-size:11px;color:#6b7280;margin-bottom:8px;">${escHtmlRiwayatCetak(r.detail)}</div>`;

            if (r.jenis === 'Cetak Tagihan' && Array.isArray(payload.items)) {
                bodyHtml += `<div style="font-size:11px;margin-bottom:6px;"><strong>Tanggal Cetak:</strong> ${escHtmlRiwayatCetak(payload.tanggalCetak)}${payload.catatan ? ' &nbsp;|&nbsp; <strong>Catatan:</strong> ' + escHtmlRiwayatCetak(payload.catatan) : ''}</div>`;
                bodyHtml += `<div style="overflow:auto;max-height:60vh;">
                    <table style="width:100%;border-collapse:collapse;font-size:11px;">
                        <thead>
                            <tr style="background:#e5e7eb;">
                                <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:left;">NO FAKTUR</th>
                                <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:left;">NAMA OUTLET</th>
                                <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:left;">ALAMAT</th>
                                <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:left;">SALES</th>
                                <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:left;">PRODUK</th>
                                <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:left;">TGL NOTA</th>
                                <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:left;">TGL TEMPO</th>
                                <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right;">TAGIHAN</th>
                                <th style="padding:5px 8px;border:1px solid #cbd5e1;text-align:left;">TIPE</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${payload.items.map(it => `
                                <tr>
                                    <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.noFaktur)}</td>
                                    <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.customer)}</td>
                                    <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.alamat)}</td>
                                    <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.sales)}</td>
                                    <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.produk)}</td>
                                    <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.tanggal)}</td>
                                    <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.jt)}</td>
                                    <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${fmtRp(it.total)}</td>
                                    <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.tipe)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background:#f1f3f4;font-weight:700;">
                                <td colspan="7" style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right;">TOTAL</td>
                                <td style="padding:5px 8px;border:1px solid #cbd5e1;text-align:right;">${fmtRp(payload.items.reduce((s,it)=>s+(parseNumber(it.total)||0),0))}</td>
                                <td style="padding:5px 8px;border:1px solid #cbd5e1;"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>`;
            } else if (Array.isArray(payload.piutang) || Array.isArray(payload.cash)) {
                const renderList = (label, list, kolomNominal) => {
                    if (!list || !list.length) return '';
                    return `<div style="font-weight:700;font-size:11px;margin:10px 0 4px;">${label}</div>
                        <div style="overflow:auto;max-height:35vh;">
                        <table style="width:100%;border-collapse:collapse;font-size:11px;">
                            <thead>
                                <tr style="background:#e5e7eb;">
                                    <th style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left;">SALES</th>
                                    <th style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left;">NO FAKTUR</th>
                                    <th style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left;">NAMA TOKO</th>
                                    <th style="padding:4px 8px;border:1px solid #cbd5e1;text-align:right;">${kolomNominal}</th>
                                    <th style="padding:4px 8px;border:1px solid #cbd5e1;text-align:right;">MINYAK CASH</th>
                                    <th style="padding:4px 8px;border:1px solid #cbd5e1;text-align:right;">MINYAK TRANSFER</th>
                                    <th style="padding:4px 8px;border:1px solid #cbd5e1;text-align:right;">RUPA CASH</th>
                                    <th style="padding:4px 8px;border:1px solid #cbd5e1;text-align:right;">RUPA TRANSFER</th>
                                    <th style="padding:4px 8px;border:1px solid #cbd5e1;text-align:left;">KET</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${list.map(it => `
                                    <tr>
                                        <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.sales)}</td>
                                        <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.noFaktur)}</td>
                                        <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.namaToko)}</td>
                                        <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${fmtRp(it.tagihan)}</td>
                                        <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${fmtRp(it.minyakCash)}</td>
                                        <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${fmtRp(it.minyakTransfer)}</td>
                                        <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${fmtRp(it.rupaCash)}</td>
                                        <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${fmtRp(it.rupaTransfer)}</td>
                                        <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escHtmlRiwayatCetak(it.ket)}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        </div>`;
                };
                bodyHtml += `<div style="font-size:11px;margin-bottom:6px;"><strong>Tanggal Harian:</strong> ${escHtmlRiwayatCetak(payload.tanggal)}</div>`;
                bodyHtml += renderList('PIUTANG TEMPO', payload.piutang, 'TAGIHAN');
                bodyHtml += renderList('CASH DROPPING', payload.cash, 'NOMINAL FAKTUR');
            } else {
                bodyHtml += '<div style="font-size:11px;color:#94a3b8;">Tidak ada detail baris untuk log ini.</div>';
            }

            document.getElementById('detailModalBodyGlobal').innerHTML = bodyHtml;
            document.getElementById('detailModalGlobal').classList.add('show');
            setDetailModalStempelLunas(false);
        }

        document.addEventListener('click', function(e) {
            const btn = e.target.closest('.btn-lihat-riwayat-cetak');
            if (btn) bukaDetailRiwayatCetak(btn.dataset.id);
        });

        async function simpanTglCetakTagihan(noFaktur, tanggalCetak) {
            if (!noFaktur) return;
            try {
                const existing = await db.cetakTagihanMap.where('noFaktur').equals(noFaktur).first();
                if (existing) { await db.cetakTagihanMap.update(existing.id, { tanggalCetak, updatedAt: new Date().toISOString() }); } else {
                    await db.cetakTagihanMap.add({ noFaktur, tanggalCetak, updatedAt: new Date().toISOString() });
                }
                cetakTagihanMap[noFaktur] = tanggalCetak;
            } catch (e) { console.warn('Gagal simpan tgl cetak tagihan:', e); }
        }

        async function loadCashNotes() {
            try {
                const rows = await db.cashNotes.toArray();
                cashNotesMap = {};
                rows.forEach(r => { cashNotesMap[r.noFaktur] = r.catatan || ''; });
            } catch (e) { cashNotesMap = {}; }
        }

        async function saveCashNote(noFaktur, catatan) {
            if (!noFaktur) return;
            try {
                const existing = await db.cashNotes.where('noFaktur').equals(noFaktur).first();
                if (existing) { await db.cashNotes.update(existing.id, { catatan, updatedAt: new Date().toISOString() }); } else {
                    await db.cashNotes.add({ noFaktur, catatan, updatedAt: new Date().toISOString() });
                }
                cashNotesMap[noFaktur] = catatan;
            } catch (e) { showToast('Gagal simpan catatan: ' + e.message, 'warning'); }
        }

        async function pindahkanSalesKeSampah(indexList, alasan) {
            const idxs = Array.from(new Set(indexList)).sort((a, b) => b - a);
            const moved = [];
            idxs.forEach(i => {
                const row = salesData[i];
                if (row) {
                    moved.push({ ...row, alasanHapus: alasan || '-', tanggalHapus: new Date().toISOString() });
                    salesData.splice(i, 1);
                }
            });
            if (!moved.length) return 0;
            await saveSalesData();
            await db.trash.bulkAdd(moved);
            await loadTrashData();
            return moved.length;
        }

        async function pulihkanDariSampah(trashId) {
            const item = trashData.find(t => t.id === trashId);
            if (!item) return;
            const { id, alasanHapus, tanggalHapus, ...row } = item;
            salesData.push(row);
            await saveSalesData();
            await db.trash.delete(trashId);
            await loadTrashData();
            rebuildSalesFilterOptions();
            salesCurrentDateIndex = Infinity;
            renderSales();
            renderTrashTable();
            renderRingkasanSaveAll();
            showToast('♻️ Data dipulihkan ke Bank Data Penjualan.', 'success');
        }

        async function hapusPermanenSampah(trashId) {
            if (!confirm('⚠️ Hapus data ini secara PERMANEN dari Data Sampah? Tidak bisa dikembalikan lagi.')) return;
            await db.trash.delete(trashId);
            await loadTrashData();
            renderTrashTable();
            renderRingkasanSaveAll();
            showToast('❌ Data sampah dihapus permanen.', 'warning');
        }

        async function kosongkanSampah() {
            if (!trashData.length) { showToast('Data Sampah sudah kosong.', 'info'); return; }
            if (!confirm(`⚠️ Kosongkan semua ${trashData.length} data di Data Sampah secara PERMANEN? Tidak bisa dikembalikan lagi.`)) return;
            await db.trash.clear();
            await loadTrashData();
            renderTrashTable();
            renderRingkasanSaveAll();
            showToast('🗑️ Data Sampah dikosongkan.', 'warning');
        }

        function getFilteredTrash() {
            const q = trashSearchQuery.trim().toLowerCase();
            let rows = trashData.filter(t => {
                if (trashSalesFilterVal && t.Sales !== trashSalesFilterVal) return false;
                if (trashAlasanFilterVal && (t.alasanHapus || '-') !== trashAlasanFilterVal) return false;
                if (q) {
                    const hay = ((t['No.Faktur'] || '') + ' ' + (t.Customer || '') + ' ' + (t.Sales || '')).toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            });
            rows.sort((a, b) => (b.tanggalHapus || '').localeCompare(a.tanggalHapus || ''));
            return rows;
        }

        function updateTrashFilterOptions() {
            const salesSel = document.getElementById('trashSalesFilter');
            const alasanSel = document.getElementById('trashAlasanFilter');
            if (salesSel) {
                const salesSet = new Set(trashData.map(t => t.Sales).filter(Boolean));
                const cur = salesSel.value;
                salesSel.innerHTML = '<option value="">Semua</option>' +
                    Array.from(salesSet).sort().map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
                if (Array.from(salesSet).includes(cur)) salesSel.value = cur; else trashSalesFilterVal = '';
            }
            if (alasanSel) {
                const alasanSet = new Set(trashData.map(t => t.alasanHapus || '-'));
                const cur = alasanSel.value;
                alasanSel.innerHTML = '<option value="">Semua</option>' +
                    Array.from(alasanSet).sort().map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('');
                if (Array.from(alasanSet).includes(cur)) alasanSel.value = cur; else trashAlasanFilterVal = '';
            }
        }

        function renderTrashTable() {
            const tbody = document.getElementById('trashTableBody');
            if (!tbody) return;

            updateTrashFilterOptions();

            const filtered = getFilteredTrash();
            const totalPages = Math.max(1, Math.ceil(filtered.length / trashRowsPerPage));
            if (trashPage > totalPages) trashPage = totalPages;
            if (trashPage < 1) trashPage = 1;
            const start = (trashPage - 1) * trashRowsPerPage;
            const pageRows = filtered.slice(start, start + trashRowsPerPage);

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="13" class="empty-msg">🗑️ Sampah kosong. Belum ada data yang dibatalkan.</td></tr>';
            } else {
                tbody.innerHTML = pageRows.map(t => {
                    const tglHapus = t.tanggalHapus ? new Date(t.tanggalHapus).toLocaleString('id-ID') : '-';
                    const checked = trashRowsSelected.has(t.id) ? 'checked' : '';
                    return `<tr>
                        <td class="center"><input type="checkbox" class="trash-row-checkbox" data-id="${t.id}" ${checked}></td>
                        <td>${tglHapus}</td>
                        <td>${escapeHtml(t['No.Faktur'] || '')}</td>
                        <td>${escapeHtml(t.Satuan || '')}</td>
                        <td class="num">${fmtRp(t['Harga Jual'] || 0)}</td>
                        <td class="num">${fmtRp(t.Disc || 0)}</td>
                        <td class="num">${fmtRp(t.Total || 0)}</td>
                        <td>${escapeHtml(t.Sales || '')}</td>
                        <td>${escapeHtml(t.Customer || '')}</td>
                        <td>${escapeHtml(t.Alamat || '')}</td>
                        <td>${escapeHtml(t.Pembayaran || '')}</td>
                        <td>${escapeHtml(t.alasanHapus || '-')}</td>
                        <td>
                            <button class="btn-restore trash-restore-btn" data-id="${t.id}">♻️</button>
                            <button class="btn-delete trash-delete-btn" data-id="${t.id}">❌</button>
                        </td>
                    </tr>`;
                }).join('');
            }

            const selectAllCb = document.getElementById('trashSelectAll');
            if (selectAllCb) {
                const idsOnPage = pageRows.map(t => t.id);
                selectAllCb.checked = idsOnPage.length > 0 && idsOnPage.every(id => trashRowsSelected.has(id));
            }

            const prevBtn = document.getElementById('trashPrevPage');
            const nextBtn = document.getElementById('trashNextPage');
            const pageLabel = document.getElementById('trashPageLabel');
            if (prevBtn) prevBtn.disabled = trashPage <= 1;
            if (nextBtn) nextBtn.disabled = trashPage >= totalPages;
            if (pageLabel) pageLabel.textContent = 'Halaman ' + trashPage + ' dari ' + totalPages;

            const infoRight = document.getElementById('trashInfoRight');
            if (infoRight) infoRight.textContent = filtered.length + ' data di sampah';
            const totalDataEl = document.getElementById('trashTotalData');
            if (totalDataEl) totalDataEl.textContent = trashData.length + ' data';
            const countLabel = document.getElementById('trashCountLabel');
            if (countLabel) countLabel.textContent = trashData.length + ' item di sampah';
            const countLabel2 = document.getElementById('trashCountLabel2');
            if (countLabel2) countLabel2.textContent = trashData.length + ' item di sampah';

            const countEl = document.getElementById('sumSampah');
            if (countEl) countEl.textContent = trashData.length;
            const badgeEl = document.getElementById('badgeTrash');
            if (badgeEl) badgeEl.textContent = trashData.length;
        }

        async function restoreTerpilihAtauSemuaDariSampah() {
            let ids = Array.from(trashRowsSelected);
            if (ids.length === 0) {
                if (trashData.length === 0) { showToast('Data Sampah sudah kosong.', 'info'); return; }
                if (!confirm('Tidak ada baris dicentang. Pulihkan SEMUA (' + trashData.length + ') data sampah ke Bank Data Penjualan?')) return;
                ids = trashData.map(t => t.id);
            } else {
                if (!confirm('Pulihkan ' + ids.length + ' data terpilih ke Bank Data Penjualan?')) return;
            }
            for (const id of ids) {
                const item = trashData.find(t => t.id === id);
                if (!item) continue;
                const { id: _id, alasanHapus, tanggalHapus, ...row } = item;
                salesData.push(row);
                await db.trash.delete(id);
            }
            await loadTrashData();
            trashRowsSelected.clear();
            await saveSalesData();
            rebuildSalesFilterOptions();
            salesCurrentDateIndex = Infinity;
            renderSales();
            renderTrashTable();
            renderRingkasanSaveAll();
            showToast('♻️ ' + ids.length + ' data dipulihkan ke Bank Data Penjualan.', 'success');
        }


        function periodKey(iso) { if (!iso) return ''; return iso.slice(0, 7); }

        function periodLabel(key) {
            const months = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September',
                'Oktober', 'November', 'Desember'
            ];
            const [y, m] = key.split('-');
            return months[parseInt(m, 10)] + ' ' + y;
        }

        function rebuildSalesFilterOptions() {
            const salesSet = new Set(),
                periodSet = new Set();
            salesData.forEach(r => { if (r.Sales) salesSet.add(r.Sales); if (r.Tanggal) periodSet.add(periodKey(r
                .Tanggal)); });
            const fSales = document.getElementById('fSalesSales');
            const curSales = fSales.value;
            fSales.innerHTML = '<option value="">Semua</option>' + Array.from(salesSet).sort().map(s =>
                '<option value="' + s + '">' + s + '</option>').join('');
            fSales.value = curSales;
            const fBulan = document.getElementById('fBulanSales');
            const curBulan = fBulan.value;
            fBulan.innerHTML = '<option value="">Semua</option>' + Array.from(periodSet).sort().map(k =>
                '<option value="' + k + '">' + periodLabel(k) + '</option>').join('');
            if (curBulan) { fBulan.value = curBulan; } else if (!userSetBulan.sales && APP_DEFAULT_BULAN && Array.from(
                    fBulan.options).some(o => o.value === APP_DEFAULT_BULAN)) { fBulan.value = APP_DEFAULT_BULAN; } else {
                fBulan.value = curBulan; }
        }

        function getFilteredSales() {
            const faktur = document.getElementById('fFakturSales').value.trim().toLowerCase();
            const sales = document.getElementById('fSalesSales').value;
            const tanggalFrom = document.getElementById('fTanggalSalesFrom').value;
            const tanggalTo = document.getElementById('fTanggalSalesTo').value;
            const bulan = document.getElementById('fBulanSales').value;
            const pembayaran = document.getElementById('fPembayaranSales').value;
            const kategori = document.getElementById('fKategoriSales').value;
            const key = `${faktur}|${sales}|${tanggalFrom}|${tanggalTo}|${bulan}|${pembayaran}|${kategori}`;
            if (filterCache.has(key)) return filterCache.get(key);
            
            const result = salesData.filter(r => {
                // SEARCH FILTER (No.Faktur ATAU nama toko/Customer): Bypass period filter (tanggal & bulan) jika ada search
                if (faktur) {
                    const cocokFaktur = (r['No.Faktur'] || '').toLowerCase().includes(faktur);
                    const cocokToko = (r.Customer || '').toLowerCase().includes(faktur);
                    if (!cocokFaktur && !cocokToko) return false;
                    // Jika ada search faktur/toko, apply sales, pembayaran, kategori tapi SKIP tanggal/bulan (range)
                    if (sales && r.Sales !== sales) return false;
                    if (pembayaran && r.Pembayaran !== pembayaran) return false;
                    if (kategori === 'Fitri' && !(r.Produk || '').toLowerCase().includes('fitri')) return false;
                    if (kategori === 'Rupa Rupa' && (r.Produk || '').toLowerCase().includes('fitri')) return false;
                    return true;
                }
                
                // NORMAL FILTER: Apply semua filter termasuk periode
                if (sales && r.Sales !== sales) return false;
                if (tanggalFrom && r.Tanggal < tanggalFrom) return false;
                if (tanggalTo && r.Tanggal > tanggalTo) return false;
                if (bulan && periodKey(r.Tanggal) !== bulan) return false;
                if (pembayaran && r.Pembayaran !== pembayaran) return false;
                if (kategori === 'Fitri' && !(r.Produk || '').toLowerCase().includes('fitri')) return false;
                if (kategori === 'Rupa Rupa' && (r.Produk || '').toLowerCase().includes('fitri')) return false;
                return true;
            });
            if (filterCache.size >= CACHE_MAX) { const firstKey = filterCache.keys().next().value;
                filterCache.delete(firstKey); }
            filterCache.set(key, result);
            return result;
        }

        // ===== TAB 1 - App-like toolbar: Toggle Tabel/Kartu + Filter Chip =====
        let tab1ViewMode = localStorage.getItem('tab1ViewMode') === 'card' ? 'card' : 'table';
        let tab1QuickFilter = 'semua'; // semua | cash | tempo | lunas | belum_lunas

        // Cache peta status faktur (lunas/belum) supaya tidak dihitung ulang
        // berkali-kali per render. Dibangun ulang tiap kali renderSales dipanggil
        // (murah karena hanya diperlukan saat ada data Tempo).
        function getTab1FakturStatusMap() {
            const map = new Map();
            if (typeof ptBuildTempoRows !== 'function') return map;
            try {
                ptBuildTempoRows().forEach(r => {
                    map.set(normFaktur(r.noFaktur), r.statusClass);
                });
            } catch (e) { /* biarkan map kosong kalau gagal, chip lunas tetap tidak error */ }
            return map;
        }

        function tab1RowMatchesQuickFilter(r, filterKey, statusMap) {
            if (filterKey === 'semua') return true;
            if (filterKey === 'cash') return r.Pembayaran === 'Cash';
            if (filterKey === 'tempo') return r.Pembayaran === 'Tempo';
            if (filterKey === 'lunas') return r.Pembayaran === 'Tempo' && statusMap.get(normFaktur(r['No.Faktur'])) === 'lunas';
            if (filterKey === 'belum_lunas') return r.Pembayaran === 'Tempo' && statusMap.get(normFaktur(r['No.Faktur'])) !== 'lunas';
            return true;
        }

        function updateTab1Chips(baseRows) {
            const needStatus = baseRows.some(r => r.Pembayaran === 'Tempo');
            const statusMap = needStatus ? getTab1FakturStatusMap() : new Map();
            let cCash = 0, cTempo = 0, cLunas = 0, cBelum = 0;
            baseRows.forEach(r => {
                if (r.Pembayaran === 'Cash') cCash++;
                else {
                    cTempo++;
                    if (statusMap.get(normFaktur(r['No.Faktur'])) === 'lunas') cLunas++; else cBelum++;
                }
            });
            const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            setTxt('chipCountSemua', baseRows.length);
            setTxt('chipCountCash', cCash);
            setTxt('chipCountTempo', cTempo);
            setTxt('chipCountLunas', cLunas);
            setTxt('chipCountBelumLunas', cBelum);
            document.querySelectorAll('#tab1ChipRow .tab1-chip').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.chip === tab1QuickFilter);
            });
            return statusMap;
        }

        document.getElementById('tab1ChipRow').addEventListener('click', function(e) {
            const btn = e.target.closest('.tab1-chip');
            if (!btn) return;
            tab1QuickFilter = btn.dataset.chip;
            // Sinkronkan dengan dropdown Pembayaran yang sudah ada supaya filter
            // lain (mis. mode Piutang) tetap konsisten & tidak membingungkan.
            const pembayaranSel = document.getElementById('fPembayaranSales');
            if (pembayaranSel) {
                if (tab1QuickFilter === 'cash') pembayaranSel.value = 'Cash';
                else if (tab1QuickFilter === 'tempo' || tab1QuickFilter === 'lunas' || tab1QuickFilter === 'belum_lunas') pembayaranSel.value = 'Tempo';
                else pembayaranSel.value = '';
            }
            salesCurrentDateIndex = Infinity;
            renderSales();
        });

        function applyTab1ViewMode() {
            const isCard = tab1ViewMode === 'card';
            const tableWrap = document.getElementById('tab1TableWrap');
            const cardList = document.getElementById('salesCardList');
            const tabelBtn = document.getElementById('tab1ViewTabelBtn');
            const kartuBtn = document.getElementById('tab1ViewKartuBtn');
            const splitLeft = document.querySelector('#tab1 .tab1-split-left');
            if (tableWrap) tableWrap.classList.toggle('tab1-hidden', isCard);
            if (cardList) cardList.classList.toggle('show', isCard);
            if (tabelBtn) tabelBtn.classList.toggle('active', !isCard);
            if (kartuBtn) kartuBtn.classList.toggle('active', isCard);
            if (splitLeft) splitLeft.classList.toggle('tab1-hidden', !isCard);
        }
        document.getElementById('tab1ViewToggle').addEventListener('click', function(e) {
            const btn = e.target.closest('.tab1-view-btn');
            if (!btn) return;
            tab1ViewMode = btn.dataset.view === 'card' ? 'card' : 'table';
            localStorage.setItem('tab1ViewMode', tab1ViewMode);
            applyTab1ViewMode();
            renderSales();
        });
        applyTab1ViewMode();
        let tab1SelectedFaktur = null;
        function renderTab1SplitList(rows) {
            const wrap = document.getElementById('tab1SplitList');
            const btnShowAll = document.getElementById('tab1SplitShowAll');
            if (!wrap) return;
            if (!rows.length) {
                wrap.innerHTML = '<div class="tab1-split-empty">📂 Tidak ada faktur.</div>';
                if (btnShowAll) btnShowAll.style.display = 'none';
                return;
            }
            const groups = new Map();
            rows.forEach(r => {
                const key = normFaktur(r['No.Faktur']);
                if (!groups.has(key)) {
                    groups.set(key, {
                        noFaktur: r['No.Faktur'] || '',
                        tanggal: r.Tanggal,
                        customer: r.Customer || '',
                        sales: r.Sales || '',
                        items: 0,
                        total: 0
                    });
                }
                const g = groups.get(key);
                g.items += 1;
                g.total += parseNumber(r.Total);
            });
            wrap.innerHTML = Array.from(groups.values()).map(g => {
                const activeCls = (tab1SelectedFaktur && normFaktur(tab1SelectedFaktur) === normFaktur(g.noFaktur)) ?
                    ' active' : '';
                return `<button type="button" class="tab1-split-item${activeCls}" data-faktur="${escapeHtml(g.noFaktur)}">
                    <div class="ti-top"><span>${escapeHtml(g.noFaktur)}</span><span>${fmtTanggal(g.tanggal)}</span></div>
                    <div class="ti-mid">${escapeHtml(g.customer)}</div>
                    <div class="ti-bottom"><span>${escapeHtml(g.sales)} · ${g.items} item</span><span class="ti-total">${fmtRp(g.total)}</span></div>
                </button>`;
            }).join('');
            if (btnShowAll) btnShowAll.style.display = tab1SelectedFaktur ? 'inline-block' : 'none';
        }
        document.getElementById('tab1SplitList').addEventListener('click', function(e) {
            const btn = e.target.closest('.tab1-split-item');
            if (!btn) return;
            const faktur = btn.getAttribute('data-faktur');
            tab1SelectedFaktur = (tab1SelectedFaktur && normFaktur(tab1SelectedFaktur) === normFaktur(faktur)) ?
                null : faktur;
            renderSales();
        });
        document.getElementById('tab1SplitShowAll').addEventListener('click', function() {
            tab1SelectedFaktur = null;
            renderSales();
        });

        // ================================================================
        // OPTIMASI PERFORMA TAB 1 (Bank Data Penjualan): Virtual Rendering
        // ----------------------------------------------------------------
        // Kalau baris yang harus ditampilkan > VIRTUAL_ROW_THRESHOLD, tabel
        // tidak lagi membuat elemen <tr> untuk SEMUA baris sekaligus (yang
        // bikin berat kalau datanya ribuan baris). Sebagai gantinya, hanya
        // baris yang kelihatan di area scroll (+ sedikit buffer atas/bawah)
        // yang dibuatkan elemen DOM-nya. Baris yang belum kelihatan hanya
        // diwakili 1 baris "spacer" kosong (biar tinggi scrollbar tetap pas)
        // dan baru dirender jadi <tr> asli begitu user scroll ke situ.
        // Total/Profit tetap dihitung untuk SEMUA baris (bukan cuma yang
        // kelihatan) supaya info lain (daftar faktur, ringkasan piutang,
        // dll) tetap akurat.
        // ================================================================
        let salesVirtualDisplayRows = [];
        let salesVirtualIndexMap = new Map();
        let salesVirtualCardStatusMap = new Map();
        const VIRTUAL_ROW_THRESHOLD = 100;
        const VIRTUAL_BUFFER_ROWS = 10;
        let salesRowHeightPx = 33; // dikalibrasi otomatis dari baris asli saat data sedikit


        // ================================================================
        // OPTIMASI PERFORMA MODE KARTU (TAB 1): Virtual Rendering
        // ----------------------------------------------------------------
        // Sama seperti tabel (lihat renderSalesTableWindow di atas): kalau
        // baris yang mau ditampilkan sebagai kartu > VIRTUAL_CARD_THRESHOLD,
        // TIDAK semua kartu dibuat jadi elemen DOM sekaligus (yang bisa bikin
        // browser freeze/"aw snap" kalau datanya ribuan baris). Hanya kartu
        // yang kelihatan di area scroll (+ buffer) yang dirender jadi <div>
        // asli; sisanya diwakili 1 "spacer" kosong di atas & bawah supaya
        // tinggi scrollbar tetap pas dan scroll terasa normal.
        // ================================================================
        const VIRTUAL_CARD_THRESHOLD = 150;
        const VIRTUAL_CARD_BUFFER = 6;
        let salesCardPitchPx = 150; // tinggi 1 kartu + gap, dikalibrasi otomatis dari kartu asli

        function buildSalesCardHtml(r, salesIndexMap, statusMap) {
            const jumlah = parseNumber(r.Jumlah);
            const harga = parseNumber(r['Harga Jual']);
            const disc = parseNumber(r.Disc);
            const total = (jumlah * harga) - disc;
            const gidx = salesIndexMap.get(r);
            const cbChecked = salesRowsSelected.has(gidx) ? 'checked' : '';
            const noFakturSafe = escapeHtml(String(r['No.Faktur'] || ''));
            const sudahDiedit = !!r._Diedit;
            const isCash = r.Pembayaran === 'Cash';
            const status = isCash ? null : statusMap.get(normFaktur(r['No.Faktur']));
            const statusBadge = isCash ? '' : (status === 'lunas' ?
                '<span class="badge lunas-mini">✅ Lunas</span>' :
                '<span class="badge belum-mini">❌ Belum Lunas</span>');
            return `<div class="sales-card${salesRowsSelected.has(gidx) ? ' selected' : ''}">
                    <div class="sales-card-top">
                        <div class="sales-card-top-left">
                            <input type="checkbox" class="sales-trash-checkbox" data-gidx="${gidx}" ${cbChecked}>
                            ${noFakturSafe ? `<a href="#" class="tab1-faktur-link sales-card-faktur" data-faktur="${noFakturSafe}">${sudahDiedit ? '✏️ ' : ''}${noFakturSafe}</a>` : '<span class="sales-card-faktur">—</span>'}
                        </div>
                        <span class="sales-card-date">${fmtTanggal(r.Tanggal)}</span>
                    </div>
                    <div class="sales-card-produk">${escapeHtml(r.Produk || '')}</div>
                    <div class="sales-card-qty">${jumlah} ${escapeHtml(r.Satuan || '')} × ${fmtRp(harga)}${disc ? ' − disc ' + fmtRp(disc) : ''}</div>
                    <div class="sales-card-mid">
                        <span class="sales-card-total">${fmtRp(total)}</span>
                        <span class="sales-card-badges"><span class="badge ${isCash ? 'cash' : 'tempo'}">${r.Pembayaran || 'Tempo'}</span>${statusBadge}</span>
                    </div>
                    <div class="sales-card-foot">
                        <span><b>${escapeHtml(r.Sales || '-')}</b></span>
                        <span>${escapeHtml(r.Customer || '-')}</span>
                        <span>${escapeHtml(r.Alamat || '-')}</span>
                    </div>
                </div>`;
        }

        function calibrateSalesCardPitch(wrap) {
            const cards = wrap.querySelectorAll('.sales-card');
            if (cards.length >= 2) {
                const pitch = cards[1].offsetTop - cards[0].offsetTop;
                if (pitch > 20) salesCardPitchPx = pitch;
            } else if (cards.length === 1) {
                const h = cards[0].getBoundingClientRect().height;
                if (h > 20) salesCardPitchPx = h + 8; // + perkiraan gap antar kartu
            }
        }

        function renderSalesCardsWindow() {
            const wrap = document.getElementById('salesCardList');
            if (!wrap) return;
            const rows = salesVirtualDisplayRows;
            const salesIndexMap = salesVirtualIndexMap;
            const statusMap = salesVirtualCardStatusMap;
            if (!rows || rows.length === 0) return;
            const total = rows.length;
            if (total <= VIRTUAL_CARD_THRESHOLD) {
                // Data sedikit: render biasa seperti sebelumnya (tidak perlu virtualisasi).
                wrap.innerHTML = rows.map(r => buildSalesCardHtml(r, salesIndexMap, statusMap)).join('');
                calibrateSalesCardPitch(wrap);
                return;
            }
            const scrollTop = wrap.scrollTop;
            const viewH = wrap.clientHeight || 485;
            let start = Math.floor(scrollTop / salesCardPitchPx) - VIRTUAL_CARD_BUFFER;
            if (start < 0) start = 0;
            const count = Math.ceil(viewH / salesCardPitchPx) + VIRTUAL_CARD_BUFFER * 2;
            let end = start + count;
            if (end > total) end = total;
            if (start > end) start = end;
            const topH = start * salesCardPitchPx;
            const botH = (total - end) * salesCardPitchPx;
            let html = '';
            if (topH > 0) html +=
                `<div class="vcard-spacer" aria-hidden="true" style="height:${topH}px;flex:0 0 auto;width:100%;"></div>`;
            for (let i = start; i < end; i++) html += buildSalesCardHtml(rows[i], salesIndexMap, statusMap);
            if (botH > 0) html +=
                `<div class="vcard-spacer" aria-hidden="true" style="height:${botH}px;flex:0 0 auto;width:100%;"></div>`;
            wrap.innerHTML = html;
        }

        (function initSalesCardVirtualScroll() {
            const wrap = document.getElementById('salesCardList');
            if (!wrap) return;
            let raf = null;
            wrap.addEventListener('scroll', function() {
                if (tab1ViewMode !== 'card') return;
                if (salesVirtualDisplayRows.length <= VIRTUAL_CARD_THRESHOLD) return;
                if (raf) return;
                raf = requestAnimationFrame(function() {
                    raf = null;
                    renderSalesCardsWindow();
                });
            });
        })();

        function renderSalesCards(displayRows, salesIndexMap, statusMap) {
            const wrap = document.getElementById('salesCardList');
            if (!wrap) return;
            // Simpan data terbaru supaya scroll handler kartu (renderSalesCardsWindow)
            // selalu pakai baris yang sama dengan yang baru saja difilter/dirender.
            salesVirtualDisplayRows = displayRows;
            salesVirtualIndexMap = salesIndexMap;
            salesVirtualCardStatusMap = statusMap;
            if (displayRows.length === 0) {
                wrap.innerHTML = `<div class="sales-card-empty">📂 ${tab1SelectedFaktur ? 'Faktur ini tidak ada di data yang tampil saat ini.' : 'Tidak ada data. Import Excel atau Tambah transaksi.'}</div>`;
                return;
            }
            if (displayRows.length > VIRTUAL_CARD_THRESHOLD) wrap.scrollTop = 0; // data berganti -> mulai dari atas
            renderSalesCardsWindow();
        }
        document.getElementById('salesCardList').addEventListener('change', function(e) {
            if (e.target.classList.contains('sales-trash-checkbox')) {
                const gidx = parseInt(e.target.dataset.gidx, 10);
                if (e.target.checked) salesRowsSelected.add(gidx); else salesRowsSelected.delete(gidx);
                e.target.closest('.sales-card').classList.toggle('selected', e.target.checked);
                updateSalesSelectedInfo();
            }
        });

        function buildSalesRowHtml(r, salesIndexMap) {
            const jumlah = parseNumber(r.Jumlah);
            const harga = parseNumber(r['Harga Jual']);
            const hargaBeli = r['Harga Beli'] !== undefined && r['Harga Beli'] !== '' && r[
                'Harga Beli'] !== null ? parseNumber(r['Harga Beli']) : null;
            const disc = parseNumber(r.Disc);
            const total = r.Total !== undefined ? r.Total : (jumlah * harga) - disc;
            const profit = hargaBeli !== null ? (total - (hargaBeli * jumlah)) : null;
            const gidx = salesIndexMap.get(r);
            const cbChecked = salesRowsSelected.has(gidx) ? 'checked' : '';
            const noFakturSafe = escapeHtml(String(r['No.Faktur'] || ''));
            const sudahDiedit = !!r._Diedit;
            const fakturLinkStyle = sudahDiedit ?
                'color:#b45309;font-weight:700;text-decoration:underline;' :
                'color:#1f4e78;font-weight:700;text-decoration:underline;';
            const fakturLinkTitle = sudahDiedit ? ' title="Faktur ini pernah diedit dari modal detail"' : '';
            return `<tr><td><input type="checkbox" class="sales-trash-checkbox" data-gidx="${gidx}" ${cbChecked}></td><td>${fmtTanggal(r.Tanggal)}</td><td>${noFakturSafe ? `<a href="#" class="tab1-faktur-link" data-faktur="${noFakturSafe}" style="${fakturLinkStyle}"${fakturLinkTitle}>${sudahDiedit ? '✏️ ' : ''}${noFakturSafe}</a>` : ''}</td><td>${r.Produk || ''}</td><td class="num">${jumlah}</td><td>${r.Satuan || ''}</td><td class="num">${fmtRp(harga)}</td><td class="num">${hargaBeli !== null ? fmtRp(hargaBeli) : '-'}</td><td class="num">${fmtRp(disc)}</td><td class="num">${fmtRp(total)}</td><td class="num">${profit !== null ? fmtRp(profit) : '-'}</td><td>${r.Sales || ''}</td><td>${r.Customer || ''}</td><td>${r.Alamat || ''}</td><td><span class="badge ${r.Pembayaran === 'Cash' ? 'cash' : 'tempo'}">${r.Pembayaran || 'Tempo'}</span></td></tr>`;
        }

        function renderSalesTableWindow() {
            const tbody = document.getElementById('salesTableBody');
            if (!tbody) return;
            const rows = salesVirtualDisplayRows;
            const salesIndexMap = salesVirtualIndexMap;
            if (!rows || rows.length === 0) return;
            const total = rows.length;
            if (total <= VIRTUAL_ROW_THRESHOLD) {
                // Data sedikit: render biasa seperti sebelumnya (tidak perlu virtualisasi).
                tbody.innerHTML = rows.map(r => buildSalesRowHtml(r, salesIndexMap)).join('');
                const firstRow = tbody.querySelector('tr');
                if (firstRow) {
                    const h = firstRow.getBoundingClientRect().height;
                    if (h > 10) salesRowHeightPx = h; // kalibrasi tinggi baris asli
                }
                return;
            }
            const wrap = document.getElementById('tab1TableWrap');
            const scrollTop = wrap ? wrap.scrollTop : 0;
            const viewH = (wrap ? wrap.clientHeight : 0) || 485;
            let start = Math.floor(scrollTop / salesRowHeightPx) - VIRTUAL_BUFFER_ROWS;
            if (start < 0) start = 0;
            const count = Math.ceil(viewH / salesRowHeightPx) + VIRTUAL_BUFFER_ROWS * 2;
            let end = start + count;
            if (end > total) end = total;
            if (start > end) start = end;
            const topH = start * salesRowHeightPx;
            const botH = (total - end) * salesRowHeightPx;
            let html = '';
            if (topH > 0) html +=
                `<tr class="vrow-spacer" aria-hidden="true" style="height:${topH}px;"><td colspan="15" style="padding:0;border:0;background:transparent;"></td></tr>`;
            for (let i = start; i < end; i++) html += buildSalesRowHtml(rows[i], salesIndexMap);
            if (botH > 0) html +=
                `<tr class="vrow-spacer" aria-hidden="true" style="height:${botH}px;"><td colspan="15" style="padding:0;border:0;background:transparent;"></td></tr>`;
            tbody.innerHTML = html;
        }
        (function initSalesVirtualScroll() {
            const wrap = document.getElementById('tab1TableWrap');
            if (!wrap) return;
            let raf = null;
            wrap.addEventListener('scroll', function() {
                if (salesVirtualDisplayRows.length <= VIRTUAL_ROW_THRESHOLD) return;
                if (raf) return;
                raf = requestAnimationFrame(function() {
                    raf = null;
                    renderSalesTableWindow();
                });
            });
        })();

        function renderSales() {
            const beforeQuickFilter = getFilteredSales();
            const statusMapForChips = updateTab1Chips(beforeQuickFilter);
            const allFiltered = tab1QuickFilter === 'semua' ? beforeQuickFilter :
                beforeQuickFilter.filter(r => tab1RowMatchesQuickFilter(r, tab1QuickFilter, statusMapForChips));
            const tbody = document.getElementById('salesTableBody');
            const tanggalFilterActive = !!document.getElementById('fTanggalSalesFrom').value || !!document
                .getElementById('fTanggalSalesTo').value;
            const chipFilterActive = tab1QuickFilter !== 'semua';
            let rows;
            if (tanggalFilterActive || chipFilterActive || allFiltered.length === 0) {
                rows = allFiltered;
                document.getElementById('salesPager').style.display = 'none';
            } else {
                const uniqueDates = Array.from(new Set(allFiltered.map(r => r.Tanggal))).sort();
                if (!(salesCurrentDateIndex < uniqueDates.length)) salesCurrentDateIndex = uniqueDates.length - 1;
                if (salesCurrentDateIndex < 0) salesCurrentDateIndex = 0;
                const selectedDate = uniqueDates[salesCurrentDateIndex];
                rows = allFiltered.filter(r => r.Tanggal === selectedDate);
                document.getElementById('salesPageLabel').textContent = 'GajahMas2026byHamung';
                document.getElementById('salesPrevDate').disabled = salesCurrentDateIndex <= 0;
                document.getElementById('salesNextDate').disabled = salesCurrentDateIndex >= uniqueDates.length - 1;
                document.getElementById('salesPager').style.display = 'flex';
            }
            // Hitung Total untuk SEMUA baris hasil filter (murah, cuma aritmatika,
            // bukan bikin elemen DOM) supaya daftar faktur di sidebar kiri &
            // ringkasan piutang tetap akurat walau tabelnya divirtualisasi.
            const salesIndexMap = new Map();
            salesData.forEach((r, i) => salesIndexMap.set(r, i));
            rows.forEach(r => {
                const jumlah = parseNumber(r.Jumlah);
                const harga = parseNumber(r['Harga Jual']);
                const disc = parseNumber(r.Disc);
                r.Total = (jumlah * harga) - disc;
            });
            renderTab1SplitList(rows);
            const displayRows = tab1SelectedFaktur ?
                rows.filter(r => normFaktur(r['No.Faktur']) === normFaktur(tab1SelectedFaktur)) : rows;
            salesVirtualCardStatusMap = statusMapForChips;
            if (displayRows.length === 0) {
                tbody.innerHTML = tab1SelectedFaktur ?
                    '<tr><td colspan="15" class="empty-msg">📂 Faktur ini tidak ada di data yang tampil saat ini.</td></tr>' :
                    '<tr><td colspan="15" class="empty-msg">📂 Tidak ada data. Import Excel atau Tambah transaksi.</td></tr>';
                salesVirtualDisplayRows = [];
                salesVirtualIndexMap = salesIndexMap;
                if (tab1ViewMode === 'card') renderSalesCards([], new Map(), statusMapForChips);
            } else {
                salesVirtualDisplayRows = displayRows;
                salesVirtualIndexMap = salesIndexMap;
                const wrapEl = document.getElementById('tab1TableWrap');
                if (wrapEl) wrapEl.scrollTop = 0; // data berganti -> mulai dari atas lagi
                renderSalesTableWindow();
                // Kartu (mode "🗂️ Kartu") cuma dirender kalau memang sedang dilihat,
                // biar tidak dobel kerja render tabel + kartu tiap kali data berubah.
                if (tab1ViewMode === 'card') {
                    renderSalesCards(displayRows, salesIndexMap, statusMapForChips);
                }
            }
            updateSalesSelectedInfo();
            document.getElementById('salesTotalData').textContent = displayRows.length + ' data' +
                (tab1SelectedFaktur ? ' (faktur ' + tab1SelectedFaktur + ')' : '');
            document.getElementById('badgeSales').textContent = salesData.length;
            document.getElementById('salesRangeLabel').textContent = salesData.length ? 'Total ' + salesData.length +
                ' baris' : 'Belum ada data';
            if (salesIsPiutangMode && rows.length) {
                const total = rows.reduce((s, r) => s + parseNumber(r.Total), 0);
                document.getElementById('totalPiutangSales').textContent = fmtRp(total);
                document.getElementById('piutangSummarySales').style.display = 'flex';
            } else {
                document.getElementById('piutangSummarySales').style.display = 'none';
            }
        }
        const debouncedRenderSales = debounce(() => { salesCurrentDateIndex = Infinity;
            renderSales(); }, 300);
        ['fFakturSales', 'fSalesSales', 'fTanggalSalesFrom', 'fTanggalSalesTo', 'fBulanSales',
            'fPembayaranSales', 'fKategoriSales'
        ].forEach(
        id => {
            const el = document.getElementById(id);
            if (el) { el.addEventListener('input', debouncedRenderSales);
                el.addEventListener('change', debouncedRenderSales); }
        });
        document.getElementById('fBulanSales').addEventListener('change', () => { userSetBulan.sales = true; });
        // Field "Tanggal" tunggal (gabungan Dari/Sampai Tanggal): isi kedua input
        // tersembunyi (from & to) dengan tanggal yang sama supaya filter tetap
        // berfungsi sebagai pencarian 1 hari, tanpa mengubah logic filter di bawah.
        (function() {
            const single = document.getElementById('fTanggalSalesSingle');
            if (!single) return;
            single.addEventListener('input', () => {
                document.getElementById('fTanggalSalesFrom').value = single.value;
                document.getElementById('fTanggalSalesTo').value = single.value;
                salesCurrentDateIndex = Infinity;
                debouncedRenderSales();
            });
        })();
        document.getElementById('salesPrevDate').addEventListener('click', () => { salesCurrentDateIndex--;
            renderSales(); });
        document.getElementById('salesNextDate').addEventListener('click', () => { salesCurrentDateIndex++;
            renderSales(); });
        document.getElementById('btnResetSales').addEventListener('click', () => {
            document.getElementById('fFakturSales').value = '';
            document.getElementById('fSalesSales').value = '';
            document.getElementById('fTanggalSalesFrom').value = '';
            document.getElementById('fTanggalSalesTo').value = '';
            document.getElementById('fTanggalSalesSingle').value = '';
            document.getElementById('fBulanSales').value = '';
            userSetBulan.sales = true;
            document.getElementById('fPembayaranSales').value = '';
            document.getElementById('fKategoriSales').value = '';
            if (salesIsPiutangMode) { salesIsPiutangMode = false;
                document.getElementById('btnPiutangMode').textContent = '📋 Piutang';
                document.getElementById('btnPiutangMode').classList.remove('active'); }
            salesCurrentDateIndex = Infinity;
            renderSales();
        });
        document.getElementById('btnPiutangMode').addEventListener('click', function() {
            if (!salesData.length) { showToast('Belum ada data.', 'warning'); return; }
            if (salesIsPiutangMode) {
                salesIsPiutangMode = false;
                this.classList.remove('active');
                this.textContent = '📋 Piutang';
                document.getElementById('fPembayaranSales').value = '';
                showToast('Mode piutang dimatikan', 'info');
            } else {
                salesIsPiutangMode = true;
                this.classList.add('active');
                this.textContent = '✅ Semua Data';
                document.getElementById('fPembayaranSales').value = 'Tempo';
                showToast('Menampilkan TEMPO (piutang)', 'info');
            }
            salesCurrentDateIndex = Infinity;
            renderSales();
        });
        document.getElementById('fPembayaranSales').addEventListener('change', function() {
            if (salesIsPiutangMode && this.value !== 'Tempo') {
                salesIsPiutangMode = false;
                document.getElementById('btnPiutangMode').classList.remove('active');
                document.getElementById('btnPiutangMode').textContent = '📋 Piutang';
            }
            salesCurrentDateIndex = Infinity;
            renderSales();
        });
        document.getElementById('btnAddSales').addEventListener('click', async function() {
            const tgl = new Date().toISOString().slice(0, 10);
            const noFaktur = prompt('No. Faktur:', '');
            if (!noFaktur) return;
            const produk = prompt('Produk:', '');
            if (!produk) return;

            // ⚠️ CEK DUPLIKAT: No.Faktur + Produk + Tanggal yang sama persis sudah ada di data
            // (Jumlah belum ditanya di titik ini, jadi tidak diikutkan di cek awal ini)
            const dupKeyBaru = salesDupKey(noFaktur, produk, tgl, '');
            const sudahAdaDup = salesData.some(r => salesDupKey(r['No.Faktur'], r.Produk, r.Tanggal, '') === dupKeyBaru);
            if (sudahAdaDup) {
                if (!confirm(`⚠️ No.Faktur "${noFaktur}" dengan produk "${produk}" SUDAH ADA di data.\nTetap simpan sebagai baris baru (duplikat)?`)) {
                    return;
                }
            }

            // 🔗 Link ke Master Produk & Harga (Tab 8): kalau produk ini sudah ada
            // di daftar master, harga jual & harga beli otomatis dipakai sebagai default.
            const hargaMaster = cariHargaProdukMaster(produk);
            if (hargaMaster) showToast('🔗 Harga ditemukan di Master Produk & Harga: ' + produk, 'info');
            const jumlah = parseFloat(prompt('Jumlah:', '1')) || 1;
            const hargaJualDefault = hargaMaster && hargaMaster.hargaJual !== '' ? String(hargaMaster
                .hargaJual) : '0';
            const harga = parseFloat(prompt('Harga Jual:', hargaJualDefault)) || 0;
            const hargaBeliDefault = hargaMaster && hargaMaster.hargaBeli !== '' ? String(hargaMaster
                .hargaBeli) : '';
            const hargaBeliInput = prompt('Harga Beli (kosongkan jika tidak tahu):', hargaBeliDefault);
            const hargaBeli = (hargaBeliInput === null || hargaBeliInput.trim() === '') ? '' : (parseFloat(
                hargaBeliInput) || 0);
            const disc = parseFloat(prompt('Disc:', '0')) || 0;
            const sales = prompt('Sales:', 'LAINNYA') || 'LAINNYA';
            const customer = prompt('Customer:', '') || '';
            const alamat = prompt('Alamat:', '') || '';
            const pembayaran = confirm('Cash? (OK=Cash, Cancel=Tempo)') ? 'Cash' : 'Tempo';
            const totalBaru = (jumlah * harga) - disc;
            const profitBaru = hargaBeli === '' ? '' : totalBaru - (hargaBeli * jumlah);
            salesData.push({ 'Tanggal': tgl, 'No.Faktur': noFaktur, 'Produk': produk, 'Jumlah': jumlah, 'Satuan': '',
                'Harga Jual': harga, 'Disc': disc, 'Total': totalBaru, 'Sales': sales,
                'Customer': customer, 'Alamat': alamat, 'Pembayaran': pembayaran, 'Harga Beli': hargaBeli,
                'Profit': profitBaru });
            const okSave = await saveSalesData();
            rebuildSalesFilterOptions();
            salesCurrentDateIndex = Infinity;
            renderSales();
            if (okSave) showToast('✅ Transaksi ditambahkan.', 'success');
        });
        // ================================================================
        // CEK DUPLIKAT DATA PENJUALAN (berdasarkan No.Faktur + Produk)
        // Dipakai saat Import Excel manual maupun saat menerima kiriman
        // data dari tab Rapikan Data, supaya kalau file/kiriman yang sama
        // tidak sengaja diproses dua kali, datanya tidak dobel.
        // ================================================================
        function salesDupKey(faktur, produk, tanggal, jumlah) {
            // PENTING: kunci duplikat HARUS ikut sertakan Tanggal & Jumlah, bukan cuma
            // No.Faktur + Produk. Kalau cuma No.Faktur+Produk, baris baru yang kebetulan
            // punya No.Faktur sama dengan baris lama (beda tanggal/beda jumlah) akan
            // dianggap "sudah ada" dan di-skip diam-diam saat import (data hilang tanpa
            // ada pesan error apapun). Lihat catatan perbaikan Juli 2026.
            return String(faktur || '').trim().toUpperCase() + '|||' + String(produk || '').trim().toUpperCase() +
                '|||' + String(tanggal || '').trim() + '|||' + String(jumlah || '').toString().trim();
        }
        function buildSalesDupKeySet(list) {
            const s = new Set();
            (list || []).forEach(r => {
                const key = salesDupKey(r['No.Faktur'], r.Produk, r.Tanggal, r.Jumlah);
                if (key !== '|||||||||') s.add(key);
            });
            return s;
        }

        // ================================================================
        // TERIMA DATA KIRIMAN DARI TAB "RAPIKAN DATA" (dashboard-Data.html)
        // Dikirim lewat localStorage key 'gm2026_transferBankData' —
        // hanya bekerja kalau dashboard-Data.html & dashboard-kerja.html
        // dibuka dari domain/origin yang sama (mis. sama-sama di GitHub Pages).
        // ================================================================
        const TRANSFER_BANKDATA_KEY = 'gm2026_transferBankData';
        window._pendingTransferData = null;

        function checkPendingTransferBankData() {
            try {
                const raw = localStorage.getItem(TRANSFER_BANKDATA_KEY);
                if (!raw) return;
                const parsed = JSON.parse(raw);
                if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
                    localStorage.removeItem(TRANSFER_BANKDATA_KEY);
                    return;
                }
                const bar = document.getElementById('transferBankDataBar');
                const msg = document.getElementById('transferBankDataMsg');
                const labelPeriode = (parsed.meta && parsed.meta.label) ? ` (Periode: ${parsed.meta.label})` : '';
                msg.textContent = `📥 Ditemukan ${parsed.items.length} data baru dari Rapikan Data${labelPeriode}. Import ke Bank Data Penjualan?`;
                bar.style.display = 'flex';
                window._pendingTransferData = parsed;
            } catch (e) {
                console.warn('Gagal membaca data kiriman dari Rapikan Data:', e);
            }
        }

        function mergeTransferDataIntoSales(items) {
            const dupKeys = buildSalesDupKeySet(salesData);
            let added = 0;
            let dup = 0;
            items.forEach(it => {
                const faktur = String(it['No.Faktur'] || '').trim();
                const produk = String(it.Produk || '').trim();
                if (!faktur) return;

                let tanggal = String(it.Tanggal || '').trim();
                if (tanggal.includes('/')) {
                    const parts = tanggal.split('/');
                    if (parts.length === 3) {
                        let thn = parts[2].trim();
                        if (thn.length === 2) thn = (parseInt(thn, 10) <= 69 ? '20' : '19') + thn;
                        tanggal = thn + '-' + parts[1].trim().padStart(2, '0') + '-' + parts[0].trim().padStart(2, '0');
                    }
                }
                const jumlah = parseNumber(it.Jumlah);

                const key = salesDupKey(faktur, produk, tanggal, jumlah);
                if (dupKeys.has(key)) { dup++; return; }
                dupKeys.add(key);

                let hargaBeli = (it['Harga Beli'] === undefined || it['Harga Beli'] === null || it['Harga Beli'] === '')
                    ? '' : parseNumber(it['Harga Beli']);
                if (hargaBeli === '') {
                    const hMaster = cariHargaProdukMaster(produk);
                    if (hMaster && hMaster.hargaBeli !== '') hargaBeli = hMaster.hargaBeli;
                }
                const harga = parseNumber(it['Harga Jual']);
                const disc = parseNumber(it.Disc);
                const total = (jumlah * harga) - disc;
                const profit = hargaBeli === '' ? '' : total - (hargaBeli * jumlah);

                let pembayaran = String(it.Pembayaran || '').trim();
                if (pembayaran !== 'Cash' && pembayaran !== 'Tempo') pembayaran = 'Tempo';
                let sales = String(it.Sales || '').trim();
                if (!sales || /^\d+$/.test(sales)) sales = 'LAINNYA';

                salesData.push({
                    'Tanggal': tanggal, 'No.Faktur': faktur, 'Produk': produk,
                    'Jumlah': jumlah, 'Satuan': String(it.Satuan || '').trim(),
                    'Harga Jual': harga, 'Disc': disc, 'Total': total, 'Sales': sales,
                    'Customer': String(it.Customer || '').trim(), 'Alamat': String(it.Alamat || '').trim(),
                    'Pembayaran': pembayaran, 'Harga Beli': hargaBeli, 'Profit': profit
                });
                added++;
            });
            return { added, dup };
        }

        document.getElementById('btnTransferBankDataImport').addEventListener('click', async function() {
            const parsed = window._pendingTransferData;
            if (!parsed) return;
            const { added, dup } = mergeTransferDataIntoSales(parsed.items);
            const okSave = await saveSalesData();
            rebuildSalesFilterOptions();
            salesCurrentDateIndex = Infinity;
            renderSales();
            checkAndShowSalesAnomaliBanner();
            localStorage.removeItem(TRANSFER_BANKDATA_KEY);
            document.getElementById('transferBankDataBar').style.display = 'none';
            window._pendingTransferData = null;
            if (okSave) {
                const dupMsg = dup > 0 ? ` ⚠️ ${dup} baris duplikat (sudah ada) dilewati.` : '';
                showToast(`✅ ${added} baris dari Rapikan Data berhasil diimpor.${dupMsg}`, 'success');
            }
            switchTab('tab1');
        });

        document.getElementById('btnTransferBankDataAbaikan').addEventListener('click', function() {
            localStorage.removeItem(TRANSFER_BANKDATA_KEY);
            document.getElementById('transferBankDataBar').style.display = 'none';
            window._pendingTransferData = null;
            showToast('Data kiriman dari Rapikan Data diabaikan.', 'info');
        });

        // ================================================================
        // BERSIHKAN BARIS HANTU (port dari bersihkan_data.py) — langsung di
        // dalam tab Bank Data Penjualan, tidak perlu download+jalankan script
        // Python terpisah lagi.
        //
        // Baris hantu = pasangan baris yang muncul tiap kali sebuah faktur
        // DIEDIT: sistem kasir menulis 1 baris MINUS (membatalkan baris lama)
        // dan 1 baris PLUS (baris pengganti) dengan No.Faktur + Tanggal +
        // Produk yang sama. Net dampaknya nol, tapi baris minus ini bikin
        // jumlah baris & transaksi beda dari yang seharusnya.
        //
        // Catatan: berbeda dari file "Data Rapi" asli yang punya jam:menit:
        // detik pada kolom Tanggal, field Tanggal di Bank Data Penjualan di
        // sini cuma tanggal (YYYY-MM-DD) tanpa jam. Jadi kunci pencocokan di
        // sini pakai No.Faktur + Tanggal + Produk + Jumlah — cukup unik untuk
        // hampir semua kasus, tapi kalau dalam SATU hari ada lebih dari satu
        // edit dengan Jumlah yang sama persis, satu di antaranya tetap bisa
        // lolos jadi baris "periksa manual" (aman, tidak akan salah hapus).
        // ================================================================
        function cariBarisHantuSales(rows) {
            const kunci = (r, jml) => [
                String(r['No.Faktur'] || '').trim().toUpperCase(),
                String(r['Tanggal'] || '').trim(),
                String(r['Produk'] || '').trim().toUpperCase(),
                jml
            ].join('|||');

            // Kumpulkan lokasi baris PLUS per kunci
            const positiveLookup = new Map();
            rows.forEach((r, idx) => {
                const jml = Number(r.Jumlah);
                if (!isFinite(jml) || jml <= 0) return;
                const key = kunci(r, jml);
                if (!positiveLookup.has(key)) positiveLookup.set(key, []);
                positiveLookup.get(key).push(idx);
            });

            const toDeleteIdx = [];
            const toFlagIdx = [];
            rows.forEach((r, idx) => {
                const jml = Number(r.Jumlah);
                if (!isFinite(jml) || jml >= 0) return; // hanya proses baris MINUS
                const candidates = positiveLookup.get(kunci(r, -jml));
                if (candidates && candidates.length) {
                    candidates.pop(); // pakai satu pasangan, jangan dipakai dua kali
                    toDeleteIdx.push(idx);
                } else {
                    toFlagIdx.push(idx); // minus tanpa pasangan -> kemungkinan retur/void asli
                }
            });
            return { toDeleteIdx, toFlagIdx };
        }

        // ================================================================
        // DETEKSI DUPLIKAT PERSIS: 2+ baris POSITIF dengan isi identik
        // plek-ketiplek (faktur, tanggal, produk, jumlah, satuan, harga jual,
        // harga beli, disc, total sama semua). Ini kasus terpisah dari
        // "baris hantu" (pasangan minus/plus akibat edit faktur) — biasanya
        // sisa bug duplikasi sinkronisasi lama. Untuk tiap kelompok duplikat,
        // baris pertama dipertahankan sebagai "asli", sisanya ditandai untuk
        // dibersihkan.
        // ================================================================
        function kunciDuplikatPersisSales(r) {
            if (!r) return '';
            return [
                String(r['No.Faktur'] || '').trim().toUpperCase(),
                String(r['Tanggal'] || '').trim(),
                String(r['Produk'] || '').trim().toUpperCase(),
                String(r.Jumlah),
                String(r.Satuan || '').trim().toUpperCase(),
                String(r['Harga Jual']),
                String(r['Harga Beli']),
                String(r.Disc),
                String(r.Total)
            ].join('|||');
        }

        function cariDuplikatPersisSales(rows) {
            // Kumpulkan lokasi baris per kunci isi (hanya baris POSITIF;
            // baris minus sudah ditangani terpisah oleh cariBarisHantuSales).
            const lookup = new Map();
            rows.forEach((r, idx) => {
                const jml = Number(r.Jumlah);
                if (!isFinite(jml) || jml <= 0) return;
                const key = kunciDuplikatPersisSales(r);
                if (!lookup.has(key)) lookup.set(key, []);
                lookup.get(key).push(idx);
            });

            const duplicateIdx = [];      // semua baris berlebih (siap dihapus), 1 baris/kelompok dipertahankan
            const duplicateGroups = [];   // detail per kelompok, untuk konfirmasi/laporan
            lookup.forEach((idxList) => {
                if (idxList.length > 1) {
                    const [keepIdx, ...extraIdx] = idxList;
                    duplicateGroups.push({ keepIdx, extraIdx });
                    duplicateIdx.push(...extraIdx);
                }
            });
            return { duplicateIdx, duplicateGroups };
        }

        // ================================================================
        // DETEKSI ANOMALI BANK DATA PENJUALAN (banner otomatis + modal detail)
        // Kategori yang dideteksi:
        //  - Baris hantu (pasangan minus/plus dari edit faktur) -> siap dibersihkan otomatis
        //  - Baris minus TANPA pasangan -> kemungkinan retur/void asli, perlu periksa manual
        //  - Duplikat persis (2+ baris positif identik plek-ketiplek) -> siap dibersihkan otomatis
        //  - Total transaksi minus (di luar kategori di atas)
        //  - Harga Jual kosong/0 padahal Jumlah > 0
        //  - Disc lebih besar dari nilai jual (Jumlah x Harga Jual), sehingga Total janggal
        // ================================================================
        // ================================================================
        // MEMORI "SUDAH DIPERIKSA" — supaya baris yang sudah dicek manual
        // (mis. retur/void yang memang sah) tidak terus-terusan dideteksi
        // ulang tiap kali tab dibuka lagi. Disimpan di localStorage per
        // browser, berdasarkan tanda tangan isi baris (bukan index, karena
        // index bisa berubah kalau ada baris lain dihapus/ditambah).
        // ================================================================
        const SALES_ANOMALI_DISMISS_KEY = 'salesAnomaliDismissed_v1';
        function getSalesAnomaliDismissedSet() {
            try {
                const raw = localStorage.getItem(SALES_ANOMALI_DISMISS_KEY);
                return raw ? new Set(JSON.parse(raw)) : new Set();
            } catch (e) { return new Set(); }
        }
        function saveSalesAnomaliDismissedSet(set) {
            try { localStorage.setItem(SALES_ANOMALI_DISMISS_KEY, JSON.stringify(Array.from(set))); } catch (e) {}
        }
        function buatKunciAnomaliSales(r) {
            if (!r) return '';
            return [
                String(r['No.Faktur'] || '').trim().toUpperCase(),
                String(r['Tanggal'] || '').trim(),
                String(r['Produk'] || '').trim().toUpperCase(),
                String(r.Jumlah), String(r['Harga Jual']), String(r.Disc), String(r.Total)
            ].join('|||');
        }

        function detectSalesAnomali(rows) {
            const dismissed = getSalesAnomaliDismissedSet();
            const { toDeleteIdx, toFlagIdx: toFlagIdxMentah } = cariBarisHantuSales(rows);
            // Baris hantu (toDeleteIdx) tetap otomatis dibersihkan tiap saat, tidak perlu ditandai.
            // Baris "minus tanpa pasangan" yang sudah pernah ditandai "sudah diperiksa" -> disaring keluar.
            const toFlagIdx = toFlagIdxMentah.filter(idx => !dismissed.has(buatKunciAnomaliSales(rows[idx])));

            const { duplicateIdx: duplicateIdxMentah } = cariDuplikatPersisSales(rows);
            // Sama seperti baris hantu, duplikat persis siap dibersihkan otomatis, tapi tetap
            // dihormati kalau pernah ditandai "sudah diperiksa" (mis. memang disengaja).
            const duplicateIdx = duplicateIdxMentah.filter(idx => !dismissed.has(buatKunciAnomaliSales(rows[idx])));

            const ghostSet = new Set([...toDeleteIdx, ...toFlagIdxMentah, ...duplicateIdxMentah]);
            const totalMinus = [], hargaKosong = [], discBerlebih = [];
            rows.forEach((r, idx) => {
                if (ghostSet.has(idx)) return; // sudah tercakup kategori baris hantu / minus tanpa pasangan / duplikat
                if (dismissed.has(buatKunciAnomaliSales(r))) return; // sudah pernah ditandai "sudah diperiksa"
                const jumlah = parseNumber(r.Jumlah);
                const harga = parseNumber(r['Harga Jual']);
                const disc = parseNumber(r.Disc);
                const totalRaw = (r.Total !== undefined && r.Total !== '') ? parseNumber(r.Total) : ((jumlah || 0) * (harga || 0) - (disc || 0));
                if (isFinite(totalRaw) && totalRaw < 0) { totalMinus.push(idx); return; }
                if (jumlah > 0 && (!isFinite(harga) || harga <= 0)) { hargaKosong.push(idx); return; }
                if (isFinite(disc) && disc > 0 && isFinite(jumlah) && isFinite(harga) && disc > (jumlah * harga)) { discBerlebih.push(idx); return; }
            });
            return { toDeleteIdx, toFlagIdx, duplicateIdx, totalMinus, hargaKosong, discBerlebih };
        }

        function totalAnomaliCount(result) {
            return result.toDeleteIdx.length + result.toFlagIdx.length + result.duplicateIdx.length +
                result.totalMinus.length + result.hargaKosong.length + result.discBerlebih.length;
        }

        function formatSalesAnomaliMsg(result) {
            const total = totalAnomaliCount(result);
            if (!total) return '';
            const parts = [];
            if (result.toDeleteIdx.length) parts.push(`${result.toDeleteIdx.length} baris hantu (siap dibersihkan otomatis)`);
            if (result.toFlagIdx.length) parts.push(`${result.toFlagIdx.length} minus tanpa pasangan`);
            if (result.duplicateIdx.length) parts.push(`${result.duplicateIdx.length} baris duplikat persis (siap dibersihkan otomatis)`);
            if (result.totalMinus.length) parts.push(`${result.totalMinus.length} Total transaksi minus`);
            if (result.hargaKosong.length) parts.push(`${result.hargaKosong.length} Harga Jual kosong/0`);
            if (result.discBerlebih.length) parts.push(`${result.discBerlebih.length} Disc lebih besar dari nilai jual`);
            return `⚠️ Ditemukan ${total} kemungkinan anomali di Bank Data Penjualan: ${parts.join(', ')}.`;
        }

        let salesAnomaliBannerTimer = null;
        const SALES_ANOMALI_BANNER_DURATION = 60000; // 60 detik — sebelumnya 15dtk terlalu cepat untuk sempat dibaca/diklik
        function startSalesAnomaliBannerTimer() {
            if (salesAnomaliBannerTimer) { clearTimeout(salesAnomaliBannerTimer); salesAnomaliBannerTimer = null; }
            const banner = document.getElementById('salesAnomaliBanner');
            salesAnomaliBannerTimer = setTimeout(() => { banner.classList.remove('show'); }, SALES_ANOMALI_BANNER_DURATION);
        }
        function checkAndShowSalesAnomaliBanner() {
            const banner = document.getElementById('salesAnomaliBanner');
            const msgEl = document.getElementById('salesAnomaliBannerMsg');
            if (!banner || !msgEl) return;
            if (salesAnomaliBannerTimer) { clearTimeout(salesAnomaliBannerTimer); salesAnomaliBannerTimer = null; }
            const result = detectSalesAnomali(salesData);
            const msg = formatSalesAnomaliMsg(result);
            if (!msg) { banner.classList.remove('show'); return; }
            msgEl.textContent = msg;
            banner.classList.add('show');
            startSalesAnomaliBannerTimer();
        }
        // Jeda hitung mundur selama mouse berada di atas banner (mis. lagi dibaca), supaya
        // tidak tiba-tiba hilang saat masih ingin dibaca/diklik; lanjut lagi 60dtk saat mouse keluar.
        document.getElementById('salesAnomaliBanner').addEventListener('mouseenter', function() {
            if (salesAnomaliBannerTimer) { clearTimeout(salesAnomaliBannerTimer); salesAnomaliBannerTimer = null; }
        });
        document.getElementById('salesAnomaliBanner').addEventListener('mouseleave', function() {
            if (this.classList.contains('show')) startSalesAnomaliBannerTimer();
        });

        document.getElementById('salesAnomaliBannerClose').addEventListener('click', function() {
            document.getElementById('salesAnomaliBanner').classList.remove('show');
            if (salesAnomaliBannerTimer) { clearTimeout(salesAnomaliBannerTimer); salesAnomaliBannerTimer = null; }
        });

        document.getElementById('salesAnomaliBannerBtn').addEventListener('click', function() {
            document.getElementById('salesAnomaliBanner').classList.remove('show');
            if (salesAnomaliBannerTimer) { clearTimeout(salesAnomaliBannerTimer); salesAnomaliBannerTimer = null; }
            bukaModalDeteksiAnomaliSales();
        });

        function anomaliRowHtml(idx, catLabel) {
            const r = salesData[idx];
            if (!r) return '';
            const jumlah = parseNumber(r.Jumlah);
            const harga = parseNumber(r['Harga Jual']);
            const disc = parseNumber(r.Disc);
            const totalRaw = (r.Total !== undefined && r.Total !== '') ? parseNumber(r.Total) : ((jumlah || 0) * (harga || 0) - (disc || 0));
            return `<tr>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;"><input type="checkbox" class="anomali-row-checkbox" data-idx="${idx}"></td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escapeHtml(String(r.Tanggal || ''))}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escapeHtml(String(r['No.Faktur'] || ''))}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escapeHtml(String(r.Produk || ''))}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(String(r.Jumlah))}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${fmtRp(totalRaw)}</td>
                <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escapeHtml(catLabel)}</td>
            </tr>`;
        }

        function bukaModalDeteksiAnomaliSales() {
            if (!salesData.length) { showToast('Tidak ada data di Bank Data Penjualan.', 'warning'); return; }
            const result = detectSalesAnomali(salesData);
            const total = totalAnomaliCount(result);
            if (!total) {
                showToast('✅ Tidak ditemukan anomali di Bank Data Penjualan saat ini.', 'success');
                document.getElementById('salesAnomaliBanner').classList.remove('show');
                return;
            }
            let rowsHtml = '';
            result.toDeleteIdx.forEach(idx => rowsHtml += anomaliRowHtml(idx, '🧹 Baris Hantu (siap dibersihkan)'));
            result.toFlagIdx.forEach(idx => rowsHtml += anomaliRowHtml(idx, '⚠️ Minus tanpa pasangan'));
            result.duplicateIdx.forEach(idx => rowsHtml += anomaliRowHtml(idx, '📋 Duplikat Persis (siap dibersihkan)'));
            result.totalMinus.forEach(idx => rowsHtml += anomaliRowHtml(idx, '🔻 Total minus'));
            result.hargaKosong.forEach(idx => rowsHtml += anomaliRowHtml(idx, '❓ Harga Jual kosong/0'));
            result.discBerlebih.forEach(idx => rowsHtml += anomaliRowHtml(idx, '❗ Disc > nilai jual'));

            document.getElementById('detailModalTitleGlobal').textContent = `🔍 Deteksi Anomali Bank Data Penjualan (${total} baris)`;
            document.getElementById('detailModalBodyGlobal').innerHTML = `
                <p style="margin-bottom:10px;font-size:12px;color:#555;">
                    Ringkasan: <b>${result.toDeleteIdx.length}</b> baris hantu siap dibersihkan otomatis,
                    <b>${result.toFlagIdx.length}</b> baris minus tanpa pasangan (perlu periksa manual),
                    <b>${result.duplicateIdx.length}</b> baris duplikat persis siap dibersihkan otomatis,
                    <b>${result.totalMinus.length}</b> Total transaksi minus,
                    <b>${result.hargaKosong.length}</b> baris Harga Jual kosong/0,
                    <b>${result.discBerlebih.length}</b> baris Disc lebih besar dari nilai jual.
                </p>
                <div style="max-height:360px;overflow:auto;margin-bottom:12px;">
                <table style="width:100%;border-collapse:collapse;font-size:11px;">
                    <thead><tr style="background:#f1f5f9;">
                        <th style="padding:4px 8px;border:1px solid #e2e8f0;text-align:center;"><input type="checkbox" id="anomaliSelectAllCheckbox" title="Pilih semua"></th>
                        <th style="padding:4px 8px;border:1px solid #e2e8f0;">Tanggal</th>
                        <th style="padding:4px 8px;border:1px solid #e2e8f0;">No.Faktur</th>
                        <th style="padding:4px 8px;border:1px solid #e2e8f0;">Produk</th>
                        <th style="padding:4px 8px;border:1px solid #e2e8f0;">Jumlah</th>
                        <th style="padding:4px 8px;border:1px solid #e2e8f0;">Total</th>
                        <th style="padding:4px 8px;border:1px solid #e2e8f0;">Kategori</th>
                    </tr></thead>
                    <tbody>${rowsHtml}</tbody>
                </table>
                </div>
                <p style="margin:0 0 8px;font-size:11px;color:#666;">Centang baris yang sudah kamu periksa (misal retur/void yang sah): pilih <b>"✅ Tandai Sudah Diperiksa"</b> kalau datanya memang benar dan mau tetap disimpan di Bank Data Penjualan (tidak akan dideteksi lagi), atau <b>"🗑️ Pindah ke Sampah"</b> kalau datanya memang mau dikeluarkan (masih bisa dipulihkan dari tab Trash &amp; Save). Pengecekan berikutnya hanya akan menyorot data yang benar-benar baru.</p>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                ${result.toDeleteIdx.length ? `<button class="btn" id="btnBersihkanDariModalAnomali" style="background:#0d6efd;border-color:#0d6efd;">🧹 Bersihkan Baris Hantu Sekarang</button>` : ''}
                ${result.duplicateIdx.length ? `<button class="btn" id="btnBersihkanDuplikatDariModalAnomali" style="background:#7c3aed;border-color:#7c3aed;">📋 Bersihkan Duplikat Sekarang</button>` : ''}
                <button class="btn" id="btnAbaikanDariModalAnomali" style="background:#64748b;border-color:#64748b;">✅ Tandai Sudah Diperiksa (Terpilih)</button>
                <button class="btn" id="btnPindahSampahDariModalAnomali" style="background:#b45309;border-color:#b45309;">🗑️ Pindah ke Sampah (Terpilih)</button>
                </div>
            `;
            document.getElementById('detailModalGlobal').classList.add('show');
            const btnBersihkanModal = document.getElementById('btnBersihkanDariModalAnomali');
            if (btnBersihkanModal) {
                btnBersihkanModal.addEventListener('click', function() {
                    document.getElementById('detailModalGlobal').classList.remove('show');
                    document.getElementById('btnBersihkanHantu').click();
                });
            }
            const btnBersihkanDuplikatModal = document.getElementById('btnBersihkanDuplikatDariModalAnomali');
            if (btnBersihkanDuplikatModal) {
                btnBersihkanDuplikatModal.addEventListener('click', async function() {
                    document.getElementById('detailModalGlobal').classList.remove('show');
                    await bersihkanDuplikatPersisSales();
                });
            }
            const selectAllCb = document.getElementById('anomaliSelectAllCheckbox');
            if (selectAllCb) {
                selectAllCb.addEventListener('change', function() {
                    document.querySelectorAll('.anomali-row-checkbox').forEach(cb => { cb.checked = selectAllCb.checked; });
                });
            }
            const btnAbaikanModal = document.getElementById('btnAbaikanDariModalAnomali');
            if (btnAbaikanModal) {
                btnAbaikanModal.addEventListener('click', function() {
                    const idxs = Array.from(document.querySelectorAll('.anomali-row-checkbox:checked')).map(cb => parseInt(cb.dataset.idx, 10));
                    if (!idxs.length) { showToast('⚠️ Centang minimal 1 baris yang mau ditandai sudah diperiksa.', 'warning'); return; }
                    const dismissed = getSalesAnomaliDismissedSet();
                    idxs.forEach(idx => {
                        const r = salesData[idx];
                        if (r) dismissed.add(buatKunciAnomaliSales(r));
                    });
                    saveSalesAnomaliDismissedSet(dismissed);
                    document.getElementById('detailModalGlobal').classList.remove('show');
                    checkAndShowSalesAnomaliBanner();
                    showToast(`✅ ${idxs.length} baris ditandai sudah diperiksa. Data tetap ada di Bank Data Penjualan, tapi tidak akan dideteksi lagi di pengecekan berikutnya.`, 'success');
                });
            }
            const btnPindahModal = document.getElementById('btnPindahSampahDariModalAnomali');
            if (btnPindahModal) {
                btnPindahModal.addEventListener('click', function() {
                    const idxs = Array.from(document.querySelectorAll('.anomali-row-checkbox:checked')).map(cb => parseInt(cb.dataset.idx, 10));
                    if (!idxs.length) { showToast('⚠️ Centang minimal 1 baris yang mau dipindah ke Sampah.', 'warning'); return; }
                    showTrashConfirmModal(idxs.length, async function(alasan) {
                        const jumlah = await pindahkanSalesKeSampah(idxs, alasan);
                        rebuildSalesFilterOptions();
                        salesCurrentDateIndex = Infinity;
                        renderSales();
                        renderTrashTable();
                        renderRingkasanSaveAll();
                        document.getElementById('detailModalGlobal').classList.remove('show');
                        checkAndShowSalesAnomaliBanner();
                        showToast(`🗑️ ${jumlah} data dipindahkan ke Data Sampah.`, 'success');
                    });
                    const reasonInputEl = document.getElementById('confirmModalReasonInput');
                    if (reasonInputEl) reasonInputEl.value = 'Sudah diperiksa - retur/void sah';
                });
            }
        }

        // ================================================================
        // PEMBERSIHAN DUPLIKAT PERSIS — dipanggil dari tombol di modal
        // deteksi anomali. Untuk tiap kelompok baris identik plek-ketiplek,
        // hanya baris pertama yang dipertahankan, sisanya dihapus.
        // ================================================================
        async function bersihkanDuplikatPersisSales() {
            if (!salesData.length) { showToast('Tidak ada data di Bank Data Penjualan.', 'warning'); return; }

            const { duplicateIdx, duplicateGroups } = cariDuplikatPersisSales(salesData);

            if (!duplicateIdx.length) {
                showToast('✅ Tidak ditemukan baris duplikat persis di Bank Data Penjualan.', 'success');
                return;
            }

            const konfirmasi = `Ditemukan ${duplicateIdx.length} baris duplikat persis ` +
                `(isi sama plek-ketiplek dengan baris lain) dari ${duplicateGroups.length} kelompok data.\n` +
                `Untuk tiap kelompok, HANYA 1 baris yang akan DIPERTAHANKAN, sisanya akan DIHAPUS.\n\nLanjutkan?`;
            if (!confirm(konfirmasi)) return;

            // Hapus dari index terbesar ke terkecil supaya index baris lain tidak kacau
            duplicateIdx.slice().sort((a, b) => b - a).forEach(idx => salesData.splice(idx, 1));

            const okSave = await saveSalesData();
            rebuildSalesFilterOptions();
            salesCurrentDateIndex = Infinity;
            renderSales();
            checkAndShowSalesAnomaliBanner();

            if (okSave) {
                showToast(`📋 ${duplicateIdx.length} baris duplikat persis berhasil dihapus.`, 'success');
            }
        }

        document.getElementById('btnBersihkanHantu').addEventListener('click', async function() {
            if (!salesData.length) { showToast('Tidak ada data di Bank Data Penjualan.', 'warning'); return; }

            const { toDeleteIdx, toFlagIdx } = cariBarisHantuSales(salesData);

            if (!toDeleteIdx.length && !toFlagIdx.length) {
                showToast('✅ Tidak ditemukan baris minus sama sekali di Bank Data Penjualan.', 'success');
                return;
            }

            const konfirmasi = `Ditemukan ${toDeleteIdx.length} baris hantu (pasangan minus/plus dari edit faktur) ` +
                `yang akan DIHAPUS,\ndan ${toFlagIdx.length} baris minus TANPA pasangan (kemungkinan retur/void asli) ` +
                `yang TIDAK akan dihapus, hanya dilaporkan untuk diperiksa manual.\n\nLanjutkan?`;
            if (!confirm(konfirmasi)) return;

            // Simpan detail baris yang perlu diperiksa manual SEBELUM index berubah
            const flaggedDetail = toFlagIdx.map(idx => salesData[idx]);

            // Hapus dari index terbesar ke terkecil supaya index baris lain tidak kacau
            toDeleteIdx.sort((a, b) => b - a).forEach(idx => salesData.splice(idx, 1));

            const okSave = await saveSalesData();
            rebuildSalesFilterOptions();
            salesCurrentDateIndex = Infinity;
            renderSales();
            checkAndShowSalesAnomaliBanner();

            if (okSave) {
                const pesanFlag = toFlagIdx.length ? ` ⚠️ ${toFlagIdx.length} baris ditandai untuk diperiksa manual.` : '';
                showToast(`🧹 ${toDeleteIdx.length} baris hantu berhasil dihapus.${pesanFlag}`, 'success');
            }

            if (flaggedDetail.length) {
                const rowsHtml = flaggedDetail.map(r => `
                    <tr>
                        <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escapeHtml(String(r.Tanggal || ''))}</td>
                        <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escapeHtml(String(r['No.Faktur'] || ''))}</td>
                        <td style="padding:4px 8px;border:1px solid #e2e8f0;">${escapeHtml(String(r.Produk || ''))}</td>
                        <td style="padding:4px 8px;border:1px solid #e2e8f0;text-align:right;">${escapeHtml(String(r.Jumlah))}</td>
                    </tr>`).join('');
                document.getElementById('detailModalTitleGlobal').textContent = '⚠️ Baris Minus Tanpa Pasangan — Periksa Manual';
                document.getElementById('detailModalBodyGlobal').innerHTML = `
                    <p style="margin-bottom:10px;font-size:12px;color:#555;">
                        Baris-baris minus di bawah ini TIDAK ditemukan pasangan plus-nya
                        (No.Faktur + Tanggal + Produk + jumlah sama), jadi TIDAK dihapus otomatis.
                        Ini kemungkinan retur/void asli, bukan hasil edit faktur — mohon periksa manual di tab Bank Data Penjualan.
                    </p>
                    <div style="max-height:360px;overflow:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:11px;">
                        <thead><tr style="background:#f1f5f9;">
                            <th style="padding:4px 8px;border:1px solid #e2e8f0;">Tanggal</th>
                            <th style="padding:4px 8px;border:1px solid #e2e8f0;">No.Faktur</th>
                            <th style="padding:4px 8px;border:1px solid #e2e8f0;">Produk</th>
                            <th style="padding:4px 8px;border:1px solid #e2e8f0;">Jumlah</th>
                        </tr></thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                    </div>`;
                document.getElementById('salesMenuDropdown').classList.remove('active');
                document.getElementById('detailModalGlobal').classList.add('show');
            }
        });

        document.getElementById('btnBersihkanDuplikatMenu').addEventListener('click', async function() {
            document.getElementById('salesMenuDropdown').classList.remove('active');
            await bersihkanDuplikatPersisSales();
        });

        document.getElementById('fileImportSales').addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(ev) {
                try {
                    showToast('⏳ Membaca & menyimpan file, mohon tunggu...', 'info');
                    const wb = XLSX.read(ev.target.result, { type: 'array', cellDates: true });
                    const sheet = wb.Sheets[wb.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
                    let added = 0;
                    let dupSkipped = 0;
                    const dupKeys = buildSalesDupKeySet(salesData);
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        if (!row || row.length < 8) continue;
                        const faktur = String(row[1] || '').trim();
                        if (!faktur || faktur.toUpperCase().includes('OOO') || faktur.toUpperCase().includes(
                            'TOTAL')) continue;
                        let tanggalRaw = row[0];
                        let tanggal = '';
                        if (tanggalRaw instanceof Date) { tanggal = tanggalRaw.toISOString().slice(0, 10); } else if (
                            typeof tanggalRaw === 'string' && tanggalRaw.includes('-')) { tanggal = tanggalRaw
                                .slice(0, 10); } else if (typeof tanggalRaw === 'string' && tanggalRaw.includes(
                            '/')) { const parts = tanggalRaw.split('/'); if (parts.length === 3) {
                                let thn = parts[2].trim();
                                if (thn.length === 2) thn = (parseInt(thn, 10) <= 69 ? '20' : '19') + thn;
                                tanggal = thn + '-' + parts[1].trim().padStart(2, '0') + '-' + parts[0].trim()
                                    .padStart(2, '0'); } }
                        if (!tanggal) continue;
                        const jumlah = parseNumber(row[3]);
                        let harga = parseNumber(row[5]);
                        let disc = parseNumber(row[6]);
                        let sales = String(row[8] || '').trim();
                        if (!sales || /^\d+$/.test(sales)) sales = 'LAINNYA';
                        let pembayaran = String(row[11] || '').trim();
                        if (pembayaran !== 'Cash' && pembayaran !== 'Tempo') pembayaran = 'Tempo';
                        const hargaBeliRaw = row[12];
                        let hargaBeli = (hargaBeliRaw === undefined || hargaBeliRaw === null || hargaBeliRaw ===
                            '') ? '' : parseNumber(hargaBeliRaw);
                        // 🔗 Link ke Master Produk & Harga (Tab 8): kalau Harga Beli kosong di file
                        // Excel, coba ambil otomatis dari daftar Master Produk berdasarkan nama produk.
                        if (hargaBeli === '') {
                            const hMaster = cariHargaProdukMaster(String(row[2] || ''));
                            if (hMaster && hMaster.hargaBeli !== '') hargaBeli = hMaster.hargaBeli;
                        }
                        // Koreksi otomatis: sebagian file sumber menulis Harga Jual/Disc dalam satuan
                        // RIBUAN (mis. 209 maksudnya Rp209.000) sementara Harga Beli ditulis dalam
                        // rupiah penuh (mis. 208800). Jika rasio Harga Beli terhadap Harga Jual sangat
                        // tinggi (>=20x), asumsikan beda skala 1000x dan samakan skalanya.
                        if (hargaBeli !== '' && harga > 0 && (hargaBeli / harga) >= 20) {
                            harga = harga * 1000;
                            disc = disc * 1000;
                        }
                        const total = (jumlah * harga) - disc;
                        // Profit selalu dihitung ulang dari Total (nominal diterima setelah Disc) &
                        // Harga Beli yang sudah sepadan skalanya, bukan memakai kolom Profit bawaan file
                        // (karena kolom Profit di file sumber sering ikut salah hitung akibat beda skala tsb).
                        // Profit = Total - (Harga Beli x Jumlah)
                        const profit = hargaBeli === '' ? '' : total - (hargaBeli * jumlah);
                        const produkTrim = String(row[2] || '').trim();
                        const dupKey = salesDupKey(faktur, produkTrim, tanggal, jumlah);
                        if (dupKeys.has(dupKey)) { dupSkipped++; continue; }
                        dupKeys.add(dupKey);
                        salesData.push({ 'Tanggal': tanggal, 'No.Faktur': faktur, 'Produk': produkTrim,
                                'Jumlah': jumlah, 'Satuan': String(row[4] || '').trim(),
                            'Harga Jual': harga, 'Disc': disc, 'Total': total, 'Sales': sales,
                            'Customer': String(row[9] || '').trim(), 'Alamat': String(row[10] || '').trim(),
                            'Pembayaran': pembayaran, 'Harga Beli': hargaBeli, 'Profit': profit });
                        added++;
                    }
                    const okSave = await saveSalesData();
                    rebuildSalesFilterOptions();
                    salesCurrentDateIndex = Infinity;
                    renderSales();
                    checkAndShowSalesAnomaliBanner();
                    if (okSave) {
                        const dupMsg = dupSkipped > 0 ? ` ⚠️ ${dupSkipped} baris duplikat (No.Faktur+Produk sudah ada) dilewati.` : '';
                        showToast('✅ ' + added + ' baris tersimpan permanen (aman untuk refresh).' + dupMsg, 'success');
                    }
                } catch (err) {
                    showToast('❌ Gagal baca file: ' + err.message, 'warning');
                }
                e.target.value = '';
            };
            reader.readAsArrayBuffer(file);
        });
        document.getElementById('btnExportSales').addEventListener('click', function() {
            if (!salesData.length) { showToast('Tidak ada data.', 'warning'); return; }
            const exportData = salesData.map(r => ({ 'Tanggal': r.Tanggal, 'No.Faktur': r['No.Faktur'],
                'Produk': r.Produk, 'Jumlah': r.Jumlah, 'Satuan': r.Satuan, 'Harga Jual': r['Harga Jual'],
                'Disc': r.Disc, 'Total': r.Total, 'Sales': r.Sales, 'Customer': r.Customer,
                'Alamat': r.Alamat, 'Pembayaran': r.Pembayaran, 'Harga Beli': r['Harga Beli'] === undefined ? ''
                    : r['Harga Beli'], 'Profit': r.Profit === undefined ? '' : r.Profit }));
            const ws = XLSX.utils.json_to_sheet(exportData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Data Penjualan');
            const filename = 'Bank_Data_Penjualan_' + new Date().toISOString().slice(0, 10) + '.xlsx';
            XLSX.writeFile(wb, filename);
            showToast('📥 ' + filename + ' (' + salesData.length + ' baris)', 'success');
        });
        document.getElementById('btnClearSales').addEventListener('click', async function() {
            if (!salesData.length) { showToast('Tidak ada data.', 'warning'); return; }
            if (!confirm('⚠️ Hapus SEMUA data penjualan?')) return;
            salesData = [];
            await saveSalesData();
            rebuildSalesFilterOptions();
            salesCurrentDateIndex = Infinity;
            renderSales();
            showToast('🗑️ Semua data penjualan dihapus.', 'warning');
        });

        // ================================================================
        // PINDAHKAN BARIS TERPILIH KE DATA SAMPAH (Tab 1 -> Tab 8)
        // ================================================================
        function updateSalesSelectedInfo() {
            const countEl = document.getElementById('salesSelectedCount');
            if (countEl) {
                if (salesRowsSelected.size > 0) {
                    countEl.style.display = 'inline';
                    countEl.textContent = '(' + salesRowsSelected.size + ')';
                } else {
                    countEl.style.display = 'none';
                }
            }
            // Dihitung dari daftar baris yang sedang tampil (salesVirtualDisplayRows),
            // bukan dari checkbox yang kebetulan ada di DOM — karena kalau tabelnya
            // divirtualisasi (data banyak), baris di luar layar tidak punya elemen
            // checkbox sama sekali.
            const selectAll = document.getElementById('salesSelectAll');
            if (selectAll) {
                const rowsNow = salesVirtualDisplayRows;
                const idxMapNow = salesVirtualIndexMap;
                let totalCount = 0,
                    selectedCount = 0;
                rowsNow.forEach(r => {
                    const gidx = idxMapNow.get(r);
                    if (gidx === undefined) return;
                    totalCount++;
                    if (salesRowsSelected.has(gidx)) selectedCount++;
                });
                selectAll.checked = (totalCount > 0 && selectedCount === totalCount);
            }

            // Floating toolbar: muncul otomatis begitu ada baris yang dicentang,
            // jadi tidak perlu cari-cari tombol lagi di ujung tabel.
            const toolbar = document.getElementById('salesSelectionToolbar');
            const toolbarCount = document.getElementById('salesToolbarCount');
            if (toolbar) {
                if (salesRowsSelected.size > 0) {
                    if (toolbarCount) toolbarCount.textContent = salesRowsSelected.size;
                    toolbar.classList.add('show');
                } else {
                    toolbar.classList.remove('show');
                }
            }
        }

        document.getElementById('salesTableBody').addEventListener('change', function(e) {
            if (e.target.classList.contains('sales-trash-checkbox')) {
                const gidx = parseInt(e.target.dataset.gidx, 10);
                if (e.target.checked) salesRowsSelected.add(gidx); else salesRowsSelected.delete(gidx);
                updateSalesSelectedInfo();
            }
        });

        document.getElementById('salesSelectAll').addEventListener('change', function() {
            const checked = this.checked;
            // Pakai daftar baris logis (bukan cuma checkbox yang ada di DOM) supaya
            // "pilih semua" tetap memilih SEMUA baris yang sedang tampil, walau
            // sebagian belum dirender ke DOM karena tabelnya divirtualisasi.
            const rowsNow = salesVirtualDisplayRows;
            const idxMapNow = salesVirtualIndexMap;
            rowsNow.forEach(r => {
                const gidx = idxMapNow.get(r);
                if (gidx === undefined) return;
                if (checked) salesRowsSelected.add(gidx); else salesRowsSelected.delete(gidx);
            });
            renderSalesTableWindow();
            if (tab1ViewMode === 'card') {
                renderSalesCards(rowsNow, idxMapNow, salesVirtualCardStatusMap || new Map());
            }
            updateSalesSelectedInfo();
        });

        // ----------------------------------------------------------------
        // Modal konfirmasi custom (pengganti confirm()/prompt() bawaan browser).
        // Dipakai untuk konfirmasi "Serius Mau Dipindah Ke Tempat Sampah..?"
        // Bisa dipakai ulang untuk fitur lain yang butuh konfirmasi + input alasan.
        // ----------------------------------------------------------------
        function showTrashConfirmModal(jumlahTerpilih, onConfirm) {
            const overlay = document.getElementById('confirmModalOverlay');
            const titleEl = document.getElementById('confirmModalTitle');
            const descEl = document.getElementById('confirmModalDesc');
            const reasonInput = document.getElementById('confirmModalReasonInput');
            const okBtn = document.getElementById('confirmModalOk');
            const cancelBtn = document.getElementById('confirmModalCancel');

            titleEl.textContent = 'Serius Mau Dipindah Ke Tempat Sampah..?';
            descEl.textContent = jumlahTerpilih > 1
                ? jumlahTerpilih + ' data yang dicentang akan dipindahkan ke Data Sampah. Data masih bisa dipulihkan lagi dari tab Trash & Save.'
                : '1 data yang dicentang akan dipindahkan ke Data Sampah. Data masih bisa dipulihkan lagi dari tab Trash & Save.';
            reasonInput.value = 'Salah Input';

            overlay.classList.add('show');
            setTimeout(() => reasonInput.focus(), 50);

            function cleanup() {
                overlay.classList.remove('show');
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                overlay.removeEventListener('click', onOverlayClick);
            }
            function onOk() {
                const alasan = reasonInput.value.trim() || '-';
                cleanup();
                onConfirm(alasan);
            }
            function onCancel() { cleanup(); }
            function onOverlayClick(e) { if (e.target === overlay) cleanup(); }

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
            overlay.addEventListener('click', onOverlayClick);
        }

        async function jalankanPindahSalesKeSampah() {
            if (salesRowsSelected.size === 0) { showToast('⚠️ Pilih minimal 1 baris data terlebih dahulu (centang di kolom paling kiri).', 'warning'); return; }
            showTrashConfirmModal(salesRowsSelected.size, async function(alasan) {
                const jumlah = await pindahkanSalesKeSampah(Array.from(salesRowsSelected), alasan);
                salesRowsSelected.clear();
                rebuildSalesFilterOptions();
                salesCurrentDateIndex = Infinity;
                renderSales();
                renderTrashTable();
                renderRingkasanSaveAll();
                updateSalesSelectedInfo();
                showToast(`🗑️ ${jumlah} data dipindahkan ke Data Sampah.`, 'success');
            });
        }

        // Tombol lama di dalam tabel (tetap ada, tidak perlu cari-cari lagi karena
        // sekarang ada juga floating toolbar di bawah layar begitu ada centang).
        document.getElementById('btnTrashSales').addEventListener('click', jalankanPindahSalesKeSampah);

        // Tombol pada floating toolbar yang muncul otomatis saat ada baris dicentang.
        document.getElementById('btnSalesToolbarTrash').addEventListener('click', jalankanPindahSalesKeSampah);

        // Tombol "Batal" di floating toolbar: batalkan semua centang.
        document.getElementById('btnSalesToolbarCancel').addEventListener('click', function() {
            salesRowsSelected.clear();
            document.querySelectorAll('.sales-trash-checkbox').forEach(cb => cb.checked = false);
            updateSalesSelectedInfo();
        });

        // ================================================================
