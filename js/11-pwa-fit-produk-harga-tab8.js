        // DETEKSI MODE STANDALONE/FULLSCREEN (PWA) - AGGRESSIVE
        // ================================================================
        function detectPWAMode() {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
            const isFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
            
            if (isStandalone || isFullscreen) {
                document.documentElement.setAttribute('data-pwa-standalone', 'true');
                const header = document.querySelector('.app-header');
                if (header) {
                    header.style.display = 'none !important';
                    header.style.visibility = 'hidden';
                    header.style.height = '0';
                    header.style.margin = '0';
                    header.style.padding = '0';
                    header.style.border = 'none';
                    header.style.width = '0';
                    header.style.overflow = 'hidden';
                    header.style.position = 'absolute';
                    header.style.left = '-9999px';
                }
                const tabs = document.querySelector('.tabs');
                if (tabs) {
                    tabs.style.top = '0';
                    tabs.style.position = 'sticky';
                    tabs.style.zIndex = '39';
                }
                console.log('✅ PWA Mode Detected - Header Hidden');
            }
        }
        
        detectPWAMode();
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', detectPWAMode);
        }
        window.matchMedia('(display-mode: standalone)').addEventListener('change', detectPWAMode);
        window.matchMedia('(display-mode: fullscreen)').addEventListener('change', detectPWAMode);

        // ================================================================
        // AUTO-FIT TABLE HEIGHT
        // ================================================================
        function fitTableWraps() {
            document.querySelectorAll('.tab-content.active .table-wrap').forEach(function(wrap) {
                const rect = wrap.getBoundingClientRect();
                if (rect.width === 0 && rect.height === 0) return;
                const tabContent = wrap.closest('.tab-content');
                const pagination = tabContent ? tabContent.querySelector(':scope > .pagination') : null;
                let reserve = 4;
                if (pagination) {
                    const pRect = pagination.getBoundingClientRect();
                    if (pRect.height > 0) reserve += pRect.height + 2;
                }
                const isTwoCol = !!wrap.closest('.two-col');
                const minH = isTwoCol ? 200 : 260;
                let available = Math.round(window.innerHeight - rect.top - reserve);
                if (available < minH) available = minH;
                const px = available + 'px';
                if (wrap.style.height !== px) {
                    wrap.style.height = px;
                    wrap.style.maxHeight = px;
                }
            });
        }
        let _fitRAF = null;

        function scheduleFitTableWraps() {
            if (_fitRAF) cancelAnimationFrame(_fitRAF);
            _fitRAF = requestAnimationFrame(fitTableWraps);
        }
        window.addEventListener('resize', scheduleFitTableWraps);
        window.addEventListener('orientationchange', scheduleFitTableWraps);

        // ================================================================
        // MASTER PRODUK & HARGA (Tab 8) — daftar produk + harga beli/jual,
        // disimpan lokal di browser (seperti draft Input Harian), bisa
        // ditambah, diedit, dicari, dan dihapus lewat modal.
        // ================================================================
        const PRODUK_HARGA_KEY = 'produkHargaMaster';
        let _produkHargaWorking = [];
        let _produkHargaSearchTerm = '';

        function loadProdukHargaMaster() {
            try {
                const raw = localStorage.getItem(PRODUK_HARGA_KEY);
                return raw ? JSON.parse(raw) : [];
            } catch (e) { return []; }
        }

        function saveProdukHargaMaster(list) {
            try {
                localStorage.setItem(PRODUK_HARGA_KEY, JSON.stringify(list));
                return true;
            } catch (e) {
                showToast('❌ Gagal menyimpan daftar produk: ' + e.message, 'warning');
                return false;
            }
        }

        function updateProdukHargaCountLabel() {
            const el = document.getElementById('produkHargaCountLabel');
            if (el) el.textContent = loadProdukHargaMaster().length + ' produk';
        }

        // ================================================================
        // LINK: Produk & Harga (Tab 8) <-> Bank Data Penjualan (Tab 1)
        // Mencari harga beli/jual dari Master Produk berdasarkan nama produk
        // (exact match dulu, kalau tidak ada baru cari yang mengandung teks).
        // ================================================================
        function cariHargaProdukMaster(namaProduk) {
            const nama = (namaProduk || '').trim().toLowerCase();
            if (!nama) return null;
            const master = loadProdukHargaMaster();
            let found = master.find(function(p) { return (p.produk || '').trim().toLowerCase() === nama; });
            if (!found) found = master.find(function(p) {
                const pn = (p.produk || '').trim().toLowerCase();
                return pn && (pn.includes(nama) || nama.includes(pn));
            });
            if (!found) return null;
            return {
                hargaBeli: (found.hargaBeli !== undefined && found.hargaBeli !== '') ? (parseFloat(found
                    .hargaBeli) || 0) : '',
                hargaJual: (found.hargaJual !== undefined && found.hargaJual !== '') ? (parseFloat(found
                    .hargaJual) || 0) : ''
            };
        }

        // Isi ulang <datalist> nama produk (untuk autocomplete di form Bank Data Penjualan)
        function refreshProdukMasterDatalist() {
            let dl = document.getElementById('produkMasterDatalist');
            if (!dl) {
                dl = document.createElement('datalist');
                dl.id = 'produkMasterDatalist';
                document.body.appendChild(dl);
            }
            const master = loadProdukHargaMaster();
            dl.innerHTML = master.map(function(p) {
                return '<option value="' + escapeHtml(p.produk || '') + '">';
            }).join('');
            const fProduk = document.getElementById('fProdukSales');
            if (fProduk && !fProduk.hasAttribute('list')) fProduk.setAttribute('list', 'produkMasterDatalist');
        }

        function bacaFormProdukHargaKeWorking() {
            const tbody = document.getElementById('phTableBody');
            if (!tbody) return;
            tbody.querySelectorAll('tr[data-idx]').forEach(tr => {
                const idx = parseInt(tr.dataset.idx, 10);
                const item = _produkHargaWorking[idx];
                if (!item) return;
                const produkInput = tr.querySelector('.ph-produk');
                const hbInput = tr.querySelector('.ph-hargabeli');
                const hjInput = tr.querySelector('.ph-hargajual');
                if (produkInput) item.produk = produkInput.value.trim();
                if (hbInput) item.hargaBeli = hbInput.value === '' ? '' : parseAngka(hbInput.value);
                if (hjInput) item.hargaJual = hjInput.value === '' ? '' : parseAngka(hjInput.value);
            });
        }

        function renderModalProdukHarga() {
            const term = _produkHargaSearchTerm.trim().toLowerCase();
            const filteredIdx = [];
            _produkHargaWorking.forEach((p, i) => {
                if (!term || (p.produk || '').toLowerCase().includes(term)) filteredIdx.push(i);
            });

            const rowsHtml = filteredIdx.map(i => {
                const p = _produkHargaWorking[i];
                return `<tr data-idx="${i}">
                    <td style="padding:4px 8px;"><input type="text" class="ph-produk" value="${escapeHtml(p.produk || '')}" style="width:100%;box-sizing:border-box;padding:4px 6px;border:1px solid #cbd5e1;border-radius:3px;font-size:11px;"></td>
                    <td style="padding:4px 8px;"><input type="number" class="ph-hargabeli num" value="${p.hargaBeli !== undefined && p.hargaBeli !== '' ? p.hargaBeli : ''}" placeholder="-" style="width:100%;box-sizing:border-box;text-align:right;padding:4px 6px;border:1px solid #cbd5e1;border-radius:3px;font-size:11px;"></td>
                    <td style="padding:4px 8px;"><input type="number" class="ph-hargajual num" value="${p.hargaJual !== undefined && p.hargaJual !== '' ? p.hargaJual : ''}" placeholder="-" style="width:100%;box-sizing:border-box;text-align:right;padding:4px 6px;border:1px solid #cbd5e1;border-radius:3px;font-size:11px;"></td>
                    <td style="text-align:center;padding:4px 8px;"><button type="button" class="btn-hapus-produk-harga" data-idx="${i}" style="color:#dc3545;background:none;border:none;font-size:16px;cursor:pointer;line-height:1;" title="Hapus produk ini">&times;</button></td>
                </tr>`;
            }).join('');

            const body = document.getElementById('detailModalBodyGlobal');
            body.innerHTML = `
                <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
                    <input type="text" id="phSearchInput" placeholder="🔍 Cari produk..." value="${escapeHtml(_produkHargaSearchTerm)}" style="flex:1;min-width:160px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:4px;font-size:11px;">
                    <button type="button" id="phBtnAmbilBankData" class="btn btn-outline" style="font-size:11px;padding:6px 14px;border-color:#0d6efd;color:#0d6efd;" title="Isi daftar produk otomatis dari data yang sudah ada di Bank Data Penjualan">📥 Ambil dari Bank Data Penjualan</button>
                    <button type="button" id="phBtnUploadExcel" class="btn btn-outline" style="font-size:11px;padding:6px 14px;border-color:#7c3aed;color:#7c3aed;" title="Upload file Excel harga beli — format rapi (kolom Produk/Harga Beli) atau file mentah, otomatis terdeteksi">📤 Upload Excel</button>
                    <input type="file" id="phFileInput" accept=".xlsx,.xls" style="display:none;">
                    <button type="button" id="phBtnDownloadExcel" class="btn btn-outline" style="font-size:11px;padding:6px 14px;border-color:#16a34a;color:#16a34a;" title="Download daftar produk &amp; harga saat ini sebagai file Excel">📥 Download Excel</button>
                    <button type="button" id="phBtnTambah" class="btn btn-outline" style="font-size:11px;padding:6px 14px;">+ Tambah Produk</button>
                </div>
                <div style="max-height:50vh;overflow:auto;border:1px solid #e2e8f0;border-radius:4px;">
                    <table style="width:100%;border-collapse:collapse;font-size:11px;table-layout:fixed;">
                        <colgroup>
                            <col style="width:auto;">
                            <col style="width:140px;">
                            <col style="width:140px;">
                            <col style="width:40px;">
                        </colgroup>
                        <thead>
                            <tr style="background:#e5e7eb;position:sticky;top:0;">
                                <th style="text-align:left;padding:6px 8px;">Produk</th>
                                <th style="text-align:right;padding:6px 8px;">Harga Beli</th>
                                <th style="text-align:right;padding:6px 8px;">Harga Jual</th>
                                <th style="padding:6px 8px;"></th>
                            </tr>
                        </thead>
                        <tbody id="phTableBody">
                            ${rowsHtml || `<tr><td colspan="4" style="text-align:center;padding:14px;color:#94a3b8;">${term ? 'Tidak ada produk yang cocok.' : 'Belum ada produk. Klik "📥 Ambil dari Bank Data Penjualan" untuk isi otomatis, atau "+ Tambah Produk" untuk isi manual.'}</td></tr>`}
                        </tbody>
                    </table>
                </div>
                <div style="margin-top:12px;display:flex;justify-content:flex-end;">
                    <button type="button" id="phBtnSimpan" class="btn btn-success" style="font-size:12px;padding:8px 20px;">💾 Simpan Semua</button>
                </div>
            `;

            const searchInput = document.getElementById('phSearchInput');
            searchInput.addEventListener('input', function() {
                bacaFormProdukHargaKeWorking();
                _produkHargaSearchTerm = this.value;
                const cursorPos = this.selectionStart;
                renderModalProdukHarga();
                const el = document.getElementById('phSearchInput');
                if (el) { el.focus();
                    el.setSelectionRange(cursorPos, cursorPos); }
            });
            document.getElementById('phBtnTambah').addEventListener('click', function() {
                bacaFormProdukHargaKeWorking();
                _produkHargaWorking.unshift({ produk: '', hargaBeli: '', hargaJual: '' });
                renderModalProdukHarga();
            });
            document.getElementById('phBtnAmbilBankData').addEventListener('click', ambilProdukDariBankDataKeMaster);
            document.getElementById('phBtnUploadExcel').addEventListener('click', function() {
                document.getElementById('phFileInput').click();
            });
            document.getElementById('phFileInput').addEventListener('change', handleProdukHargaExcelUpload);
            document.getElementById('phBtnDownloadExcel').addEventListener('click', downloadProdukHargaExcel);
            document.getElementById('phBtnSimpan').addEventListener('click', simpanProdukHargaDariModal);
            body.querySelectorAll('.btn-hapus-produk-harga').forEach(btn => {
                btn.addEventListener('click', function() {
                    bacaFormProdukHargaKeWorking();
                    const idx = parseInt(this.dataset.idx, 10);
                    if (!confirm('Hapus produk ini dari daftar?')) return;
                    _produkHargaWorking.splice(idx, 1);
                    renderModalProdukHarga();
                });
            });
        }

        // ================================================================
        // LINK: Ambil daftar produk unik + harga jual/beli dari Bank Data
        // Penjualan (Tab 1) ke Master Produk & Harga (Tab 8), untuk "cek"
        // kecocokan harga & melengkapi produk yang belum ada di master.
        // ================================================================
        function ambilProdukDariBankData() {
            // Urutkan dari transaksi TERBARU ke terlama supaya harga yang
            // dipakai adalah harga jual/beli paling baru per produk.
            const sorted = salesData.slice().sort((a, b) => String(b.Tanggal || '').localeCompare(String(a
                .Tanggal || '')));
            const result = {};
            sorted.forEach(r => {
                const nama = String(r.Produk || '').trim();
                if (!nama) return;
                const key = nama.toLowerCase();
                if (!result[key]) result[key] = { produk: nama, hargaBeli: '', hargaJual: '' };
                if (result[key].hargaJual === '') {
                    const hj = parseNumber(r['Harga Jual']);
                    if (hj) result[key].hargaJual = hj;
                }
                if (result[key].hargaBeli === '') {
                    const hbRaw = r['Harga Beli'];
                    if (hbRaw !== undefined && hbRaw !== '' && hbRaw !== null) {
                        const hb = parseNumber(hbRaw);
                        if (hb) result[key].hargaBeli = hb;
                    }
                }
            });
            return Object.values(result).sort((a, b) => a.produk.localeCompare(b.produk, 'id'));
        }

        function ambilProdukDariBankDataKeMaster() {
            bacaFormProdukHargaKeWorking();
            if (!salesData || !salesData.length) {
                showToast('⚠️ Bank Data Penjualan masih kosong, tidak ada produk yang bisa diambil.', 'warning');
                return;
            }
            const daftarBankData = ambilProdukDariBankData();
            if (!daftarBankData.length) {
                showToast('⚠️ Tidak ditemukan nama produk di Bank Data Penjualan.', 'warning');
                return;
            }
            let ditambah = 0,
                dilengkapi = 0;
            daftarBankData.forEach(item => {
                const key = item.produk.toLowerCase();
                const existing = _produkHargaWorking.find(p => (p.produk || '').trim().toLowerCase() === key);
                if (existing) {
                    if ((existing.hargaBeli === '' || existing.hargaBeli === undefined) && item.hargaBeli !==
                        '') { existing.hargaBeli = item.hargaBeli;
                        dilengkapi++; }
                    if ((existing.hargaJual === '' || existing.hargaJual === undefined) && item.hargaJual !==
                        '') { existing.hargaJual = item.hargaJual;
                        dilengkapi++; }
                } else {
                    _produkHargaWorking.push(item);
                    ditambah++;
                }
            });
            _produkHargaWorking.sort((a, b) => (a.produk || '').localeCompare(b.produk || '', 'id'));
            renderModalProdukHarga();
            let pesan = '📥 ' + ditambah + ' produk baru diambil dari Bank Data Penjualan';
            if (dilengkapi) pesan += ', ' + dilengkapi + ' harga kosong dilengkapi';
            pesan += '. Cek lalu klik "💾 Simpan Semua".';
            showToast(pesan, ditambah || dilengkapi ? 'success' : 'info');
        }

        function simpanProdukHargaDariModal() {
            bacaFormProdukHargaKeWorking();
            const cleaned = _produkHargaWorking.filter(p => (p.produk || '').trim() !== '');
            cleaned.sort((a, b) => (a.produk || '').localeCompare(b.produk || '', 'id'));
            _produkHargaWorking = cleaned;
            const ok = saveProdukHargaMaster(cleaned);
            if (ok) {
                updateProdukHargaCountLabel();
                refreshProdukMasterDatalist();
                showToast('💾 Daftar Produk & Harga berhasil disimpan.', 'success');
                renderModalProdukHarga();
            }
        }

        // ================================================================
        // UPLOAD FILE EXCEL (rapi atau mentah) -> Master Produk & Harga
        // Auto-detect: coba format rapi (kolom "Produk"/"Harga beli") dulu;
        // kalau tidak ketemu sama sekali, otomatis fallback baca format
        // mentah (mis. daftarharga.xls: ada baris judul, header pakai sel
        // gabungan, baris data diselingi baris kosong).
        // ================================================================
        function parseProdukHargaRapi(sheet) {
            const json = XLSX.utils.sheet_to_json(sheet);
            const hasil = {};
            let count = 0;
            json.forEach(row => {
                const p = row['Produk'] || row['produk'] || row['Nama Produk'];
                const h = row['Harga beli'] || row['Harga Beli'] || row['harga beli'] || row['harga_beli'];
                if (p && h) { hasil[String(p).trim()] = parseInt(h) || 0; count++; }
            });
            return { hasil, count };
        }

        function parseProdukHargaMentah(sheet) {
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
            const hasil = {};
            let count = 0;
            let headerDitemukan = false;
            for (const row of rows) {
                if (!headerDitemukan) {
                    if (row.some(v => String(v).trim().toLowerCase() === 'produk')) headerDitemukan = true;
                    continue;
                }
                if (row.length <= 6) continue;
                const nama = String(row[3] || '').trim();
                const harga = row[6];
                if (!nama) continue;
                if (typeof harga !== 'number' || harga === 0) continue;
                hasil[nama] = Math.round(harga);
                count++;
            }
            return { hasil, count };
        }

        function handleProdukHargaExcelUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const wb = XLSX.read(data, { type: 'array' });
                    const sheet = wb.Sheets[wb.SheetNames[0]];

                    let { hasil, count } = parseProdukHargaRapi(sheet);
                    let modeMentah = false;
                    if (count === 0) {
                        ({ hasil, count } = parseProdukHargaMentah(sheet));
                        modeMentah = true;
                    }
                    if (count === 0) {
                        showToast('⚠️ Tidak ada data "Produk" & "Harga beli" yang terbaca dari file ini.',
                            'warning');
                        return;
                    }

                    bacaFormProdukHargaKeWorking();
                    let ditambah = 0,
                        diupdate = 0;
                    Object.keys(hasil).forEach(nama => {
                        const key = nama.toLowerCase();
                        const existing = _produkHargaWorking.find(p => (p.produk || '').trim().toLowerCase() ===
                            key);
                        if (existing) {
                            existing.hargaBeli = hasil[nama];
                            diupdate++;
                        } else {
                            _produkHargaWorking.push({ produk: nama, hargaBeli: hasil[nama], hargaJual: '' });
                            ditambah++;
                        }
                    });
                    _produkHargaWorking.sort((a, b) => (a.produk || '').localeCompare(b.produk || '', 'id'));
                    renderModalProdukHarga();
                    showToast('📤 ' + ditambah + ' produk baru, ' + diupdate + ' harga beli di-update' +
                        (modeMentah ? ' (format mentah terdeteksi)' : '') +
                        '. Klik "💾 Simpan Semua" untuk menyimpan.', 'success');
                } catch (err) {
                    showToast('❌ Error baca file: ' + err.message, 'warning');
                }
            };
            reader.readAsArrayBuffer(file);
            event.target.value = '';
        }

        function downloadProdukHargaExcel() {
            bacaFormProdukHargaKeWorking();
            const data = _produkHargaWorking
                .filter(p => (p.produk || '').trim() !== '')
                .slice()
                .sort((a, b) => (a.produk || '').localeCompare(b.produk || '', 'id'))
                .map(p => ({
                    'Produk': p.produk,
                    'Harga Beli': p.hargaBeli === '' || p.hargaBeli === undefined ? 0 : p.hargaBeli,
                    'Harga Jual': p.hargaJual === '' || p.hargaJual === undefined ? 0 : p.hargaJual
                }));
            if (!data.length) {
                showToast('⚠️ Belum ada produk untuk di-download.', 'warning');
                return;
            }
            const ws = XLSX.utils.json_to_sheet(data);
            ws['!cols'] = [{ wch: 35 }, { wch: 14 }, { wch: 14 }];
            const wbOut = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wbOut, ws, 'Produk & Harga');
            const tgl = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wbOut, 'produk_harga_' + tgl + '.xlsx');
            showToast('📥 File Excel Produk & Harga berhasil di-download.', 'success');
        }

        // ================================================================
        // DOWNLOAD EXCEL — Cek Cash, Cek Piutang, Cetak Tagihan, Pembayaran,
        // Pengeluaran. Masing-masing generate .xlsx dari data yang SEDANG
        // TAMPIL (mengikuti filter/bulan/tanggal aktif di tab tersebut),
        // bukan seluruh data mentah di database.
        // ================================================================
        function exportCekCashExcel() {
            if (!cashTableFiltered.length) {
                showToast('⚠️ Tidak ada data Cek Cash untuk di-download (sesuai filter aktif).', 'warning');
                return;
            }
            const data = cashTableFiltered.map(d => ({
                'No.Faktur': d['No.Faktur'] || '',
                'Tanggal Transaksi': fmtTanggal(d.Tanggal),
                'Customer': d.Customer || '',
                'Alamat': d.Alamat || '',
                'Sales': d.Sales || '',
                'Kategori': (d.Produk || '').toLowerCase().includes('fitri') ? 'Minyak Fitri' : 'Rupa Rupa',
                'Nominal': parseNumber(d.Total) || 0,
                'Status': d._status === 'cocok' ? 'Lunas' : 'Belum Lunas'
            }));
            const ws = XLSX.utils.json_to_sheet(data);
            ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Cek Cash');
            const filename = 'Cek_Cash_' + new Date().toISOString().slice(0, 10) + '.xlsx';
            XLSX.writeFile(wb, filename);
            showToast('📥 ' + filename + ' (' + data.length + ' baris)', 'success');
        }

        function exportCekPiutangExcel() {
            const rows = ptGetFilteredTempo();
            if (!rows.length) {
                showToast('⚠️ Tidak ada data Cek Piutang untuk di-download (sesuai filter aktif).', 'warning');
                return;
            }
            const data = rows.map(r => {
                const sisaTagihan = ptSisaTagihanBaris(r);
                const statusText = r.statusClass === 'lunas' ? 'Sudah Lunas' :
                    (r.statusClass === 'overdue' && r.overdueDays != null ? `${r.overdueDays} Hari Overdue` : ptStatusLabel(r.statusClass));
                return {
                    'No.Faktur': r.noFaktur || '',
                    'Tgl Transaksi': fmtTanggal(r.tanggal),
                    'Customer': r.customer || '',
                    'Alamat': r.alamat || '',
                    'Sales': r.sales || '',
                    'Kategori': r.kategori === 'fitri' ? 'Minyak Fitri' : 'Rupa Rupa',
                    'Produk': r.produkNama || '',
                    'Total Tagihan': parseNumber(r.total) || 0,
                    'Total Dibayar': r.totalBayar != null ? parseNumber(r.totalBayar) : 0,
                    'Sisa Tagihan': r.statusClass === 'lunas' ? 0 : sisaTagihan,
                    'Jatuh Tempo': r.jt ? fmtTanggal(r.jt) : '',
                    'Status': statusText,
                    'Tgl Bayar': r.tanggalBayar || '',
                    'Tgl Cetak Tagihan': cetakTagihanMap[r.noFaktur] || '',
                    'Keterangan': r.ketRaw || ''
                };
            });
            const ws = XLSX.utils.json_to_sheet(data);
            ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 14 }, { wch: 20 },
                { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 16 }, { wch: 20 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Cek Piutang');
            const filename = 'Cek_Piutang_' + new Date().toISOString().slice(0, 10) + '.xlsx';
            XLSX.writeFile(wb, filename);
            showToast('📥 ' + filename + ' (' + data.length + ' baris)', 'success');
        }

        function exportCetakTagihanExcel() {
            const rows = window._tagihanSelectedRows || [];
            if (!rows.length) {
                showToast('⚠️ Belum ada faktur yang tampil di Cetak Tagihan untuk di-download.', 'warning');
                return;
            }
            const data = rows.map((r, i) => {
                const nominal = ptNominalTagih(r);
                const produkNama = r.produk || r.produkNama || '';
                const isFitri = produkNama.toLowerCase().includes('fitri');
                const sumberLabel = r.tipe === 'cash' ? 'CASH' : 'PIUTANG';
                const ket = (isFitri ? 'MINYAK' : 'RUPA2') + ' (' + sumberLabel + ')';
                const produkDisplay = produkNama || (isFitri ? 'Minyak Fitri' : 'Rupa Rupa');
                return {
                    'NO': i + 1,
                    'NO FAKTUR': r.noFaktur || '',
                    'NAMA OUTLET': r.customer || '',
                    'ALAMAT': r.alamat || '',
                    'SALESMAN': r.sales || '',
                    'PRODUK': produkDisplay,
                    'TGL NOTA': fmtTanggal(r.tanggal),
                    'TGL TEMPO': r.jt || '',
                    'TAGIHAN': nominal,
                    'KET': ket
                };
            });
            const ws = XLSX.utils.json_to_sheet(data);
            ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 12 }, { wch: 20 }, { wch: 14 },
                { wch: 14 }, { wch: 14 }, { wch: 18 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Cetak Tagihan');
            const filename = 'Cetak_Tagihan_' + new Date().toISOString().slice(0, 10) + '.xlsx';
            XLSX.writeFile(wb, filename);
            showToast('📥 ' + filename + ' (' + data.length + ' baris)', 'success');
        }

        // Baca langsung dari input di tabel (bukan array data terpisah), karena Tab 7
        // (Pembayaran/Input Harian) memang berupa form yang diedit manual per tanggal.
        function bacaBarisInputHarian(tbodyId) {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return [];
            const hasil = [];
            tbody.querySelectorAll('tr').forEach(tr => {
                const inputs = tr.querySelectorAll('input');
                if (inputs.length < 13) return; // baris tidak lengkap/kosong, lewati
                const [sales, noFaktur, namaToko, alamat, tglFaktur, jt, tagihan,
                    cashMinyak, transferMinyak, cashRupa, transferRupa, ket, total] =
                    Array.from(inputs).map(inp => inp.value.trim());
                // Lewati baris yang benar-benar kosong (belum diisi sama sekali)
                if (!noFaktur && !namaToko && !tagihan && !total) return;
                hasil.push({ sales, noFaktur, namaToko, alamat, tglFaktur, jt, tagihan,
                    cashMinyak, transferMinyak, cashRupa, transferRupa, ket, total });
            });
            return hasil;
        }

        function exportPembayaranHarianExcel() {
            const piutangRows = bacaBarisInputHarian('piutangInputBody');
            const cashRows = bacaBarisInputHarian('cashInputBody');
            if (!piutangRows.length && !cashRows.length) {
                showToast('⚠️ Belum ada data terisi di Piutang Tempo maupun Cash Dropping untuk tanggal ini.', 'warning');
                return;
            }
            const kolom = (rows, labelSales) => rows.map(r => ({
                [labelSales]: r.sales, 'NO FAKTUR': r.noFaktur, 'NAMA TOKO': r.namaToko, 'ALAMAT': r.alamat,
                'TGL FAKTUR': r.tglFaktur, 'JT': r.jt, 'TAGIHAN/NOMINAL': r.tagihan,
                'CASH (Minyak)': r.cashMinyak, 'TRANSFER (Minyak)': r.transferMinyak,
                'CASH (Rupa-Rupa)': r.cashRupa, 'TRANSFER (Rupa-Rupa)': r.transferRupa,
                'KET': r.ket, 'TOTAL': r.total
            }));
            const wsPiutang = XLSX.utils.json_to_sheet(kolom(piutangRows, 'SALES'));
            const wsCash = XLSX.utils.json_to_sheet(kolom(cashRows, 'DROPPING/SALES'));
            const colWidths = [{ wch: 14 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
                { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 16 }, { wch: 14 }];
            wsPiutang['!cols'] = colWidths;
            wsCash['!cols'] = colWidths;
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, wsPiutang, 'Piutang Tempo');
            XLSX.utils.book_append_sheet(wb, wsCash, 'Cash Dropping');
            const tglEl = document.getElementById('tanggalHarian');
            const tglVal = (tglEl && tglEl.value) ? tglEl.value : new Date().toISOString().slice(0, 10);
            const filename = 'Pembayaran_Harian_' + tglVal + '.xlsx';
            XLSX.writeFile(wb, filename);
            showToast('📥 ' + filename + ' berhasil di-download.', 'success');
        }

        function exportPengeluaranExcel() {
            if (!pengeluaranFiltered.length) {
                showToast('⚠️ Tidak ada data Pengeluaran untuk bulan ini.', 'warning');
                return;
            }
            const rows = [];
            let dayStartSaldo = 0;
            pengeluaranFiltered.forEach(day => {
                const list = (day.transaksi && day.transaksi.length) ? day.transaksi :
                    [{ ket: day.keterangan || '', jumlah: 0, tipe: 'pengeluaran', kategori: 'kantor' }];
                let cumMasuk = 0, sumKantor = 0, sumBurung = 0;
                list.forEach((t, i) => {
                    const isMasuk = t.tipe === 'masuk';
                    const kategori = t.kategori === 'burung' ? 'burung' : 'kantor';
                    if (isMasuk) cumMasuk += (t.jumlah || 0);
                    else if (kategori === 'burung') sumBurung += (t.jumlah || 0);
                    else sumKantor += (t.jumlah || 0);
                    rows.push({
                        'Tanggal': i === 0 ? fmtTanggal(day.tanggal) : '',
                        'Keterangan': t.ket || '',
                        'Masuk': isMasuk ? (t.jumlah || 0) : '',
                        'Kantor': (!isMasuk && kategori === 'kantor') ? (t.jumlah || 0) : '',
                        'Burung': (!isMasuk && kategori === 'burung') ? (t.jumlah || 0) : '',
                        'Total Harian': '', 'Saldo': ''
                    });
                });
                const dayTotal = sumKantor + sumBurung;
                const dayEndSaldo = (day.saldo !== undefined && day.saldo !== null) ? day.saldo :
                    (dayStartSaldo + cumMasuk - dayTotal);
                rows.push({ 'Tanggal': '', 'Keterangan': 'TOTAL HARI INI', 'Masuk': '', 'Kantor': '', 'Burung': '',
                    'Total Harian': dayTotal, 'Saldo': dayEndSaldo });
                dayStartSaldo = dayEndSaldo;
            });
            const ws = XLSX.utils.json_to_sheet(rows);
            ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Pengeluaran');
            const filename = 'Pengeluaran_' + (pengeluaranBulan || new Date().toISOString().slice(0, 7)) + '.xlsx';
            XLSX.writeFile(wb, filename);
            showToast('📥 ' + filename + ' berhasil di-download.', 'success');
        }

        document.getElementById('btnExportCekCash').addEventListener('click', exportCekCashExcel);
        document.getElementById('ptBtnExportExcel').addEventListener('click', function() {
            document.getElementById('ptMenuDropdown').classList.remove('active');
            exportCekPiutangExcel();
        });
        document.getElementById('tagihanBtnExportExcel').addEventListener('click', exportCetakTagihanExcel);
        document.getElementById('btnExportHarianExcel').addEventListener('click', function() {
            document.getElementById('harianMenuDropdown').classList.remove('active');
            exportPembayaranHarianExcel();
        });
        document.getElementById('pengeluaranExportExcelBtn').addEventListener('click', function() {
            document.getElementById('pgMenuDropdown').classList.remove('active');
            exportPengeluaranExcel();
        });

        function bukaModalProdukHarga() {
            _produkHargaWorking = loadProdukHargaMaster().slice().sort((a, b) =>
                (a.produk || '').localeCompare(b.produk || '', 'id'));
            _produkHargaSearchTerm = '';
            document.getElementById('detailModalTitleGlobal').textContent = '📦 Master Produk & Harga';
            renderModalProdukHarga();
            document.getElementById('detailModalGlobal').classList.add('show');
            setDetailModalStempelLunas(false);
            // 🔗 Kalau master masih kosong sama sekali, otomatis coba isi dari
            // Bank Data Penjualan supaya user tidak mulai dari nol.
            if (_produkHargaWorking.length === 0 && salesData && salesData.length) {
                ambilProdukDariBankDataKeMaster();
            }
        }

        document.getElementById('btnBukaProdukHarga').addEventListener('click', bukaModalProdukHarga);
        updateProdukHargaCountLabel();
        refreshProdukMasterDatalist();

        // ================================================================
