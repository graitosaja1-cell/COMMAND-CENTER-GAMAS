        // TAMPILAN "FAKTUR CETAK" (mirip faktur kertas yang dicetak sehari-hari)
        // Dipakai bersama oleh modal Detail Faktur - Cek Piutang & Cek Cash,
        // supaya staff langsung familiar dengan tampilannya.
        // opts: { noFaktur, tglFaktur, tglTempo, customer, sales, jenis: 'CASH'|'TEMPO', items:[{kode,nama,qty,satuan,harga,disc,jumlah}] }
        // ================================================================
        function buildFakturCetakHtml(opts) {
            const items = Array.isArray(opts.items) ? opts.items : [];
            let totalQty = 0,
                totalJumlah = 0;
            let rowsHtml = items.map((it, i) => {
                totalQty += parseNumber(it.qty) || 0;
                totalJumlah += parseNumber(it.jumlah) || 0;
                return `<tr>
                        <td class="fc-no">${i + 1}</td>
                        <td class="fc-kode">${it.kode ? escapeHtml(it.kode) : '-'}</td>
                        <td>${escapeHtml(it.nama || '-')}</td>
                        <td class="fc-qty">${(it.qty || it.qty === 0) ? (it.qty + (it.satuan ? ' ' + escapeHtml(it.satuan) : '')) : ''}</td>
                        <td class="fc-harga">${it.harga ? fmtRp(it.harga) : ''}</td>
                        <td class="fc-disc">${it.disc ? fmtRp(it.disc) : ''}</td>
                        <td class="fc-jumlah">${fmtRp(it.jumlah || 0)}</td>
                    </tr>`;
            }).join('');
            const jenisClass = opts.jenis === 'CASH' ? 'fc-jenis-cash' : 'fc-jenis-tempo';
            return `
                <div class="fc-wrap">
                    <div class="fc-head">
                        <div class="fc-head-title">FAKTUR PENJUALAN</div>
                        <div class="fc-head-fields">
                            <div class="fc-field"><span class="fc-label">No Faktur :</span><span class="fc-val">${escapeHtml(opts.noFaktur || '-')}</span></div>
                            <div class="fc-field"><span class="fc-label">Tgl. Faktur :</span><span class="fc-val">${escapeHtml(opts.tglFaktur || '-')}</span></div>
                            <div class="fc-field"><span class="fc-label">Tgl. Tempo :</span><span class="fc-val">${escapeHtml(opts.tglTempo || '-')}</span></div>
                            <div class="fc-field"><span class="fc-label">Customer :</span><span class="fc-val">${escapeHtml(opts.customer || '-')}</span></div>
                        </div>
                    </div>
                    <div class="fc-subhead">
                        <div class="fc-sales"><span class="fc-label">Sales :</span><span class="fc-val">${escapeHtml(opts.sales || '-')}</span></div>
                        <div class="fc-jenis ${jenisClass}">${escapeHtml(opts.jenis || '')}</div>
                    </div>
                    <div class="fc-table-scroll">
                    <table class="fc-table">
                        <thead>
                            <tr>
                                <th style="width:30px;">No</th>
                                <th style="width:70px;">Kode</th>
                                <th>Nama Barang</th>
                                <th style="width:80px;">Qty</th>
                                <th style="width:100px;">Harga Satuan</th>
                                <th style="width:80px;">Disc.</th>
                                <th style="width:110px;">Jumlah</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" class="fc-total-label">Total</td>
                                <td class="fc-qty">${totalQty || ''}</td>
                                <td></td>
                                <td></td>
                                <td class="fc-jumlah">${fmtRp(totalJumlah)}</td>
                            </tr>
                        </tfoot>
                    </table>
                    </div>
                </div>`;
        }

        function ptShowDetailModal(r) {
            ptCurrentDetailFaktur = r.noFaktur;
            document.getElementById('ptDetailTitle').textContent = `🧾 Detail Faktur - ${r.noFaktur}`;

            // Cek ulang ke Bank Data Penjualan (Tab 1): satu No.Faktur bisa punya lebih dari
            // 1 baris/item produk. Kalau hanya dihitung dari 1 baris, Total Tagihan jadi lebih
            // kecil dari yang sebenarnya sehingga Sisa Tagihan bisa minus padahal belum tentu lunas.
            const itemsFaktur = salesData.filter(s => normFaktur(s['No.Faktur']) === normFaktur(r.noFaktur));
            const isMultiItem = itemsFaktur.length > 1;
            const totalTagihanGabungan = isMultiItem ? itemsFaktur.reduce((sum, it) => sum + parseNumber(it
                .Total), 0) : r.total;
            const totalTagihanPakai = isMultiItem ? totalTagihanGabungan : r.total;

            const belumBayar = totalTagihanPakai - (r.totalBayar || 0);
            const catatanTersimpan = piutangNotesMap[r.noFaktur] || '';

            // Riwayat lengkap semua pembayaran/titip untuk faktur ini (bisa lebih dari
            // 1 kali kalau dicicil), dipakai supaya "kapan & berapa titipnya" jelas
            // kebaca, bukan cuma kemunculan terakhir.
            const riwayatBayar = ptHitungRiwayatFaktur(r.noFaktur);
            const totalDariRiwayat = riwayatBayar.reduce((s, x) => s + x.total, 0);
            const belumBayarRiwayat = totalTagihanPakai - totalDariRiwayat;
            const riwayatHtml = riwayatBayar.length ? `
                    <div style="font-weight:700; margin-bottom:4px;">💵 Riwayat Pembayaran (dari Data Uang Masuk):</div>
                    <table style="width:100%; border-collapse:collapse; font-size:10.5px; margin-bottom:6px;">
                        <thead>
                            <tr style="border-bottom:1px solid var(--line);">
                                <th style="text-align:left;padding:3px 4px;">Tanggal</th>
                                <th style="text-align:left;padding:3px 4px;">Sumber</th>
                                <th style="text-align:right;padding:3px 4px;">Cash</th>
                                <th style="text-align:right;padding:3px 4px;">Transfer</th>
                                <th style="text-align:right;padding:3px 4px;">Total</th>
                                <th style="text-align:left;padding:3px 4px;">Ket</th>
                            </tr>
                        </thead>
                        <tbody>${riwayatBayar.map(x => `<tr>
                                <td style="padding:3px 4px;">${x.tglTampil}</td>
                                <td style="padding:3px 4px;">${x.sumber === 'Cash' ? 'Cash Dropping' : 'Piutang Tempo'}</td>
                                <td class="num" style="padding:3px 4px;">${x.cash > 0 ? fmtRp(x.cash) : '-'}</td>
                                <td class="num" style="padding:3px 4px;">${x.transfer > 0 ? fmtRp(x.transfer) : '-'}</td>
                                <td class="num" style="padding:3px 4px;font-weight:600;">${fmtRp(x.total)}</td>
                                <td style="padding:3px 4px;${x.ket.toLowerCase().includes('titip') ? 'color:#c2410c;font-weight:600;' : ''}">${escapeHtml(x.ket || '-')}</td>
                            </tr>`).join('')}</tbody>
                        <tfoot>
                            <tr style="border-top:1px solid var(--line); font-weight:700;">
                                <td colspan="4" style="padding:3px 4px;">TOTAL SUDAH DIBAYAR</td>
                                <td class="num" style="padding:3px 4px;">${fmtRp(totalDariRiwayat)}</td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                ` : `<div style="color:#6b7280; font-size:10.5px; margin-bottom:6px;">Belum ada catatan pembayaran untuk faktur ini di Data Uang Masuk.</div>`;

            const multiItemNoticeHtml = isMultiItem ? `
                    <div style="background:#fff7ed; border:1px solid #fdba74; border-radius:6px; padding:8px 10px; margin:8px 0; font-size:10.5px; line-height:1.6;">
                        <div style="font-weight:700; color:#c2410c;">⚠️ Ditemukan ${itemsFaktur.length} item produk untuk No. Faktur ini di Bank Data Penjualan.</div>
                        <div>Total Tagihan di bawah sudah digabung otomatis dari semua item: <strong>${fmtRp(totalTagihanGabungan)}</strong> (bukan hanya ${fmtRp(r.total)} dari 1 baris produk saja).</div>
                        <table style="width:100%; border-collapse:collapse; margin-top:6px;">
                            <thead><tr style="border-bottom:1px solid #fdba74;"><th style="text-align:left;padding:2px 4px;">Produk</th><th style="text-align:right;padding:2px 4px;">Total</th></tr></thead>
                            <tbody>${itemsFaktur.map(it => `<tr><td style="padding:2px 4px;">${escapeHtml(it.Produk || '-')}</td><td class="num" style="padding:2px 4px;">${fmtRp(parseNumber(it.Total))}</td></tr>`).join('')}</tbody>
                        </table>
                    </div>
                ` : '';

            const fcJenisPt = (r.pembayaran === 'Cash') ? 'CASH' : 'TEMPO';
            const fcItemsPt = itemsFaktur.length ? itemsFaktur.map(it => ({
                kode: '',
                nama: it.Produk,
                qty: parseNumber(it.Jumlah) || 0,
                satuan: it.Satuan || '',
                harga: parseNumber(it['Harga Jual']) || 0,
                disc: parseNumber(it.Disc) || 0,
                jumlah: it.Total !== undefined && it.Total !== '' ? parseNumber(it.Total) : ((parseNumber(it.Jumlah) || 0) * (parseNumber(it['Harga Jual']) || 0) - (parseNumber(it.Disc) || 0))
            })) : [{ kode: '', nama: r.produkNama || '-', qty: '', satuan: '', harga: '', disc: '', jumlah: totalTagihanPakai }];
            const fakturCetakHtmlPt = buildFakturCetakHtml({
                noFaktur: r.noFaktur,
                tglFaktur: fmtTanggal(r.tanggal),
                tglTempo: r.jt || 'Belum diketahui',
                customer: r.customer + (r.namaTokoUM && r.namaTokoUM !== r.customer ? ` (uang masuk: ${r.namaTokoUM})` : ''),
                sales: r.sales,
                jenis: fcJenisPt,
                items: fcItemsPt
            });

            document.getElementById('ptDetailBody').innerHTML = `
                    ${fakturCetakHtmlPt}
                    ${multiItemNoticeHtml}
                    ${riwayatHtml}
                    <div class="fc-info-box" style="padding-left:0;padding-right:0;">
                        <div class="fc-info-row">
                            <span>${riwayatBayar.length ? '' : 'Belum ada catatan pembayaran untuk faktur ini di Data Uang Masuk.'}</span>
                            <span class="fc-sisa-tagihan" style="color:${belumBayarRiwayat>0.5 ? '#b91c1c':'#1e7a46'};">Sisa Tagihan: ${fmtRp(belumBayarRiwayat)}</span>
                        </div>
                        <div class="fc-info-row">
                            <strong>Status:</strong> <span class="badge pt-${r.statusClass}">${ptStatusLabel(r.statusClass)}</span>
                            ${r.statusClass === 'lunas' ? '<span class="stempel-lunas-lg">Lunas</span>' : (r.ketRaw ? `<span class="fc-pill fc-pill-ok">${escapeHtml(r.ketRaw)}</span>` : '<span class="fc-pill fc-pill-warn">Belum ada catatan di Data Uang Masuk</span>')}
                        </div>
                        <div class="fc-info-row" style="display:block;">
                            <div style="font-weight:700; margin-bottom:4px;">📝 Catatan Piutang:</div>
                            <textarea id="ptCatatanInput" rows="3" style="width:100%; box-sizing:border-box; border:1px solid #d1d5db; border-radius:4px; padding:5px 8px; font-size:11px; font-family:inherit; resize:vertical; background:#fff;" placeholder="Tulis catatan untuk faktur ini (misal: janji bayar, alasan telat, dll)...">${escapeHtml(catatanTersimpan)}</textarea>
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:6px;">
                                <button class="btn btn-danger" id="ptTrashBtn" style="font-size:10px;padding:4px 12px;">🗑️ Pindahkan ke Sampah</button>
                                <button class="btn btn-outline" id="ptCatatanSaveBtn" style="font-size:10px;padding:4px 12px;">💾 Simpan Catatan</button>
                            </div>
                        </div>
                    </div>
                `;
            document.getElementById('ptDetailModal').classList.add('show');
            const saveBtn = document.getElementById('ptCatatanSaveBtn');
            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {
                    const val = document.getElementById('ptCatatanInput').value;
                    await savePiutangNote(ptCurrentDetailFaktur, val);
                    showToast('📝 Catatan disimpan.', 'success');
                    ptRenderTempoTable();
                });
            }
            const trashBtn = document.getElementById('ptTrashBtn');
            if (trashBtn) {
                trashBtn.addEventListener('click', async () => {
                    const idx = salesData.findIndex(row => normFaktur(row['No.Faktur']) === normFaktur(r.noFaktur));
                    if (idx === -1) {
                        showToast('⚠️ Data asli tidak ditemukan di Bank Data Penjualan (mungkin sudah dipindahkan/dihapus).',
                            'warning');
                        return;
                    }
                    const alasan = prompt('Alasan pindahkan faktur ini ke Data Sampah:\n(contoh: Salah Input, Batal, Retur, dll)',
                        'Batal / Tidak Jadi Tagih');
                    if (alasan === null) return;
                    if (!confirm(`Pindahkan faktur ${r.noFaktur} ke Data Sampah?\nData masih bisa dipulihkan kembali dari tab Trash & Save.`))
                        return;

                    await pindahkanSalesKeSampah([idx], alasan.trim() || '-');

                    delete ptChecked[r.noFaktur];
                    delete cashChecked[r.noFaktur];

                    document.getElementById('ptDetailModal').classList.remove('show');
                    rebuildSalesFilterOptions();
                    ptRenderTempoTable();
                    if (typeof renderTrashTable === 'function') renderTrashTable();
                    if (typeof renderRingkasanSaveAll === 'function') renderRingkasanSaveAll();
                    if (typeof renderTagihanDariPiutang === 'function') renderTagihanDariPiutang();
                    showToast(`🗑️ Faktur ${r.noFaktur} dipindahkan ke Data Sampah.`, 'success');
                });
            }
        }
        document.getElementById('ptDetailClose').addEventListener('click', () => { document.getElementById('ptDetailModal')
                .classList.remove('show'); });
        document.getElementById('ptDetailModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) e
                .currentTarget.classList.remove('show'); });
        document.addEventListener('click', function(e) {
            const target = e.target.closest('.pt-faktur-link');
            if (target) { e.preventDefault(); const idx = parseInt(target.dataset.idx, 10); const rows = window
                    ._ptRowsCache || []; const r = rows[idx]; if (r) ptShowDetailModal(r); }
        });

        // ================================================================
        // MODAL DETAIL FAKTUR – TAB 3 (CEK CASH)
        // Mengambil data produk/harga beli/harga jual/profit dari Bank Data
        // Penjualan (Tab 1) dan data pembayaran dari Data Uang Masuk (Tab 2).
        // ================================================================
        // ================================================================
        // STEMPEL "LUNAS" pada modal detail faktur (dipakai khusus di
        // Cek Cash saat status pembayaran sudah cocok/lunas).
        // ================================================================
        function setDetailModalStempelLunas(show) {
            const el = document.getElementById('detailModalStempelLunas');
            if (el) el.style.display = show ? 'flex' : 'none';
        }

        function cashShowDetailModal(d) {
            const noFaktur = (d['No.Faktur'] || '').toString().trim();
            if (!noFaktur) return;
            cashCurrentDetailFaktur = noFaktur;

            // Semua baris produk untuk No.Faktur ini dari Tab 1 (Bank Data Penjualan)
            const items = salesData.filter(s => normFaktur(s['No.Faktur']) === normFaktur(noFaktur));
            const sumber = items.length ? items : [d];

            let totalQty = 0,
                totalJual = 0,
                totalBeli = 0,
                totalDisc = 0;
            const baris = sumber.map(it => {
                const jumlah = parseNumber(it.Jumlah);
                const hargaJual = parseNumber(it['Harga Jual']);
                const hargaBeli = it['Harga Beli'] !== undefined && it['Harga Beli'] !== '' ? parseNumber(it[
                    'Harga Beli']) : null;
                const disc = parseNumber(it.Disc);
                const totalBaris = it.Total !== undefined && it.Total !== '' ? parseNumber(it.Total) : (jumlah *
                    hargaJual) - disc;
                totalQty += jumlah;
                totalJual += totalBaris;
                if (hargaBeli !== null) totalBeli += hargaBeli * jumlah;
                totalDisc += disc;
                return `<tr>
                        <td>${escapeHtml(it.Produk || '-')}</td>
                        <td class="num">${jumlah || 0} ${escapeHtml(it.Satuan || '')}</td>
                        <td class="num">${fmtRp(hargaJual)}</td>
                        <td class="num">${hargaBeli !== null ? fmtRp(hargaBeli) : '-'}</td>
                        <td class="num">${disc ? fmtRp(disc) : '-'}</td>
                    </tr>`;
            }).join('');

            // Data pembayaran dari Tab 2 (Data Uang Masuk / Cek Cash matching)
            const bayar = d._dropDetail || null;
            const statusLabel = d._status === 'cocok' ? '✅ Lunas (sudah cocok Data Uang Masuk)' :
                '❌ Belum Lunas (belum ditemukan di Data Uang Masuk)';

            const catatanTersimpan = cashNotesMap[noFaktur] || '';

            // Cek ke Bank Data Penjualan: kalau 1 No.Faktur punya lebih dari 1 item produk,
            // kasih tahu di modal supaya jelas kenapa Total Tagihan di atas 1 baris saja.
            const isMultiItemCash = items.length > 1;
            const multiItemNoticeCashHtml = isMultiItemCash ? `
                    <div style="background:#fff7ed; border:1px solid #fdba74; border-radius:6px; padding:8px 10px; margin:8px 0; font-size:10.5px; line-height:1.6;">
                        <div style="font-weight:700; color:#c2410c;">⚠️ Ditemukan ${items.length} item produk untuk No. Faktur ini di Bank Data Penjualan.</div>
                        <div>Rincian & TOTAL di tabel di bawah sudah digabung otomatis dari semua item (Total Tagihan: <strong>${fmtRp(totalJual)}</strong>).</div>
                    </div>
                ` : '';

            const fcItemsCash = sumber.map(it => {
                const jumlah = parseNumber(it.Jumlah);
                const hargaJual = parseNumber(it['Harga Jual']);
                const disc = parseNumber(it.Disc);
                const totalBaris = it.Total !== undefined && it.Total !== '' ? parseNumber(it.Total) : (jumlah * hargaJual) - disc;
                return { kode: '', nama: it.Produk, qty: jumlah || 0, satuan: it.Satuan || '', harga: hargaJual || 0, disc: disc || 0, jumlah: totalBaris };
            });
            const fakturCetakHtmlCash = buildFakturCetakHtml({
                noFaktur: noFaktur,
                tglFaktur: fmtTanggal(d.Tanggal),
                tglTempo: bayar && bayar.jt ? bayar.jt : '-',
                customer: d.Customer,
                sales: d.Sales,
                jenis: 'CASH',
                items: fcItemsCash
            });

            document.getElementById('detailModalTitleGlobal').textContent = `🧾 Detail Faktur - ${noFaktur}`;
            document.getElementById('detailModalBodyGlobal').innerHTML = `
                    ${fakturCetakHtmlCash}
                    ${multiItemNoticeCashHtml}
                    <div class="fc-info-box" style="padding-left:0;padding-right:0;">
                        <div class="fc-info-row">
                            <strong>💰 Status Pembayaran (dari Data Uang Masuk):</strong>
                            <span class="fc-pill ${d._status === 'cocok' ? 'fc-pill-ok' : 'fc-pill-warn'}">${statusLabel}</span>
                        </div>
                        ${bayar ? `
                        <div class="fc-info-row" style="display:grid; grid-template-columns:1fr 1fr; gap:2px 18px;">
                        <div><strong>Toko (Uang Masuk):</strong> ${escapeHtml(bayar.namaToko || '-')}</div>
                        <div><strong>Tgl Jatuh Tempo:</strong> ${escapeHtml(bayar.jt || '-')}</div>
                        <div><strong>Tgl Uang Masuk:</strong> ${bayar._tglHari ? fmtTanggalHarianYY(bayar._tglHari, bayar._bulanRecord) : '-'}</div>
                        <div><strong>Tagihan:</strong> ${fmtRp(bayar.tagihan)}</div>
                        <div><strong>Dibayar Cash:</strong> ${fmtRp(bayar.bayarCash)}</div>
                        <div><strong>Dibayar Transfer:</strong> ${fmtRp(bayar.bayarTransfer)}</div>
                        <div><strong>Total Dibayar:</strong> ${fmtRp(bayar.totalBayar)}</div>
                        <div><strong>Keterangan:</strong> ${escapeHtml(bayar.ket || '-')}</div>
                        </div>
                        ` : `<div class="fc-info-row"><span class="info-kosong-mencolok" style="width:100%;">Belum ada data pembayaran yang cocok di Data Uang Masuk</span></div>`}
                        <div class="fc-info-row" style="display:block;">
                            <div style="font-weight:700; margin-bottom:4px;">📝 Catatan Cek Cash:</div>
                            <textarea id="cashCatatanInput" rows="3" style="width:100%; box-sizing:border-box; border:1px solid #d1d5db; border-radius:4px; padding:5px 8px; font-size:11px; font-family:inherit; resize:vertical; background:#fff;" placeholder="Tulis catatan untuk faktur ini...">${escapeHtml(catatanTersimpan)}</textarea>
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:6px;">
                                <button class="btn btn-danger" id="cashTrashBtn" style="font-size:10px;padding:4px 12px;">🗑️ Pindahkan ke Sampah</button>
                                <button class="btn btn-outline" id="cashCatatanSaveBtn" style="font-size:10px;padding:4px 12px;">💾 Simpan Catatan</button>
                            </div>
                        </div>
                        <div class="fc-info-row" style="display:block; background:#fff7ed; border:1px solid #fdba74; border-radius:6px; padding:8px 10px; margin-top:4px;">
                            <div style="font-size:10.5px; color:#7c2d12; margin-bottom:6px; line-height:1.5;">Kalau transaksi ini ternyata belum dibayar cash dan berubah jadi <strong>piutang (tempo)</strong>, pindahkan ke Cek Piutang di sini:</div>
                            <button class="btn btn-orange" id="cashUbahJadiPiutangBtn" style="font-size:10.5px; padding:6px 12px; width:100%;">🔁 Ubah ke Piutang (Tempo)</button>
                        </div>
                    </div>
                `;
            document.getElementById('detailModalGlobal').classList.add('show');
            setDetailModalStempelLunas(d._status === 'cocok');
            const saveBtn = document.getElementById('cashCatatanSaveBtn');
            if (saveBtn) {
                saveBtn.addEventListener('click', async () => {
                    const val = document.getElementById('cashCatatanInput').value;
                    await saveCashNote(cashCurrentDetailFaktur, val);
                    showToast('📝 Catatan disimpan.', 'success');
                    renderCashTable();
                });
            }
            const trashBtn = document.getElementById('cashTrashBtn');
            if (trashBtn) {
                trashBtn.addEventListener('click', async () => {
                    const idxList = [];
                    salesData.forEach((row, i) => { if (normFaktur(row['No.Faktur']) === normFaktur(noFaktur)) idxList
                            .push(i); });
                    if (!idxList.length) {
                        showToast('⚠️ Data asli tidak ditemukan di Bank Data Penjualan (mungkin sudah dipindahkan/dihapus).',
                            'warning');
                        return;
                    }
                    const alasan = prompt('Alasan pindahkan faktur ini ke Data Sampah:\n(contoh: Salah Input, Batal, Retur, dll)',
                        'Batal / Tidak Jadi Tagih');
                    if (alasan === null) return;
                    if (!confirm(`Pindahkan faktur ${noFaktur} ke Data Sampah?\nData masih bisa dipulihkan kembali dari tab Trash & Save.`))
                        return;

                    await pindahkanSalesKeSampah(idxList, alasan.trim() || '-');

                    delete cashChecked[noFaktur];
                    delete ptChecked[noFaktur];

                    document.getElementById('detailModalGlobal').classList.remove('show');
                    rebuildSalesFilterOptions();
                    await renderCek();
                    if (typeof renderTrashTable === 'function') renderTrashTable();
                    if (typeof renderRingkasanSaveAll === 'function') renderRingkasanSaveAll();
                    if (typeof renderTagihanDariPiutang === 'function') renderTagihanDariPiutang();
                    showToast(`🗑️ Faktur ${noFaktur} dipindahkan ke Data Sampah.`, 'success');
                });
            }
            const ubahBtn = document.getElementById('cashUbahJadiPiutangBtn');
            if (ubahBtn) {
                ubahBtn.addEventListener('click', async () => {
                    await ubahCashJadiPiutang(cashCurrentDetailFaktur);
                });
            }
        }

        // ================================================================
        // UBAH TRANSAKSI CASH -> PIUTANG (TEMPO)
        // Dipakai saat transaksi yang tadinya tercatat Cash ternyata belum
        // dibayar dan harus pindah jadi piutang tempo (Tab 3 -> Tab 4).
        // Caranya: field "Pembayaran" pada baris salesData faktur tsb
        // diubah dari "Cash" menjadi "Tempo", lalu kedua tabel di-render ulang.
        // ================================================================
        async function ubahCashJadiPiutang(noFaktur) {
            if (!noFaktur) return;
            const rows = salesData.filter(r => normFaktur(r['No.Faktur']) === normFaktur(noFaktur));
            if (rows.length === 0) {
                showToast('❌ Baris faktur tidak ditemukan di Bank Data Penjualan.', 'warning');
                return;
            }
            const sudahTempo = rows.every(r => r.Pembayaran === 'Tempo');
            if (sudahTempo) {
                showToast('ℹ️ Faktur ini sudah berstatus Tempo (Piutang).', 'info');
                return;
            }
            const ok = confirm(
                `Ubah faktur ${target} dari Cash menjadi Piutang (Tempo)? Faktur ini akan hilang dari Cek Cash dan muncul di Cek Piutang.`
            );
            if (!ok) return;

            rows.forEach(r => { r.Pembayaran = 'Tempo'; });
            const saved = await saveSalesData();
            if (!saved) return;

            // Bawa catatan yang sudah ada di Cek Cash supaya tidak hilang, pindah ke Catatan Piutang
            if (cashNotesMap[target]) {
                await savePiutangNote(target, cashNotesMap[target]);
            }
            // Bersihkan status pilihan/centang di Cek Cash untuk faktur ini
            delete cashChecked[target];

            document.getElementById('detailModalGlobal').classList.remove('show');
            showToast(`🔁 Faktur ${target} dipindahkan ke Cek Piutang (Tempo).`, 'success');

            await renderCek();
            if (typeof ptRefresh === 'function') {
                await ptRefresh(false);
            } else if (typeof ptRenderTempoTable === 'function') {
                ptRenderTempoTable();
            }
        }
        document.getElementById('detailModalCloseGlobal').addEventListener('click', () => {
            document.getElementById('detailModalGlobal').classList.remove('show');
        });
        document.getElementById('detailModalGlobal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) e.currentTarget.classList.remove('show');
        });
        document.addEventListener('click', function(e) {
            const target = e.target.closest('.faktur-link');
            if (target && target.dataset.src === 'cekCash') {
                const idx = parseInt(target.dataset.idx, 10);
                const rows = cashTableFiltered || [];
                const r = rows[idx];
                if (r) cashShowDetailModal(r);
            }
        });

        async function ptRefresh(showMsg) {
            const incomeByMonth = {};
            for (const bulan in cashDataMap) { 
                if (Array.isArray(cashDataMap[bulan])) { 
                    incomeByMonth[bulan] = cashDataMap[bulan]; 
                } 
            }
            ptIncomeByMonth = incomeByMonth;
            const jumlahBulanIncome = Object.keys(ptIncomeByMonth).length;
            
            // Debug: log data structure
            const debugInfo = Object.keys(ptIncomeByMonth).map(bulan => {
                let piutangCount = 0;
                (ptIncomeByMonth[bulan] || []).forEach(day => {
                    if (day.piutangDetail) piutangCount += day.piutangDetail.length;
                });
                return `${bulan}: ${piutangCount} piutang`;
            }).join(', ');
            console.log('✅ ptIncomeByMonth loaded:', debugInfo);
            
            const statusEl = document.getElementById('ptSourceStatus');
            if (statusEl) { statusEl.innerHTML =
                    `<span class="pt-status-dot ok"></span>${salesData.length} transaksi penjualan · ${jumlahBulanIncome} bulan data uang masuk`
                    ; }
            if (showMsg) showToast('🔄 Data piutang dimuat ulang.', 'success');
            ptRebuildFilterOptions();
            ptPage = 1;
            ptRenderTempoTable();
            updatePiutangSelectedInfo();
        }
        const debouncedPtRender = debounce(() => { ptPage = 1;
            ptRenderTempoTable(); }, 300);
        const ptFilterIds = ['ptSearch', 'ptTanggal', 'ptSales', 'ptKategori', 'ptStatus'];
        
        function attachPtFilterListeners() {
            ptFilterIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) { 
                    el.addEventListener('input', debouncedPtRender, false);
                    el.addEventListener('change', debouncedPtRender, false);
                    el.addEventListener('blur', debouncedPtRender, false);
                }
            });
        }
        
        attachPtFilterListeners();
        document.getElementById('ptBtnReset').addEventListener('click', () => {
            document.getElementById('ptSearch').value = '';
            document.getElementById('ptTanggal').value = '';
            ptSelectedBulan = new Set(); // Reset -> kembali ke "Semua Bulan"
            userSetBulan.pt = true;
            const bulanArrReset = Array.from(new Set(salesData.filter(r => r.Tanggal).map(r => String(r.Tanggal).slice(0, 7)))).sort();
            ptRenderBulanPanel(bulanArrReset);
            document.getElementById('ptSales').value = '';
            document.getElementById('ptKategori').value = '';
            document.getElementById('ptStatus').value = '';
            ptPage = 1;
            ptRenderTempoTable();
        });
        // Buka/tutup panel checkbox multi-bulan. Panel pakai position:fixed (bukan
        // absolute di dalam .filter-bar), karena .filter-bar punya overflow-x:auto
        // yang akan memotong/menyembunyikan apapun yang meluber ke bawahnya.
        function ptTutupBulanPanel() {
            const panel = document.getElementById('ptBulanPanel');
            if (panel) panel.classList.remove('show');
        }
        function ptPosisikanBulanPanel() {
            const btn = document.getElementById('ptBulanBtn');
            const panel = document.getElementById('ptBulanPanel');
            if (!btn || !panel) return;
            const rect = btn.getBoundingClientRect();
            panel.style.top = (rect.bottom + 4) + 'px';
            let left = rect.left;
            const maxLeft = window.innerWidth - 180; // jaga-jaga supaya tidak keluar layar kanan
            if (left > maxLeft) left = Math.max(4, maxLeft);
            panel.style.left = left + 'px';
        }
        document.getElementById('ptBulanBtn').addEventListener('click', function(e) {
            e.stopPropagation();
            const panel = document.getElementById('ptBulanPanel');
            const willOpen = !panel.classList.contains('show');
            if (willOpen) { ptPosisikanBulanPanel(); panel.classList.add('show'); }
            else { ptTutupBulanPanel(); }
        });
        document.addEventListener('click', function(e) {
            const panel = document.getElementById('ptBulanPanel');
            const btn = document.getElementById('ptBulanBtn');
            if (panel && panel.classList.contains('show') && !panel.contains(e.target) && e.target !== btn) {
                ptTutupBulanPanel();
            }
        });
        window.addEventListener('scroll', ptTutupBulanPanel, true);
        window.addEventListener('resize', ptTutupBulanPanel);
        document.getElementById('ptBtnRefresh').addEventListener('click', async () => { 
            await loadAllCashDataBeforePtRefresh();
            await ptRefresh(true);
            sembunyikanNotifDataBaru('piutang');
        });
        document.getElementById('ptBtnInputManual').addEventListener('click', function() {
            document.getElementById('ptMenuDropdown').classList.remove('active');
            bukaPtInputManualModal();
        });

        function bukaPtInputManualModal() {
            document.getElementById('ptInputManualForm').reset();
            const today = new Date().toISOString().slice(0, 10);
            document.getElementById('pimTanggal').value = today;
            document.getElementById('pimJatuhTempo').value = '';
            const salesSet = new Set();
            salesData.forEach(r => { if (r.Sales) salesSet.add(r.Sales); });
            document.getElementById('pimSalesList').innerHTML = Array.from(salesSet).sort().map(s =>
                `<option value="${s}"></option>`).join('');
            document.getElementById('ptInputManualModal').classList.add('show');
        }

        function tutupPtInputManualModal() {
            document.getElementById('ptInputManualModal').classList.remove('show');
        }

        document.getElementById('ptInputManualClose').addEventListener('click', tutupPtInputManualModal);
        document.getElementById('pimBtnBatal').addEventListener('click', tutupPtInputManualModal);
        document.getElementById('ptInputManualModal').addEventListener('click', function(e) {
            if (e.target === this) tutupPtInputManualModal();
        });

        function isoToDMY(iso) {
            if (!iso) return '';
            const parts = String(iso).split('-');
            if (parts.length !== 3) return '';
            return parts[2] + '/' + parts[1] + '/' + parts[0];
        }

        document.getElementById('ptInputManualForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const tanggal = document.getElementById('pimTanggal').value;
            const noFaktur = document.getElementById('pimNoFaktur').value.trim();
            const customer = document.getElementById('pimCustomer').value.trim();
            const alamat = document.getElementById('pimAlamat').value.trim();
            const sales = document.getElementById('pimSales').value.trim();
            const kategori = document.getElementById('pimKategori').value;
            const total = parseNumber(document.getElementById('pimTotal').value);
            const jatuhTempoIso = document.getElementById('pimJatuhTempo').value;

            if (!tanggal || !noFaktur || !customer || !sales || !total) {
                showToast('⚠️ Lengkapi dulu kolom yang wajib diisi (*)', 'warning');
                return;
            }
            const sudahAda = salesData.some(r => String(r['No.Faktur'] || '').trim().toLowerCase() === noFaktur
                .toLowerCase());
            if (sudahAda) {
                if (!confirm(`No.Faktur "${noFaktur}" sudah ada di data. Tetap simpan sebagai data baru?`)) return;
            }
            const produk = kategori === 'fitri' ? 'Minyak Fitri (Input Manual)' : 'Rupa Rupa (Input Manual)';
            const row = {
                'Tanggal': tanggal, 'No.Faktur': noFaktur, 'Produk': produk, 'Jumlah': 1, 'Satuan': '',
                'Harga Jual': total, 'Disc': 0, 'Total': total, 'Sales': sales, 'Customer': customer,
                'Alamat': alamat, 'Pembayaran': 'Tempo', 'Harga Beli': '', 'Profit': ''
            };
            if (jatuhTempoIso) row.JatuhTempoManual = isoToDMY(jatuhTempoIso);
            salesData.push(row);
            const okSave = await saveSalesData();
            if (typeof rebuildSalesFilterOptions === 'function') rebuildSalesFilterOptions();
            ptRebuildFilterOptions();
            ptPage = 1;
            ptRenderTempoTable();
            tutupPtInputManualModal();
            if (okSave) showToast('✅ Data piutang lama berhasil ditambahkan ke Cek Piutang.', 'success');
        });
        document.getElementById('ptDataBaruNotif').addEventListener('click', function() {
            document.getElementById('ptBtnRefresh').click();
        });

        // ================================================================
