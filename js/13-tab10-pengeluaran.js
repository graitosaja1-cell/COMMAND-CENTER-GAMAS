        // TAB 10 – PENGELUARAN (input manual + import Excel "LAPORAN KAS KECIL")
        // ================================================================
        let pengeluaranDataMap = {};
        let pengeluaranBulan = '';
        let pengeluaranFiltered = [];
        let pengeluaranPage = 1;
        const pengeluaranRowsPerPage = 31;

        function pgUid() {
            return 'tx_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        }

        function pgBulanDariTanggalISO(iso) {
            return iso ? iso.slice(0, 7) : '';
        }

        function pgHitungUlangHari(day) {
            const masukList = (day.transaksi || []).filter(t => t.tipe === 'masuk');
            const keluarList = (day.transaksi || []).filter(t => t.tipe !== 'masuk');
            day.masuk = masukList.reduce((s, t) => s + (t.jumlah || 0), 0);
            day.totalPengeluaran = keluarList.reduce((s, t) => s + (t.jumlah || 0), 0);
            day.keterangan = (day.transaksi || []).map(t => t.ket + ' (' + fmtRp(t.jumlah) + ')').join('; ');
        }

        // Hitung ulang saldo berjalan untuk seluruh data 1 bulan (urut tanggal).
        function pgHitungUlangSaldoBulan(bulan) {
            const list = pengeluaranDataMap[bulan] || [];
            list.sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));
            let saldo = 0;
            list.forEach(day => {
                pgHitungUlangHari(day);
                saldo += (day.masuk || 0) - (day.totalPengeluaran || 0);
                day.saldo = saldo;
            });
        }

        // Parse baris-baris sheet "LAPORAN KAS KECIL" (format kas kecil harian:
        // Tanggal | Keterangan | Masuk | Pengeluaran Kantor | Burung | Total | Saldo)
        // menjadi rekap per-hari, dengan rincian transaksi.
        // Konversi serial tanggal Excel (mis. 46204) ke "YYYY-MM-DD" TANPA lewat objek Date lokal,
        // supaya tidak kena bug pergeseran 1 hari akibat timezone browser (lihat catatan di pgProcessExcelFile).
        // Rumus ini murni aritmatika hari (epoch Excel = 30 Des 1899), aman di timezone manapun.
        function excelSerialToYMD(serial) {
            const utcDays = Math.round(serial) - 25569; // 25569 = jumlah hari dari 30 Des 1899 ke 1 Jan 1970
            const ms = utcDays * 86400 * 1000;
            const d = new Date(ms);
            const y = d.getUTCFullYear();
            const m = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            return `${y}-${m}-${dd}`;
        }

        // Konversi sel tanggal dari baris Excel Pengeluaran menjadi serial Excel (angka).
        // MENERIMA lebih dari sekadar serial number mentah, supaya file yang tanggalnya
        // ter-export/ter-format sebagai TEKS (mis. "01/08/2026", "2026-08-01", "1 Agustus 2026")
        // tidak lagi diam-diam gagal terbaca (sebelumnya hanya angka serial yang dikenali).
        function pgSelToExcelSerial(tglCell) {
            if (typeof tglCell === 'number' && tglCell > 25569 && tglCell < 60000) return tglCell;
            if (tglCell instanceof Date && !isNaN(tglCell.getTime())) {
                return (tglCell.getTime() / 86400000) + 25569;
            }
            if (typeof tglCell === 'string') {
                const s = tglCell.trim();
                if (!s) return null;
                // Format "YYYY-MM-DD" atau "YYYY/MM/DD"
                let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
                if (m) {
                    const y = +m[1], mo = +m[2], da = +m[3];
                    const serial = Math.round((Date.UTC(y, mo - 1, da) / 86400000) + 25569);
                    if (serial > 25569 && serial < 60000) return serial;
                }
                // Format "DD-MM-YYYY", "DD/MM/YYYY", atau "DD.MM.YYYY"
                m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2,4})/);
                if (m) {
                    let da = +m[1], mo = +m[2], y = +m[3];
                    if (y < 100) y += 2000;
                    const serial = Math.round((Date.UTC(y, mo - 1, da) / 86400000) + 25569);
                    if (serial > 25569 && serial < 60000) return serial;
                }
                // Format "1 Agustus 2026" / "1 Januari 2026" (nama bulan Indonesia)
                const bulanIndo = {
                    'januari': 0, 'februari': 1, 'maret': 2, 'april': 3, 'mei': 4, 'juni': 5,
                    'juli': 6, 'agustus': 7, 'september': 8, 'oktober': 9, 'november': 10, 'desember': 11
                };
                m = s.toLowerCase().match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
                if (m && bulanIndo.hasOwnProperty(m[2])) {
                    const da = +m[1], mo = bulanIndo[m[2]], y = +m[3];
                    const serial = Math.round((Date.UTC(y, mo, da) / 86400000) + 25569);
                    if (serial > 25569 && serial < 60000) return serial;
                }
            }
            return null;
        }

        function parsePengeluaranDariRows(rows) {
            const hasil = [];
            let current = null;
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i] || [];
                const tglCell = row[0];
                const ket = (row[1] === null || row[1] === undefined) ? '' : String(row[1]).trim();
                const masuk = parseNumber(row[2]);
                const kantor = parseNumber(row[3]);
                const burung = parseNumber(row[4]);
                const totalHarian = parseNumber(row[5]);
                const saldo = parseNumber(row[6]);

                if (ket && ket.toUpperCase() === 'TOTAL') break; // baris ringkasan akhir laporan
                // FIX: label "TOTAL" di file ini biasanya ada di kolom A (kolom tanggal), bukan kolom B.
                // Tanpa cek ini, baris ringkasan total bulan bisa "bocor" menimpa totalPengeluaran hari terakhir.
                if (typeof tglCell === 'string' && tglCell.trim().toUpperCase() === 'TOTAL') break;

                // tglCell bisa berupa serial Excel mentah (number), Date object, ATAU teks
                // (mis. hasil paste manual/export beda format) — semua dicoba lewat pgSelToExcelSerial.
                const tgl = pgSelToExcelSerial(tglCell);

                if (tgl) {
                    if (current) hasil.push(current);
                    current = { tanggal: excelSerialToYMD(tgl), transaksi: [], masuk: 0, totalPengeluaran: 0, saldo: 0 };
                    if (ket) {
                        if (masuk) current.transaksi.push({ id: pgUid(), ket, jumlah: masuk, tipe: 'masuk' });
                        else if (kantor || burung) current.transaksi.push({ id: pgUid(), ket, jumlah: kantor || burung,
                            tipe: 'pengeluaran', kategori: burung ? 'burung' : 'kantor' });
                    }
                    if (saldo) current.saldo = saldo;
                } else if (current) {
                    if (ket && (kantor || burung)) {
                        current.transaksi.push({ id: pgUid(), ket, jumlah: kantor || burung, tipe: 'pengeluaran',
                            kategori: burung ? 'burung' : 'kantor' });
                    } else if (ket && masuk) {
                        current.transaksi.push({ id: pgUid(), ket, jumlah: masuk, tipe: 'masuk' });
                    }
                    if (totalHarian) current.totalPengeluaran = totalHarian;
                    if (saldo) current.saldo = saldo;
                }
            }
            if (current) hasil.push(current);
            hasil.forEach(h => {
                const masukSum = h.transaksi.filter(t => t.tipe === 'masuk').reduce((s, t) => s + (t.jumlah || 0), 0);
                if (masukSum) h.masuk = masukSum;
                if (!h.totalPengeluaran) {
                    h.totalPengeluaran = h.transaksi.filter(t => t.tipe !== 'masuk').reduce((s, t) => s + (t.jumlah ||
                        0), 0);
                }
                h.keterangan = h.transaksi.map(t => t.ket + ' (' + fmtRp(t.jumlah) + ')').join('; ');
            });
            return hasil;
        }

        async function loadPengeluaranData() {
            try {
                const allRecords = await db.pengeluaran.toArray();
                allRecords.forEach(record => {
                    if (record.bulan && Array.isArray(record.data)) pengeluaranDataMap[record.bulan] = record.data;
                });
                if (!pengeluaranBulan) {
                    if (APP_DEFAULT_BULAN) {
                        pengeluaranBulan = APP_DEFAULT_BULAN;
                    } else {
                        const nowPg = new Date();
                        pengeluaranBulan = nowPg.getFullYear() + '-' + String(nowPg.getMonth() + 1).padStart(2, '0');
                    }
                }
                if (!pengeluaranDataMap[pengeluaranBulan]) pengeluaranDataMap[pengeluaranBulan] = [];
            } catch (e) {
                console.warn('Error loading pengeluaran data:', e);
                if (!pengeluaranDataMap[pengeluaranBulan]) pengeluaranDataMap[pengeluaranBulan] = [];
            }
            return pengeluaranDataMap[pengeluaranBulan];
        }

        async function savePengeluaranData(bulan) {
            try {
                const data = pengeluaranDataMap[bulan] || [];
                const existing = await db.pengeluaran.where('bulan').equals(bulan).first();
                if (existing) { await db.pengeluaran.update(existing.id, { data, tanggal: new Date().toISOString() }); }
                else { await db.pengeluaran.add({ bulan, data, tanggal: new Date().toISOString() }); }
            } catch (e) { showToast('❌ Gagal simpan pengeluaran: ' + e.message, 'warning'); }
        }

        function getPengeluaranData() {
            if (!pengeluaranDataMap[pengeluaranBulan]) pengeluaranDataMap[pengeluaranBulan] = [];
            return pengeluaranDataMap[pengeluaranBulan];
        }

        function pgRebuildBulanOptions() {
            const select = document.getElementById('bulanPengeluaran');
            if (!select) return;
            const bulanSet = new Set(Object.keys(pengeluaranDataMap));
            bulanSet.add(pengeluaranBulan);
            const bulanList = Array.from(bulanSet).filter(Boolean).sort();
            const current = select.value || pengeluaranBulan;
            select.innerHTML = bulanList.map(b => `<option value="${b}">${fmtBulanTahun(b)}</option>`).join('');
            if (bulanList.includes(current)) select.value = current;
            else if (bulanList.length) select.value = bulanList[bulanList.length - 1];
            pengeluaranBulan = select.value;
        }

        function renderPengeluaran() {
            const data = getPengeluaranData();
            pengeluaranFiltered = [...data].sort((a, b) => (a.tanggal || '').localeCompare(b.tanggal || ''));
            const totalPages = Math.ceil(pengeluaranFiltered.length / pengeluaranRowsPerPage) || 1;
            if (pengeluaranPage > totalPages) pengeluaranPage = 1;
            renderPengeluaranTable();
            updatePengeluaranPagination();
            renderPengeluaranCards();
            document.getElementById('badgePengeluaran').textContent = pengeluaranFiltered.length;
        }

        function renderPengeluaranTable() {
            const tbody = document.getElementById('pengeluaranTableBody');
            const start = (pengeluaranPage - 1) * pengeluaranRowsPerPage;
            const end = start + pengeluaranRowsPerPage;
            const pageData = pengeluaranFiltered.slice(start, end);
            const COLS = 8; // Tanggal, Keterangan, Masuk, Kantor, Burung, Total, Saldo, Aksi

            if (pageData.length === 0) {
                tbody.innerHTML =
                    `<tr><td colspan="${COLS}" class="empty-msg">📂 Belum ada data. Input manual di atas, atau import file Excel Pengeluaran (sheet "LAPORAN KAS KECIL").</td></tr>`;
                return;
            }

            // Saldo awal blok (halaman ini) = saldo hari sebelum hari pertama pada halaman ini
            const firstIdx = pengeluaranFiltered.indexOf(pageData[0]);
            let dayStartSaldo = firstIdx > 0 ? (pengeluaranFiltered[firstIdx - 1].saldo || 0) : 0;

            let html = '';
            let grandMasuk = 0, grandKantor = 0, grandBurung = 0, grandTotal = 0, grandSaldoAkhir = 0;

            pageData.forEach((day, dayIdx) => {
                const list = (day.transaksi && day.transaksi.length) ? day.transaksi :
                    [{ id: pgUid(), ket: day.keterangan || '', jumlah: 0, tipe: 'pengeluaran', kategori: 'kantor' }];
                let cumMasuk = 0;
                let sumKantor = 0, sumBurung = 0;

                list.forEach((t, i) => {
                    const isMasuk = t.tipe === 'masuk';
                    const kategori = t.kategori === 'burung' ? 'burung' : 'kantor';
                    if (isMasuk) cumMasuk += (t.jumlah || 0);
                    else if (kategori === 'burung') sumBurung += (t.jumlah || 0);
                    else sumKantor += (t.jumlah || 0);

                    const tanggalCell = (i === 0) ? `<td class="pg-col-tanggal">${fmtTanggal(day.tanggal)}</td>` :
                        `<td class="pg-col-tanggal"></td>`;
                    const masukCell = isMasuk ? `<strong>${fmtNumOnly(t.jumlah)}</strong>` : '';
                    const kantorCell = (!isMasuk && kategori === 'kantor') ? fmtNumOnly(t.jumlah) : '';
                    const burungCell = (!isMasuk && kategori === 'burung') ? fmtNumOnly(t.jumlah) : '';
                    const saldoCell = isMasuk ? `<strong>${fmtRp(dayStartSaldo + cumMasuk)}</strong>` : '';

                    html += `<tr>${tanggalCell}<td>${t.ket || ''}</td>` +
                        `<td class="num pg-col-masuk">${masukCell}</td>` +
                        `<td class="num pg-col-kantor">${kantorCell}</td>` +
                        `<td class="num pg-col-burung">${burungCell}</td>` +
                        `<td class="num pg-col-total"></td>` +
                        `<td class="num">${saldoCell}</td>` +
                        `<td class="pg-col-aksi"><button type="button" class="pg-del-btn" title="Hapus baris" onclick="pgHapusTransaksi('${day.tanggal}','${t.id}')">🗑</button></td></tr>`;
                });

                const dayTotal = sumKantor + sumBurung;
                const dayEndSaldo = (day.saldo !== undefined && day.saldo !== null) ? day.saldo :
                    (dayStartSaldo + cumMasuk - dayTotal);

                html += `<tr class="pg-row-subtotal">` +
                    `<td class="pg-col-tanggal"></td><td></td>` +
                    `<td class="num pg-col-masuk"></td>` +
                    `<td class="num pg-col-kantor"></td>` +
                    `<td class="num pg-col-burung"></td>` +
                    `<td class="num pg-col-total">${fmtNumOnly(dayTotal)}</td>` +
                    `<td class="num">${fmtRp(dayEndSaldo)}</td>` +
                    `<td class="pg-col-aksi"><button type="button" class="pg-del-btn" title="Hapus seluruh hari" onclick="pgHapusHari('${day.tanggal}')">🗑</button></td></tr>`;

                if (dayIdx < pageData.length - 1) {
                    html += `<tr class="pg-row-spacer"><td colspan="${COLS}">&nbsp;</td></tr>`;
                }

                dayStartSaldo = dayEndSaldo;
                grandMasuk += cumMasuk;
                grandKantor += sumKantor;
                grandBurung += sumBurung;
                grandTotal += dayTotal;
                grandSaldoAkhir = dayEndSaldo;
            });

            // Baris TOTAL (hanya bermakna penuh kalau tampil 1 halaman / bulan penuh)
            html += `<tr class="pg-row-spacer"><td colspan="${COLS}">&nbsp;</td></tr>`;
            html += `<tr class="pg-row-total">` +
                `<td class="pg-col-tanggal"></td><td class="center">TOTAL</td>` +
                `<td class="num pg-col-masuk">${fmtNumOnly(grandMasuk)}</td>` +
                `<td class="num pg-col-kantor">${fmtNumOnly(grandKantor)}</td>` +
                `<td class="num pg-col-burung">${grandBurung ? fmtNumOnly(grandBurung) : '-'}</td>` +
                `<td class="num pg-col-total">${fmtNumOnly(grandTotal)}</td>` +
                `<td class="num">${fmtRp(grandSaldoAkhir)}</td>` +
                `<td></td></tr>`;

            // Blok tanda tangan (mengikuti format lembar kas kecil)
            html += `<tr class="pg-row-spacer"><td colspan="${COLS}">&nbsp;</td></tr>`;
            html += `<tr class="pg-row-signature"><td colspan="${COLS}"><strong>MENGETAHUI</strong></td></tr>`;
            html += `<tr class="pg-row-signature">` +
                `<td class="pg-col-tanggal"></td>` +
                `<td><strong>ADMIN</strong></td>` +
                `<td colspan="2"><strong>HEAD OFFICE</strong></td>` +
                `<td colspan="2"></td>` +
                `<td colspan="2"><strong>OWNER</strong></td></tr>`;
            html += `<tr class="pg-row-signature-line">` +
                `<td class="pg-col-tanggal"></td>` +
                `<td><span>(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</span></td>` +
                `<td colspan="2"><span>(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</span></td>` +
                `<td colspan="2"></td>` +
                `<td colspan="2"><span>(&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)</span></td></tr>`;

            tbody.innerHTML = html;
        }

        function updatePengeluaranPagination() {
            const total = pengeluaranFiltered.length;
            const totalPages = Math.ceil(total / pengeluaranRowsPerPage) || 1;
            document.getElementById('pgPageInfo').textContent = 'Halaman ' + pengeluaranPage + ' dari ' + totalPages;
            document.getElementById('pgPrevPage').disabled = (pengeluaranPage <= 1);
            document.getElementById('pgNextPage').disabled = (pengeluaranPage >= totalPages);
            document.getElementById('pgTotalData').textContent = total + ' data';
        }

        function renderPengeluaranCards() {
            let masuk = 0, pengeluaran = 0, saldoAkhir = 0;
            pengeluaranFiltered.forEach(item => { masuk += item.masuk || 0; pengeluaran += item.totalPengeluaran || 0; });
            if (pengeluaranFiltered.length) saldoAkhir = pengeluaranFiltered[pengeluaranFiltered.length - 1].saldo || 0;
            document.getElementById('pgTotalMasuk').textContent = fmtRp(masuk);
            document.getElementById('pgTotalPengeluaran').textContent = fmtRp(pengeluaran);
            document.getElementById('pgSaldoAkhir').textContent = fmtRp(saldoAkhir);
        }

        // ---------- Detail per-hari (lihat & hapus transaksi) ----------
        function pgBukaDetailHari(tanggal) {
            const data = getPengeluaranData();
            const day = data.find(d => d.tanggal === tanggal);
            if (!day) return;
            document.getElementById('pgDetailModalTitle').textContent = '🧾 Detail Transaksi - ' + fmtTanggal(tanggal);
            const list = day.transaksi || [];
            let html = '';
            if (list.length === 0) {
                html = '<div class="empty-msg">Tidak ada rincian transaksi tersimpan untuk hari ini.</div>';
            } else {
                html += '<table style="width:100%;"><thead><tr><th style="text-align:left;">Keterangan</th><th style="text-align:left;">Jenis</th><th class="num">Jumlah</th><th></th></tr></thead><tbody>';
                list.forEach(t => {
                    html += `<tr><td>${t.ket}</td><td>${t.tipe === 'masuk' ? 'Masuk' : 'Pengeluaran'}</td>` +
                        `<td class="num">${fmtRp(t.jumlah)}</td>` +
                        `<td><button type="button" class="btn btn-reset" style="padding:3px 8px;font-size:10px;" onclick="pgHapusTransaksi('${tanggal}','${t.id}')">🗑 Hapus</button></td></tr>`;
                });
                html += '</tbody></table>';
            }
            html += `<div style="margin-top:14px; text-align:right;"><button type="button" class="btn btn-reset" onclick="pgHapusHari('${tanggal}')">🗑 Hapus Seluruh Hari Ini</button></div>`;
            document.getElementById('pgDetailModalBody').innerHTML = html;
            document.getElementById('pgDetailModal').classList.add('show');
        }

        async function pgHapusTransaksi(tanggal, txId) {
            if (!confirm('Hapus transaksi ini?')) return;
            const data = getPengeluaranData();
            const day = data.find(d => d.tanggal === tanggal);
            if (!day) return;
            day.transaksi = (day.transaksi || []).filter(t => t.id !== txId);
            if (day.transaksi.length === 0) {
                pengeluaranDataMap[pengeluaranBulan] = data.filter(d => d.tanggal !== tanggal);
            }
            pgHitungUlangSaldoBulan(pengeluaranBulan);
            await savePengeluaranData(pengeluaranBulan);
            renderPengeluaran();
            document.getElementById('pgDetailModal').classList.remove('show');
            showToast('🗑 Transaksi dihapus.', 'success');
        }

        async function pgHapusHari(tanggal) {
            if (!confirm('Hapus semua data pengeluaran/masuk tanggal ' + fmtTanggal(tanggal) + '?')) return;
            pengeluaranDataMap[pengeluaranBulan] = getPengeluaranData().filter(d => d.tanggal !== tanggal);
            await savePengeluaranData(pengeluaranBulan);
            renderPengeluaran();
            document.getElementById('pgDetailModal').classList.remove('show');
            showToast('🗑 Data tanggal ' + fmtTanggal(tanggal) + ' dihapus.', 'success');
        }

        async function pgHapusSemuaBulanIni() {
            const data = getPengeluaranData();
            if (!data || data.length === 0) { showToast('Tidak ada data di bulan ini.', 'info'); return; }
            const label = (document.getElementById('bulanPengeluaran').selectedOptions[0] || {}).textContent || pengeluaranBulan;
            if (!confirm('⚠️ Ini akan MENGHAPUS SEMUA data Pengeluaran & Masuk untuk bulan ' + label +
                    ' (' + data.length + ' hari data). Tindakan ini tidak bisa dibatalkan. Lanjutkan?')) return;
            if (!confirm('Yakin sekali? Ketik OK di kotak berikutnya untuk konfirmasi terakhir.')) return;
            pengeluaranDataMap[pengeluaranBulan] = [];
            await savePengeluaranData(pengeluaranBulan);
            renderPengeluaran();
            showToast('🗑 Semua data Pengeluaran bulan ' + label + ' sudah dihapus. Silakan upload ulang Excel-nya.',
                'success');
        }
        document.getElementById('pengeluaranHapusBulanBtn').addEventListener('click', pgHapusSemuaBulanIni);

        document.getElementById('pgDetailModalClose').addEventListener('click', function() {
            document.getElementById('pgDetailModal').classList.remove('show');
        });
        document.getElementById('pgDetailModal').addEventListener('click', function(e) {
            if (e.target === this) this.classList.remove('active');
        });

        // ---------- Modal Input Transaksi ----------
        let pgSesiInputList = [];

        function pgResetSesiInput() {
            pgSesiInputList = [];
            const body = document.getElementById('pgInSesiBody');
            if (body) body.innerHTML = '<tr><td colspan="5" class="empty-msg">Belum ada transaksi ditambahkan di sesi ini.</td></tr>';
        }

        function pgHitungTotalPreview() {
            const total = parseNumber(document.getElementById('pgInMasuk').value) +
                parseNumber(document.getElementById('pgInKantor').value) +
                parseNumber(document.getElementById('pgInBurung').value);
            document.getElementById('pgInTotalPreview').textContent = 'Rp ' + formatAngka(total);
            return total;
        }

        ['pgInMasuk', 'pgInKantor', 'pgInBurung'].forEach(function(id) {
            document.getElementById(id).addEventListener('input', pgHitungTotalPreview);
        });

        function pgBukaInputModal() {
            pgResetSesiInput();
            const tglInput = document.getElementById('pgInTanggal');
            if (!tglInput.value) tglInput.value = new Date().toISOString().slice(0, 10);
            document.getElementById('pgInKeterangan').value = '';
            document.getElementById('pgInMasuk').value = '';
            document.getElementById('pgInKantor').value = '';
            document.getElementById('pgInBurung').value = '';
            pgHitungTotalPreview();
            document.getElementById('pgInputModal').classList.add('show');
            document.getElementById('pgInKeterangan').focus();
        }

        function pgTutupInputModal() {
            document.getElementById('pgInputModal').classList.remove('show');
        }

        document.getElementById('pgBukaInputModalBtn').addEventListener('click', pgBukaInputModal);
        document.getElementById('pgInputModalClose').addEventListener('click', pgTutupInputModal);
        document.getElementById('pgInBatal').addEventListener('click', pgTutupInputModal);
        document.getElementById('pgInputModal').addEventListener('click', function(e) {
            if (e.target === this) pgTutupInputModal();
        });

        function pgTambahBarisSesi(tanggal, ket, masuk, kantor, burung) {
            pgSesiInputList.push({ tanggal, ket, masuk, kantor, burung });
            const body = document.getElementById('pgInSesiBody');
            let html = '';
            pgSesiInputList.forEach(r => {
                html += `<tr><td>${fmtTanggal(r.tanggal)}</td><td>${r.ket}</td>` +
                    `<td class="num">${r.masuk ? fmtNumOnly(r.masuk) : ''}</td>` +
                    `<td class="num">${r.kantor ? fmtNumOnly(r.kantor) : ''}</td>` +
                    `<td class="num">${r.burung ? fmtNumOnly(r.burung) : ''}</td></tr>`;
            });
            body.innerHTML = html;
        }

        // ---------- Input manual transaksi (dari modal) ----------
        document.getElementById('pgInputForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const tanggal = document.getElementById('pgInTanggal').value;
            const ket = document.getElementById('pgInKeterangan').value.trim();
            const masuk = parseNumber(document.getElementById('pgInMasuk').value);
            const kantor = parseNumber(document.getElementById('pgInKantor').value);
            const burung = parseNumber(document.getElementById('pgInBurung').value);
            if (!tanggal || !ket) { showToast('Lengkapi tanggal dan keterangan.', 'warning'); return; }
            const isiCount = [masuk, kantor, burung].filter(v => v > 0).length;
            if (isiCount === 0) { showToast('Isi salah satu kolom: Masuk, Kantor, atau Burung.', 'warning'); return; }
            if (isiCount > 1) { showToast('Isi hanya SATU kolom saja: Masuk, Kantor, atau Burung.', 'warning'); return; }

            const bulan = pgBulanDariTanggalISO(tanggal);
            if (!pengeluaranDataMap[bulan]) pengeluaranDataMap[bulan] = [];
            const list = pengeluaranDataMap[bulan];
            let day = list.find(d => d.tanggal === tanggal);
            if (!day) {
                day = { tanggal, transaksi: [], masuk: 0, totalPengeluaran: 0, saldo: 0 };
                list.push(day);
            }
            let tx;
            if (masuk > 0) tx = { id: pgUid(), ket, jumlah: masuk, tipe: 'masuk' };
            else if (kantor > 0) tx = { id: pgUid(), ket, jumlah: kantor, tipe: 'pengeluaran', kategori: 'kantor' };
            else tx = { id: pgUid(), ket, jumlah: burung, tipe: 'pengeluaran', kategori: 'burung' };
            day.transaksi.push(tx);
            pgHitungUlangSaldoBulan(bulan);
            await savePengeluaranData(bulan);

            pengeluaranBulan = bulan;
            pgRebuildBulanOptions();
            pengeluaranPage = 1;
            renderPengeluaran();

            pgTambahBarisSesi(tanggal, ket, masuk, kantor, burung);

            document.getElementById('pgInKeterangan').value = '';
            document.getElementById('pgInMasuk').value = '';
            document.getElementById('pgInKantor').value = '';
            document.getElementById('pgInBurung').value = '';
            document.getElementById('pgInTanggal').value = tanggal;
            pgHitungTotalPreview();
            document.getElementById('pgInKeterangan').focus();
            showToast('✅ Transaksi tersimpan.', 'success');
        });

        // ---------- Bulan selector ----------
        document.getElementById('bulanPengeluaran').addEventListener('change', async function() {
            pengeluaranBulan = this.value;
            if (!pengeluaranDataMap[pengeluaranBulan]) {
                const rec = await db.pengeluaran.where('bulan').equals(pengeluaranBulan).first();
                pengeluaranDataMap[pengeluaranBulan] = rec ? (rec.data || []) : [];
            }
            pengeluaranPage = 1;
            renderPengeluaran();
        });

        // ---------- Import Excel (1 tombol: klik = pilih file sekaligus proses) ----------
        function pgProcessExcelFile(file) {
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    // PENTING: cellDates:true SENGAJA tidak dipakai di sini. SheetJS punya bug dikenal:
                    // saat cellDates:true dipakai di browser dengan timezone UTC+ (mis. WIB), tanggal
                    // yang dibaca dari Excel bisa mundur 1 hari. Solusinya: baca sebagai serial number
                    // mentah (raw), lalu konversi manual di parsePengeluaranDariRows() pakai perhitungan
                    // yang aman dari timezone (lihat fungsi excelSerialToYMD).
                    const workbook = XLSX.read(data, { type: 'array' });
                    let sheetName = workbook.SheetNames.find(n => n.toUpperCase().includes('KAS KECIL'));
                    if (!sheetName) sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
                    const hasil = parsePengeluaranDariRows(rows);
                    if (hasil.length === 0) { showToast('Tidak ada data ditemukan di sheet "' + sheetName + '".',
                        'warning'); return; }

                    const perBulan = {};
                    hasil.forEach(item => {
                        const b = pgBulanDariTanggalISO(item.tanggal);
                        if (!perBulan[b]) perBulan[b] = [];
                        perBulan[b].push(item);
                    });

                    for (const bulan of Object.keys(perBulan)) {
                        const current = pengeluaranDataMap[bulan] || [];
                        const existingTgl = new Set(current.map(d => d.tanggal));
                        perBulan[bulan].forEach(newItem => {
                            if (!existingTgl.has(newItem.tanggal)) current.push(newItem);
                            else {
                                const idx = current.findIndex(d => d.tanggal === newItem.tanggal);
                                if (idx !== -1) current[idx] = newItem;
                            }
                        });
                        pengeluaranDataMap[bulan] = current;
                        pgHitungUlangSaldoBulan(bulan);
                        await savePengeluaranData(bulan);
                    }

                    pengeluaranBulan = Object.keys(perBulan).sort().pop() || pengeluaranBulan;
                    pgRebuildBulanOptions();
                    pengeluaranPage = 1;
                    renderPengeluaran();
                    showToast('Berhasil! Total ' + hasil.length + ' hari diproses dari sheet "' + sheetName + '".',
                        'success');
                } catch (err) {
                    showToast('Gagal baca file: ' + err.message, 'warning');
                }
            };
            reader.readAsArrayBuffer(file);
        }

        document.getElementById('pengeluaranUploadBtn').addEventListener('click', function() {
            document.getElementById('pengeluaranFileInput').click();
        });

        document.getElementById('pengeluaranFileInput').addEventListener('change', function() {
            const file = this.files[0];
            this.value = '';
            if (!file) return;
            pgProcessExcelFile(file);
        });

        document.getElementById('pengeluaranRefreshBtn').addEventListener('click', async function() {
            await loadPengeluaranData();
            pgRebuildBulanOptions();
            renderPengeluaran();
            showToast('🔄 Data Pengeluaran diperbarui.', 'success');
        });

        document.getElementById('pengeluaranExportBtn').addEventListener('click', function() {
            const data = getPengeluaranData();
            if (data.length === 0) { showToast('Tidak ada data.', 'warning'); return; }
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'pengeluaran_' + pengeluaranBulan + '_' + new Date().toISOString().slice(0, 10) + '.json';
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('pengeluaranPrintBtn').addEventListener('click', function() {
            const label = document.getElementById('pgPrintBulanLabel');
            if (label) label.textContent = fmtBulanTahun(pengeluaranBulan);

            document.body.classList.add('printing-pengeluaran');
            let sudahDibersihkanPg = false;
            function bersihkanPrintingPengeluaran() {
                if (sudahDibersihkanPg) return;
                sudahDibersihkanPg = true;
                document.body.classList.remove('printing-pengeluaran');
                window.onafterprint = null;
                if (pgPrintMql) {
                    if (pgPrintMql.removeEventListener) pgPrintMql.removeEventListener('change', pgPrintMqlHandler);
                    else pgPrintMql.removeListener(pgPrintMqlHandler);
                }
            }
            window.onafterprint = bersihkanPrintingPengeluaran;
            let pgPrintMql = window.matchMedia ? window.matchMedia('print') : null;
            function pgPrintMqlHandler(mql) {
                if (!mql.matches) bersihkanPrintingPengeluaran();
            }
            if (pgPrintMql) {
                if (pgPrintMql.addEventListener) pgPrintMql.addEventListener('change', pgPrintMqlHandler);
                else pgPrintMql.addListener(pgPrintMqlHandler);
            }

            window.print();
        });

        document.getElementById('pgPrevPage').addEventListener('click', function() {
            if (pengeluaranPage > 1) { pengeluaranPage--; renderPengeluaranTable(); updatePengeluaranPagination(); }
        });
        document.getElementById('pgNextPage').addEventListener('click', function() {
            const totalPages = Math.ceil(pengeluaranFiltered.length / pengeluaranRowsPerPage) || 1;
            if (pengeluaranPage < totalPages) { pengeluaranPage++; renderPengeluaranTable(); updatePengeluaranPagination(); }
        });

        // ================================================================
