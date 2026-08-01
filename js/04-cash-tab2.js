        // FUNGSI CASH (Tab 2) – disingkat
        // ================================================================
        // PENTING: cache singkat (30 detik) untuk baca seluruh koleksi cashIncome.
        // Sebelumnya SETIAP pindah tab/dashboard memicu query penuh ke server,
        // yang cepat menghabiskan kuota baca harian Firestore (plan gratis/Spark
        // punya limit harian). Dengan cache ini, gonta-ganti tab dalam rentang
        // 30 detik cukup pakai data yang sudah ada di memori.
        let _cashAllCache = null, _cashAllCacheTime = 0;
        const CASH_CACHE_TTL_MS = 30000;
        async function ambilSemuaCashIncomeCached(paksaFresh) {
            const now = Date.now();
            if (!paksaFresh && _cashAllCache && (now - _cashAllCacheTime) < CASH_CACHE_TTL_MS) {
                return _cashAllCache;
            }
            const allRecords = await db.cashIncome.toArray();
            _cashAllCache = allRecords; _cashAllCacheTime = now;
            return allRecords;
        }
        // Load ALL cash data from database - used before ptRefresh
        async function loadAllCashDataBeforePtRefresh() {
            try {
                const allRecords = await ambilSemuaCashIncomeCached(false);
                console.log('Loading all cash data records:', allRecords.length);
                allRecords.forEach(record => {
                    if (record.bulan && Array.isArray(record.data)) {
                        cashDataMap[record.bulan] = record.data;
                        console.log(`  ${record.bulan}: ${record.data.length} days`);
                    }
                });
            } catch (e) { 
                console.error('Error loading all cash data:', e);
            }
        }

        async function loadCashData() {
            try {
                // Load data dari SEMUA bulan, bukan hanya cashBulan
                const allRecords = await ambilSemuaCashIncomeCached(false);
                allRecords.forEach(record => {
                    if (record.bulan && Array.isArray(record.data)) {
                        cashDataMap[record.bulan] = record.data;
                    }
                });
                // Dulu di sini ada query kedua (where('bulan').equals(cashBulan).first())
                // yang mubazir karena datanya sudah ada di 'allRecords' hasil query di atas.
                const currentRecord = allRecords.find(r => r.bulan === cashBulan);
                if (currentRecord) { 
                    cashDataMap[cashBulan] = currentRecord.data || []; 
                } else { 
                    if (!cashDataMap[cashBulan]) cashDataMap[cashBulan] = []; 
                }
            } catch (e) { 
                console.warn('Error loading cash data:', e);
                if (!cashDataMap[cashBulan]) cashDataMap[cashBulan] = []; 
            }
            return cashDataMap[cashBulan];
        }

        async function saveCashData() {
            try {
                const data = cashDataMap[cashBulan] || [];
                const existing = await db.cashIncome.where('bulan').equals(cashBulan).first();
                if (existing) { await db.cashIncome.update(existing.id, { data, tanggal: new Date().toISOString() }); } else {
                    await db.cashIncome.add({ bulan: cashBulan, data, tanggal: new Date().toISOString() });
                }
                _cashAllCacheTime = 0; // invalidate cache segera setelah menulis
                await autoBackupCashToLocalStorage();
            } catch (e) { showToast('❌ Gagal simpan cash: ' + e.message, 'warning'); }
        }

        function getCashData() {
            if (!cashDataMap[cashBulan]) cashDataMap[cashBulan] = [];
            return cashDataMap[cashBulan];
        }

        function renderPemasukan() {
            const data = getCashData();
            cashFiltered = [...data];
            cashFiltered.sort((a, b) => {
                const da = a.tanggal.split('-'),
                    db = b.tanggal.split('-');
                const dayA = parseInt(da[0]),
                    monA = parseInt(da[1]);
                const dayB = parseInt(db[0]),
                    monB = parseInt(db[1]);
                if (monA !== monB) return monA - monB;
                return dayA - dayB;
            });
            if (cashPage > Math.ceil(cashFiltered.length / cashRowsPerPage) && cashFiltered.length > 0) cashPage = 1;
            renderPemasukanTable();
            updatePemasukanPagination();
            renderPemasukanCards();
            document.getElementById('pemasukanTotalDays').textContent = cashFiltered.length;
            document.getElementById('badgeCash').textContent = cashFiltered.length;
        }

        function renderPemasukanTable() {
            const tbody = document.getElementById('pemasukanTableBody');
            const start = (cashPage - 1) * cashRowsPerPage;
            const end = start + cashRowsPerPage;
            const pageData = cashFiltered.slice(start, end);
            if (pageData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="empty-msg">Tidak ada data.</td></tr>';
                return;
            }
            let html = '';
            pageData.forEach(item => {
                const jmlFaktur = (item.piutangDetail ? item.piutangDetail.length : 0) + (item.cashDroppingDetail ?
                    item.cashDroppingDetail.length : 0);
                html +=
                    `<tr><td>${fmtTanggalHarianYY(item.tanggal, cashBulan)}</td><td>${fmtRp(item.piutangCash)}</td><td>${fmtRp(item.piutangTransfer)}</td><td>${fmtRp(item.penjualanCash)}</td><td>${fmtRp(item.penjualanTransfer)}</td><td><strong>${fmtRp(item.totalCash)}</strong></td><td><strong>${fmtRp(item.totalTransfer)}</strong></td><td><strong>${fmtRp(item.grandTotal)}</strong></td><td><button class="btn-faktur" onclick="bukaFakturModalTab1('${item.tanggal}')">🧾 ${jmlFaktur}</button></td></tr>`;
            });
            tbody.innerHTML = html;
        }

        function updatePemasukanPagination() {
            const total = cashFiltered.length;
            const totalPages = Math.ceil(total / cashRowsPerPage) || 1;
            document.getElementById('pemPageInfo').textContent = 'Halaman ' + cashPage + ' dari ' + totalPages;
            document.getElementById('pemPrevPage').disabled = (cashPage <= 1);
            document.getElementById('pemNextPage').disabled = (cashPage >= totalPages);
            document.getElementById('pemTotalData').textContent = total + ' data';
        }

        function renderPemasukanCards() {
            let cash = 0,
                transfer = 0,
                grand = 0,
                minyak = 0,
                rupa = 0;
            cashFiltered.forEach(item => { cash += item.totalCash || 0;
                transfer += item.totalTransfer || 0;
                grand += item.grandTotal || 0;
                // Uang Masuk Minyak & Rupa-Rupa: dijumlah dari rincian per faktur
                // (piutangDetail + cashDroppingDetail), baik dari hasil upload Excel
                // (Tab 2) maupun input manual (Tab Pembayaran), karena keduanya sudah
                // menyimpan split Minyak/Rupa-Rupa per faktur secara terpisah.
                (item.piutangDetail || []).forEach(d => {
                    minyak += (d.minyakCash || 0) + (d.minyakTransfer || 0);
                    rupa += (d.rupaCash || 0) + (d.rupaTransfer || 0);
                });
                (item.cashDroppingDetail || []).forEach(d => {
                    minyak += (d.minyakCash || 0) + (d.minyakTransfer || 0);
                    rupa += (d.rupaCash || 0) + (d.rupaTransfer || 0);
                });
            });
            document.getElementById('pemTotalCash').textContent = fmtRp(cash);
            document.getElementById('pemTotalTransfer').textContent = fmtRp(transfer);
            document.getElementById('pemTotalMinyak').textContent = fmtRp(minyak);
            document.getElementById('pemTotalRupa').textContent = fmtRp(rupa);
            document.getElementById('pemGrandTotal').textContent = fmtRp(grand);
        }

        // Event handler Tab 2 (disingkat)
        document.getElementById('pemasukanFileInput').addEventListener('change', function() {
            const name = this.files[0] ? this.files[0].name : 'No file chosen';
            document.getElementById('pemasukanFileName').textContent = name;
            document.getElementById('pemasukanFileName').className = 'file-name' + (this.files[0] ? '' : ' empty');
        });
        document.getElementById('pemasukanUploadBtn').addEventListener('click', async function() {
            const fileInput = document.getElementById('pemasukanFileInput');
            const file = fileInput.files[0];
            if (!file) { showToast('Pilih file Excel!', 'warning'); return; }
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const sheetNames = workbook.SheetNames;
                    let results = [];
                    sheetNames.forEach(sheetName => {
                        if (sheetName.toLowerCase().includes('sheet2') || sheetName.toLowerCase().includes(
                            'template')) return;
                        const sheet = workbook.Sheets[sheetName];
                        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
                        const tanggal = ekstrakTanggal(rows);
                        if (!tanggal) return;
                        let piutangCash = 0,
                            piutangTransfer = 0;
                        let idxPiutang = cariBaris(rows, "UANG MASUK DARI PIUTANG");
                        if (idxPiutang !== -1) {
                            const row = rows[idxPiutang];
                            piutangCash = ambilAngka(row, 9) + ambilAngka(row, 11);
                            piutangTransfer = ambilAngka(row, 10) + ambilAngka(row, 12);
                        }
                        let penjualanCash = 0,
                            penjualanTransfer = 0;
                        let idxPenjualan = cariBaris(rows, "UANG MASUK PENJUALAN CASH");
                        if (idxPenjualan === -1) idxPenjualan = cariBaris(rows, "UANG MASUK CASH");
                        if (idxPenjualan !== -1) {
                            const row = rows[idxPenjualan];
                            penjualanCash = ambilAngka(row, 9) + ambilAngka(row, 11);
                            penjualanTransfer = ambilAngka(row, 10) + ambilAngka(row, 12);
                        }
                        let idxPiutangStart = cariBaris(rows, "PIUTANG TEMPO");
                        let idxPiutangEnd = idxPiutangStart !== -1 ? cariBarisDari(rows, "UANG MASUK DARI PIUTANG",
                            idxPiutangStart + 1) : -1;
                        const piutangDetail = ekstrakDetailFaktur(rows, idxPiutangStart, idxPiutangEnd);
                        let cariMulaiDropping = idxPiutangEnd !== -1 ? idxPiutangEnd + 1 : 0;
                        let idxDroppingStart = cariBarisDari(rows, "CASH DROPPING", cariMulaiDropping);
                        let idxDroppingEnd = idxDroppingStart !== -1 ? cariBarisDari(rows, "UANG MASUK PENJUALAN CASH",
                            idxDroppingStart + 1) : -1;
                        if (idxDroppingEnd === -1 && idxDroppingStart !== -1) {
                            idxDroppingEnd = cariBarisDari(rows, "UANG MASUK CASH", idxDroppingStart + 1);
                        }
                        const cashDroppingDetail = ekstrakDetailFaktur(rows, idxDroppingStart, idxDroppingEnd);
                        results.push({ tanggal, piutangCash, piutangTransfer, penjualanCash, penjualanTransfer,
                            totalCash: piutangCash + penjualanCash, totalTransfer: piutangTransfer +
                            penjualanTransfer, grandTotal: piutangCash + piutangTransfer + penjualanCash +
                            penjualanTransfer, piutangDetail, cashDroppingDetail });
                    });
                    if (results.length === 0) { showToast('Tidak ada data ditemukan.', 'warning'); return; }
                    // Muat ulang dari server dulu supaya tidak menimpa perubahan dari
                    // halaman/perangkat lain yang belum tercermin di memori browser ini.
                    await loadCashData();
                    const current = getCashData();
                    if (current.length > 0) {
                        if (!confirm('Data saat ini ' + current.length + ' hari. Tambahkan ' + results.length +
                            ' hari baru?')) {
                            cashDataMap[cashBulan] = results;
                        } else {
                            const existing = new Set(current.map(d => normDDMM(d.tanggal)));
                            results.forEach(newItem => {
                                if (!existing.has(normDDMM(newItem.tanggal))) current.push(newItem);
                                else {
                                    const idx = current.findIndex(d => normDDMM(d.tanggal) === normDDMM(newItem.tanggal));
                                    if (idx !== -1) current[idx] = newItem;
                                }
                            });
                            cashDataMap[cashBulan] = current;
                        }
                    } else {
                        cashDataMap[cashBulan] = results;
                    }
                    await saveCashData();
                    renderPemasukan();
                    renderCek();
                    tampilkanNotifDataBaru('both');
                    showToast('Berhasil! Total ' + getCashData().length + ' hari.', 'success');
                } catch (err) {
                    showToast('Gagal baca file: ' + err.message, 'warning');
                }
            };
            reader.readAsArrayBuffer(file);
            fileInput.value = '';
            document.getElementById('pemasukanFileName').textContent = 'No file chosen';
            document.getElementById('pemasukanFileName').className = 'file-name empty';
        });
        document.getElementById('pemasukanExportBtn').addEventListener('click', function() {
            const data = getCashData();
            if (data.length === 0) { showToast('Tidak ada data.', 'warning'); return; }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'pemasukan_' + cashBulan + '_' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            URL.revokeObjectURL(url);
        });
        document.getElementById('pemasukanImportBtn').addEventListener('click', function() {
            document.getElementById('pemasukanImportFileInput').click();
        });
        document.getElementById('pemasukanImportFileInput').addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const json = JSON.parse(e.target.result);
                    if (!Array.isArray(json) || json.length === 0) { showToast('File tidak valid.', 'warning'); return; }
                    await loadCashData();
                    const current = getCashData();
                    if (current.length > 0) {
                        if (!confirm('Ganti ' + current.length + ' data dengan ' + json.length + ' dari file?'))
                        return;
                    }
                    cashDataMap[cashBulan] = json;
                    await saveCashData();
                    renderPemasukan();
                    renderCek();
                    tampilkanNotifDataBaru('both');
                    showToast('Import berhasil! ' + json.length + ' hari.', 'success');
                } catch (err) { showToast('Gagal import: ' + err.message, 'warning'); }
            };
            reader.readAsText(file);
            this.value = '';
        });
        document.getElementById('pemasukanHapusBtn').addEventListener('click', async function() {
            const data = getCashData();
            if (data.length === 0) { showToast('Tidak ada data untuk dihapus.', 'warning'); return; }
            if (!confirm('Yakin hapus semua data untuk bulan ' + cashBulan + '? (' + data.length + ' hari)')) return;
            cashDataMap[cashBulan] = [];
            await saveCashData();
            renderPemasukan();
            renderCek();
            showToast('Data telah dihapus.', 'info');
        });
        document.getElementById('bulanPemasukan').addEventListener('change', async function() {
            cashBulan = this.value;
            await loadCashData();
            renderPemasukan();
            const cekBulanSelect = document.getElementById('cekFilterBulan');
            if (cekBulanSelect) {
                let found = false;
                for (let opt of cekBulanSelect.options) {
                    if (opt.value === cashBulan) { cekBulanSelect.value = cashBulan;
                        found = true; break; }
                }
                if (!found) cekBulanSelect.value = '';
                renderCek();
            }
            const activeTab = document.querySelector('.tab-content.active');
            if (activeTab && activeTab.id === 'tab4') { ptPage = 1;
                ptRefresh(false); }
        });
        document.getElementById('pemPrevPage').addEventListener('click', function() { if (cashPage > 1) { cashPage--;
                renderPemasukan(); } });
        document.getElementById('pemNextPage').addEventListener('click', function() {
            const totalPages = Math.ceil(cashFiltered.length / cashRowsPerPage);
            if (cashPage < totalPages) { cashPage++;
                renderPemasukan(); }
        });

        // Cari faktur di SEMUA periode data (dari bulan paling awal sampai paling akhir yang ada di database),
        // tidak terpengaruh oleh filter bulan yang sedang aktif di layar.
        async function cariFakturDiSemuaData(query) {
            const target = query.trim();
            const targetLower = target.toLowerCase();
            const merged = {};
            try {
                const semuaRecord = await db.cashIncome.toArray();
                semuaRecord.forEach(rec => { merged[rec.bulan] = rec.data || []; });
            } catch (e) { /* fallback ke cache di memori jika DB gagal dibaca */ }
            // Timpa dengan data di memori (mis. bulan yang sedang dibuka & belum tentu sudah tersimpan)
            for (const bulan in cashDataMap) { merged[bulan] = cashDataMap[bulan]; }

            // Boleh cari pakai No. Faktur (cocok persis) ATAU nama toko (cocok sebagian,
            // tidak case-sensitive) — supaya kalau lupa nomor fakturnya, bisa ketik nama
            // tokonya saja.
            const cocok = (f) => f.noFaktur.trim() === target || (f.namaToko || '').toLowerCase().includes(targetLower);

            // Ambil catatan PALING BARU yang cocok (bukan yang pertama ketemu), supaya
            // konsisten dengan tab Cek Piutang yang juga selalu pakai status terbaru.
            // Ini penting kalau 1 faktur sempat dicatat lebih dari sekali (mis. awalnya "Titip",
            // lalu diupdate jadi "Lunas" di tanggal lain), dan juga kalau pencarian nama toko
            // menghasilkan beberapa faktur (ambil yang terbaru).
            let terbaru = null;
            for (const bulan of Object.keys(merged).sort()) {
                const dataBulan = merged[bulan];
                if (!Array.isArray(dataBulan)) continue;
                for (const day of dataBulan) {
                    const dayPart = String(day.tanggal || '').split('-')[0].padStart(2, '0');
                    const sortKey = bulan + '-' + dayPart;
                    if (day.piutangDetail && Array.isArray(day.piutangDetail)) {
                        const found = day.piutangDetail.find(cocok);
                        if (found && (!terbaru || sortKey >= terbaru.sortKey)) terbaru = { sumber: 'piutang', tanggalHari: day.tanggal, bulan, detail: found, sortKey };
                    }
                    if (day.cashDroppingDetail && Array.isArray(day.cashDroppingDetail)) {
                        const found = day.cashDroppingDetail.find(cocok);
                        if (found && (!terbaru || sortKey >= terbaru.sortKey)) terbaru = { sumber: 'dropping', tanggalHari: day.tanggal, bulan, detail: found, sortKey };
                    }
                }
            }
            return terbaru ? { sumber: terbaru.sumber, tanggalHari: terbaru.tanggalHari, bulan: terbaru.bulan, detail: terbaru.detail } : null;
        }
        document.getElementById('cariFakturBtn').addEventListener('click', async function() {
            const input = document.getElementById('cariFakturInput');
            const noFaktur = input.value.trim();
            if (!noFaktur) { showToast('Masukkan nomor faktur atau nama toko.', 'warning'); return; }
            const result = await cariFakturDiSemuaData(noFaktur);
            if (!result) { showToast('Faktur/toko "' + noFaktur + '" tidak ditemukan.', 'warning'); return; }
            const item = { tanggal: result.tanggalHari, piutangDetail: [], cashDroppingDetail: [] };
            if (result.sumber === 'piutang') { item.piutangDetail = [result.detail]; } else { item.cashDroppingDetail = [
                    result.detail
                ]; }
            fakturActiveItemTab1 = item;
            fakturActiveTabTab1 = result.sumber === 'piutang' ? 'piutang' : 'dropping';
            fakturSearchTermTab1 = '';
            document.getElementById('fakturModalTitleTab1').textContent = '🧾 Detail Faktur - ' + result.detail.noFaktur +
                ' (' + fmtTanggalHarianYY(result.tanggalHari, result.bulan) + ')';
            document.getElementById('tabPiutangTab1').classList.toggle('active', fakturActiveTabTab1 === 'piutang');
            document.getElementById('tabDroppingTab1').classList.toggle('active', fakturActiveTabTab1 === 'dropping');
            document.getElementById('tabPiutangTab1').textContent = 'Piutang Tempo (' + item.piutangDetail.length + ')';
            document.getElementById('tabDroppingTab1').textContent = 'Cash Dropping (' + item.cashDroppingDetail.length +
            ')';
            renderFakturModalTab1();
            document.getElementById('fakturModalTab1').classList.add('show');
        });
        document.getElementById('resetCariBtn').addEventListener('click', function() { document.getElementById(
                'cariFakturInput').value = ''; });
        const debouncedCariFaktur = debounce(() => { document.getElementById('cariFakturBtn').click(); }, 400);
        document.getElementById('cariFakturInput').addEventListener('input', debouncedCariFaktur);
        document.getElementById('cariFakturInput').addEventListener('keydown', function(e) { if (e.key === 'Enter')
                document.getElementById('cariFakturBtn').click(); });

        let fakturActiveItemTab1 = null;
        let fakturActiveTabTab1 = 'piutang';
        let fakturSearchTermTab1 = '';
        window.bukaFakturModalTab1 = function(tanggal) {
            const data = getCashData();
            const item = data.find(d => d.tanggal === tanggal);
            if (!item) { showToast('Data tidak ditemukan.', 'warning'); return; }
            fakturActiveItemTab1 = item;
            fakturActiveTabTab1 = 'piutang';
            fakturSearchTermTab1 = '';
            document.getElementById('fakturSearchTab1').value = '';
            document.getElementById('fakturModalTitleTab1').textContent = '🧾 Detail Faktur - Tanggal ' + fmtTanggalHarianYY(tanggal, cashBulan);
            document.getElementById('tabPiutangTab1').classList.add('active');
            document.getElementById('tabDroppingTab1').classList.remove('active');
            document.getElementById('tabPiutangTab1').textContent = 'Piutang Tempo (' + (item.piutangDetail ? item
                .piutangDetail.length : 0) + ')';
            document.getElementById('tabDroppingTab1').textContent = 'Cash Dropping (' + (item.cashDroppingDetail ? item
                .cashDroppingDetail.length : 0) + ')';
            renderFakturModalTab1();
            document.getElementById('fakturModalTab1').classList.add('show');
        };

        function tutupFakturModalTab1() {
            document.getElementById('fakturModalTab1').classList.remove('show');
            fakturActiveItemTab1 = null;
        }

        function renderFakturModalTab1() {
            const tbody = document.getElementById('fakturTableBodyTab1');
            if (!fakturActiveItemTab1) {
                tbody.innerHTML = '<tr><td colspan="11" class="empty-msg">Tidak ada data.</td></tr>';
                return;
            }
            const list = fakturActiveTabTab1 === 'piutang' ? (fakturActiveItemTab1.piutangDetail || []) : (fakturActiveItemTab1
                .cashDroppingDetail || []);
            const term = fakturSearchTermTab1.trim().toLowerCase();
            const filteredList = term ? list.filter(d => d.noFaktur.toLowerCase().includes(term) || d.namaToko.toLowerCase()
                .includes(term) || d.alamat.toLowerCase().includes(term) || d.sales.toLowerCase().includes(term)) :
            list;
            document.getElementById('fakturSummaryTab1').textContent = filteredList.length + ' dari ' + list.length +
                ' faktur';
            if (filteredList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="empty-msg">Tidak ada faktur ditemukan.</td></tr>';
                return;
            }
            let html = '';
            let totalTagihan = 0,
                totalBayarCash = 0,
                totalBayarTransfer = 0;
            filteredList.forEach(d => {
                const ketCls = (d.ket || '').toLowerCase().includes('lunas') ? 'ket-lunas' : (d.ket || '')
                    .toLowerCase().includes('titip') ? 'ket-titip' : '';
                // 🔧 Bersihkan alamat/tanggal kalau ternyata kadung tersimpan sebagai
                // teks Date mentah (bug dari file sumber lama) supaya tampil rapi.
                const alamatBersih = bersihkanTeksAlamat(d.alamat);
                const tglFakturBersih = formatTanggalExcel(d.tglFaktur);
                const jtBersih = formatTanggalExcel(d.jt);
                totalTagihan += parseNumber(d.tagihan);
                totalBayarCash += parseNumber(d.bayarCash);
                totalBayarTransfer += parseNumber(d.bayarTransfer);
                html +=
                    `<tr><td class="center">${d.no}</td><td>${d.sales}</td><td>${d.noFaktur}</td><td>${d.namaToko}</td><td>${alamatBersih}</td><td>${tglFakturBersih}</td><td>${jtBersih}</td><td class="num">${fmtRp(d.tagihan)}</td><td class="num">${fmtRp(d.bayarCash)}</td><td class="num">${fmtRp(d.bayarTransfer)}</td><td class="${ketCls}">${d.ket}</td></tr>`;
            });
            html +=
                `<tr style="font-weight:700;background:#f1f5f9;border-top:2px solid #94a3b8;"><td colspan="7" style="text-align:right;padding-right:10px;">TOTAL</td><td class="num">${fmtRp(totalTagihan)}</td><td class="num">${fmtRp(totalBayarCash)}</td><td class="num">${fmtRp(totalBayarTransfer)}</td><td></td></tr>`;
            tbody.innerHTML = html;
        }
        document.getElementById('fakturModalCloseTab1').addEventListener('click', tutupFakturModalTab1);
        document.getElementById('fakturModalTab1').addEventListener('click', function(e) { if (e.target === this)
                tutupFakturModalTab1(); });
        document.getElementById('tabPiutangTab1').addEventListener('click', function() { fakturActiveTabTab1 = 'piutang';
            this.classList.add('active');
            document.getElementById('tabDroppingTab1').classList.remove('active');
            renderFakturModalTab1(); });
        document.getElementById('tabDroppingTab1').addEventListener('click', function() { fakturActiveTabTab1 = 'dropping';
            this.classList.add('active');
            document.getElementById('tabPiutangTab1').classList.remove('active');
            renderFakturModalTab1(); });
        document.getElementById('fakturSearchTab1').addEventListener('input', function() { fakturSearchTermTab1 = this
                .value;
            renderFakturModalTab1(); });

        // ================================================================
