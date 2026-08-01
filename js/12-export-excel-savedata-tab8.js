        // TAB 8 - SAVE DATA ALL (BACKUP & RESTORE SEMUA DATA)
        // ================================================================
        function getAllInputHarianKeys() {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith('inputHarian_')) keys.push(k);
            }
            return keys;
        }

        // Bagian RINGAN saja: hitung badge/angka ringkasan (pakai .count(), bukan
        // .toArray(), jadi murah) — aman dipanggil di startup meski user belum
        // membuka Tab 8, supaya badge tetap akurat tanpa render tabel penuh.
        async function updateRingkasanBadges() {
            try {
                const [salesCount, cashCount, printCount, sampahCount] = await Promise.all([
                    db.sales.count(),
                    db.cashIncome.count(),
                    db.printHistory.count(),
                    db.trash.count()
                ]);
                document.getElementById('sumSales').textContent = salesCount;
                document.getElementById('sumCash').textContent = cashCount;
                document.getElementById('sumPrint').textContent = printCount;
                document.getElementById('sumHarian').textContent = getAllInputHarianKeys().length;
                document.getElementById('sumSampah').textContent = sampahCount;
                const trashBadge = document.getElementById('badgeTrash');
                if (trashBadge) trashBadge.textContent = sampahCount;
            } catch (e) {
                console.warn('Gagal memuat ringkasan Save All:', e);
            }
        }

        // Versi LENGKAP (dipanggil saat Tab 8 benar-benar dibuka, atau setelah
        // ada perubahan data sampah/print history): badge + tabel sampah +
        // riwayat cetak. Bagian ini yang "berat" karena membaca & merender
        // seluruh isi tabel, makanya sengaja tidak dipanggil di startup.
        async function renderRingkasanSaveAll() {
            await updateRingkasanBadges();
            await loadTrashData();
            renderTrashTable();
            await renderRiwayatCetak();

            const lastBackup = localStorage.getItem('gmLastBackupAt');
            const statusEl = document.getElementById('saveAllStatus');
            if (statusEl) {
                statusEl.textContent = lastBackup
                    ? '✅ Backup terakhir: ' + lastBackup
                    : '📭 Belum pernah backup di perangkat ini.';
            }
        }

        async function simpanSemuaData() {
            const ok = confirm('Save All ke Device Ini?');
            if (!ok) return;

            try {
                const [sales, cashIncome, printHistory, trash, piutangNotes, cashNotes, cetakTagihan] = await Promise.all([
                    db.sales.toArray(),
                    db.cashIncome.toArray(),
                    db.printHistory.toArray(),
                    db.trash.toArray(),
                    db.piutangNotes.toArray(),
                    db.cashNotes.toArray(),
                    db.cetakTagihanMap.toArray()
                ]);

                const inputHarian = {};
                getAllInputHarianKeys().forEach(function(key) {
                    try {
                        inputHarian[key] = JSON.parse(localStorage.getItem(key));
                    } catch (e) {}
                });

                const backup = {
                    app: 'GAMAS 2026 - All in One',
                    backupVersion: 2,
                    exportedAt: new Date().toISOString(),
                    data: { sales, cashIncome, printHistory, inputHarian, trash, piutangNotes, cashNotes, cetakTagihan }
                };

                const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                const a = document.createElement('a');
                a.href = url;
                a.download = 'GAJAH_MAS_2026_BACKUP_' + stamp + '.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);

                const now = new Date().toLocaleString('id-ID');
                localStorage.setItem('gmLastBackupAt', now);
                
                // === PERBAIKAN: Banner peringatan hilang otomatis setelah Save All Data ===
                const bar = document.getElementById('storageStatusBar');
                if (bar) {
                    bar.style.display = 'none';
                    sessionStorage.setItem('gmBannerDismissed', 'true');
                }
                
                renderRingkasanSaveAll();
                showToast('✅ Semua data berhasil disimpan ke perangkat ini!', 'success');
            } catch (e) {
                showToast('❌ Gagal menyimpan data: ' + e.message, 'warning');
            }
        }

        async function muatSemuaDataDariFile(file) {
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const backup = JSON.parse(e.target.result);
                    if (!backup || !backup.data) {
                        showToast('File backup tidak valid.', 'warning');
                        return;
                    }
                    const ok = confirm('Restore akan MENIMPA data yang ada saat ini dengan isi file backup. Lanjutkan?');
                    if (!ok) return;

                    const { sales, cashIncome, printHistory, inputHarian, trash, piutangNotes, cashNotes, cetakTagihan } = backup.data;

                    if (Array.isArray(sales)) {
                        await db.sales.clear();
                        if (sales.length) await db.sales.bulkAdd(sales);
                    }
                    if (Array.isArray(cashIncome)) {
                        await db.cashIncome.clear();
                        if (cashIncome.length) await db.cashIncome.bulkAdd(cashIncome);
                    }
                    if (Array.isArray(printHistory)) {
                        await db.printHistory.clear();
                        if (printHistory.length) await db.printHistory.bulkAdd(printHistory);
                    }
                    if (Array.isArray(trash)) {
                        await db.trash.clear();
                        if (trash.length) await db.trash.bulkAdd(trash);
                    }
                    if (Array.isArray(piutangNotes)) {
                        await db.piutangNotes.clear();
                        if (piutangNotes.length) await db.piutangNotes.bulkAdd(piutangNotes);
                    }
                    if (Array.isArray(cashNotes)) {
                        await db.cashNotes.clear();
                        if (cashNotes.length) await db.cashNotes.bulkAdd(cashNotes);
                    }
                    if (Array.isArray(cetakTagihan)) {
                        await db.cetakTagihanMap.clear();
                        if (cetakTagihan.length) await db.cetakTagihanMap.bulkAdd(cetakTagihan);
                    }
                    if (inputHarian && typeof inputHarian === 'object') {
                        getAllInputHarianKeys().forEach(function(k) { localStorage.removeItem(k); });
                        Object.keys(inputHarian).forEach(function(k) {
                            localStorage.setItem(k, JSON.stringify(inputHarian[k]));
                        });
                    }

                    await loadSalesData();
                    await loadCashData();
                    await loadTrashData();
                    await loadPiutangNotes();
                    await loadCashNotes();
                    await loadCetakTagihanMap();
                    autoBackupSalesToLocalStorage();
                    await autoBackupCashToLocalStorage();
                    renderPemasukan();
                    renderSales();
                    renderCek();
                    window._cekDataLoaded = true;
                    await ptRefresh(false);
                    window._ptDataLoaded = true;
                    renderTagihanDariPiutang();
                    renderRingkasanSaveAll();

                    showToast('✅ Data berhasil dipulihkan dari backup!', 'success');
                } catch (err) {
                    showToast('❌ Gagal memulihkan data: ' + err.message, 'warning');
                }
            };
            reader.readAsText(file);
        }

        document.getElementById('trashTableBody').addEventListener('click', function(e) {
            const restoreBtn = e.target.closest('.trash-restore-btn');
            const deleteBtn = e.target.closest('.trash-delete-btn');
            if (restoreBtn) {
                const id = parseInt(restoreBtn.dataset.id, 10);
                if (confirm('Pulihkan data ini kembali ke Bank Data Penjualan?')) pulihkanDariSampah(id);
            } else if (deleteBtn) {
                const id = parseInt(deleteBtn.dataset.id, 10);
                hapusPermanenSampah(id);
            }
        });
        document.getElementById('trashTableBody').addEventListener('change', function(e) {
            const cb = e.target.closest('.trash-row-checkbox');
            if (!cb) return;
            const id = parseInt(cb.dataset.id, 10);
            if (cb.checked) trashRowsSelected.add(id); else trashRowsSelected.delete(id);
            renderTrashTable();
        });
        document.getElementById('trashSelectAll').addEventListener('change', function() {
            const filtered = getFilteredTrash();
            const start = (trashPage - 1) * trashRowsPerPage;
            const idsOnPage = filtered.slice(start, start + trashRowsPerPage).map(t => t.id);
            if (this.checked) idsOnPage.forEach(id => trashRowsSelected.add(id));
            else idsOnPage.forEach(id => trashRowsSelected.delete(id));
            renderTrashTable();
        });
        document.getElementById('trashSearch').addEventListener('input', function() {
            trashSearchQuery = this.value;
            trashPage = 1;
            renderTrashTable();
        });
        document.getElementById('trashSalesFilter').addEventListener('change', function() {
            trashSalesFilterVal = this.value;
            trashPage = 1;
            renderTrashTable();
        });
        document.getElementById('trashAlasanFilter').addEventListener('change', function() {
            trashAlasanFilterVal = this.value;
            trashPage = 1;
            renderTrashTable();
        });
        document.getElementById('trashBtnReset').addEventListener('click', function() {
            trashSearchQuery = '';
            trashSalesFilterVal = '';
            trashAlasanFilterVal = '';
            document.getElementById('trashSearch').value = '';
            trashPage = 1;
            renderTrashTable();
        });
        document.getElementById('trashPrevPage').addEventListener('click', function() {
            if (trashPage > 1) { trashPage--; renderTrashTable(); }
        });
        document.getElementById('trashNextPage').addEventListener('click', function() {
            const totalPages = Math.max(1, Math.ceil(getFilteredTrash().length / trashRowsPerPage));
            if (trashPage < totalPages) { trashPage++; renderTrashTable(); }
        });
        document.getElementById('btnRestoreAllTrash').addEventListener('click', restoreTerpilihAtauSemuaDariSampah);
        document.getElementById('btnEmptyTrash').addEventListener('click', kosongkanSampah);

        document.getElementById('btnRefreshRiwayatCetak').addEventListener('click', renderRiwayatCetak);
        document.getElementById('btnKosongkanRiwayatCetak').addEventListener('click', async function() {
            if (!confirm('Yakin mau menghapus SEMUA riwayat cetak?\nTindakan ini tidak bisa dibatalkan.')) return;
            try {
                await db.printHistory.clear();
                await renderRiwayatCetak();
                const c = await db.printHistory.count();
                const el = document.getElementById('sumPrint');
                if (el) el.textContent = c;
                showToast('🗑️ Riwayat cetak dikosongkan.', 'success');
            } catch (e) {
                showToast('❌ Gagal mengosongkan riwayat cetak: ' + e.message, 'warning');
            }
        });

        document.getElementById('btnSaveAllData').addEventListener('click', simpanSemuaData);
        document.getElementById('btnRestoreAllData').addEventListener('click', function() {
            document.getElementById('restoreAllFileInput').click();
        });
        document.getElementById('restoreAllFileInput').addEventListener('change', function(e) {
            const file = e.target.files[0];
            muatSemuaDataDariFile(file);
            e.target.value = '';
        });

        // ================================================================
        // MODAL DETAIL FAKTUR – TAB 1 (BANK DATA PENJUALAN)
        // Klik No.Faktur di tabel Tab 1 -> tampilkan Harga Beli, Harga Jual,
        // dan Profit per item dari faktur tsb.
        // ================================================================
        function tab1ShowFakturDetail(noFaktur) {
            noFaktur = String(noFaktur || '').trim();
            if (!noFaktur) return;

            const gidxList = [];
            salesData.forEach((s, i) => { if (normFaktur(s['No.Faktur']) === normFaktur(noFaktur)) gidxList.push(i); });
            if (!gidxList.length) return;
            const rows = gidxList.map(i => salesData[i]);

            let totalQty = 0,
                totalJual = 0,
                totalBeli = 0,
                totalProfit = 0,
                adaHargaBeli = false;

            const baris = rows.map((it, i) => {
                const gidx = gidxList[i];
                const jumlah = parseNumber(it.Jumlah);
                const hargaJual = parseNumber(it['Harga Jual']);
                const disc = parseNumber(it.Disc);
                const hargaBeli = (it['Harga Beli'] !== undefined && it['Harga Beli'] !== '' && it['Harga Beli'] !==
                    null) ? parseNumber(it['Harga Beli']) : null;
                const totalBaris = it.Total !== undefined && it.Total !== '' ? parseNumber(it.Total) : (jumlah *
                    hargaJual) - disc;
                let profitBaris;
                if (it.Profit !== undefined && it.Profit !== '' && it.Profit !== null) {
                    profitBaris = parseNumber(it.Profit);
                } else if (hargaBeli !== null) {
                    profitBaris = totalBaris - (hargaBeli * jumlah);
                } else {
                    profitBaris = null;
                }
                if (hargaBeli !== null) adaHargaBeli = true;
                totalQty += jumlah;
                totalJual += totalBaris;
                if (hargaBeli !== null) totalBeli += hargaBeli * jumlah;
                if (profitBaris !== null) totalProfit += profitBaris;
                return `<tr data-gidx="${gidx}">
                        <td style="padding:6px 8px;"><input type="text" class="tab1e-produk" list="produkMasterDatalist" value="${escapeHtml(it.Produk || '')}" style="width:100%;min-width:110px;box-sizing:border-box;padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;font-size:11.5px;"></td>
                        <td class="num" style="padding:6px 8px;"><input type="number" class="tab1e-qty num" value="${jumlah || 0}" style="width:100%;box-sizing:border-box;text-align:right;padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;font-size:11.5px;"></td>
                        <td class="num" style="padding:6px 8px;"><input type="number" class="tab1e-hargabeli num" value="${hargaBeli !== null ? hargaBeli : ''}" placeholder="-" style="width:100%;box-sizing:border-box;text-align:right;padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;font-size:11.5px;"></td>
                        <td class="num" style="padding:6px 8px;"><input type="number" class="tab1e-hargajual num" value="${hargaJual || 0}" style="width:100%;box-sizing:border-box;text-align:right;padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;font-size:11.5px;"></td>
                        <td class="num" style="padding:6px 8px;"><input type="number" class="tab1e-disc num" value="${disc || 0}" style="width:100%;box-sizing:border-box;text-align:right;padding:5px 7px;border:1px solid #cbd5e1;border-radius:5px;font-size:11.5px;"></td>
                        <td class="num tab1e-total" style="font-weight:700;padding:6px 8px;font-size:12.5px;color:#1e3a5f;">${fmtRp(totalBaris)}</td>
                    </tr>`;
            }).join('');

            const first = rows[0];
            const marginPct = totalJual > 0 && adaHargaBeli ? ((totalProfit / totalJual) * 100).toFixed(1) : null;
            const isCash = first.Pembayaran === 'Cash';

            document.getElementById('detailModalTitleGlobal').textContent = `🧾 Detail Faktur - ${noFaktur}`;
            document.getElementById('detailModalBodyGlobal').innerHTML = `
                    <div style="display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;">
                        <div style="font-size:11px; line-height:1.9; min-width:220px;">
                            <div><strong>No. Faktur:</strong> ${escapeHtml(noFaktur)}</div>
                            <div><strong>Tanggal:</strong> ${fmtTanggal(first.Tanggal)}</div>
                            <div><strong>Sales:</strong> ${escapeHtml(first.Sales || '-')}</div>
                            <div><strong>Customer:</strong> ${escapeHtml(first.Customer || '-')}</div>
                            <div><strong>Alamat:</strong> ${escapeHtml(first.Alamat || '-')}</div>
                            <div style="display:flex;align-items:center;gap:8px;">
                                <strong>Pembayaran:</strong>
                            <select id="tab1EditPembayaran" style="padding:3px 8px;border:1px solid #cbd5e1;border-radius:4px;font-size:11px;font-weight:600;">
                                <option value="Cash" ${isCash ? 'selected' : ''}>Cash</option>
                                <option value="Tempo" ${!isCash ? 'selected' : ''}>Tempo</option>
                            </select>
                            </div>
                        </div>
                        <div style="min-width:220px;max-width:360px;text-align:right;">
                            <div class="teks-kedip-cepat" style="font-size:13px;font-weight:800;color:#c2410c;line-height:1.4;">BISA RUBAH TRANSAKSI DISINI</div>
                            <div style="font-size:10px;color:#6b7280;margin-top:2px;">( jika klik <strong>Transaksi Batal</strong>, data akan dipindah ke Trash dan tidak akan ikut dijumlahkan )</div>
                        </div>
                    </div>
                    <hr style="margin:14px 0; border:none; border-top:1px solid var(--line);">
                    <div style="font-size:12px;font-weight:700;margin-bottom:8px;">📦 Rincian Item <span style="font-weight:400;color:#6b7280;">(bisa diedit — Produk, Qty, Harga Beli, Harga Jual, Disc. Total otomatis terisi)</span></div>
                    <div class="df-table-wrap">
                    <table id="tab1EditFakturTable" style="width:100%; table-layout:fixed; border-collapse:collapse; font-size:11.5px;">
                        <colgroup>
                            <col style="width:auto;">
                            <col style="width:60px;">
                            <col style="width:100px;">
                            <col style="width:100px;">
                            <col style="width:90px;">
                            <col style="width:120px;">
                        </colgroup>
                        <thead>
                            <tr>
                                <th style="text-align:left;padding:8px 8px;">Produk</th>
                                <th style="text-align:right;padding:8px 8px;">Qty</th>
                                <th style="text-align:right;padding:8px 8px;">Harga Beli</th>
                                <th style="text-align:right;padding:8px 8px;">Harga Jual</th>
                                <th style="text-align:right;padding:8px 8px;">Disc</th>
                                <th style="text-align:right;padding:8px 8px;">Total</th>
                            </tr>
                        </thead>
                        <tbody>${baris}</tbody>
                    </table>
                    </div>
                    <div class="df-total-box">
                        <div class="df-total-label">TOTAL &nbsp;(<span id="tab1EditTotalQty">${totalQty}</span> pcs)</div>
                        <div class="df-total-value" id="tab1EditTotalJual">${fmtRp(totalJual)}</div>
                    </div>
                    <hr style="margin:14px 0; border:none; border-top:1px solid var(--line);">
                    <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                        <button type="button" id="tab1BtnTransaksiBatal" class="btn btn-danger df-btn-pill" data-faktur="${escapeHtml(noFaktur)}">❌ Transaksi Batal</button>
                        <button type="button" id="tab1BtnUbahFaktur" class="btn btn-success df-btn-pill" data-faktur="${escapeHtml(noFaktur)}">✅ Ubah &amp; Simpan</button>
                    </div>
                `;
            document.getElementById('detailModalGlobal').classList.add('show');
            setDetailModalStempelLunas(false);
            tab1BindEditFakturModalEvents();
        }

        // Hitung ulang Total & Profit per baris (live) setiap kali user mengetik
        // di kolom Qty/Harga Beli/Harga Jual pada modal edit faktur Tab 1.
        function tab1HitungUlangBarisEdit(tr) {
            const qty = parseAngka(tr.querySelector('.tab1e-qty').value);
            const hargaJual = parseAngka(tr.querySelector('.tab1e-hargajual').value);
            const disc = parseAngka(tr.querySelector('.tab1e-disc').value);
            const total = (qty * hargaJual) - disc;
            tr.querySelector('.tab1e-total').textContent = fmtRp(total);
            tab1HitungUlangTotalKeseluruhanEdit();
        }

        function tab1HitungUlangTotalKeseluruhanEdit() {
            const table = document.getElementById('tab1EditFakturTable');
            if (!table) return;
            let totalQty = 0,
                totalJual = 0;
            table.querySelectorAll('tbody tr').forEach(tr => {
                const qty = parseAngka(tr.querySelector('.tab1e-qty').value);
                const hargaJual = parseAngka(tr.querySelector('.tab1e-hargajual').value);
                const disc = parseAngka(tr.querySelector('.tab1e-disc').value);
                const total = (qty * hargaJual) - disc;
                totalQty += qty;
                totalJual += total;
            });
            document.getElementById('tab1EditTotalQty').textContent = totalQty;
            document.getElementById('tab1EditTotalJual').textContent = fmtRp(totalJual);
        }

        // ================================================================
        // AUTOCOMPLETE PRODUK (dropdown kustom) — dipakai di kolom "Produk"
        // pada modal Detail Faktur (Rincian Item, bisa diedit).
        // Ketik huruf awal nama produk -> muncul daftar produk yang namanya
        // diawali huruf/kata tsb, tinggal klik salah satu untuk memilih.
        // Dibuat manual (bukan hanya andalkan <datalist>) karena <datalist>
        // tidak didukung di sebagian browser mobile (mis. Safari iOS).
        // ================================================================
        let _produkAcBox = null;
        let _produkAcCurrentInput = null;
        let _produkAcHighlightIdx = -1;

        function _produkAcGetBox() {
            if (!_produkAcBox) {
                _produkAcBox = document.createElement('div');
                _produkAcBox.id = 'produkAutocompleteBox';
                _produkAcBox.style.cssText =
                    'position:absolute;z-index:99999;background:#fff;border:1px solid #cbd5e1;' +
                    'border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,0.18);max-height:220px;' +
                    'overflow-y:auto;font-size:11px;display:none;';
                document.body.appendChild(_produkAcBox);
            }
            return _produkAcBox;
        }

        function _produkAcHide() {
            const box = _produkAcGetBox();
            box.style.display = 'none';
            box.innerHTML = '';
            _produkAcCurrentInput = null;
            _produkAcHighlightIdx = -1;
        }

        function _produkAcRenderHighlight() {
            const box = _produkAcGetBox();
            Array.from(box.children).forEach((el, i) => {
                el.style.background = (i === _produkAcHighlightIdx) ? '#eff6ff' : '#fff';
            });
        }

        // Gabungkan nama produk dari Master Produk & Harga (Tab 8) dengan nama
        // produk yang sudah pernah muncul di Bank Data Penjualan, supaya daftar
        // saran tetap lengkap walau Master Produk belum diisi semua.
        function _produkAcDaftarNama() {
            const set = new Set();
            loadProdukHargaMaster().forEach(p => { const nm = (p.produk || '').trim();
                if (nm) set.add(nm); });
            if (typeof salesData !== 'undefined' && Array.isArray(salesData)) {
                salesData.forEach(r => { const nm = (r.Produk || '').trim();
                    if (nm) set.add(nm); });
            }
            return Array.from(set);
        }

        function _produkAcShow(inputEl) {
            const q = inputEl.value.trim().toLowerCase();
            if (!q) { _produkAcHide(); return; }
            const semua = _produkAcDaftarNama();
            // Utamakan produk yang namanya DIAWALI huruf/teks yang diketik
            // (mis. ketik "f" -> semua produk berawalan F).
            let matches = semua.filter(nm => nm.toLowerCase().startsWith(q));
            if (matches.length === 0) {
                // fallback: cari juga di tengah nama (mis. ketik "botol")
                matches = semua.filter(nm => nm.toLowerCase().includes(q));
            }
            matches = matches.sort((a, b) => a.localeCompare(b)).slice(0, 20);

            const box = _produkAcGetBox();
            if (matches.length === 0) { _produkAcHide(); return; }

            box.innerHTML = matches.map(nm =>
                `<div class="produk-ac-item" style="padding:5px 10px;cursor:pointer;white-space:nowrap;" data-nama="${escapeHtml(nm)}">${escapeHtml(nm)}</div>`
            ).join('');

            const rect = inputEl.getBoundingClientRect();
            box.style.left = (rect.left + window.scrollX) + 'px';
            box.style.top = (rect.bottom + window.scrollY + 2) + 'px';
            box.style.width = Math.max(rect.width, 160) + 'px';
            box.style.display = 'block';
            _produkAcCurrentInput = inputEl;
            _produkAcHighlightIdx = -1;

            box.querySelectorAll('.produk-ac-item').forEach(item => {
                item.addEventListener('mouseenter', () => {
                    _produkAcHighlightIdx = Array.from(box.children).indexOf(item);
                    _produkAcRenderHighlight();
                });
                // Pakai 'mousedown' (bukan 'click') supaya pilihan terdaftar
                // SEBELUM input kehilangan fokus (blur), jadi tidak "hilang".
                item.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    inputEl.value = item.dataset.nama;
                    _produkAcHide();
                    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
                    inputEl.focus();
                });
            });
        }

        function setupProdukAutocomplete(inputEl) {
            if (!inputEl || inputEl._produkAcBound) return;
            inputEl._produkAcBound = true;
            inputEl.setAttribute('autocomplete', 'off');
            inputEl.addEventListener('input', () => _produkAcShow(inputEl));
            inputEl.addEventListener('focus', () => { if (inputEl.value.trim()) _produkAcShow(inputEl); });
            inputEl.addEventListener('keydown', (e) => {
                const box = _produkAcGetBox();
                if (box.style.display !== 'block' || _produkAcCurrentInput !== inputEl) return;
                const items = Array.from(box.children);
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    _produkAcHighlightIdx = Math.min(_produkAcHighlightIdx + 1, items.length - 1);
                    _produkAcRenderHighlight();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    _produkAcHighlightIdx = Math.max(_produkAcHighlightIdx - 1, 0);
                    _produkAcRenderHighlight();
                } else if (e.key === 'Enter') {
                    if (_produkAcHighlightIdx >= 0 && items[_produkAcHighlightIdx]) {
                        e.preventDefault();
                        items[_produkAcHighlightIdx].dispatchEvent(new Event('mousedown'));
                    }
                } else if (e.key === 'Escape') {
                    _produkAcHide();
                }
            });
            inputEl.addEventListener('blur', () => {
                // beri jeda supaya event 'mousedown' pada item sempat jalan duluan
                setTimeout(() => { if (_produkAcCurrentInput === inputEl) _produkAcHide(); }, 150);
            });
        }
        document.addEventListener('scroll', () => _produkAcHide(), true);
        window.addEventListener('resize', () => _produkAcHide());

        function tab1BindEditFakturModalEvents() {
            const table = document.getElementById('tab1EditFakturTable');
            if (table) {
                table.querySelectorAll('tbody tr').forEach(tr => {
                    tr.querySelectorAll('.tab1e-qty, .tab1e-hargabeli, .tab1e-hargajual').forEach(inp => {
                        inp.addEventListener('input', () => tab1HitungUlangBarisEdit(tr));
                    });
                    // 🔗 Link ke Master Produk & Harga (Tab 8): saat nama produk diubah/dipilih
                    // dari daftar, harga beli & harga jual otomatis terisi kalau produk dikenali.
                    const produkInp = tr.querySelector('.tab1e-produk');
                    if (produkInp) {
                        setupProdukAutocomplete(produkInp);
                        produkInp.addEventListener('change', function() {
                            const h = cariHargaProdukMaster(this.value);
                            if (!h) return;
                            const beliInp = tr.querySelector('.tab1e-hargabeli');
                            const jualInp = tr.querySelector('.tab1e-hargajual');
                            if (beliInp && h.hargaBeli !== '') beliInp.value = h.hargaBeli;
                            if (jualInp && h.hargaJual !== '') jualInp.value = h.hargaJual;
                            tab1HitungUlangBarisEdit(tr);
                        });
                    }
                });
            }
            const btnUbah = document.getElementById('tab1BtnUbahFaktur');
            if (btnUbah) btnUbah.addEventListener('click', function() { tab1SimpanPerubahanFaktur(this.dataset.faktur); });
            const btnBatal = document.getElementById('tab1BtnTransaksiBatal');
            if (btnBatal) btnBatal.addEventListener('click', function() { tab1BatalkanTransaksiFaktur(this.dataset.faktur); });
        }

        // Set penanda faktur yang pernah diedit lewat modal ini, supaya
        // No.Faktur-nya bisa ditandai warna beda di tabel Bank Data Penjualan.
        let editedFakturSet = new Set();

        async function tab1SimpanPerubahanFaktur(noFaktur) {
            const table = document.getElementById('tab1EditFakturTable');
            if (!table) return;
            const pembayaranBaru = document.getElementById('tab1EditPembayaran').value;

            table.querySelectorAll('tbody tr').forEach(tr => {
                const gidx = parseInt(tr.dataset.gidx, 10);
                const row = salesData[gidx];
                if (!row) return;
                const discBaru = parseAngka(tr.querySelector('.tab1e-disc').value);
                const produkBaru = tr.querySelector('.tab1e-produk').value.trim();
                const qtyBaru = parseAngka(tr.querySelector('.tab1e-qty').value);
                const hargaBeliRaw = tr.querySelector('.tab1e-hargabeli').value;
                const hargaBeliBaru = hargaBeliRaw === '' ? '' : parseAngka(hargaBeliRaw);
                const hargaJualBaru = parseAngka(tr.querySelector('.tab1e-hargajual').value);
                const totalBaru = (qtyBaru * hargaJualBaru) - discBaru;
                const profitBaru = hargaBeliRaw === '' ? '' : (totalBaru - (hargaBeliBaru * qtyBaru));

                row.Produk = produkBaru;
                row.Jumlah = qtyBaru;
                row['Harga Beli'] = hargaBeliBaru;
                row['Harga Jual'] = hargaJualBaru;
                row.Disc = discBaru;
                row.Total = totalBaru;
                row.Profit = profitBaru;
                row.Pembayaran = pembayaranBaru;
                row._Diedit = true;
            });

            editedFakturSet.add(noFaktur);

            const ok = await saveSalesData();
            if (!ok) return;

            filterCache.clear();
            rebuildSalesFilterOptions();
            renderSales();
            document.getElementById('detailModalGlobal').classList.remove('show');
            showToast(`✅ Perubahan faktur ${noFaktur} berhasil disimpan ke Bank Data Penjualan.`, 'success');
        }

        async function tab1BatalkanTransaksiFaktur(noFaktur) {
            const gidxList = [];
            salesData.forEach((s, i) => { if (normFaktur(s['No.Faktur']) === normFaktur(noFaktur)) gidxList.push(i); });
            if (!gidxList.length) { showToast('Faktur tidak ditemukan.', 'warning'); return; }
            if (!confirm(`Batalkan transaksi faktur ${noFaktur}?\nSemua baris (${gidxList.length} item) akan dipindahkan ke Data Sampah dan bisa dipulihkan lagi dari tab Save Data All.`)) return;

            const jumlah = await pindahkanSalesKeSampah(gidxList, 'Transaksi Batal (dari Detail Faktur)');
            editedFakturSet.delete(noFaktur);
            rebuildSalesFilterOptions();
            salesCurrentDateIndex = Infinity;
            renderSales();
            renderTrashTable();
            renderRingkasanSaveAll();
            document.getElementById('detailModalGlobal').classList.remove('show');
            showToast(`❌ Transaksi faktur ${noFaktur} dibatalkan — ${jumlah} baris dipindahkan ke Data Sampah.`, 'success');
        }
        document.addEventListener('click', function(e) {
            const target = e.target.closest('.tab1-faktur-link');
            if (target) {
                e.preventDefault();
                tab1ShowFakturDetail(target.dataset.faktur);
            }
        });

        // ================================================================
