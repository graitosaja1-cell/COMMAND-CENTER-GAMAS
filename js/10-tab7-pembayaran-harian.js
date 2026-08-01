        // TAB 7 – PEMBAYARAN (INPUT HARIAN) – JavaScript lengkap
        // ================================================================
        function formatAngka(v) {
            if (v === undefined || v === null || isNaN(v)) return '';
            return Math.round(v).toLocaleString('id-ID');
        }

        function parseAngka(str) {
            if (!str) return 0;
            const cleaned = String(str).replace(/[^0-9]/g, '');
            return parseInt(cleaned) || 0;
        }

        function buatBarisPiutang(no) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-center" style="font-weight:600;">${no}</td>
                <td><input type="text" class="form-control form-control-sm kolom-sales" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="date" class="form-control form-control-sm" /></td>
                <td><input type="date" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm uang-input" /></td>
                <td><input type="text" class="form-control form-control-sm uang-input" /></td>
                <td><input type="text" class="form-control form-control-sm uang-input" /></td>
                <td><input type="text" class="form-control form-control-sm uang-input" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm total-baris" readonly style="font-weight:700;background:#f1f3f4;" /></td>
                <td class="text-center"><button class="btn-hapus-baris" title="Hapus baris">&times;</button></td>
            `;
            return tr;
        }

        function buatBarisCash(no) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="text-center" style="font-weight:600;">${no}</td>
                <td><input type="text" class="form-control form-control-sm kolom-sales" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="date" class="form-control form-control-sm" /></td>
                <td><input type="date" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm uang-input" /></td>
                <td><input type="text" class="form-control form-control-sm uang-input" /></td>
                <td><input type="text" class="form-control form-control-sm uang-input" /></td>
                <td><input type="text" class="form-control form-control-sm uang-input" /></td>
                <td><input type="text" class="form-control form-control-sm" /></td>
                <td><input type="text" class="form-control form-control-sm total-baris" readonly style="font-weight:700;background:#f1f3f4;" /></td>
                <td class="text-center"><button class="btn-hapus-baris" title="Hapus baris">&times;</button></td>
            `;
            return tr;
        }

        function rebuildGroupTotals(tbodyId) {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;
            tbody.querySelectorAll('tr.group-subtotal, tr.row-spacer').forEach(r => r.remove());

            const dataRows = Array.from(tbody.querySelectorAll('tr')).filter(
                tr => !tr.classList.contains('group-subtotal') && !tr.classList.contains('row-spacer')
            );
            if (dataRows.length === 0) return;

            const groups = [];
            let current = null;
            dataRows.forEach(tr => {
                const salesInput = tr.querySelector('.kolom-sales');
                const val = salesInput ? salesInput.value.trim() : '';
                if (!current || current.key !== val) {
                    current = { key: val, rows: [] };
                    groups.push(current);
                }
                current.rows.push(tr);
            });

            groups.forEach((g, gi) => {
                if (!g.key) return;
                let sumMC = 0,
                    sumMT = 0,
                    sumRC = 0,
                    sumRT = 0;
                g.rows.forEach(tr => {
                    const inputs = tr.querySelectorAll('.uang-input');
                    if (inputs.length >= 4) {
                        sumMC += parseAngka(inputs[0].value);
                        sumMT += parseAngka(inputs[1].value);
                        sumRC += parseAngka(inputs[2].value);
                        sumRT += parseAngka(inputs[3].value);
                    }
                });
                const grand = sumMC + sumMT + sumRC + sumRT;
                const subtotalTr = document.createElement('tr');
                subtotalTr.className = 'group-subtotal';
                subtotalTr.innerHTML = `
                    <td colspan="8" class="text-end">TOTAL</td>
                    <td>${formatAngka(sumMC)}</td>
                    <td>${formatAngka(sumMT)}</td>
                    <td>${formatAngka(sumRC)}</td>
                    <td>${formatAngka(sumRT)}</td>
                    <td></td>
                    <td>${formatAngka(grand)}</td>
                    <td></td>
                `;
                const lastRow = g.rows[g.rows.length - 1];
                lastRow.after(subtotalTr);

                const isLast = gi === groups.length - 1;
                if (!isLast) {
                    const spacer = document.createElement('tr');
                    spacer.className = 'row-spacer';
                    spacer.innerHTML = `<td colspan="15"></td>`;
                    subtotalTr.after(spacer);
                }
            });
        }

        function hitungTotalBaris(tr) {
            const inputs = tr.querySelectorAll('.uang-input');
            let total = 0;
            inputs.forEach(inp => {
                total += parseAngka(inp.value);
            });
            const totalField = tr.querySelector('.total-baris');
            if (totalField) totalField.value = formatAngka(total);
            return total;
        }

        function hitungTotalKolom(tbodyId, totalMinyakCashId, totalMinyakTransferId, totalRupaCashId, totalRupaTransferId,
            totalGrandId) {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;
            let sumMC = 0,
                sumMT = 0,
                sumRC = 0,
                sumRT = 0;
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(tr => {
                const inputs = tr.querySelectorAll('.uang-input');
                if (inputs.length >= 4) {
                    sumMC += parseAngka(inputs[0].value);
                    sumMT += parseAngka(inputs[1].value);
                    sumRC += parseAngka(inputs[2].value);
                    sumRT += parseAngka(inputs[3].value);
                }
            });
            document.getElementById(totalMinyakCashId).value = formatAngka(sumMC);
            document.getElementById(totalMinyakTransferId).value = formatAngka(sumMT);
            document.getElementById(totalRupaCashId).value = formatAngka(sumRC);
            document.getElementById(totalRupaTransferId).value = formatAngka(sumRT);
            const grand = sumMC + sumMT + sumRC + sumRT;
            document.getElementById(totalGrandId).value = formatAngka(grand);
            return { sumMC, sumMT, sumRC, sumRT, grand };
        }

        function hitungRingkasan() {
            const p = hitungTotalKolom('piutangInputBody', 'piutangTotalMinyakCash', 'piutangTotalMinyakTransfer',
                'piutangTotalRupaCash', 'piutangTotalRupaTransfer', 'piutangTotalGrand');
            const c = hitungTotalKolom('cashInputBody', 'cashTotalMinyakCash', 'cashTotalMinyakTransfer',
                'cashTotalRupaCash', 'cashTotalRupaTransfer', 'cashTotalGrand');

            const pMC = p ? p.sumMC : 0,
                pMT = p ? p.sumMT : 0,
                pRC = p ? p.sumRC : 0,
                pRT = p ? p.sumRT : 0;
            const cMC = c ? c.sumMC : 0,
                cMT = c ? c.sumMT : 0,
                cRC = c ? c.sumRC : 0,
                cRT = c ? c.sumRT : 0;

            document.getElementById('ringkasanPiutangMinyakCash').value = formatAngka(pMC);
            document.getElementById('ringkasanPiutangMinyakTransfer').value = formatAngka(pMT);
            document.getElementById('ringkasanPiutangRupaCash').value = formatAngka(pRC);
            document.getElementById('ringkasanPiutangRupaTransfer').value = formatAngka(pRT);
            document.getElementById('ringkasanPiutangTotal').value = formatAngka(pMC + pMT + pRC + pRT);

            document.getElementById('ringkasanCashMinyakCash').value = formatAngka(cMC);
            document.getElementById('ringkasanCashMinyakTransfer').value = formatAngka(cMT);
            document.getElementById('ringkasanCashRupaCash').value = formatAngka(cRC);
            document.getElementById('ringkasanCashRupaTransfer').value = formatAngka(cRT);
            document.getElementById('ringkasanCashTotal').value = formatAngka(cMC + cMT + cRC + cRT);

            const tMC = pMC + cMC,
                tMT = pMT + cMT,
                tRC = pRC + cRC,
                tRT = pRT + cRT;
            document.getElementById('ringkasanTotalMinyakCash').value = formatAngka(tMC);
            document.getElementById('ringkasanTotalMinyakTransfer').value = formatAngka(tMT);
            document.getElementById('ringkasanTotalRupaCash').value = formatAngka(tRC);
            document.getElementById('ringkasanTotalRupaTransfer').value = formatAngka(tRT);

            const totalCash = tMC + tRC;
            const totalTransfer = tMT + tRT;
            document.getElementById('ringkasanTotalCash').value = formatAngka(totalCash);
            document.getElementById('ringkasanTotalTransfer').value = formatAngka(totalTransfer);
            const grandTotalEl = document.getElementById('ringkasanGrandTotal');
            if (grandTotalEl) grandTotalEl.value = formatAngka(totalCash + totalTransfer);

            const totalRows = document.querySelectorAll('#piutangInputBody tr:not(.group-subtotal):not(.row-spacer)').length +
                document.querySelectorAll('#cashInputBody tr:not(.group-subtotal):not(.row-spacer)').length;
            const recordCountEl = document.getElementById('recordCount');
            if (recordCountEl) recordCountEl.textContent = totalRows + ' baris';
            document.getElementById('badgePembayaran').textContent = totalRows;
        }

        // ================================================================
        // AUTO-SAVE TAB PEMBAYARAN (Input Harian)
        // Supaya perubahan TIDAK HILANG saat pindah tanggal atau refresh,
        // perubahan disimpan otomatis (debounced) & di-flush sebelum
        // pindah tanggal / menutup halaman.
        // ================================================================
        let _statusFlashTimeout = null;
        function tampilkanStatusTersimpan(silent) {
            const el = document.getElementById('inputHarianSourceStatus');
            if (!el) return;
            el.classList.remove('status-flash-manual', 'status-flash-auto');
            // Memaksa reflow supaya animasi bisa berulang walau kelasnya sama
            // seperti sebelumnya (di-restart dari awal tiap kali dipanggil).
            void el.offsetWidth;
            el.classList.add(silent ? 'status-flash-auto' : 'status-flash-manual');
            if (_statusFlashTimeout) clearTimeout(_statusFlashTimeout);
            _statusFlashTimeout = setTimeout(function() {
                el.classList.remove('status-flash-manual', 'status-flash-auto');
            }, 2200);
        }

        let inputHarianDirty = false;
        const autoSimpanHarianDebounced = debounce(function() {
            simpanDataHarian(true);
        }, 3500); // dinaikkan dari 1500ms — kurangi frekuensi tulis ke server saat mengetik

        function tandaiInputHarianBerubah() {
            inputHarianDirty = true;
            autoSimpanHarianDebounced();
        }

        async function flushSimpanHarianJikaBerubah() {
            if (inputHarianDirty) {
                await simpanDataHarian(true);
            }
        }

        function setupInputListeners() {
            document.querySelector('#piutangInputBody').addEventListener('input', function(e) {
                const target = e.target;
                if (target.classList.contains('uang-input') || target.classList.contains('total-baris')) {
                    const tr = target.closest('tr');
                    if (tr) hitungTotalBaris(tr);
                    hitungTotalKolom('piutangInputBody', 'piutangTotalMinyakCash', 'piutangTotalMinyakTransfer',
                        'piutangTotalRupaCash', 'piutangTotalRupaTransfer', 'piutangTotalGrand');
                    rebuildGroupTotals('piutangInputBody');
                    hitungRingkasan();
                } else if (target.classList.contains('kolom-sales')) {
                    rebuildGroupTotals('piutangInputBody');
                }
                tandaiInputHarianBerubah();
            });

            document.querySelector('#cashInputBody').addEventListener('input', function(e) {
                const target = e.target;
                if (target.classList.contains('uang-input') || target.classList.contains('total-baris')) {
                    const tr = target.closest('tr');
                    if (tr) hitungTotalBaris(tr);
                    hitungTotalKolom('cashInputBody', 'cashTotalMinyakCash', 'cashTotalMinyakTransfer',
                        'cashTotalRupaCash', 'cashTotalRupaTransfer', 'cashTotalGrand');
                    rebuildGroupTotals('cashInputBody');
                    hitungRingkasan();
                } else if (target.classList.contains('kolom-sales')) {
                    rebuildGroupTotals('cashInputBody');
                }
                tandaiInputHarianBerubah();
            });

            document.querySelector('#piutangInputBody').addEventListener('click', function(e) {
                if (e.target.classList.contains('btn-hapus-baris')) {
                    const tr = e.target.closest('tr');
                    const jumlahData = document.querySelectorAll('#piutangInputBody tr:not(.group-subtotal):not(.row-spacer)')
                        .length;
                    if (tr && jumlahData > 1) {
                        if (confirm('Hapus baris ini?')) {
                            tr.remove();
                            renumberRows('piutangInputBody');
                            hitungTotalKolom('piutangInputBody', 'piutangTotalMinyakCash',
                                'piutangTotalMinyakTransfer', 'piutangTotalRupaCash',
                                'piutangTotalRupaTransfer', 'piutangTotalGrand');
                            rebuildGroupTotals('piutangInputBody');
                            hitungRingkasan();
                            tandaiInputHarianBerubah();
                        }
                    } else {
                        alert('Harus ada minimal 1 baris.');
                    }
                }
            });

            document.querySelector('#cashInputBody').addEventListener('click', function(e) {
                if (e.target.classList.contains('btn-hapus-baris')) {
                    const tr = e.target.closest('tr');
                    const jumlahData = document.querySelectorAll('#cashInputBody tr:not(.group-subtotal):not(.row-spacer)')
                        .length;
                    if (tr && jumlahData > 1) {
                        if (confirm('Hapus baris ini?')) {
                            tr.remove();
                            renumberRows('cashInputBody');
                            hitungTotalKolom('cashInputBody', 'cashTotalMinyakCash',
                                'cashTotalMinyakTransfer', 'cashTotalRupaCash',
                                'cashTotalRupaTransfer', 'cashTotalGrand');
                            rebuildGroupTotals('cashInputBody');
                            hitungRingkasan();
                            tandaiInputHarianBerubah();
                        }
                    } else {
                        alert('Harus ada minimal 1 baris.');
                    }
                }
            });
        }

        function renumberRows(tbodyId) {
            const tbody = document.getElementById(tbodyId);
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr')).filter(
                tr => !tr.classList.contains('group-subtotal') && !tr.classList.contains('row-spacer')
            );
            rows.forEach((tr, idx) => {
                const td = tr.querySelector('td:first-child');
                if (td) td.textContent = idx + 1;
            });
        }

        function tambahBaris(target) {
            const tbody = document.getElementById(target === 'piutang' ? 'piutangInputBody' : 'cashInputBody');
            if (!tbody) return;
            const count = tbody.querySelectorAll('tr:not(.group-subtotal):not(.row-spacer)').length + 1;
            const tr = target === 'piutang' ? buatBarisPiutang(count) : buatBarisCash(count);
            tbody.appendChild(tr);
            if (target === 'piutang') {
                hitungTotalKolom('piutangInputBody', 'piutangTotalMinyakCash', 'piutangTotalMinyakTransfer',
                    'piutangTotalRupaCash', 'piutangTotalRupaTransfer', 'piutangTotalGrand');
                rebuildGroupTotals('piutangInputBody');
            } else {
                hitungTotalKolom('cashInputBody', 'cashTotalMinyakCash', 'cashTotalMinyakTransfer',
                    'cashTotalRupaCash', 'cashTotalRupaTransfer', 'cashTotalGrand');
                rebuildGroupTotals('cashInputBody');
            }
            hitungRingkasan();
            tandaiInputHarianBerubah();
        }

        // ================================================================
        // MODAL INPUT MANUAL (TAB PEMBAYARAN)
        // ================================================================
        let imTarget = 'piutang';

        function imHitungTotalPreview() {
            const total = parseAngka(document.getElementById('imMinyakCash').value) +
                parseAngka(document.getElementById('imMinyakTransfer').value) +
                parseAngka(document.getElementById('imRupaCash').value) +
                parseAngka(document.getElementById('imRupaTransfer').value);
            document.getElementById('imTotalPreview').textContent = 'Rp ' + formatAngka(total);
            return total;
        }

        function imSetTarget(target) {
            imTarget = target;
            document.getElementById('imTargetPiutang').classList.toggle('active', target === 'piutang');
            document.getElementById('imTargetCash').classList.toggle('active', target === 'cash');
            document.getElementById('imLabelSales').textContent = target === 'piutang' ? 'Sales' : 'Dropping/Sales';
            document.getElementById('imLabelTagihan').textContent = target === 'piutang' ? 'Tagihan' :
                'Nominal Faktur';
        }

        function imResetForm() {
            document.getElementById('imForm').reset();
            document.getElementById('imTglFaktur').value = document.getElementById('tanggalHarian').value || '';
            imHitungTotalPreview();
        }

        function imOpenModal() {
            imResetForm();
            imSetTarget('piutang');
            document.getElementById('harianInputManualModal').classList.add('show');
            document.getElementById('imNoFaktur').focus();
        }

        function imCloseModal() {
            document.getElementById('harianInputManualModal').classList.remove('show');
        }

        document.getElementById('btnInputManualHarian').addEventListener('click', function() {
            document.getElementById('harianMenuDropdown').classList.remove('active');
            imOpenModal();
        });
        document.getElementById('imClose').addEventListener('click', imCloseModal);
        document.getElementById('imBatal').addEventListener('click', imCloseModal);
        document.getElementById('imTargetPiutang').addEventListener('click', function() {
            imSetTarget('piutang');
        });
        document.getElementById('imTargetCash').addEventListener('click', function() {
            imSetTarget('cash');
        });
        ['imMinyakCash', 'imMinyakTransfer', 'imRupaCash', 'imRupaTransfer'].forEach(function(id) {
            document.getElementById(id).addEventListener('input', imHitungTotalPreview);
        });

        document.getElementById('imSimpan').addEventListener('click', function() {
            const noFaktur = document.getElementById('imNoFaktur').value.trim();
            const namaToko = document.getElementById('imNamaToko').value.trim();
            if (!noFaktur && !namaToko) {
                showToast('⚠️ Isi minimal No Faktur atau Nama Toko dulu.', 'warning');
                return;
            }

            const tbodyId = imTarget === 'piutang' ? 'piutangInputBody' : 'cashInputBody';
            const tbody = document.getElementById(tbodyId);
            const count = tbody.querySelectorAll('tr:not(.group-subtotal):not(.row-spacer)').length + 1;
            const tr = imTarget === 'piutang' ? buatBarisPiutang(count) : buatBarisCash(count);
            tbody.appendChild(tr);

            const inputs = tr.querySelectorAll('input');
            // Urutan: 0 sales, 1 no_faktur, 2 nama_toko, 3 alamat, 4 tgl_faktur, 5 jt,
            // 6 tagihan, 7 minyak_cash, 8 minyak_transfer, 9 rupa_cash, 10 rupa_transfer, 11 ket
            inputs[0].value = document.getElementById('imSales').value.trim();
            inputs[1].value = noFaktur;
            inputs[2].value = namaToko;
            inputs[3].value = document.getElementById('imAlamat').value.trim();
            inputs[4].value = document.getElementById('imTglFaktur').value;
            inputs[5].value = document.getElementById('imJt').value;
            inputs[6].value = formatAngka(parseAngka(document.getElementById('imTagihan').value));
            inputs[7].value = formatAngka(parseAngka(document.getElementById('imMinyakCash').value));
            inputs[8].value = formatAngka(parseAngka(document.getElementById('imMinyakTransfer').value));
            inputs[9].value = formatAngka(parseAngka(document.getElementById('imRupaCash').value));
            inputs[10].value = formatAngka(parseAngka(document.getElementById('imRupaTransfer').value));
            inputs[11].value = document.getElementById('imKet').value.trim();
            hitungTotalBaris(tr);

            if (imTarget === 'piutang') {
                hitungTotalKolom('piutangInputBody', 'piutangTotalMinyakCash', 'piutangTotalMinyakTransfer',
                    'piutangTotalRupaCash', 'piutangTotalRupaTransfer', 'piutangTotalGrand');
                rebuildGroupTotals('piutangInputBody');
            } else {
                hitungTotalKolom('cashInputBody', 'cashTotalMinyakCash', 'cashTotalMinyakTransfer',
                    'cashTotalRupaCash', 'cashTotalRupaTransfer', 'cashTotalGrand');
                rebuildGroupTotals('cashInputBody');
            }
            hitungRingkasan();
            tandaiInputHarianBerubah();

            tr.scrollIntoView({ behavior: 'smooth', block: 'center' });
            showToast(`✅ Baris ${imTarget === 'piutang' ? 'Piutang Tempo' : 'Cash Dropping'} berhasil ditambahkan.`,
                'success');
            imCloseModal();
        });

        async function simpanDataHarian(silent) {
            const tgl = document.getElementById('tanggalHarian').value;
            if (!tgl) { alert('Pilih tanggal terlebih dahulu.'); return; }

            const data = {
                tanggal: tgl,
                piutang: [],
                cash: []
            };

            const piutangRows = document.querySelectorAll('#piutangInputBody tr:not(.group-subtotal):not(.row-spacer)');
            piutangRows.forEach(tr => {
                const inputs = tr.querySelectorAll('input');
                if (inputs.length >= 13) {
                    data.piutang.push({
                        sales: inputs[0].value,
                        no_faktur: inputs[1].value,
                        nama_toko: inputs[2].value,
                        alamat: inputs[3].value,
                        tgl_faktur: inputs[4].value,
                        jt: inputs[5].value,
                        tagihan: inputs[6].value,
                        minyak_cash: inputs[7].value,
                        minyak_transfer: inputs[8].value,
                        rupa_cash: inputs[9].value,
                        rupa_transfer: inputs[10].value,
                        ket: inputs[11].value,
                    });
                }
            });

            const cashRows = document.querySelectorAll('#cashInputBody tr:not(.group-subtotal):not(.row-spacer)');
            cashRows.forEach(tr => {
                const inputs = tr.querySelectorAll('input');
                if (inputs.length >= 13) {
                    data.cash.push({
                        dropping_sales: inputs[0].value,
                        no_faktur: inputs[1].value,
                        nama_toko: inputs[2].value,
                        alamat: inputs[3].value,
                        tgl_faktur: inputs[4].value,
                        jt: inputs[5].value,
                        nominal_faktur: inputs[6].value,
                        minyak_cash: inputs[7].value,
                        minyak_transfer: inputs[8].value,
                        rupa_cash: inputs[9].value,
                        rupa_transfer: inputs[10].value,
                        ket: inputs[11].value,
                    });
                }
            });

            const key = 'inputHarian_' + tgl;
            inputHarianDirty = false;
            // Cadangan lokal (jaring pengaman jika server/koneksi bermasalah)
            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (e) {
                console.warn('Gagal cadangan lokal:', e);
            }

            // Simpan permanen ke penyimpanan lokal (IndexedDB) perangkat ini
            try {
                const existing = await db.inputHarian.where('tanggal').equals(tgl).first();
                if (existing) {
                    await db.inputHarian.update(existing.id, { data: data, updatedAt: new Date().toISOString() });
                } else {
                    await db.inputHarian.add({ tanggal: tgl, data: data, updatedAt: new Date().toISOString() });
                }
                const jamSimpan = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                document.getElementById('inputHarianSourceStatus').textContent =
                    (silent ? '💾 Tersimpan otomatis · ' : '✅ Tersimpan · ') + jamSimpan;
                if (!silent) showToast('✅ Data untuk tanggal ' + tgl + ' berhasil disimpan!', 'success');
                tampilkanStatusTersimpan(silent);
            } catch (e) {
                document.getElementById('inputHarianSourceStatus').textContent = '⚠️ Gagal menyimpan data untuk tanggal ' + tgl;
                showToast('⚠️ Gagal menyimpan data: ' + e.message, 'warning');
            }

            try {
                await syncInputHarianKeUangMasuk(tgl);
            } catch (e) {
                showToast('⚠️ Data tersimpan, tapi gagal memperbarui Data Uang Masuk: ' + e.message, 'warning');
            }
        }

        async function syncInputHarianKeUangMasuk(tgl) {
            const [y, m, d] = tgl.split('-');
            const bulanKey = `${y}-${m}`;
            const tanggalKey = `${d}-${m}`;

            function bacaDetail(tbodyId) {
                const list = [];
                document.querySelectorAll(`#${tbodyId} tr:not(.group-subtotal):not(.row-spacer)`).forEach((tr, idx) => {
                    const inputs = tr.querySelectorAll('input');
                    if (inputs.length < 12) return;
                    const noFaktur = inputs[1].value.trim();
                    const minyakCash = parseAngka(inputs[7].value);
                    const minyakTransfer = parseAngka(inputs[8].value);
                    const rupaCash = parseAngka(inputs[9].value);
                    const rupaTransfer = parseAngka(inputs[10].value);
                    const bayarCash = minyakCash + rupaCash;
                    const bayarTransfer = minyakTransfer + rupaTransfer;
                    if (!noFaktur && bayarCash === 0 && bayarTransfer === 0) return;
                    list.push({
                        no: idx + 1,
                        sales: inputs[0].value,
                        noFaktur: noFaktur,
                        namaToko: inputs[2].value,
                        alamat: inputs[3].value,
                        tglFaktur: inputs[4].value,
                        jt: inputs[5].value,
                        tagihan: parseAngka(inputs[6].value),
                        // PENTING: simpan split Minyak/Rupa-Rupa terpisah (bukan cuma
                        // digabung ke bayarCash/bayarTransfer), supaya kalau Data Uang
                        // Masuk ini ditarik ulang ke tab Pembayaran nanti, split-nya
                        // tidak hilang/ketimpa jadi tergabung semua ke kolom Minyak.
                        minyakCash,
                        minyakTransfer,
                        rupaCash,
                        rupaTransfer,
                        bayarCash,
                        bayarTransfer,
                        totalBayar: bayarCash + bayarTransfer,
                        ket: inputs[11].value
                    });
                });
                return list;
            }

            const piutangDetail = bacaDetail('piutangInputBody');
            const cashDroppingDetail = bacaDetail('cashInputBody');

            const sum = (arr, key) => arr.reduce((s, it) => s + (it[key] || 0), 0);
            const piutangCash = sum(piutangDetail, 'bayarCash');
            const piutangTransfer = sum(piutangDetail, 'bayarTransfer');
            const penjualanCash = sum(cashDroppingDetail, 'bayarCash');
            const penjualanTransfer = sum(cashDroppingDetail, 'bayarTransfer');
            const totalCash = piutangCash + penjualanCash;
            const totalTransfer = piutangTransfer + penjualanTransfer;
            const grandTotal = totalCash + totalTransfer;

            const dayRecord = { tanggal: tanggalKey, piutangCash, piutangTransfer, penjualanCash, penjualanTransfer,
                totalCash, totalTransfer, grandTotal, piutangDetail, cashDroppingDetail };

            // Simpan data harian ke IndexedDB lokal: baca data bulan ini,
            // gabungkan/ganti hari yang bersangkutan, lalu tulis balik.
            {
                let list;
                try {
                    const rec = await db.cashIncome.where('bulan').equals(bulanKey).first();
                    list = rec ? (rec.data || []) : [];
                } catch (e) { list = cashDataMap[bulanKey] || []; }
                const existingIdx = list.findIndex(it => normDDMM(it.tanggal) === normDDMM(tanggalKey));
                if (existingIdx >= 0) list[existingIdx] = dayRecord; else list.push(dayRecord);
                cashDataMap[bulanKey] = list;

                const existing = await db.cashIncome.where('bulan').equals(bulanKey).first();
                if (existing) {
                    await db.cashIncome.update(existing.id, { data: list, tanggal: new Date().toISOString() });
                } else {
                    await db.cashIncome.add({ bulan: bulanKey, data: list, tanggal: new Date().toISOString() });
                }
            }

            if (bulanKey === cashBulan) {
                await loadCashData();
                renderPemasukan();
            }
            const tab3Aktif = document.getElementById('tab3').classList.contains('active');
            const tab4Aktif = document.getElementById('tab4').classList.contains('active');
            if (tab3Aktif) renderCek();
            if (tab4Aktif) await ptRefresh(false);
            // Tampilkan notifikasi "Data baru masuk" di tab yang SEDANG TIDAK dibuka,
            // supaya saat user pindah ke tab tersebut mereka tahu ada data baru dari
            // input manual Tab Pembayaran dan perlu klik "Muat Ulang".
            if (!tab3Aktif) tampilkanNotifDataBaru('cash');
            if (!tab4Aktif) tampilkanNotifDataBaru('piutang');
        }

        function tglExcelKeISO(str) {
            if (!str) return '';
            const s = String(str).trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
            const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
            if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
            return '';
        }

        // Format tanggal jadi "SABTU 11/07/2026" (nama hari Indonesia + dd/mm/yyyy),
        // supaya tampilan/cetak tab Pembayaran sama persis seperti judul kanan-atas
        // di file Excel aslinya.
        function formatTanggalHarianIndo(isoDateStr) {
            if (!isoDateStr) return '';
            const [y, m, d] = isoDateStr.split('-').map(Number);
            if (!y || !m || !d) return '';
            const dt = new Date(y, m - 1, d);
            const namaHari = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT', 'SABTU'][dt.getDay()];
            const dd = String(d).padStart(2, '0');
            const mm = String(m).padStart(2, '0');
            return `${namaHari} ${dd}/${mm}/${y}`;
        }
        function updateTglHarianFormatted() {
            const tgl = document.getElementById('tanggalHarian').value;
            const el = document.getElementById('tglHarianFormatted');
            if (el) el.textContent = formatTanggalHarianIndo(tgl);
        }

        async function ambilDariUangMasuk(tgl) {
            const [y, m, d] = tgl.split('-');
            const bulanKey = `${y}-${m}`;
            const tanggalKey = `${d}-${m}`;
            let list;
            try {
                const rec = await db.cashIncome.where('bulan').equals(bulanKey).first();
                list = rec ? (rec.data || []) : [];
            } catch (e) { return null; }

            const day = list.find(it => normDDMM(it.tanggal) === normDDMM(tanggalKey));
            if (!day) return null;

            const piutang = (day.piutangDetail || []).map(it => ({
                sales: it.sales || '',
                no_faktur: it.noFaktur || '',
                nama_toko: it.namaToko || '',
                alamat: it.alamat || '',
                tgl_faktur: tglExcelKeISO(it.tglFaktur),
                jt: tglExcelKeISO(it.jt),
                tagihan: it.tagihan || '',
                // Pakai data Minyak/Rupa-Rupa yang sudah terpisah (data baru).
                // Kalau data lama (sebelum perbaikan ini) belum punya field ini,
                // fallback ke cara lama supaya tidak error (tapi tetap kumpul di Minyak).
                minyak_cash: (it.minyakCash !== undefined) ? it.minyakCash : (it.bayarCash || ''),
                minyak_transfer: (it.minyakTransfer !== undefined) ? it.minyakTransfer : (it.bayarTransfer || ''),
                rupa_cash: (it.rupaCash !== undefined) ? it.rupaCash : '',
                rupa_transfer: (it.rupaTransfer !== undefined) ? it.rupaTransfer : '',
                ket: it.ket || '',
            }));
            const cash = (day.cashDroppingDetail || []).map(it => ({
                dropping_sales: it.sales || '',
                no_faktur: it.noFaktur || '',
                nama_toko: it.namaToko || '',
                alamat: it.alamat || '',
                tgl_faktur: tglExcelKeISO(it.tglFaktur),
                jt: tglExcelKeISO(it.jt),
                nominal_faktur: it.tagihan || '',
                minyak_cash: (it.minyakCash !== undefined) ? it.minyakCash : (it.bayarCash || ''),
                minyak_transfer: (it.minyakTransfer !== undefined) ? it.minyakTransfer : (it.bayarTransfer || ''),
                rupa_cash: (it.rupaCash !== undefined) ? it.rupaCash : '',
                rupa_transfer: (it.rupaTransfer !== undefined) ? it.rupaTransfer : '',
                ket: it.ket || '',
            }));

            if (piutang.length === 0 && cash.length === 0) return null;
            return { tanggal: tgl, piutang, cash };
        }

        async function muatDataHarian() {
            const tgl = document.getElementById('tanggalHarian').value;
            if (!tgl) { alert('Pilih tanggal terlebih dahulu.'); return; }
            inputHarianDirty = false;

            const key = 'inputHarian_' + tgl;
            let data;
            let sumber = null; // 'tersimpan' | 'lokal' | 'uangmasuk'
            try {
                let dariPenyimpanan = null;
                try {
                    const rec = await db.inputHarian.where('tanggal').equals(tgl).first();
                    if (rec && rec.data) dariPenyimpanan = rec.data;
                } catch (e) {
                    console.warn('Gagal ambil data harian tersimpan:', e);
                }

                if (dariPenyimpanan) {
                    data = dariPenyimpanan;
                    sumber = 'tersimpan';
                } else {
                    const stored = localStorage.getItem(key);
                    if (stored) {
                        data = JSON.parse(stored);
                        sumber = 'lokal';
                    } else {
                        const fallback = await ambilDariUangMasuk(tgl);
                        if (fallback) {
                            data = fallback;
                            sumber = 'uangmasuk';
                        } else {
                            resetToDefaultHarian(tgl);
                            document.getElementById('inputHarianSourceStatus').textContent = '';
                            return;
                        }
                    }
                }
            } catch (e) {
                alert('Gagal memuat data: ' + e.message);
                return;
            }

            const piutangBody = document.getElementById('piutangInputBody');
            const cashBody = document.getElementById('cashInputBody');
            piutangBody.innerHTML = '';
            cashBody.innerHTML = '';

            if (data.piutang && data.piutang.length > 0) {
                data.piutang.forEach((item, idx) => {
                    const tr = buatBarisPiutang(idx + 1);
                    const inputs = tr.querySelectorAll('input');
                    if (inputs.length >= 13) {
                        inputs[0].value = item.sales || '';
                        inputs[1].value = item.no_faktur || '';
                        inputs[2].value = item.nama_toko || '';
                        inputs[3].value = item.alamat || '';
                        inputs[4].value = item.tgl_faktur || '';
                        inputs[5].value = item.jt || '';
                        inputs[6].value = item.tagihan || '';
                        inputs[7].value = item.minyak_cash || '';
                        inputs[8].value = item.minyak_transfer || '';
                        inputs[9].value = item.rupa_cash || '';
                        inputs[10].value = item.rupa_transfer || '';
                        inputs[11].value = item.ket || '';
                    }
                    piutangBody.appendChild(tr);
                });
            } else {
                piutangBody.appendChild(buatBarisPiutang(1));
            }

            if (data.cash && data.cash.length > 0) {
                data.cash.forEach((item, idx) => {
                    const tr = buatBarisCash(idx + 1);
                    const inputs = tr.querySelectorAll('input');
                    if (inputs.length >= 13) {
                        inputs[0].value = item.dropping_sales || '';
                        inputs[1].value = item.no_faktur || '';
                        inputs[2].value = item.nama_toko || '';
                        inputs[3].value = item.alamat || '';
                        inputs[4].value = item.tgl_faktur || '';
                        inputs[5].value = item.jt || '';
                        inputs[6].value = item.nominal_faktur || '';
                        inputs[7].value = item.minyak_cash || '';
                        inputs[8].value = item.minyak_transfer || '';
                        inputs[9].value = item.rupa_cash || '';
                        inputs[10].value = item.rupa_transfer || '';
                        inputs[11].value = item.ket || '';
                    }
                    cashBody.appendChild(tr);
                });
            } else {
                cashBody.appendChild(buatBarisCash(1));
            }

            piutangBody.querySelectorAll('tr:not(.group-subtotal):not(.row-spacer)').forEach(tr => hitungTotalBaris(tr));
            cashBody.querySelectorAll('tr:not(.group-subtotal):not(.row-spacer)').forEach(tr => hitungTotalBaris(tr));
            hitungTotalKolom('piutangInputBody', 'piutangTotalMinyakCash', 'piutangTotalMinyakTransfer',
                'piutangTotalRupaCash', 'piutangTotalRupaTransfer', 'piutangTotalGrand');
            hitungTotalKolom('cashInputBody', 'cashTotalMinyakCash', 'cashTotalMinyakTransfer',
                'cashTotalRupaCash', 'cashTotalRupaTransfer', 'cashTotalGrand');
            rebuildGroupTotals('piutangInputBody');
            rebuildGroupTotals('cashInputBody');
            hitungRingkasan();

            document.getElementById('inputHarianSourceStatus').textContent =
                sumber === 'uangmasuk' ? '📊 Data ditarik dari Data Uang Masuk untuk tanggal ' + tgl + ' — cek/perbaiki split Minyak vs Rupa-rupa lalu Simpan.' :
                sumber === 'tersimpan' ? '💾 Data tersimpan untuk tanggal ' + tgl :
                '💾 Data dari cadangan lokal (localStorage) untuk tanggal ' + tgl;
            updateTglHarianFormatted();
        }

        function resetToDefaultHarian(tgl) {
            inputHarianDirty = false;
            const piutangBody = document.getElementById('piutangInputBody');
            const cashBody = document.getElementById('cashInputBody');
            piutangBody.innerHTML = '';
            cashBody.innerHTML = '';
            piutangBody.appendChild(buatBarisPiutang(1));
            cashBody.appendChild(buatBarisCash(1));
            hitungTotalKolom('piutangInputBody', 'piutangTotalMinyakCash', 'piutangTotalMinyakTransfer',
                'piutangTotalRupaCash', 'piutangTotalRupaTransfer', 'piutangTotalGrand');
            hitungTotalKolom('cashInputBody', 'cashTotalMinyakCash', 'cashTotalMinyakTransfer',
                'cashTotalRupaCash', 'cashTotalRupaTransfer', 'cashTotalGrand');
            rebuildGroupTotals('piutangInputBody');
            rebuildGroupTotals('cashInputBody');
            hitungRingkasan();
            document.getElementById('inputHarianSourceStatus').textContent = tgl ? '📭 Data direset untuk tanggal ' + tgl : '';
            updateTglHarianFormatted();
            if (tgl) {
                const key = 'inputHarian_' + tgl;
                localStorage.removeItem(key);
                (async () => {
                    try {
                        const existing = await db.inputHarian.where('tanggal').equals(tgl).first();
                        if (existing) await db.inputHarian.delete(existing.id);
                    } catch (e) {
                        console.warn('Gagal hapus data harian di server:', e);
                    }
                })();
            }
        }

        // Baca semua baris dari tabel Piutang Tempo / Cash Dropping di tab
        // Pembayaran, LENGKAP dengan split Minyak/Rupa-Rupa — dipakai untuk
        // menyimpan detail utuh ke Riwayat Cetak (bukan cuma ringkasan teks).
        function bacaBarisHarianUntukRiwayat(tbodyId) {
            const list = [];
            document.querySelectorAll(`#${tbodyId} tr:not(.group-subtotal):not(.row-spacer)`).forEach(tr => {
                const inputs = tr.querySelectorAll('input');
                if (inputs.length < 12) return;
                const noFaktur = inputs[1].value.trim();
                const minyakCash = parseAngka(inputs[7].value);
                const minyakTransfer = parseAngka(inputs[8].value);
                const rupaCash = parseAngka(inputs[9].value);
                const rupaTransfer = parseAngka(inputs[10].value);
                if (!noFaktur && !minyakCash && !minyakTransfer && !rupaCash && !rupaTransfer) return;
                list.push({
                    sales: inputs[0].value,
                    noFaktur: noFaktur,
                    namaToko: inputs[2].value,
                    alamat: inputs[3].value,
                    tglFaktur: inputs[4].value,
                    jt: inputs[5].value,
                    tagihan: parseAngka(inputs[6].value),
                    minyakCash, minyakTransfer, rupaCash, rupaTransfer,
                    ket: inputs[11].value
                });
            });
            return list;
        }

        function initInputHarian() {
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            document.getElementById('tanggalHarian').value = `${y}-${m}-${d}`;

            document.querySelectorAll('#tab7 .add-row-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const target = this.dataset.target;
                    tambahBaris(target);
                });
            });

            document.getElementById('btnSimpanHarian').addEventListener('click', function() { simpanDataHarian(false); });
            document.getElementById('btnMuatHarian').addEventListener('click', muatDataHarian);
            document.getElementById('btnResetHarian').addEventListener('click', function() {
                if (confirm('Reset semua data untuk tanggal ini?')) {
                    resetToDefaultHarian(document.getElementById('tanggalHarian').value);
                }
            });

            document.getElementById('btnPrintHarian').addEventListener('click', function() {
                const tglHarian = document.getElementById('tanggalHarian').value || '-';
                const itemsDetailHarian = {
                    tanggal: tglHarian,
                    piutang: bacaBarisHarianUntukRiwayat('piutangInputBody'),
                    cash: bacaBarisHarianUntukRiwayat('cashInputBody')
                };
                catatRiwayatCetak('Cetak Pembayaran/Input Harian', `Tanggal Harian: ${tglHarian}`, itemsDetailHarian);
                window.print();
            });

            // === TAMPILAN CETAK: nama SALES/DROPPING hanya muncul di baris
            // pertama tiap kelompok (persis seperti sel di-merge di Excel).
            // Nilai asli disimpan sementara & dikembalikan lagi setelah print
            // selesai, supaya tidak mengganggu data/logika pengelompokan.
            let _tab7SavedSalesForPrint = null;
            window.addEventListener('beforeprint', function() {
                if (!document.getElementById('tab7').classList.contains('active')) return;
                _tab7SavedSalesForPrint = [];
                ['piutangInputBody', 'cashInputBody'].forEach(bodyId => {
                    const rows = Array.from(document.querySelectorAll(
                        `#${bodyId} tr:not(.group-subtotal):not(.row-spacer)`));
                    let lastVal = null;
                    rows.forEach(tr => {
                        const inp = tr.querySelector('.kolom-sales');
                        if (!inp) return;
                        _tab7SavedSalesForPrint.push({ inp, val: inp.value });
                        const trimmed = inp.value.trim();
                        if (trimmed !== '' && trimmed === lastVal) {
                            inp.value = '';
                        } else if (trimmed !== '') {
                            lastVal = trimmed;
                        }
                    });
                });
            });
            window.addEventListener('afterprint', function() {
                if (_tab7SavedSalesForPrint) {
                    _tab7SavedSalesForPrint.forEach(({ inp, val }) => { inp.value = val; });
                    _tab7SavedSalesForPrint = null;
                }
            });

            setupInputListeners();
            muatDataHarian();

            document.getElementById('tanggalHarian').addEventListener('change', async function() {
                await flushSimpanHarianJikaBerubah();
                muatDataHarian();
                updateTglHarianFormatted();
            });

            window.addEventListener('beforeunload', function(e) {
                if (inputHarianDirty) {
                    // Coba simpan dulu (tanpa menunggu selesai — browser tidak
                    // menjamin async selesai di beforeunload), lalu tetap
                    // tampilkan peringatan bawaan browser sebagai jaring kedua.
                    try { flushSimpanHarianJikaBerubah(); } catch (e2) {}
                    e.preventDefault();
                    e.returnValue = '';
                }
            });

            // ===== JARING PENGAMAN UTAMA: simpan otomatis begitu halaman
            // disembunyikan (pindah tab/app lain, minimize, atau benar-benar
            // ditutup/komputer dimatikan). 'visibilitychange' → 'hidden' jauh
            // lebih bisa diandalkan daripada 'beforeunload' untuk benar-benar
            // MENJALANKAN penyimpanan (bukan cuma menampilkan peringatan),
            // karena event ini terjadi SEBELUM tab benar-benar ditutup. =====
            document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'hidden' && inputHarianDirty) {
                    flushSimpanHarianJikaBerubah();
                }
            });
            // 'pagehide' sebagai lapisan tambahan (dipicu saat navigasi keluar/
            // menutup tab di banyak browser, termasuk beberapa kasus yang tidak
            // memicu 'visibilitychange').
            window.addEventListener('pagehide', function() {
                if (inputHarianDirty) {
                    try { flushSimpanHarianJikaBerubah(); } catch (e2) {}
                }
            });
        }

        // ================================================================
