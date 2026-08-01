        // TAB 4 – CEK PIUTANG
        // ================================================================
        let ptIncomeByMonth = {};

        function ptParseISODate(str) { if (!str) return null; const m = String(str).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
            if (!m) return null; return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])); }

        function ptParseDMY(str) { if (!str) return null; const m = String(str).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (!m) return null; return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])); }

        function ptDaysBetween(a, b) { return Math.round((a - b) / (1000 * 60 * 60 * 24)); }

        // ================================================================
        // TAB 0 - RINGKASAN
        // Semua angka di sini dihitung LANGSUNG dari salesData (Bank Data
        // Penjualan) & data piutang yang sama dipakai tab Cek Piutang —
        // tidak ada sumber data terpisah lagi, jadi tidak akan "kosong"
        // selama Bank Data Penjualan sudah terisi.
        // ================================================================
        let rkSearchRupaTerm = '';

        function rkPeriodKey(iso) { return periodKey(iso); }

        function rkPopulatePeriodeSelect() {
            const sel = document.getElementById('rkPeriodeSelect');
            if (!sel) return;
            const prev = sel.value;
            const periodSet = new Set();
            salesData.forEach(r => { const p = rkPeriodKey(r.Tanggal); if (p) periodSet.add(p); });
            const periods = Array.from(periodSet).sort().reverse();
            if (periods.length === 0) {
                const now = new Date();
                periods.push(now.toISOString().slice(0, 7));
            }
            sel.innerHTML = periods.map(p => `<option value="${p}">${fmtBulanTahun(p)}</option>`).join('');
            if (prev && periods.includes(prev)) {
                sel.value = prev;
            } else {
                sel.value = periods[0];
            }
        }

        function rkBuildSalesTable(rows, salesList) {
            // rows: array of {produk, bySales: {namaSales: qty}, total}
            // Mengembalikan {theadHtml, tbodyHtml}
            const theadHtml = '<tr><th>Produk</th>' +
                salesList.map(s => `<th class="rk-num">${escapeHtml(s)}</th>`).join('') +
                '<th class="rk-num">Total</th></tr>';
            let tbodyHtml = '';
            const totalPerSales = {};
            salesList.forEach(s => totalPerSales[s] = 0);
            let grandTotal = 0;
            rows.forEach(row => {
                tbodyHtml += '<tr><td class="rk-product-name">' + escapeHtml(row.produk) + '</td>' +
                    salesList.map(s => {
                        const v = row.bySales[s] || 0;
                        totalPerSales[s] += v;
                        return `<td class="rk-num">${v || '-'}</td>`;
                    }).join('') +
                    `<td class="rk-num">${row.total}</td></tr>`;
                grandTotal += row.total;
            });
            tbodyHtml += '<tr class="rk-total-row"><td>TOTAL</td>' +
                salesList.map(s => `<td class="rk-num">${totalPerSales[s]}</td>`).join('') +
                `<td class="rk-num">${grandTotal}</td></tr>`;
            return { theadHtml, tbodyHtml, grandTotal, totalPerSales };
        }

        function rkRenderPiutangRow(d) {
            const overdueTxt = (d.statusClass === 'overdue' && d.overdueDays != null) ?
                ` <span class="rk-overdue">(${d.overdueDays} hr)</span>` : '';
            return `<tr>
                <td>${escapeHtml(d.noFaktur || '-')}</td>
                <td>${escapeHtml(d.customer || '-')}</td>
                <td>${escapeHtml(d.alamat || '-')}</td>
                <td>${escapeHtml(d.produkGabungan || '-')}</td>
                <td class="rk-num">${fmtRp(d.sisa)}</td>
                <td>${fmtTanggal(d.tanggal) || '-'}</td>
                <td>${d.jt || '-'}${overdueTxt}</td>
                <td>${escapeHtml(d.sales || '-')}</td>
            </tr>`;
        }

        function rkRender() {
            if (!document.getElementById('tab0')) return;
            const emptyGlobal = document.getElementById('rkEmptyGlobal');
            const content = document.getElementById('rkContent');
            if (salesData.length === 0) {
                if (emptyGlobal) emptyGlobal.style.display = 'block';
                if (content) content.style.display = 'none';
                return;
            }
            if (emptyGlobal) emptyGlobal.style.display = 'none';
            if (content) content.style.display = 'block';

            document.getElementById('rkTanggalHariIni').textContent = fmtTanggal(new Date().toISOString().slice(0, 10));
            rkPopulatePeriodeSelect();
            const periode = document.getElementById('rkPeriodeSelect').value;

            const rowsPeriode = salesData.filter(r => rkPeriodKey(r.Tanggal) === periode);
            const fitriRows = rowsPeriode.filter(r => ptIsFitri(r.Produk));
            const rupaRows = rowsPeriode.filter(r => !ptIsFitri(r.Produk));

            const salesList = Array.from(new Set(rowsPeriode.map(r => (r.Sales || '').trim()).filter(Boolean))).sort();

            // ----- Penjualan FITRI -----
            const fitriMap = {};
            fitriRows.forEach(r => {
                const produk = (r.Produk || '-').trim();
                const s = (r.Sales || '').trim();
                const qty = parseNumber(r.Jumlah) || 0;
                if (!fitriMap[produk]) fitriMap[produk] = { produk, bySales: {}, total: 0 };
                fitriMap[produk].bySales[s] = (fitriMap[produk].bySales[s] || 0) + qty;
                fitriMap[produk].total += qty;
            });
            const fitriRowsArr = Object.values(fitriMap).sort((a, b) => b.total - a.total);
            const fitriTable = rkBuildSalesTable(fitriRowsArr, salesList);
            document.querySelector('#rkTableFitri thead').innerHTML = fitriTable.theadHtml;
            document.querySelector('#rkTableFitri tbody').innerHTML = fitriTable.tbodyHtml;
            document.getElementById('rkFitriEmpty').style.display = fitriRowsArr.length ? 'none' : 'block';
            document.getElementById('rkTableFitri').style.display = fitriRowsArr.length ? '' : 'none';

            // ----- Stat cards (Total FITRI + per sales) -----
            const statsBar = document.getElementById('rkStatsBar');
            let statsHtml = `<div class="rk-stat-card"><div><div class="rk-stat-label">Total Fitri</div><div class="rk-stat-value">${fitriTable.grandTotal}</div></div><div class="rk-stat-sub">Unit</div></div>`;
            salesList.forEach(s => {
                statsHtml += `<div class="rk-stat-card"><div><div class="rk-stat-label">${escapeHtml(s)}</div><div class="rk-stat-value">${fitriTable.totalPerSales[s] || 0}</div></div><div class="rk-stat-sub">Unit</div></div>`;
            });
            statsBar.innerHTML = statsHtml;

            // ----- Rupa Rupa -----
            const rupaMap = {};
            rupaRows.forEach(r => {
                const produk = (r.Produk || '-').trim();
                const s = (r.Sales || '').trim();
                const qty = parseNumber(r.Jumlah) || 0;
                if (!rupaMap[produk]) rupaMap[produk] = { produk, bySales: {}, total: 0 };
                rupaMap[produk].bySales[s] = (rupaMap[produk].bySales[s] || 0) + qty;
                rupaMap[produk].total += qty;
            });
            let rupaRowsArr = Object.values(rupaMap).sort((a, b) => b.total - a.total);

            // ----- Dropdown "Pilih Produk" — daftar SEMUA produk Rupa Rupa di periode
            // ini (tidak ikut terpotong oleh filter cari), diurutkan A-Z. -----
            const rupaSelectEl = document.getElementById('rkPilihProdukRupa');
            if (rupaSelectEl) {
                const namaProdukList = Object.keys(rupaMap).sort((a, b) => a.localeCompare(b));
                const optionsHtml = '<option value="">— Pilih Produk —</option>' +
                    namaProdukList.map(nm => `<option value="${escapeHtml(nm)}">${escapeHtml(nm)}</option>`).join('');
                if (rupaSelectEl.dataset.optCount != namaProdukList.length || rupaSelectEl.innerHTML === '') {
                    rupaSelectEl.innerHTML = optionsHtml;
                    rupaSelectEl.dataset.optCount = namaProdukList.length;
                }
                // Sinkronkan pilihan dropdown dengan isi kolom cari saat ini
                rupaSelectEl.value = namaProdukList.includes(rkSearchRupaTerm) ? rkSearchRupaTerm : '';
            }

            if (rkSearchRupaTerm) {
                const q = rkSearchRupaTerm.toLowerCase();
                rupaRowsArr = rupaRowsArr.filter(r => r.produk.toLowerCase().includes(q));
            }
            const rupaTable = rkBuildSalesTable(rupaRowsArr, salesList);
            document.querySelector('#rkTableRupa thead').innerHTML = rupaTable.theadHtml;
            document.querySelector('#rkTableRupa tbody').innerHTML = rupaTable.tbodyHtml;
            document.getElementById('rkRupaEmpty').style.display = rupaRowsArr.length ? 'none' : 'block';
            document.getElementById('rkTableRupa').style.display = rupaRowsArr.length ? '' : 'none';

            // ----- Piutang Terbesar & Piutang Terlama (snapshot terkini, tidak terikat periode) -----
            rkRenderPiutang();
        }

        function rkRenderPiutang() {
            const besarBody = document.getElementById('rkPiutangBesarBody');
            const lamaBody = document.getElementById('rkPiutangLamaBody');
            const besarEmpty = document.getElementById('rkPiutangBesarEmpty');
            const lamaEmpty = document.getElementById('rkPiutangLamaEmpty');
            if (!besarBody || !lamaBody) return;
            if (!window._ptDataLoaded) {
                // Data piutang belum dimuat sama sekali — biarkan kosong dulu,
                // switchTab('tab0') akan memuatnya lalu panggil ulang fungsi ini.
                besarBody.innerHTML = '';
                lamaBody.innerHTML = '';
                besarEmpty.style.display = 'block';
                lamaEmpty.style.display = 'block';
                return;
            }
            let tempoRows;
            try { tempoRows = ptBuildTempoRows(); } catch (e) { tempoRows = []; }
            // Gabungkan per No.Faktur (1 faktur bisa punya beberapa baris produk,
            // tapi totalFaktur/totalBayar-nya sudah sama di semua barisnya).
            const byFaktur = {};
            tempoRows.forEach(r => {
                const key = normFaktur(r.noFaktur);
                if (!key) return;
                if (!byFaktur[key]) {
                    byFaktur[key] = { ...r, produkSet: new Set() };
                }
                byFaktur[key].produkSet.add((r.produkNama || r.produk || '').trim());
            });
            const piutangList = Object.values(byFaktur).map(d => {
                const sisa = Math.max(0, (d.totalFaktur || 0) - (d.totalBayar || 0));
                return { ...d, sisa, produkGabungan: Array.from(d.produkSet).filter(Boolean).join(', ') };
            }).filter(d => d.statusClass !== 'lunas' && d.sisa > 0.5);

            const besar = [...piutangList].sort((a, b) => b.sisa - a.sisa).slice(0, 5);
            const lama = [...piutangList].sort((a, b) => String(a.tanggal || '').localeCompare(String(b.tanggal || ''))).slice(0, 5);

            besarBody.innerHTML = besar.map(rkRenderPiutangRow).join('');
            lamaBody.innerHTML = lama.map(rkRenderPiutangRow).join('');
            besarEmpty.style.display = besar.length ? 'none' : 'block';
            lamaEmpty.style.display = lama.length ? 'none' : 'block';
        }

        document.getElementById('rkPeriodeSelect').addEventListener('change', rkRender);
        document.getElementById('rkSearchRupa').addEventListener('input', function() {
            rkSearchRupaTerm = this.value.trim();
            rkRender();
        });
        document.getElementById('rkPilihProdukRupa').addEventListener('change', function() {
            rkSearchRupaTerm = this.value;
            document.getElementById('rkSearchRupa').value = this.value;
            rkRender();
        });

        function ptIsFitri(produk) { return (produk || '').toLowerCase().includes('fitri'); }

        function ptFlattenPiutang() {
            const flat = [];
            Object.keys(ptIncomeByMonth).sort().forEach(bulan => {
                (ptIncomeByMonth[bulan] || []).forEach(day => {
                    (day.piutangDetail || []).forEach(d => { flat.push({ ...d, _bulan: bulan,
                            _tanggalHari: day.tanggal }); });
                });
            });
            return flat;
        }

        function ptLatestByFaktur(flatList) {
            const map = {};
            flatList.forEach(d => { const key = normFaktur(d.noFaktur); if (!key) return; if (!map[
                    key] || (d._bulan >= map[key]._bulan)) map[key] = d; });
            return map;
        }

        // PENTING: satu No.Faktur bisa dibayar berkali-kali (dicicil / titip beberapa
        // kali di tanggal berbeda). ptLatestByFaktur() di atas cuma mengambil SATU
        // kemunculan pembayaran TERAKHIR, sehingga cicilan-cicilan sebelumnya "hilang"
        // dari total dibayar — inilah yang bikin Status & Sisa Tagihan di tabel Cek
        // Piutang bisa salah (faktur yang sebenarnya sudah lunas masih tercatat
        // Overdue dengan sisa tagihan yang salah).
        //
        // ptSumByFaktur() menjumlahkan SEMUA kemunculan pembayaran per No.Faktur
        // (persis seperti logika ptHitungRiwayatFaktur yang dipakai modal), supaya
        // totalBayar/bayarCash/bayarTransfer akurat. Untuk field yang sifatnya
        // "status terkini" (ket, jt, namaToko) tetap diambil dari kemunculan PALING
        // BARU (berdasarkan tanggal asli, bukan cuma bulan), supaya keterangan yang
        // ditampilkan tetap relevan dengan kondisi terbaru.
        function ptSumByFaktur() {
            const map = {};
            Object.keys(ptIncomeByMonth).sort().forEach(bulan => {
                const tahun = (bulan || '').slice(0, 4) || String(new Date().getFullYear());
                const bulanNum = (bulan || '').slice(5, 7) || '01';
                (ptIncomeByMonth[bulan] || []).forEach(day => {
                    const dayPart = String(day.tanggal || '').split('-')[0] || '01';
                    const tglISO = `${tahun}-${bulanNum}-${dayPart.padStart(2,'0')}`;
                    (day.piutangDetail || []).forEach(d => {
                        const key = normFaktur(d.noFaktur);
                        if (!key) return;
                        if (!map[key]) map[key] = { totalBayar: 0, bayarCash: 0, bayarTransfer: 0, jt: '',
                            ket: '', namaToko: '', _bulan: '', _tanggalHari: '', _tglISO: '' };
                        const p = map[key];
                        const cash = parseNumber(d.bayarCash || 0);
                        const transfer = parseNumber(d.bayarTransfer || 0);
                        const total = (d.totalBayar != null) ? parseNumber(d.totalBayar) : (cash + transfer);
                        p.totalBayar += total;
                        p.bayarCash += cash;
                        p.bayarTransfer += transfer;
                        // Metadata tampilan (ket/jt/namaToko/tgl bayar) diambil dari kemunculan
                        // paling baru berdasarkan tanggal asli (bukan cuma bulan).
                        if (!p._tglISO || tglISO >= p._tglISO) {
                            p._tglISO = tglISO;
                            p._bulan = bulan;
                            p._tanggalHari = day.tanggal;
                            p.jt = d.jt || p.jt;
                            p.ket = d.ket || p.ket;
                            p.namaToko = d.namaToko || p.namaToko;
                        }
                    });
                });
            });
            return map;
        }

        function ptStatusClassFromKet(ket) {
            const k = (ket || '').toLowerCase();
            if (k.includes('lunas') && !k.includes('belum')) return 'lunas';
            if (k.includes('belum')) return 'belum';
            if (k.includes('titip')) return 'titip';
            if (k.includes('tagih')) return 'tagih';
            return 'tercatat';
        }

        function ptStatusLabel(cls) {
            const labels = { lunas: '✅ Sudah Lunas', belum: '❌ Belum Lunas', titip: '🟠 Titip', tagih: '📮 Tagih',
                tercatat: '⏳ Belum Ada Data', overdue: '🔴 Jatuh Tempo/Overdue' };
            return labels[cls] || cls;
        }

        // Satu No.Faktur bisa punya beberapa baris produk (banyak baris di salesData),
        // sementara pembayaran (totalBayar) selalu tercatat per-FAKTUR, bukan per-baris
        // produk. Supaya "Sisa Tagihan" per baris tidak asal dikurangi begitu saja
        // (yang bisa menghasilkan angka minus/salah kalau ada >1 baris produk), sisa
        // tagihan faktur dibagi proporsional sesuai porsi nilai tiap baris produk.
        // Kalau faktur sudah lunas penuh, hasilnya otomatis 0 untuk semua barisnya.
        function ptSisaTagihanBaris(r) {
            const totalFaktur = r.totalFaktur || r.total || 0;
            const sisaFaktur = Math.max(0, totalFaktur - (r.totalBayar || 0));
            if (totalFaktur <= 0) return 0;
            const proporsi = (r.total || 0) / totalFaktur;
            return sisaFaktur * proporsi;
        }

        // ================================================================
        // CACHE ptBuildTempoRows() — khusus per "giliran" render (microtask)
        // ----------------------------------------------------------------
        // ptRenderTempoTable() memanggil fungsi ini 2x berturut-turut secara
        // sinkron (sekali untuk tabel utama, sekali lagi lewat
        // updateTab4ChipCounts() untuk hitung ulang badge/chip) — padahal
        // datanya (salesData & ptIncomeByMonth) belum tentu berubah di
        // antara kedua panggilan itu. Supaya tidak dihitung dobel, hasilnya
        // di-cache HANYA untuk sisa "tick" JS yang sedang berjalan.
        // Begitu event loop lanjut ke microtask berikutnya, cache otomatis
        // dianggap basi lagi (lewat Promise.resolve().then(...)) — jadi
        // TIDAK ada risiko status piutang/lunas nyangkut data lama walau
        // salesData diubah di banyak tempat berbeda di kode ini.
        // ================================================================
        let _ptTempoRowsCache = null;
        function ptBuildTempoRows() {
            if (_ptTempoRowsCache) return _ptTempoRowsCache;
            const piutangMap = ptSumByFaktur();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const rows = [];
            // PENTING: satu No.Faktur bisa punya banyak baris produk (banyak baris di salesData).
            // "Sudah Lunas" harus dicek terhadap TOTAL SELURUH FAKTUR (jumlah semua baris produknya),
            // bukan cuma nilai satu baris produk saja — kalau tidak, bayar titip yang lebih besar dari
            // satu baris produk (tapi masih kurang dari total faktur) bisa salah ditandai "Lunas".
            const fakturTotalMap = {};
            salesData.filter(r => r.Pembayaran === 'Tempo').forEach(r => {
                const k = normFaktur(r['No.Faktur']);
                fakturTotalMap[k] = (fakturTotalMap[k] || 0) + parseNumber(r.Total);
            });
            salesData.filter(r => r.Pembayaran === 'Tempo').forEach(r => {
                const key = normFaktur(r['No.Faktur']);
                const detail = piutangMap[key];
                let cls, jt = '',
                    ketRaw = '',
                    totalBayar = null,
                    tanggalBayar = '';
                let bayarCash = null,
                    bayarTransfer = null,
                    namaTokoUM = '';
                if (detail) {
                    cls = ptStatusClassFromKet(detail.ket);
                    jt = detail.jt || '';
                    ketRaw = detail.ket || '';
                    totalBayar = detail.totalBayar;
                    bayarCash = detail.bayarCash;
                    bayarTransfer = detail.bayarTransfer;
                    namaTokoUM = detail.namaToko || '';
                    if ((cls === 'lunas' || (totalBayar && totalBayar > 0)) && detail._tanggalHari && detail
                    ._bulan) {
                        const dayPart = String(detail._tanggalHari).split('-')[0];
                        const [tahun, bulanNum] = detail._bulan.split('-');
                        if (dayPart) tanggalBayar = `${dayPart.padStart(2,'0')}/${bulanNum}/${tahun}`;
                    }
                } else {
                    cls = 'tercatat';
                }
                if (!jt && r.JatuhTempoManual) {
                    jt = r.JatuhTempoManual;
                }
                if (!jt && r.Tanggal) {
                    const tglJual = ptParseISODate(r.Tanggal);
                    if (tglJual) {
                        const jtDate = new Date(tglJual);
                        jtDate.setDate(jtDate.getDate() + 13);
                        jt =
                            `${String(jtDate.getDate()).padStart(2,'0')}/${String(jtDate.getMonth()+1).padStart(2,'0')}/${jtDate.getFullYear()}`;
                    }
                }
                if (cls === 'tercatat' && totalBayar != null && totalBayar > 0) {
                    cls = 'belum';
                }
                let overdueDays = null;
                const totalTagihan = parseNumber(r.Total);
                const totalTagihanFaktur = fakturTotalMap[key] != null ? fakturTotalMap[key] : totalTagihan;
                const sudahLunasNominal = totalBayar != null && totalBayar >= totalTagihanFaktur - 0.5;
                if (sudahLunasNominal) cls = 'lunas';
                if (cls !== 'lunas' && jt) {
                    const jtDate = ptParseDMY(jt);
                    if (jtDate && jtDate < today) { cls = 'overdue';
                        overdueDays = ptDaysBetween(today, jtDate); }
                }
                rows.push({ tanggal: r.Tanggal, noFaktur: r['No.Faktur'], customer: r.Customer, alamat: r
                        .Alamat, sales: r.Sales, total: parseNumber(r.Total), totalFaktur: totalTagihanFaktur,
                    jt, statusClass: cls,
                    ketRaw, bayarCash, bayarTransfer, namaTokoUM, produkNama: r.Produk, totalBayar,
                    overdueDays, tanggalBayar, produk: r.Produk, kategori: ptIsFitri(r.Produk) ? 'fitri' :
                        'rupa', pembayaran: r.Pembayaran || 'Tempo' });
            });
            // Urutkan berdasarkan Tgl Transaksi TERTUA dulu. PENTING sejak pindah ke
            // Firestore: Firestore TIDAK menjamin urutan dokumen mengikuti urutan
            // input (beda dengan IndexedDB yang dulu kebetulan berurutan karena
            // auto-increment id). Tanpa sort eksplisit ini, urutan tampil jadi acak.
            rows.sort((a, b) => String(a.tanggal || '').localeCompare(String(b.tanggal || '')) ||
                String(a.noFaktur || '').localeCompare(String(b.noFaktur || '')));
            _ptTempoRowsCache = rows;
            Promise.resolve().then(() => { _ptTempoRowsCache = null; });
            return rows;
        }

        // Menyimpan bulan-bulan yang sedang dicentang di filter multi-bulan Cek Piutang.
        // Kosong (Set kosong) = "Semua Bulan". Diisi otomatis dengan bulan terakhir (mis. Juli)
        // hanya SEKALI saat pertama kali dibuka (lihat ptBulanDidDefault), supaya kalau
        // user sudah mengubah pilihannya sendiri, sync data di belakang layar tidak
        // menimpa ulang pilihan itu.
        let ptSelectedBulan = new Set();
        let ptBulanDidDefault = false;

        function ptBulanSummaryLabel(bulanArr) {
            if (!ptSelectedBulan.size || ptSelectedBulan.size >= bulanArr.length) return 'Semua';
            const terpilih = bulanArr.filter(k => ptSelectedBulan.has(k));
            if (terpilih.length <= 2) return terpilih.map(fmtBulanTahun).join(', ');
            return terpilih.length + ' bulan dipilih';
        }

        function ptRenderBulanPanel(bulanArr) {
            const panel = document.getElementById('ptBulanPanel');
            if (!panel) return;
            const semuaChecked = !ptSelectedBulan.size || ptSelectedBulan.size >= bulanArr.length;
            panel.innerHTML = `
                <label><input type="checkbox" id="ptBulanSemua" ${semuaChecked ? 'checked' : ''}> <b>Semua</b></label>
                <div class="pt-bulan-sep"></div>
                ${bulanArr.map(k => `<label><input type="checkbox" class="pt-bulan-item" value="${k}" ${(!semuaChecked && ptSelectedBulan.has(k)) ? 'checked' : ''}> ${fmtBulanTahun(k)}</label>`).join('')}
            `;
            const btn = document.getElementById('ptBulanBtn');
            if (btn) btn.textContent = ptBulanSummaryLabel(bulanArr);

            const cbSemua = document.getElementById('ptBulanSemua');
            if (cbSemua) {
                cbSemua.addEventListener('change', () => {
                    if (cbSemua.checked) ptSelectedBulan = new Set();
                    userSetBulan.pt = true;
                    ptRenderBulanPanel(bulanArr);
                    ptPage = 1;
                    ptRenderTempoTable();
                });
            }
            panel.querySelectorAll('.pt-bulan-item').forEach(cb => {
                cb.addEventListener('change', () => {
                    const checkedItems = Array.from(panel.querySelectorAll('.pt-bulan-item:checked')).map(c => c.value);
                    ptSelectedBulan = new Set(checkedItems);
                    userSetBulan.pt = true;
                    ptRenderBulanPanel(bulanArr);
                    ptPage = 1;
                    ptRenderTempoTable();
                });
            });
        }

        function ptRebuildFilterOptions() {
            const salesSet = new Set(),
                bulanSet = new Set();
            salesData.forEach(r => { if (r.Sales) salesSet.add(r.Sales); if (r.Tanggal) bulanSet.add(String(r.Tanggal)
                    .slice(0, 7)); });
            const fSales = document.getElementById('ptSales');
            const curSales = fSales ? fSales.value : '';
            if (fSales) {
                fSales.innerHTML = '<option value="">Semua</option>' + Array.from(salesSet).sort().map(s =>
                    `<option value="${s}">${s}</option>`).join('');
                fSales.value = curSales;
            }
            const bulanArr = Array.from(bulanSet).sort();
            // Default "bulan terakhir" (mis. Juli) HANYA sekali di awal (saat pertama kali
            // tab ini dimuat di sesi ini) — supaya Cek Piutang selalu terbuka di bulan
            // berjalan. Piutang lama yang belum lunas tetap kelihatan lewat filter bulan
            // (lihat ptGetFilteredTempo: faktur belum lunas dari bulan sebelumnya tetap
            // tampil selama masih <= bulan yang dipilih).
            if (!ptBulanDidDefault && bulanArr.length) {
                ptSelectedBulan = new Set(bulanArr.slice(-1));
                ptBulanDidDefault = true;
            } else if (ptBulanDidDefault && ptSelectedBulan.size) {
                // Buang bulan yang sudah tidak ada lagi di data (jaga-jaga data berubah)
                ptSelectedBulan = new Set(Array.from(ptSelectedBulan).filter(k => bulanSet.has(k)));
            }
            ptRenderBulanPanel(bulanArr);
            // Re-attach listeners after rebuilding options
            if (typeof attachPtFilterListeners === 'function') {
                attachPtFilterListeners();
            }
        }

        function ptGetFilteredTempo(ignoreStatus) {
            const search = document.getElementById('ptSearch').value.trim().toLowerCase();
            const tanggalEl = document.getElementById('ptTanggal');
            const tanggal = tanggalEl ? tanggalEl.value : '';
            const bulanAktif = ptSelectedBulan; // Set kosong = Semua Bulan
            const maxBulanAktif = bulanAktif.size ? Array.from(bulanAktif).sort().slice(-1)[0] : '';
            const sales = document.getElementById('ptSales').value;
            const kategori = document.getElementById('ptKategori').value;
            const status = ignoreStatus ? '' : document.getElementById('ptStatus').value;
            
            return ptBuildTempoRows().filter(r => {
                // SEARCH FILTER: Bypass bulan filter jika ada search (cari di semua periode)
                if (search) {
                    if (!((r.noFaktur || '').toLowerCase().includes(search) || (r.customer || '')
                            .toLowerCase().includes(search))) return false;
                    // Jika ada search, apply sales, tanggal, kategori, status tapi SKIP bulan filter
                    if (tanggal && String(r.tanggal || '') !== tanggal) return false;
                    if (sales && r.sales !== sales) return false;
                    if (kategori && r.kategori !== kategori) return false;
                    if (status === 'belum_gabungan') { 
                        if (r.statusClass === 'lunas') return false; 
                    } else if (status === 'titip') {
                        if (!(r.ketRaw || '').toLowerCase().includes('titip')) return false;
                    } else if (status && r.statusClass !== status) return false;
                    return true;
                }
                
                // NORMAL FILTER: Apply semua filter termasuk bulan (bisa lebih dari 1 bulan dicentang)
                if (tanggal && String(r.tanggal || '') !== tanggal) return false;
                if (bulanAktif.size) {
                    const rBulan = String(r.tanggal || '').slice(0, 7);
                    // Faktur yang belum lunas (termasuk Titip) dianggap masih "nyangkut" sampai
                    // dibayar, jadi tetap tampil selama transaksinya <= bulan terbesar yang
                    // dicentang — walau bulan transaksinya sendiri tidak dicentang. Faktur yang
                    // sudah Lunas tetap harus persis salah satu bulan yang dicentang.
                    if (r.statusClass !== 'lunas') {
                        if (rBulan > maxBulanAktif) return false;
                    } else if (!bulanAktif.has(rBulan)) return false;
                }
                if (sales && r.sales !== sales) return false;
                if (kategori && r.kategori !== kategori) return false;
                if (status === 'belum_gabungan') { 
                    if (r.statusClass === 'lunas') return false; 
                } else if (status === 'titip') {
                    if (!(r.ketRaw || '').toLowerCase().includes('titip')) return false;
                } else if (status && r.statusClass !== status) return false;
                return true;
            });
        }

        function ptRenderTempoTable() {
            const rows = ptGetFilteredTempo();
            const tbody = document.getElementById('ptTbody');
            const totalRows = rows.length;
            const totalPages = Math.ceil(totalRows / ptRowsPerPage) || 1;
            if (ptPage > totalPages) ptPage = totalPages;
            if (ptPage < 1) ptPage = 1;
            const start = (ptPage - 1) * ptRowsPerPage;
            const end = Math.min(start + ptRowsPerPage, totalRows);
            const pageRows = rows.slice(start, end);

            if (pageRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="16" class="empty-msg">📂 Belum ada data piutang tempo.</td></tr>';
            } else {
                tbody.innerHTML = pageRows.map((r, i) => {
                    const realIdx = start + i;
                    const checked = ptChecked[r.noFaktur] ? 'checked' : '';
                    const sisaTagihan = ptSisaTagihanBaris(r);
                    return `<tr class="${r.statusClass==='overdue' ? 'pt-row-overdue' : ''}">
                                <td><input type="checkbox" class="pt-row-checkbox" data-faktur="${r.noFaktur}" ${checked}></td>
                                <td><a href="#" class="pt-faktur-link" data-idx="${realIdx}" style="color:#1f4e78; font-weight:700; text-decoration:underline;">${piutangNotesMap[r.noFaktur] ? '📝 ' : ''}${r.noFaktur||''}</a></td>
                                <td>${fmtTanggalYY(fmtTanggal(r.tanggal))}</td>
                                <td>${r.customer||''}</td>
                                <td>${r.alamat||''}</td>
                                <td>${r.sales||''}</td>
                                <td><span class="badge pt-tercatat">${r.kategori==='fitri' ? 'Minyak Fitri' : 'Rupa Rupa'}</span></td>
                                <td>${r.produkNama||'-'}</td>
                                <td class="num">${fmtRp(r.total)}</td>
                                <td class="num">${r.totalBayar!=null ? fmtRp(r.totalBayar) : '-'}</td>
                                <td class="num">${r.statusClass === 'lunas' ? '-' : fmtRp(sisaTagihan)}</td>
                                <td>${r.jt ? fmtTanggalYY(r.jt) : '-'}</td>
                                <td>${r.statusClass === 'lunas' ? '<span class="stempel-lunas">Lunas</span>' : `<span class="badge pt-${r.statusClass}">${r.statusClass==='overdue' && r.overdueDays!=null ? `${r.overdueDays} hr/Overdue` : ptStatusLabel(r.statusClass)}</span>`}</td>
                                <td>${r.tanggalBayar || '-'}</td>
                                <td>${cetakTagihanMap[r.noFaktur] || '-'}</td>
                                <td>${r.ketRaw || '-'}</td>
                            </tr>`;
                }).join('');
            }

            window._ptRowsCache = rows;
            document.getElementById('ptPageInfo').textContent = `Halaman ${ptPage} dari ${totalPages}`;
            document.getElementById('ptTotalData').textContent = totalRows + ' data';
            document.getElementById('ptPrevPage').disabled = (ptPage <= 1);
            document.getElementById('ptNextPage').disabled = (ptPage >= totalPages);

            const outstanding = rows.filter(r => r.statusClass !== 'lunas').length;
            document.getElementById('badgePiutang').textContent = outstanding;

            updateTab4ChipCounts();
            renderPiutangCards(pageRows, start);
            updatePiutangSelectedInfo();
        }

        // ===== KELOLA KOLOM - CEK PIUTANG (TAB 4) =====
        // Daftar kolom yang bisa disembunyikan/ditampilkan (kolom checkbox di posisi 1 selalu tampil).
        // "col" = posisi nth-child asli di tabel. "def" = tampil secara default agar tabel
        // rapi saat pertama dibuka (tidak perlu geser/scroll horizontal).
        const PT_KOLOM_LIST = [
            { col: 2, label: 'No.Faktur', def: true },
            { col: 3, label: 'Tgl Transaksi', def: true },
            { col: 4, label: 'Customer', def: true },
            { col: 5, label: 'Alamat', def: false },
            { col: 6, label: 'Sales', def: false },
            { col: 7, label: 'Kategori', def: false },
            { col: 8, label: 'Produk', def: true },
            { col: 9, label: 'Total Tagihan', def: true },
            { col: 10, label: 'Total Dibayar', def: false },
            { col: 11, label: 'Sisa Tagihan', def: true },
            { col: 12, label: 'Jatuh Tempo', def: true },
            { col: 13, label: 'Status', def: true },
            { col: 14, label: 'Tgl Bayar', def: false },
            { col: 15, label: 'Tgl Cetak Tgh', def: false },
            { col: 16, label: 'Keterangan', def: false },
        ];
        const PT_KOLOM_LS_KEY = 'pt_kolom_visible_v1';

        function ptLoadKolomState() {
            try {
                const raw = localStorage.getItem(PT_KOLOM_LS_KEY);
                if (raw) {
                    const saved = JSON.parse(raw);
                    if (saved && typeof saved === 'object') {
                        // Lengkapi kalau ada kolom baru yang belum tersimpan di localStorage lama
                        PT_KOLOM_LIST.forEach(k => { if (!(k.col in saved)) saved[k.col] = k.def; });
                        return saved;
                    }
                }
            } catch (e) {}
            const def = {};
            PT_KOLOM_LIST.forEach(k => { def[k.col] = k.def; });
            return def;
        }
        let ptKolomState = ptLoadKolomState();

        function ptSaveKolomState() {
            try { localStorage.setItem(PT_KOLOM_LS_KEY, JSON.stringify(ptKolomState)); } catch (e) {}
        }

        function ptApplyKolomVisibility() {
            const wrap = document.getElementById('tab4TableWrap');
            if (!wrap) return;
            PT_KOLOM_LIST.forEach(k => {
                wrap.classList.toggle('pt-hide-c' + k.col, !ptKolomState[k.col]);
            });
            const visibleCount = PT_KOLOM_LIST.filter(k => ptKolomState[k.col]).length;
            const badge = document.getElementById('ptKolomBadge');
            if (badge) badge.textContent = visibleCount;
        }

        function ptRenderKolomDropdown() {
            const panel = document.getElementById('ptKolomDropdown');
            if (!panel) return;
            panel.innerHTML = `
                <div class="kolom-dropdown-panel">
                    ${PT_KOLOM_LIST.map(k => `
                        <div class="kolom-item">
                            <input type="checkbox" id="ptKolomChk${k.col}" data-col="${k.col}" ${ptKolomState[k.col] ? 'checked' : ''}>
                            <label for="ptKolomChk${k.col}">${k.label}</label>
                        </div>
                    `).join('')}
                </div>
                <div class="kolom-dropdown-footer">
                    <button type="button" class="kolom-btn-reset" id="ptKolomResetBtn">↺ Default</button>
                    <button type="button" class="kolom-btn-terapkan" id="ptKolomAllBtn">Tampilkan Semua</button>
                </div>`;
            panel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                cb.addEventListener('change', function() {
                    ptKolomState[this.dataset.col] = this.checked;
                    ptSaveKolomState();
                    ptApplyKolomVisibility();
                });
            });
            const resetBtn = document.getElementById('ptKolomResetBtn');
            if (resetBtn) resetBtn.addEventListener('click', function() {
                PT_KOLOM_LIST.forEach(k => { ptKolomState[k.col] = k.def; });
                ptSaveKolomState();
                ptApplyKolomVisibility();
                ptRenderKolomDropdown();
            });
            const allBtn = document.getElementById('ptKolomAllBtn');
            if (allBtn) allBtn.addEventListener('click', function() {
                PT_KOLOM_LIST.forEach(k => { ptKolomState[k.col] = true; });
                ptSaveKolomState();
                ptApplyKolomVisibility();
                ptRenderKolomDropdown();
            });
        }

        ptRenderKolomDropdown();
        ptApplyKolomVisibility();

        // Chip Semua/Lunas/Belum Lunas/Titip (tab Cek Piutang) — dihitung dari rows yang sudah
        // kena filter lain (search/tanggal/bulan/sales/kategori) TAPI TANPA filter Status, supaya
        // angkanya tetap menunjukkan total apa adanya persis seperti chip di tab Cek Cash.
        function updateTab4ChipCounts() {
            const rowsAllStatus = ptGetFilteredTempo(true);
            const cLunas = rowsAllStatus.filter(r => r.statusClass === 'lunas').length;
            const cBelumLunas = rowsAllStatus.filter(r => r.statusClass !== 'lunas').length;
            const cTitip = rowsAllStatus.filter(r => (r.ketRaw || '').toLowerCase().includes('titip')).length;
            const setChipTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
            setChipTxt('tab4ChipCountSemua', rowsAllStatus.length);
            setChipTxt('tab4ChipCountLunas', cLunas);
            setChipTxt('tab4ChipCountBelumLunas', cBelumLunas);
            setChipTxt('tab4ChipCountTitip', cTitip);
            const statusVal = document.getElementById('ptStatus').value;
            const activeChip = statusVal === 'lunas' ? 'lunas' : (statusVal === 'belum_gabungan' ? 'belum_lunas' : (statusVal === 'titip' ? 'titip' : 'semua'));
            document.querySelectorAll('#tab4ChipRow .tab1-chip').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.chip === activeChip);
            });
        }
        document.getElementById('tab4ChipRow').addEventListener('click', function(e) {
            const btn = e.target.closest('.tab1-chip');
            if (!btn) return;
            const chip = btn.dataset.chip; // semua | lunas | belum_lunas | titip
            const statusSel = document.getElementById('ptStatus');
            if (statusSel) {
                statusSel.value = chip === 'lunas' ? 'lunas' : (chip === 'belum_lunas' ? 'belum_gabungan' : (chip === 'titip' ? 'titip' : ''));
            }
            ptPage = 1;
            ptRenderTempoTable();
        });

        function updatePiutangSelectedInfo() {
            const selectedCount = Object.values(ptChecked).filter(v => v).length;
            const statusEl = document.getElementById('ptSourceStatus');
            if (statusEl) {
                let baseText = statusEl.textContent.replace(/·.*$/, '').trim();
                statusEl.innerHTML = `${baseText} · ${selectedCount} faktur dipilih`;
            }
            // Floating toolbar: muncul otomatis begitu ada faktur yang dicentang,
            // sama seperti di tab Cek Cash.
            const toolbar = document.getElementById('ptSelectionToolbar');
            const toolbarCount = document.getElementById('ptToolbarCount');
            if (toolbar) {
                if (selectedCount > 0) {
                    if (toolbarCount) toolbarCount.textContent = selectedCount;
                    toolbar.classList.add('show');
                } else {
                    toolbar.classList.remove('show');
                }
            }
        }

        document.getElementById('ptTbody').addEventListener('change', function(e) {
            if (e.target.classList.contains('pt-row-checkbox')) {
                const faktur = e.target.dataset.faktur;
                ptChecked[faktur] = e.target.checked;
                const allCbs = document.querySelectorAll('.pt-row-checkbox');
                const checkedCbs = document.querySelectorAll('.pt-row-checkbox:checked');
                const selectAll = document.getElementById('ptSelectAll');
                if (selectAll) selectAll.checked = (allCbs.length > 0 && checkedCbs.length === allCbs.length);
                updatePiutangSelectedInfo();
                if (e.target.checked) sendSelectedToTab6();
            }
        });

        // Warna latar untuk kelompok No.Faktur yang sama di kartu Cek Piutang.
        // Deterministik (hash dari No.Faktur) supaya faktur yg sama SELALU dapat
        // warna yg sama walau data di-render ulang / pindah halaman.
        function ptFakturColorPalette(key) {
            const palette = ['#e0f2fe', '#fce7f3', '#fef9c3', '#dcfce7', '#ede9fe', '#ffe4e6', '#e0e7ff',
                '#fee2e2', '#d1fae5', '#fef3c7', '#cffafe', '#f3e8ff'
            ];
            const s = String(key || '');
            let hash = 0;
            for (let i = 0; i < s.length; i++) { hash = s.charCodeAt(i) + ((hash << 5) - hash); hash |= 0; }
            return palette[Math.abs(hash) % palette.length];
        }

        // ===== Mode Kartu untuk Cek Piutang (Tab 4) — sama seperti Cek Cash ===== //
        function renderPiutangCards(pageRows, start) {
            const wrap = document.getElementById('ptCardList');
            if (!wrap) return;
            if (!pageRows || pageRows.length === 0) {
                wrap.innerHTML = `<div class="sales-card-empty">📂 Belum ada data piutang tempo.</div>`;
                return;
            }
            // Gabungkan baris2 yang No.Fakturnya sama (1 faktur bisa punya >1 baris
            // produk di Bank Data Penjualan) supaya tampil sebagai 1 KARTU per faktur,
            // dengan rincian semua produknya + Total Tagihan gabungan di dalam kartu
            // itu — sama seperti modal Detail Faktur (bukan per-baris seperti dulu).
            const seenFaktur = new Set();
            const groups = [];
            pageRows.forEach((r, i) => {
                const key = normFaktur(r.noFaktur);
                if (seenFaktur.has(key)) return;
                seenFaktur.add(key);
                groups.push({ row: r, idx: i });
            });

            wrap.innerHTML = groups.map(({ row: r, idx: i }) => {
                const realIdx = start + i;
                const checked = ptChecked[r.noFaktur] ? 'checked' : '';
                const noFakturSafe = escapeHtml(String(r.noFaktur || ''));
                const rincian = buildPiutangCardRincian(r.noFaktur, r);
                const sisaTagihan = r.statusClass === 'lunas' ? 0 : Math.max(0, rincian.totalJual - (r
                    .totalBayar || 0));
                const multiTag = rincian.itemCount > 1 ?
                    ' <span title="Faktur ini punya beberapa item produk">🔗</span>' : '';
                const statusBadge = r.statusClass === 'lunas' ?
                    '<span class="badge lunas-mini">✅ Lunas</span>' :
                    `<span class="badge pt-${r.statusClass}">${r.statusClass === 'overdue' && r.overdueDays != null ? `${r.overdueDays} hr/Overdue` : ptStatusLabel(r.statusClass)}</span>`;
                return `<div class="sales-card${checked ? ' selected' : ''}">
                    ${r.statusClass === 'lunas' ? '<div class="sales-card-stempel-lunas">Lunas</div>' : ''}
                    <div class="sales-card-top">
                        <div class="sales-card-top-left">
                            <input type="checkbox" class="pt-row-checkbox" data-faktur="${noFakturSafe}" ${checked}>
                            <a href="#" class="pt-faktur-link sales-card-faktur" data-idx="${realIdx}">${piutangNotesMap[r.noFaktur] ? '📝 ' : ''}${noFakturSafe}${multiTag}</a>
                        </div>
                        <span class="sales-card-date">${fmtTanggalYY(fmtTanggal(r.tanggal))}</span>
                    </div>
                    <div class="sales-card-produk">${escapeHtml(r.customer || '-')}</div>
                    <div class="sales-card-qty">${escapeHtml(r.alamat || '-')}</div>
                    ${rincian.html}
                    <div class="pt-card-tagihan-grid">
                        <div class="pt-card-tagihan-item">
                            <div class="pt-card-tagihan-label">Total Tagihan (awal transaksi)</div>
                            <div class="pt-card-tagihan-value">${fmtRp(rincian.totalJual)}</div>
                        </div>
                        <div class="pt-card-tagihan-item">
                            <div class="pt-card-tagihan-label">Total Dibayar</div>
                            <div class="pt-card-tagihan-value">${r.totalBayar!=null ? fmtRp(r.totalBayar) : '-'}</div>
                        </div>
                        <div class="pt-card-tagihan-item">
                            <div class="pt-card-tagihan-label">Sisa Tagihan</div>
                            <div class="pt-card-tagihan-value ${r.statusClass === 'lunas' ? 'lunas' : 'belum'}">${fmtRp(sisaTagihan)}</div>
                        </div>
                    </div>
                    <div class="sales-card-mid">
                        <span class="sales-card-badges"><span class="badge pt-tercatat">${r.kategori === 'fitri' ? 'Minyak Fitri' : 'Rupa Rupa'}</span> ${statusBadge}</span>
                    </div>
                    <div class="sales-card-foot">
                        <span><b>${escapeHtml(r.sales || '-')}</b></span>
                        <span>Jth Tempo: ${r.jt ? fmtTanggalYY(r.jt) : '-'}</span>
                    </div>
                </div>`;
            }).join('');
        }

        document.getElementById('ptCardList').addEventListener('change', function(e) {
            if (e.target.classList.contains('pt-row-checkbox')) {
                const faktur = e.target.dataset.faktur;
                ptChecked[faktur] = e.target.checked;
                e.target.closest('.sales-card').classList.toggle('selected', e.target.checked);
                const allCbs = document.querySelectorAll('.pt-row-checkbox');
                const checkedCbs = document.querySelectorAll('.pt-row-checkbox:checked');
                const selectAll = document.getElementById('ptSelectAll');
                if (selectAll) selectAll.checked = (allCbs.length > 0 && checkedCbs.length === allCbs.length);
                updatePiutangSelectedInfo();
                if (e.target.checked) sendSelectedToTab6();
            }
        });

        let tab4ViewMode = localStorage.getItem('tab4ViewMode') === 'card' ? 'card' : 'table';
        function applyTab4ViewMode() {
            const isCard = tab4ViewMode === 'card';
            const tableWrap = document.getElementById('tab4TableWrap');
            const cardList = document.getElementById('ptCardList');
            const tabelBtn = document.getElementById('tab4ViewTabelBtn');
            const kartuBtn = document.getElementById('tab4ViewKartuBtn');
            if (tableWrap) tableWrap.style.display = isCard ? 'none' : '';
            if (cardList) cardList.classList.toggle('show', isCard);
            if (tabelBtn) tabelBtn.classList.toggle('active', !isCard);
            if (kartuBtn) kartuBtn.classList.toggle('active', isCard);
        }
        document.getElementById('tab4ViewToggle').addEventListener('click', function(e) {
            const btn = e.target.closest('.tab1-view-btn');
            if (!btn) return;
            tab4ViewMode = btn.dataset.view === 'card' ? 'card' : 'table';
            localStorage.setItem('tab4ViewMode', tab4ViewMode);
            applyTab4ViewMode();
        });
        applyTab4ViewMode();

        document.getElementById('ptSelectAll').addEventListener('change', function() {
            const checked = this.checked;
            document.querySelectorAll('.pt-row-checkbox').forEach(cb => {
                cb.checked = checked;
                ptChecked[cb.dataset.faktur] = checked;
            });
            updatePiutangSelectedInfo();
            if (checked) sendSelectedToTab6();
        });

        document.getElementById('ptPrevPage').addEventListener('click', function() { if (ptPage > 1) { ptPage--;
                ptRenderTempoTable(); } });
        document.getElementById('ptNextPage').addEventListener('click', function() {
            const totalRows = ptGetFilteredTempo().length;
            const totalPages = Math.ceil(totalRows / ptRowsPerPage) || 1;
            if (ptPage < totalPages) { ptPage++;
                ptRenderTempoTable(); }
        });

        // Kumpulkan SEMUA kemunculan pembayaran (cicilan/titip) untuk satu No.Faktur
        // dari Data Uang Masuk (piutangDetail & cashDroppingDetail, semua bulan/hari),
        // supaya modal Detail Faktur bisa menampilkan riwayat lengkap: kapan bayar,
        // berapa titipnya. (ptBuildTempoRows sekarang juga sudah menjumlahkan semua
        // kemunculan lewat ptSumByFaktur(), jadi status ringkasan di tabel & di sini
        // saling konsisten.)
        function ptHitungRiwayatFaktur(noFaktur) {
            const target = normFaktur(noFaktur);
            const riwayat = [];
            Object.keys(ptIncomeByMonth).sort().forEach(bulan => {
                const tahun = (bulan || '').slice(0, 4) || String(new Date().getFullYear());
                const bulanNum = (bulan || '').slice(5, 7) || '01';
                (ptIncomeByMonth[bulan] || []).forEach(day => {
                    const dayPart = String(day.tanggal || '').split('-')[0] || '01';
                    const tglTampil = `${dayPart.padStart(2,'0')}/${bulanNum}/${tahun}`;
                    const tglISO = `${tahun}-${bulanNum}-${dayPart.padStart(2,'0')}`;
                    const cek = (list, sumber) => {
                        (list || []).forEach(d => {
                            if (normFaktur(d.noFaktur) !== target) return;
                            const cash = parseNumber(d.bayarCash || 0);
                            const transfer = parseNumber(d.bayarTransfer || 0);
                            const total = (d.totalBayar != null) ? parseNumber(d.totalBayar) : (cash + transfer);
                            if (total <= 0) return;
                            riwayat.push({ tglTampil, tglISO, sumber, cash, transfer, total, ket: d.ket || '' });
                        });
                    };
                    cek(day.piutangDetail, 'Tempo');
                    cek(day.cashDroppingDetail, 'Cash');
                });
            });
            riwayat.sort((a, b) => a.tglISO.localeCompare(b.tglISO));
            return riwayat;
        }

        // ================================================================
