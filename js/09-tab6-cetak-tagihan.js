        // TAB 6 – CETAK TAGIHAN (PER SALES, TANPA TOTAL KESELURUHAN)
        // ================================================================
        function buildCashTagihanRows() {
            return salesData.filter(r => (r.Pembayaran || '').toLowerCase() === 'cash' && cashChecked[r['No.Faktur']] ===
                true).map(r => ({
                tipe: 'cash',
                tanggal: r.Tanggal,
                noFaktur: r['No.Faktur'],
                customer: r.Customer,
                alamat: r.Alamat,
                sales: r.Sales,
                produk: r.Produk,
                produkNama: r.Produk,
                jt: '',
                total: parseNumber(r.Total)
            }));
        }

        // Nominal yang seharusnya DICETAK/DITAGIH ke customer: untuk faktur piutang,
        // pakai Sisa Tagihan (proporsional per baris produk), BUKAN Total Tagihan awal
        // — supaya faktur yang sudah lunas tidak ikut tercetak seolah belum dibayar.
        // Untuk faktur cash (Cek Cash), tetap pakai total apa adanya karena cash tidak
        // punya mekanisme cicilan/titip seperti piutang.
        function ptNominalTagih(r) {
            if (r.tipe === 'piutang') return ptSisaTagihanBaris(r);
            return parseNumber(r.total);
        }

        function renderTagihanDariPiutang() {
            const rows = ptBuildTempoRows();
            const piutangRowsAll = rows.filter(r => ptChecked[r.noFaktur] === true).map(r => ({ ...r, tipe: 'piutang' }));
            // Faktur piutang yang Sisa Tagihannya sudah Rp0 (lunas) TIDAK ikut dicetak —
            // tidak masuk akal menagih ulang customer yang sudah lunas.
            const piutangLunasSkip = piutangRowsAll.filter(r => ptNominalTagih(r) <= 0.5);
            const piutangRows = piutangRowsAll.filter(r => ptNominalTagih(r) > 0.5);
            const cashRows = buildCashTagihanRows();
            const selectedRows = [...piutangRows, ...cashRows];

            const tbody = document.getElementById('tagihanTableBody');
            const tfoot = document.getElementById('tagihanTableFoot');

            const now = new Date();
            const tglCetak = String(now.getDate()).padStart(2, '0') + '/' + String(now.getMonth() + 1).padStart(2,
                '0') + '/' + now.getFullYear();
            document.getElementById('tagihanTanggalCetak').textContent = tglCetak;
            document.getElementById('tagihanJumlahTerpilih2').textContent = selectedRows.length + ' faktur';

            const skipNotice = document.getElementById('tagihanLunasSkipNotice');
            if (skipNotice) {
                const skipFakturUnik = new Set(piutangLunasSkip.map(r => r.noFaktur)).size;
                if (skipFakturUnik > 0) {
                    skipNotice.textContent = `✅ ${skipFakturUnik} faktur sudah lunas — tidak ikut dicetak`;
                    skipNotice.style.display = 'inline';
                } else {
                    skipNotice.style.display = 'none';
                }
            }

            if (selectedRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="empty-msg">Belum ada faktur dipilih dari Cek Piutang / Cek Cash.</td></tr>';
                tfoot.style.display = 'none';
                document.getElementById('tagihanTotalTagihan').textContent = 'Rp 0';
                document.getElementById('tagihanTotalSetoran').textContent = 'Rp 0';
                document.getElementById('tagihanDisetorkan').textContent = 'Rp 0';
                document.getElementById('tagihanTotalTagihan2').textContent = 'Rp 0';
                document.getElementById('badgeTagihan').textContent = '0';
                window._tagihanSelectedRows = [];
                window._tagihanTotal = 0;
                return;
            }

            let total = 0;
            let html = '';
            selectedRows.forEach((r, i) => {
                const nominal = ptNominalTagih(r);
                total += nominal;
                const produkNama = r.produk || r.produkNama || '';
                const isFitri = produkNama.toLowerCase().includes('fitri');
                const sumberLabel = r.tipe === 'cash' ? 'CASH' : 'PIUTANG';
                const ket = (isFitri ? 'MINYAK' : 'RUPA2') + ' (' + sumberLabel + ')';
                const produkDisplay = produkNama || (isFitri ? 'Minyak Fitri' : 'Rupa Rupa');
                html += `<tr>
                            <td>${i+1}</td>
                            <td style="max-width:100px; min-width:70px; width:100px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${r.noFaktur || ''}">${r.noFaktur || ''}</td>
                            <td>${r.customer || ''}</td>
                            <td>${r.alamat || ''}</td>
                            <td>${r.sales || ''}</td>
                            <td style="min-width:150px; max-width:200px; white-space:normal; word-break:break-word;">${produkDisplay}</td>
                            <td>${fmtTanggal(r.tanggal)}</td>
                            <td>${r.jt || '-'}</td>
                            <td class="num">${fmtRp(nominal)}</td>
                            <td>${ket}</td>
                            <td class="text-center no-print"><button type="button" class="btn-gagal-cetak" title="Gagal cetak / tidak jadi ditagih" data-nofaktur="${r.noFaktur || ''}" data-tipe="${r.tipe}">×</button></td>
                        </tr>`;
            });

            tbody.innerHTML = html;
            tfoot.style.display = 'table-footer-group';
            document.getElementById('tagihanTotalTagihan').textContent = fmtRp(total);
            document.getElementById('tagihanTotalSetoran').textContent = fmtRp(total);
            document.getElementById('tagihanTotalTagihan2').textContent = fmtRp(total);

            window._tagihanSelectedRows = selectedRows;
            window._tagihanTotal = total;

            hitungDisetorkan();
            document.getElementById('badgeTagihan').textContent = selectedRows.length;
        }

        function hitungDisetorkan() {
            const total = window._tagihanTotal || 0;
            const operasional = parseNumber(document.getElementById('tagihanOperasional').value);
            const lain = parseNumber(document.getElementById('tagihanLain').value);
            const disetorkan = total - operasional - lain;
            document.getElementById('tagihanDisetorkan').textContent = fmtRp(disetorkan);
        }

        document.getElementById('tagihanOperasional').addEventListener('input', hitungDisetorkan);
        document.getElementById('tagihanLain').addEventListener('input', hitungDisetorkan);

        // ================================================================
        // TOMBOL KIRIM KE CETAK (Tab 4 -> Tab 6)
        // ================================================================
        function sendSelectedToTab6() {
            const piutangRowsAll = ptBuildTempoRows().filter(r => ptChecked[r.noFaktur] === true).map(r => ({ ...r, tipe: 'piutang' }));
            const piutangLunasSkip = piutangRowsAll.filter(r => ptNominalTagih(r) <= 0.5);
            const piutangRows = piutangRowsAll.filter(r => ptNominalTagih(r) > 0.5);
            const cashRows = buildCashTagihanRows();
            const selectedRows = [...piutangRows, ...cashRows];

            if (selectedRows.length === 0) {
                if (piutangLunasSkip.length > 0) {
                    showToast('✅ Faktur yang dipilih sudah lunas semua — tidak ada yang perlu dicetak.', 'success');
                } else {
                    showToast('⚠️ Pilih minimal 1 faktur di Tab 4 (Cek Piutang) atau Tab 3 (Cek Cash) terlebih dahulu!',
                        'warning');
                }
                return;
            }

            let total = 0;
            let html = '';
            selectedRows.forEach((r, i) => {
                const nominal = ptNominalTagih(r);
                total += nominal;
                html += `<tr>
                            <td class="center">${i+1}</td>
                            <td>${r.noFaktur || ''}</td>
                            <td>${r.customer || ''}</td>
                            <td>${r.alamat || ''}</td>
                            <td>${r.sales || ''}</td>
                            <td>${r.jt || '-'}</td>
                            <td class="num">${fmtRp(nominal)}</td>
                        </tr>`;
            });

            document.getElementById('ptSendConfirmBody').innerHTML = html;
            document.getElementById('ptSendConfirmTotal').textContent = fmtRp(total);
            document.getElementById('ptSendConfirmCount').textContent = selectedRows.length + ' faktur' +
                (piutangLunasSkip.length > 0 ? ` (${new Set(piutangLunasSkip.map(r=>r.noFaktur)).size} faktur lunas dilewati)` : '');
            document.getElementById('ptSendConfirmModal').classList.add('show');
        }

        function ptSendConfirmBatalkan() {
            document.getElementById('ptSendConfirmModal').classList.remove('show');
            // Catatan: status centang SENGAJA tidak dikosongkan di sini, supaya faktur yang
            // sudah pernah dikirim ke Cetak Tagihan tidak hilang saat user membatalkan/menutup
            // modal ini untuk faktur lain yang baru dicentang.
        }
        document.getElementById('ptSendConfirmClose').addEventListener('click', ptSendConfirmBatalkan);
        document.getElementById('ptSendConfirmBatal').addEventListener('click', ptSendConfirmBatalkan);
        document.getElementById('ptSendConfirmKirim').addEventListener('click', function() {
            document.getElementById('ptSendConfirmModal').classList.remove('show');
            const selectedCount = Object.values(ptChecked).filter(v => v).length + Object.values(cashChecked)
                .filter(v => v).length;

            switchTab('tab6'); // switchTab sudah otomatis memanggil renderTagihanDariPiutang() dengan data centang saat ini
            showToast(`✅ ${selectedCount} faktur berhasil dikirim ke Cetak Tagihan!`, 'success');

            // Status centang SENGAJA dibiarkan tetap (tidak direset) supaya kalau nanti
            // kembali ke Cek Piutang/Cek Cash untuk menambah faktur lain, faktur yang sudah
            // terkirim sebelumnya tetap ada di Cetak Tagihan (tidak hilang).
        });


        document.getElementById('tagihanBtnRefresh').addEventListener('click', function() {
            renderTagihanDariPiutang();
            showToast('🔄 Daftar tagihan diperbarui dari Cek Piutang.', 'success');
        });

        // ================================================================
        // GAGAL CETAK (BATALKAN 1 FAKTUR SAJA DARI CETAK TAGIHAN)
        // ================================================================
        document.getElementById('tagihanTableBody').addEventListener('click', function(e) {
            const btn = e.target.closest('.btn-gagal-cetak');
            if (!btn) return;

            const noFaktur = btn.getAttribute('data-nofaktur');
            const tipe = btn.getAttribute('data-tipe');
            if (!noFaktur) return;

            if (!confirm('Faktur ' + noFaktur + ' gagal dicetak / tidak jadi ditagih?\nBaris ini akan dihapus dari Cetak Tagihan.')) return;

            if (tipe === 'cash') {
                cashChecked[noFaktur] = false;
                document.querySelectorAll('.cash-row-checkbox[data-faktur="' + CSS.escape(noFaktur) + '"]').forEach(cb => {
                    cb.checked = false;
                });
                updateCashSelectedInfo();
            } else {
                ptChecked[noFaktur] = false;
                document.querySelectorAll('.pt-row-checkbox[data-faktur="' + CSS.escape(noFaktur) + '"]').forEach(cb => {
                    cb.checked = false;
                });
                updatePiutangSelectedInfo();
            }

            renderTagihanDariPiutang();
            showToast('✖ Faktur ' + noFaktur + ' dibatalkan dari Cetak Tagihan.', 'success');
        });

        // ================================================================
        // HAPUS SEMUA PILIHAN
        // ================================================================
        document.getElementById('tagihanBtnClearSelection').addEventListener('click', function() {
            if (!confirm('Hapus semua pilihan faktur di Cek Piutang & Cek Cash?')) return;

            ptChecked = {};
            cashChecked = {};

            if (document.getElementById('tab4').classList.contains('active')) {
                document.querySelectorAll('.pt-row-checkbox').forEach(cb => {
                    cb.checked = false;
                });
                document.getElementById('ptSelectAll').checked = false;
                ptRenderTempoTable();
            }
            if (document.getElementById('tab3').classList.contains('active')) {
                document.querySelectorAll('.cash-row-checkbox').forEach(cb => {
                    cb.checked = false;
                });
                document.getElementById('cashSelectAll').checked = false;
                renderCashTable();
            }

            updatePiutangSelectedInfo();
            updateCashSelectedInfo();
            renderTagihanDariPiutang();

            window._tagihanSelectedRows = [];
            window._tagihanTotal = 0;

            showToast('✅ Semua pilihan telah dihapus.', 'success');
        });

        // ================================================================
        // CETAK SEMUA — PER SALES (TANPA TOTAL KESELURUHAN)
        // ================================================================
        document.getElementById('tagihanBtnPrint').addEventListener('click', function() {
            const selectedRows = window._tagihanSelectedRows || [];
            if (selectedRows.length === 0) {
                showToast('Tidak ada faktur dipilih untuk dicetak.', 'warning');
                return;
            }

            // Kelompokkan berdasarkan salesman
            const groups = {};
            selectedRows.forEach(r => {
                const sales = r.sales || 'Tanpa Sales';
                if (!groups[sales]) groups[sales] = [];
                groups[sales].push(r);
            });

            const tanggalCetak = document.getElementById('tagihanTanggalCetak').textContent;
            const catatan = document.getElementById('tagihanCatatan').value.trim();

            // Simpan otomatis tanggal cetak tagihan per faktur (khusus piutang) supaya
            // muncul di kolom "Tgl Cetak Tagihan" pada Tab 4 - Cek Piutang, untuk
            // memantau kapan terakhir kali faktur tersebut ditagih.
            selectedRows.forEach(r => {
                if (r.tipe === 'piutang' && r.noFaktur) simpanTglCetakTagihan(r.noFaktur, tanggalCetak);
            });
            if (typeof ptRenderTempoTable === 'function') ptRenderTempoTable();

            let html = '';

            // Loop per group
            Object.keys(groups).forEach((salesman, idx) => {
                const items = groups[salesman];
                let subtotal = 0;
                items.forEach(r => subtotal += parseNumber(r.total));

                html += `<div class="tg-block">
                            <div class="tg-block-head">
                                <div>TAGIHAN SALESMAN: ${salesman}</div>
                                <div>Tanggal Cetak: ${tanggalCetak}</div>
                            </div>
                            <table class="tg-table">
                                <colgroup>
                                    <col style="width:3%"><col style="width:8%"><col style="width:9%">
                                    <col style="width:6%"><col style="width:5%"><col style="width:10%">
                                    <col style="width:6%"><col style="width:6%"><col style="width:10%">
                                    <col style="width:5%"><col style="width:32%">
                                </colgroup>
                                <thead><tr>
                                    <th>NO</th><th>NO FAKTUR</th><th>NAMA OUTLET</th><th>ALAMAT</th><th>SALES</th>
                                    <th>PRODUK</th>
                                    <th>TGL NOTA</th><th>TGL TEMPO</th><th class="num">TAGIHAN</th><th>KET</th>
                                    <th>HASIL TAGIHAN</th>
                                </tr></thead>
                                <tbody>
                                    ${items.map((r,i) => {
                                        const produkNama = r.produk || r.produkNama || '';
                                        const isFitri = produkNama.toLowerCase().includes('fitri');
                                        const ket = isFitri ? 'MINYAK' : 'RUPA2';
                                        const produkDisplay = produkNama || (isFitri ? 'Minyak Fitri' : 'Rupa Rupa');
                                        return `<tr>
                                            <td>${i+1}</td><td>${r.noFaktur}</td><td>${r.customer}</td><td>${r.alamat}</td><td>${r.sales}</td>
                                            <td>${produkDisplay}</td>
                                            <td>${fmtTanggal(r.tanggal)}</td><td>${r.jt || '-'}</td>
                                            <td class="num">${fmtRp(r.total)}</td><td>${ket}</td>
                                            <td>&nbsp;</td>
                                        </tr>`;
                                    }).join('')}
                                </tbody>
                                <tfoot><tr>
                                    <td colspan="8" style="text-align:right;font-weight:700;">SUBTOTAL</td>
                                    <td class="num" style="font-weight:700;">${fmtRp(subtotal)}</td>
                                    <td></td>
                                    <td></td>
                                </tr></tfoot>
                            </table>

                            <!-- AREA SETORAN & TANDA TANGAN -->
                            <div class="tg-summary">
                                <div>Total Tagihan : ${fmtRp(subtotal)}</div>
                                <div>Jumlah yang disetor : Rp _________________</div>
                            </div>
                            <div class="tg-signature">
                                <div>Penyetor : _________________</div>
                                <div>Penerima : _________________</div>
                            </div>
                        </div>`;
            });

            // Catatan (jika ada)
            if (catatan) {
                html += `<div style="text-align:center; font-style:italic; margin-top:10px; border-top:1px dashed #ccc; padding-top:8px;">📝 ${catatan}</div>`;
            }

            const container = document.getElementById('tagihanPrintGabungan');
            container.innerHTML =
                '<button type="button" class="btn tg-btn-tutup" id="tgBtnTutupCetakSingle">✕ Tutup / Kembali ke Tampilan Normal</button>' +
                html;
            document.body.classList.add('printing-gabungan');

            let sudahDibersihkan = false;

            function bersihkanTampilanCetak() {
                if (sudahDibersihkan) return;
                sudahDibersihkan = true;
                document.body.classList.remove('printing-gabungan');
                container.innerHTML = '';
                window.onafterprint = null;
                if (printMql) {
                    if (printMql.removeEventListener) printMql.removeEventListener('change', printMqlHandler);
                    else printMql.removeListener(printMqlHandler);
                }
            }

            window.onafterprint = bersihkanTampilanCetak;
            let printMql = window.matchMedia ? window.matchMedia('print') : null;

            function printMqlHandler(mql) {
                if (!mql.matches) bersihkanTampilanCetak();
            }
            if (printMql) {
                if (printMql.addEventListener) printMql.addEventListener('change', printMqlHandler);
                else printMql.addListener(printMqlHandler);
            }
            document.getElementById('tgBtnTutupCetakSingle').addEventListener('click', bersihkanTampilanCetak);

            // Catat ke Riwayat Cetak: setiap klik dicatat sebagai baris baru
            // (tidak menimpa/menggantikan catatan sebelumnya), LENGKAP dengan
            // detail semua faktur yang dicetak supaya bisa dibuka utuh lagi
            // kapan saja (penting karena menyangkut uang).
            const jumlahFaktur = selectedRows.length;
            const namaSales = Object.keys(groups).join(', ');
            const totalSemua = selectedRows.reduce((sum, r) => sum + parseNumber(r.total), 0);
            const itemsDetailTagihan = {
                tanggalCetak: tanggalCetak,
                catatan: catatan,
                items: selectedRows.map(r => ({
                    noFaktur: r.noFaktur || '',
                    customer: r.customer || '',
                    alamat: r.alamat || '',
                    sales: r.sales || '',
                    produk: r.produk || r.produkNama || '',
                    tanggal: fmtTanggal(r.tanggal),
                    jt: r.jt || '-',
                    total: parseNumber(r.total),
                    tipe: r.tipe || ''
                }))
            };
            catatRiwayatCetak(
                'Cetak Tagihan',
                `${jumlahFaktur} faktur — Sales: ${namaSales} — Tgl Cetak: ${tanggalCetak} — Total: ${fmtRp(totalSemua)}`,
                itemsDetailTagihan
            );

            window.print();
        });

        // ================================================================
        // DITAGIHKAN → KIRIM HASIL TAGIHAN KE TAB PEMBAYARAN (INPUT HARIAN)
        // ================================================================
        function tglInputISO(str) {
            if (!str) return '';
            str = String(str).trim();
            if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
            const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
            if (m) return `${m[3]}-${m[2]}-${m[1]}`;
            return '';
        }

        function isiBarisDariTagihan(tr, r, nominal, isFitri) {
            const inputs = tr.querySelectorAll('input');
            if (inputs.length < 12) return;
            inputs[0].value = r.sales || '';
            inputs[1].value = r.noFaktur || '';
            inputs[2].value = r.customer || '';
            inputs[3].value = r.alamat || '';
            inputs[4].value = tglInputISO(r.tanggal);
            inputs[5].value = tglInputISO(r.jt);
            inputs[6].value = formatAngka(nominal);
            inputs[7].value = isFitri ? formatAngka(nominal) : '';
            inputs[8].value = '';
            inputs[9].value = isFitri ? '' : formatAngka(nominal);
            inputs[10].value = '';
            inputs[11].value = (r.tipe === 'cash' ? 'Penjualan Cash' : 'Tagihan Piutang') + ' – dari Cetak Tagihan';
        }

        function isRowKosong(tr) {
            const inputs = Array.from(tr.querySelectorAll('input')).slice(0, 12);
            return inputs.every(inp => !inp.value.trim());
        }

        document.getElementById('tagihanBtnKirimPembayaran').addEventListener('click', async function() {
            const selectedRows = window._tagihanSelectedRows || [];
            if (selectedRows.length === 0) {
                showToast('Tidak ada faktur dipilih untuk ditagihkan.', 'warning');
                return;
            }
            if (!confirm(
                    `Tandai ${selectedRows.length} faktur sebagai sudah ditagihkan dan kirim hasilnya ke tab Pembayaran? Pilihan di Cek Piutang / Cek Cash akan dikosongkan setelah ini.`
                )) return;

            let tgl = document.getElementById('tanggalHarian').value;
            if (!tgl) {
                const t = new Date();
                tgl = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
                document.getElementById('tanggalHarian').value = tgl;
            }

            const piutangBody = document.getElementById('piutangInputBody');
            const cashBody = document.getElementById('cashInputBody');

            // Buang 1 baris kosong bawaan supaya tidak tercampur baris hasil tagihan
            [piutangBody, cashBody].forEach(body => {
                const rows = body.querySelectorAll('tr:not(.group-subtotal):not(.row-spacer)');
                if (rows.length === 1 && isRowKosong(rows[0])) rows[0].remove();
            });

            let noP = piutangBody.querySelectorAll('tr:not(.group-subtotal):not(.row-spacer)').length;
            let noC = cashBody.querySelectorAll('tr:not(.group-subtotal):not(.row-spacer)').length;

            selectedRows.forEach(r => {
                const nominal = parseNumber(r.total);
                const produkNama = r.produk || r.produkNama || '';
                const isFitri = produkNama.toLowerCase().includes('fitri');
                const isPiutang = r.tipe === 'piutang';
                const tr = isPiutang ? buatBarisPiutang(++noP) : buatBarisCash(++noC);
                isiBarisDariTagihan(tr, r, nominal, isFitri);
                (isPiutang ? piutangBody : cashBody).appendChild(tr);
                hitungTotalBaris(tr);
            });

            if (piutangBody.querySelectorAll('tr:not(.group-subtotal):not(.row-spacer)').length === 0) piutangBody
                .appendChild(buatBarisPiutang(1));
            if (cashBody.querySelectorAll('tr:not(.group-subtotal):not(.row-spacer)').length === 0) cashBody
                .appendChild(buatBarisCash(1));

            hitungTotalKolom('piutangInputBody', 'piutangTotalMinyakCash', 'piutangTotalMinyakTransfer',
                'piutangTotalRupaCash', 'piutangTotalRupaTransfer', 'piutangTotalGrand');
            hitungTotalKolom('cashInputBody', 'cashTotalMinyakCash', 'cashTotalMinyakTransfer',
                'cashTotalRupaCash', 'cashTotalRupaTransfer', 'cashTotalGrand');
            rebuildGroupTotals('piutangInputBody');
            rebuildGroupTotals('cashInputBody');
            hitungRingkasan();

            await simpanDataHarian(true);

            // Kosongkan pilihan — faktur sudah ditagihkan
            selectedRows.forEach(r => {
                if (r.tipe === 'piutang') delete ptChecked[r.noFaktur];
                else delete cashChecked[r.noFaktur];
            });
            renderTagihanDariPiutang();
            if (document.getElementById('tab4').classList.contains('active')) ptRenderTempoTable();
            updatePiutangSelectedInfo();
            updateCashSelectedInfo();

            showToast(`✅ ${selectedRows.length} faktur ditagihkan & masuk ke Pembayaran (${tgl}).`, 'success');
            switchTab('tab7');
        });

        // ================================================================
