        // TAB 3 – CEK CASH (Satu tabel seperti Cek Piutang)
        // ================================================================
        async function loadAllCashForCek() {
            // Dulu di sini query langsung ke db.cashIncome.toArray() setiap
            // Tab 3 dibuka/refresh — padahal itu request Firestore (bukan
            // IndexedDB lokal) yang makan kuota baca & latensi. Sekarang pakai
            // loadCashData(), yang sudah lewat ambilSemuaCashIncomeCached()
            // (cache 30 detik) dan mengisi cashDataMap untuk SEMUA bulan.
            // Tombol "Refresh" tetap berfungsi: begitu cache 30 detik itu
            // kedaluwarsa (atau di-invalidate manual oleh saveCashData()),
            // panggilan ini otomatis ambil data segar dari server lagi.
            let all = [];
            try {
                await loadCashData();
                for (const bulan in cashDataMap) {
                    (cashDataMap[bulan] || []).forEach(day => {
                        all.push({ ...day, _bulanRecord: bulan });
                    });
                }
            } catch (e) { console.warn('Gagal muat cash data:', e); }
            return all;
        }

        function getUniqueSalesCek() {
            const set = new Set();
            salesData.forEach(d => { if (d.Sales) set.add(d.Sales.trim()); });
            return Array.from(set).sort();
        }

        function updateCekSalesDropdown() {
            const select = document.getElementById('cekFilterSales');
            const currentVal = select.value;
            const list = getUniqueSalesCek();
            select.innerHTML = '<option value="">Semua Sales</option>';
            list.forEach(s => { const opt = document.createElement('option');
                opt.value = s;
                opt.textContent = s;
                select.appendChild(opt); });
            if (currentVal && list.includes(currentVal)) select.value = currentVal;
            else select.value = '';
            cekFilterSales = select.value;
        }

        function updateCekBulanDropdown() {
            const select = document.getElementById('cekFilterBulan');
            const currentVal = select.value;
            const periodSet = new Set();
            salesData.forEach(r => { if (r.Tanggal) periodSet.add(r.Tanggal.slice(0, 7)); });
            for (const bulan in cashDataMap) { periodSet.add(bulan); }
            const sorted = Array.from(periodSet).sort();
            select.innerHTML = '<option value="">Semua Bulan</option>';
            sorted.forEach(k => { const opt = document.createElement('option');
                opt.value = k;
                opt.textContent = periodLabel(k);
                select.appendChild(opt); });
            if (currentVal && sorted.includes(currentVal)) select.value = currentVal;
            else if (!userSetBulan.cek && APP_DEFAULT_BULAN && sorted.includes(APP_DEFAULT_BULAN)) select.value =
                APP_DEFAULT_BULAN;
            else select.value = '';
            cekFilterBulan = select.value;
        }

        function fmtTglBayarCash(tglHari, bulanRecord) {
            if (!tglHari || !bulanRecord) return '-';
            const dayPart = String(tglHari).split('-')[0].trim().padStart(2, '0');
            const parts = String(bulanRecord).split('-');
            if (parts.length !== 2) return '-';
            const [tahun, bulanNum] = parts;
            if (!tahun || !bulanNum || !/^\d+$/.test(dayPart)) return '-';
            return `${dayPart}/${bulanNum}/${tahun}`;
        }

        function buildMatchMapSales(fakturList, key = 'noFaktur') {
            const map = new Map();
            fakturList.forEach(f => { const k = (f[key] || '').toString().trim(); if (k) map.set(k, f); });
            return map;
        }

        function getFilteredCashDetail(detailList) {
            return detailList.filter(d => {
                const no = (d.noFaktur || '').toString().toLowerCase();
                const sales = (d.sales || '').toString().toLowerCase();
                const tgl = d.tglFaktur || '';
                const tglKey = toDateKey(tgl);
                const bulan = tglKey.slice(0, 7);
                
                // SEARCH FILTER: Bypass bulan filter jika ada search faktur
                if (cekFilterFaktur) {
                    if (!no.includes(cekFilterFaktur.toLowerCase())) return false;
                    // Jika ada search, apply sales & tanggal tapi SKIP bulan filter
                    if (cekFilterSales && !sales.includes(cekFilterSales.toLowerCase())) return false;
                    if (cekFilterTanggal && tglKey !== cekFilterTanggal) return false;
                    return true;
                }
                
                // NORMAL FILTER: Apply semua filter termasuk bulan
                if (cekFilterSales && !sales.includes(cekFilterSales.toLowerCase())) return false;
                if (cekFilterTanggal && tglKey !== cekFilterTanggal) return false;
                if (cekFilterBulan && bulan !== cekFilterBulan) return false;
                return true;
            });
        }

        function getFilteredSalesCek() {
            return salesData.filter(d => {
                const no = (d['No.Faktur'] || '').toString().toLowerCase();
                const sales = (d.Sales || '').toString().toLowerCase();
                const tgl = d.Tanggal || '';
                const bulan = tgl.slice(0, 7);
                const produk = (d.Produk || '').toString().toLowerCase();
                
                // SEARCH FILTER: Bypass bulan filter jika ada search faktur
                if (cekFilterFaktur) {
                    if (!no.includes(cekFilterFaktur.toLowerCase())) return false;
                    // Jika ada search, apply sales, tanggal, kategori tapi SKIP bulan filter
                    if (cekFilterSales && !sales.includes(cekFilterSales.toLowerCase())) return false;
                    if (cekFilterTanggal && tgl !== cekFilterTanggal) return false;
                    if (cekFilterKategori === 'Fitri' && !produk.includes('fitri')) return false;
                    if (cekFilterKategori === 'Rupa Rupa' && produk.includes('fitri')) return false;
                    return true;
                }
                
                // NORMAL FILTER: Apply semua filter termasuk bulan
                if (cekFilterSales && !sales.includes(cekFilterSales.toLowerCase())) return false;
                if (cekFilterTanggal && tgl !== cekFilterTanggal) return false;
                if (cekFilterBulan && bulan !== cekFilterBulan) return false;
                if (cekFilterKategori === 'Fitri' && !produk.includes('fitri')) return false;
                if (cekFilterKategori === 'Rupa Rupa' && produk.includes('fitri')) return false;
                return true;
            });
        }

        // renderCek untuk Tab 3 – satu tabel seperti Cek Piutang
        async function renderCek() {
            cekFilterFaktur = document.getElementById('cekFilterFaktur').value.trim();
            cekFilterTanggal = document.getElementById('cekFilterTanggal').value;
            cekFilterSales = document.getElementById('cekFilterSales').value;
            cekFilterBulan = document.getElementById('cekFilterBulan').value;
            cekFilterKategori = document.getElementById('cekFilterKategori').value;
            cekFilterKet = document.getElementById('cekFilterKet').value;
            updateCekSalesDropdown();
            updateCekBulanDropdown();
            cekFilterSales = document.getElementById('cekFilterSales').value;
            cekFilterBulan = document.getElementById('cekFilterBulan').value;
            cekFilterKategori = document.getElementById('cekFilterKategori').value;
            cekFilterKet = document.getElementById('cekFilterKet').value;

            const finalFilteredSales = getFilteredSalesCek();
            const cashSales = finalFilteredSales.filter(d => (d.Pembayaran || '').toLowerCase() === 'cash');
            const cashDataAll = await loadAllCashForCek();
            let cashDroppingAll = [];
            cashDataAll.forEach(day => {
                if (day.cashDroppingDetail && Array.isArray(day.cashDroppingDetail)) {
                    day.cashDroppingDetail.forEach(f => { cashDroppingAll.push({ ...f, _tglHari: day.tanggal,
                            _bulanRecord: day._bulanRecord }); });
                }
            });
            const filteredCashDrop = getFilteredCashDetail(cashDroppingAll);
            const cashDropMap = new Map();
            filteredCashDrop.forEach(d => { const no = normFaktur(d.noFaktur); if (no) cashDropMap.set(no, d); });

            let filteredCashSales = cashSales;
            let filteredCashDropFinal = filteredCashDrop;
            if (cekFilterKet === 'cocok') {
                filteredCashSales = cashSales.filter(d => cashDropMap.has(normFaktur(d['No.Faktur'])));
                filteredCashDropFinal = filteredCashDrop.filter(d => cashDropMap.has(normFaktur(d.noFaktur)));
            } else if (cekFilterKet === 'tidak') {
                filteredCashSales = cashSales.filter(d => !cashDropMap.has(normFaktur(d['No.Faktur'])));
                filteredCashDropFinal = filteredCashDrop.filter(d => !cashDropMap.has(normFaktur(d.noFaktur)));
            }

            rawCashSales = filteredCashSales;
            rawCashDrop = filteredCashDropFinal;

            // Gabungkan data cash sales dengan status dari cash dropping
            const merged = filteredCashSales.map(d => {
                const no = normFaktur(d['No.Faktur']);
                const inCashDrop = cashDropMap.has(no);
                return {
                    ...d,
                    _inCashDrop: inCashDrop,
                    _dropDetail: cashDropMap.get(no) || null,
                    _status: inCashDrop ? 'cocok' : 'tidak'
                };
            });

            cashTableFiltered = merged;

            // Update chip Semua/Lunas/Belum Lunas (dihitung dari cashSales SEBELUM
            // difilter oleh status, supaya angkanya tetap menunjukkan total apa adanya
            // dan chip yang belum aktif tetap kelihatan jumlahnya).
            let cLunasChip = 0, cBelumChip = 0;
            cashSales.forEach(d => {
                if (cashDropMap.has(normFaktur(d['No.Faktur']))) cLunasChip++; else cBelumChip++;
            });
            const setChipTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            setChipTxt('tab3ChipCountSemua', cashSales.length);
            setChipTxt('tab3ChipCountLunas', cLunasChip);
            setChipTxt('tab3ChipCountBelumLunas', cBelumChip);
            const tab3ActiveChip = cekFilterKet === 'cocok' ? 'lunas' : (cekFilterKet === 'tidak' ? 'belum_lunas' : 'semua');
            document.querySelectorAll('#tab3ChipRow .tab1-chip').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.chip === tab3ActiveChip);
            });

            // Update status info
            const totalCash = cashSales.length;
            const selectedCount = Object.values(cashChecked).filter(v => v).length;
            document.getElementById('cashSourceStatus').innerHTML =
                `${totalCash} transaksi cash · ${selectedCount} faktur dipilih`;
            document.getElementById('cashInfoRight').textContent = merged.length + ' data';
            document.getElementById('badgeCek').textContent = totalCash;

            // Render tabel dengan pagination
            renderCashTable();
        }

        function renderCashTable() {
            const tbody = document.getElementById('cekCashSalesBody');
            const total = cashTableFiltered.length;
            const totalPages = Math.max(1, Math.ceil(total / cashTableRowsPerPage));
            if (cashTablePage > totalPages) cashTablePage = totalPages;
            if (cashTablePage < 1) cashTablePage = 1;
            const start = (cashTablePage - 1) * cashTableRowsPerPage;
            const pageRows = cashTableFiltered.slice(start, start + cashTableRowsPerPage);

            if (pageRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="empty-msg">Tidak ada data cash.</td></tr>';
            } else {
                tbody.innerHTML = pageRows.map((d, idx) => {
                    const noFaktur = d['No.Faktur'] || '';
                    const cbChecked = cashChecked[noFaktur] ? 'checked' : '';
                    const statusLabel = d._status === 'cocok' ? '✅ Lunas' : '❌ Belum Lunas';
                    const badgeClass = d._status === 'cocok' ? 'cocok' : 'tidak';
                    const stempel = d._status === 'cocok' ? '<span class="stempel-lunas">Lunas</span>' :
                        `<span class="badge ${badgeClass}">${statusLabel}</span>`;
                    const kategori = (d.Produk || '').toLowerCase().includes('fitri') ? 'Minyak Fitri' : 'Rupa Rupa';
                    const fakturLinkStyle = 'color:#1f4e78;font-weight:700;text-decoration:underline;';
                    return `<tr>
                        <td><input type="checkbox" class="cash-row-checkbox" data-faktur="${noFaktur}" ${cbChecked}></td>
                        <td><span class="faktur-link" data-idx="${start+idx}" data-src="cekCash" style="${fakturLinkStyle}">${cashNotesMap[noFaktur] ? '📝 ' : ''}${noFaktur}</span></td>
                        <td>${fmtTanggal(d.Tanggal)}</td>
                        <td>${d.Customer || ''}</td>
                        <td>${d.Alamat || ''}</td>
                        <td>${d.Sales || ''}</td>
                        <td><span class="badge pt-tercatat">${kategori}</span></td>
                        <td class="num">${fmtRp(d.Total || 0)}</td>
                        <td>${stempel}</td>
                    </tr>`;
                }).join('');
            }

            // Pagination controls
            document.getElementById('cashPageLabel').textContent = `Halaman ${cashTablePage} dari ${totalPages}`;
            document.getElementById('cashPrevPage').disabled = cashTablePage <= 1;
            document.getElementById('cashNextPage').disabled = cashTablePage >= totalPages;
            document.getElementById('cashTotalData').textContent = total + ' data';

            updateCashSelectedInfo();

            // Select all
            const selectAll = document.getElementById('cashSelectAll');
            const allCbs = document.querySelectorAll('.cash-row-checkbox');
            const checkedCbs = document.querySelectorAll('.cash-row-checkbox:checked');
            if (selectAll) selectAll.checked = (allCbs.length > 0 && checkedCbs.length === allCbs.length);

            renderCashCards(pageRows, start);
        }

        // Bangun tabel rincian produk (Produk / Qty / Harga Jual / Harga Beli / Disc)
        // untuk 1 No.Faktur, dipakai di dalam kartu Cek Cash (mode Kartu).
        // Sumber data & rumus sama persis dengan modal Detail Faktur (cashShowDetailModal)
        // supaya angkanya selalu konsisten antara kartu dan modal.
        function buildCashCardRincian(noFaktur, fallbackRow) {
            const items = salesData.filter(s => normFaktur(s['No.Faktur']) === normFaktur(noFaktur));
            const sumber = items.length ? items : [fallbackRow];
            let totalQty = 0, totalJual = 0, totalBeli = 0, totalDisc = 0;
            const rows = sumber.map(it => {
                const jumlah = parseNumber(it.Jumlah);
                const hargaJual = parseNumber(it['Harga Jual']);
                const hargaBeli = it['Harga Beli'] !== undefined && it['Harga Beli'] !== '' ? parseNumber(it['Harga Beli']) : null;
                const disc = parseNumber(it.Disc);
                const totalBaris = it.Total !== undefined && it.Total !== '' ? parseNumber(it.Total) : (jumlah * hargaJual) - disc;
                totalQty += jumlah;
                totalJual += totalBaris;
                if (hargaBeli !== null) totalBeli += hargaBeli * jumlah;
                totalDisc += disc;
                return `<tr>
                        <td>${escapeHtml(it.Produk || '-')}</td>
                        <td>${jumlah || 0} ${escapeHtml(it.Satuan || '')}</td>
                        <td>${fmtRp(hargaJual)}</td>
                        <td>${hargaBeli !== null ? fmtRp(hargaBeli) : '-'}</td>
                        <td>${disc ? fmtRp(disc) : '-'}</td>
                    </tr>`;
            }).join('');
            const html = `<table class="cash-card-produk-table">
                    <thead><tr><th>Produk</th><th>Qty</th><th>Harga Jual</th><th>Harga Beli</th><th>Disc</th></tr></thead>
                    <tbody>${rows}</tbody>
                    <tfoot><tr><td>TOTAL</td><td>${totalQty}</td><td>${fmtRp(totalJual)}</td><td>${totalBeli ? fmtRp(totalBeli) : '-'}</td><td>${totalDisc ? fmtRp(totalDisc) : '-'}</td></tr></tfoot>
                </table>`;
            // Kembalikan juga total gabungan (bukan cuma HTML) supaya kartu bisa
            // menampilkan Total per-FAKTUR (semua produk), bukan cuma total 1 baris.
            return { html, totalQty, totalJual, totalBeli, totalDisc, itemCount: sumber.length };
        }

        // Rincian produk untuk 1 No.Faktur di kartu Cek Piutang (Tab 4) — analog dengan
        // buildCashCardRincian di atas, dipakai supaya kartu piutang juga gabung jadi
        // 1 kartu per faktur (bukan 1 kartu per baris produk), sama seperti modal Detail Faktur.
        function buildPiutangCardRincian(noFaktur, fallbackRow) {
            const items = salesData.filter(s => normFaktur(s['No.Faktur']) === normFaktur(noFaktur) && s
                .Pembayaran === 'Tempo');
            const sumber = items.length ? items : [fallbackRow];
            let totalQty = 0,
                totalJual = 0;
            const rows = sumber.map(it => {
                const isSalesRow = it && it.Produk !== undefined;
                const jumlah = isSalesRow ? parseNumber(it.Jumlah) : 0;
                const namaProduk = isSalesRow ? it.Produk : (it.produkNama || it.produk || '-');
                const satuan = isSalesRow ? (it.Satuan || '') : '';
                const totalBaris = isSalesRow ?
                    (it.Total !== undefined && it.Total !== '' ? parseNumber(it.Total) : (jumlah * parseNumber(
                        it['Harga Jual']))) : (it.total || 0);
                totalQty += jumlah;
                totalJual += totalBaris;
                return `<tr>
                        <td>${escapeHtml(namaProduk || '-')}</td>
                        <td>${jumlah || 0} ${escapeHtml(satuan)}</td>
                        <td>${fmtRp(totalBaris)}</td>
                    </tr>`;
            }).join('');
            const html = `<table class="cash-card-produk-table">
                    <thead><tr><th>Produk</th><th>Qty</th><th>Total</th></tr></thead>
                    <tbody>${rows}</tbody>
                    <tfoot><tr><td>TOTAL</td><td>${totalQty}</td><td>${fmtRp(totalJual)}</td></tr></tfoot>
                </table>`;
            return { html, totalQty, totalJual, itemCount: sumber.length };
        }

        function renderCashCards(pageRows, start) {
            const wrap = document.getElementById('cashCardList');
            if (!wrap) return;
            if (!pageRows || pageRows.length === 0) {
                wrap.innerHTML = `<div class="sales-card-empty">📂 Tidak ada data cash.</div>`;
                return;
            }
            // Gabungkan baris2 yang No.Fakturnya sama (1 faktur bisa punya >1 baris
            // produk di Bank Data Penjualan) supaya tampil sebagai 1 KARTU per faktur,
            // dengan rincian semua produknya di dalam kartu itu — sama seperti modal
            // Detail Faktur. Baris ke-2, ke-3, dst dari faktur yang sama dilewati di
            // sini (bukan dihapus datanya, cuma tidak dirender jadi kartu terpisah).
            const seenFaktur = new Set();
            const groups = [];
            pageRows.forEach((d, idx) => {
                const key = normFaktur(d['No.Faktur']);
                if (seenFaktur.has(key)) return;
                seenFaktur.add(key);
                groups.push({ row: d, idx });
            });

            wrap.innerHTML = groups.map(({ row: d, idx }) => {
                const noFaktur = d['No.Faktur'] || '';
                const cbChecked = cashChecked[noFaktur] ? 'checked' : '';
                const statusLabel = d._status === 'cocok' ? '✅ Lunas' : '❌ Belum Lunas';
                const kategori = (d.Produk || '').toLowerCase().includes('fitri') ? 'Minyak Fitri' : 'Rupa Rupa';
                const noFakturSafe = escapeHtml(String(noFaktur));
                const rincian = buildCashCardRincian(noFaktur, d);
                const multiTag = rincian.itemCount > 1 ?
                    ' <span title="Faktur ini punya beberapa item produk">🔗</span>' : '';
                return `<div class="sales-card${cbChecked ? ' selected' : ''}">
                    ${d._status === 'cocok' ? '<div class="sales-card-stempel-lunas">Lunas</div>' : ''}
                    <div class="sales-card-top">
                        <div class="sales-card-top-left">
                            <input type="checkbox" class="cash-row-checkbox" data-faktur="${noFakturSafe}" ${cbChecked}>
                            <span class="faktur-link sales-card-faktur" data-idx="${start+idx}" data-src="cekCash" style="cursor:pointer;">${cashNotesMap[noFaktur] ? '📝 ' : ''}${noFakturSafe}${multiTag}</span>
                        </div>
                        <span class="sales-card-date">${fmtTanggal(d.Tanggal)}</span>
                    </div>
                    <div class="sales-card-produk">${escapeHtml(d.Customer || '-')}</div>
                    <div class="sales-card-qty">${escapeHtml(d.Alamat || '-')}</div>
                    ${rincian.html}
                    <div class="sales-card-mid">
                        <span class="sales-card-total">${fmtRp(rincian.totalJual)}</span>
                        <span class="sales-card-badges"><span class="badge pt-tercatat">${kategori}</span> <span class="badge ${d._status === 'cocok' ? 'cocok' : 'tidak'}">${statusLabel}</span></span>
                    </div>
                    <div class="sales-card-foot">
                        <span><b>${escapeHtml(d.Sales || '-')}</b></span>
                    </div>
                </div>`;
            }).join('');
        }

        let tab3ViewMode = localStorage.getItem('tab3ViewMode') === 'table' ? 'table' : 'card';
        function applyTab3ViewMode() {
            const isCard = tab3ViewMode === 'card';
            const tableWrap = document.getElementById('tab3TableWrap');
            const cardList = document.getElementById('cashCardList');
            const tabelBtn = document.getElementById('tab3ViewTabelBtn');
            const kartuBtn = document.getElementById('tab3ViewKartuBtn');
            if (tableWrap) tableWrap.style.display = isCard ? 'none' : '';
            if (cardList) cardList.classList.toggle('show', isCard);
            if (tabelBtn) tabelBtn.classList.toggle('active', !isCard);
            if (kartuBtn) kartuBtn.classList.toggle('active', isCard);
        }
        document.getElementById('tab3ChipRow').addEventListener('click', function(e) {
            const btn = e.target.closest('.tab1-chip');
            if (!btn) return;
            const chip = btn.dataset.chip; // semua | lunas | belum_lunas
            const ketSel = document.getElementById('cekFilterKet');
            if (ketSel) ketSel.value = chip === 'lunas' ? 'cocok' : (chip === 'belum_lunas' ? 'tidak' : '');
            cashTablePage = 1;
            renderCek();
        });

        document.getElementById('tab3ViewToggle').addEventListener('click', function(e) {
            const btn = e.target.closest('.tab1-view-btn');
            if (!btn) return;
            tab3ViewMode = btn.dataset.view === 'card' ? 'card' : 'table';
            localStorage.setItem('tab3ViewMode', tab3ViewMode);
            applyTab3ViewMode();
        });
        applyTab3ViewMode();

        document.getElementById('cashCardList').addEventListener('change', function(e) {
            if (e.target.classList.contains('cash-row-checkbox')) {
                const faktur = e.target.dataset.faktur;
                cashChecked[faktur] = e.target.checked;
                e.target.closest('.sales-card').classList.toggle('selected', e.target.checked);
                const allCbs = document.querySelectorAll('.cash-row-checkbox');
                const checkedCbs = document.querySelectorAll('.cash-row-checkbox:checked');
                const selectAll = document.getElementById('cashSelectAll');
                if (selectAll) selectAll.checked = (allCbs.length > 0 && checkedCbs.length === allCbs.length);
                updateCashSelectedInfo();
                if (e.target.checked) sendSelectedToTab6();
            }
        });

        document.getElementById('cashPrevPage').addEventListener('click', function() {
            if (cashTablePage > 1) { cashTablePage--;
                renderCashTable(); }
        });
        document.getElementById('cashNextPage').addEventListener('click', function() {
            const totalPages = Math.max(1, Math.ceil(cashTableFiltered.length / cashTableRowsPerPage));
            if (cashTablePage < totalPages) { cashTablePage++;
                renderCashTable(); }
        });

        // Filter events
        const debouncedRenderCek = debounce(() => { cashTablePage = 1;
            renderCek(); }, 300);
        document.getElementById('cekFilterFaktur').addEventListener('input', debouncedRenderCek);
        document.getElementById('cekFilterTanggal').addEventListener('change', debouncedRenderCek);
        document.getElementById('cekFilterSales').addEventListener('change', debouncedRenderCek);
        document.getElementById('cekFilterBulan').addEventListener('change', debouncedRenderCek);
        document.getElementById('cekFilterBulan').addEventListener('change', () => { userSetBulan.cek = true; });
        document.getElementById('cekFilterKategori').addEventListener('change', debouncedRenderCek);
        document.getElementById('cekFilterKet').addEventListener('change', debouncedRenderCek);

        document.getElementById('cekBtnReset').addEventListener('click', () => {
            document.getElementById('cekFilterFaktur').value = '';
            document.getElementById('cekFilterTanggal').value = '';
            document.getElementById('cekFilterSales').value = '';
            document.getElementById('cekFilterBulan').value = '';
            userSetBulan.cek = true;
            document.getElementById('cekFilterKategori').value = '';
            document.getElementById('cekFilterKet').value = '';
            cashTablePage = 1;
            renderCek();
            showToast('↺ Filter direset', 'info');
        });

        document.getElementById('cekBtnRefresh').addEventListener('click', function() {
            cashTablePage = 1;
            renderCek();
            sembunyikanNotifDataBaru('cash');
            showToast('🔄 Data dimuat ulang.', 'success');
        });
        document.getElementById('cashDataBaruNotif').addEventListener('click', function() {
            document.getElementById('cekBtnRefresh').click();
        });

        // ================================================================
        // CHECKBOX FAKTUR PENJUALAN CASH (Tab 3 -> Tab 6)
        // ================================================================
        function updateCashSelectedInfo() {
            const selectedCount = Object.values(cashChecked).filter(v => v).length;
            const statusEl = document.getElementById('cashSourceStatus');
            if (statusEl) {
                const total = cashTableFiltered.length;
                statusEl.innerHTML = `${total} transaksi cash · ${selectedCount} faktur dipilih`;
            }
            // Floating toolbar: muncul otomatis begitu ada faktur yang dicentang,
            // sama seperti di tab Bank Data Penjualan.
            const toolbar = document.getElementById('cashSelectionToolbar');
            const toolbarCount = document.getElementById('cashToolbarCount');
            if (toolbar) {
                if (selectedCount > 0) {
                    if (toolbarCount) toolbarCount.textContent = selectedCount;
                    toolbar.classList.add('show');
                } else {
                    toolbar.classList.remove('show');
                }
            }
        }

        document.getElementById('cekCashSalesBody').addEventListener('change', function(e) {
            if (e.target.classList.contains('cash-row-checkbox')) {
                const faktur = e.target.dataset.faktur;
                cashChecked[faktur] = e.target.checked;
                const allCbs = document.querySelectorAll('.cash-row-checkbox');
                const checkedCbs = document.querySelectorAll('.cash-row-checkbox:checked');
                const selectAll = document.getElementById('cashSelectAll');
                if (selectAll) selectAll.checked = (allCbs.length > 0 && checkedCbs.length === allCbs.length);
                updateCashSelectedInfo();
                if (e.target.checked) sendSelectedToTab6();
            }
        });

        document.getElementById('cashSelectAll').addEventListener('change', function() {
            const checked = this.checked;
            document.querySelectorAll('.cash-row-checkbox').forEach(cb => {
                cb.checked = checked;
                cashChecked[cb.dataset.faktur] = checked;
            });
            updateCashSelectedInfo();
            if (checked) sendSelectedToTab6();
        });


        // ================================================================
