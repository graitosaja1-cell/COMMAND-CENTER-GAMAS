        // ================================================================
        // UTILITY
        // ================================================================
        function fmtRp(n) { n = Math.round(parseNumber(n) || 0); return 'Rp ' + n.toLocaleString('id-ID'); }
        function fmtNumOnly(n) { n = Math.round(parseNumber(n) || 0); return n ? n.toLocaleString('id-ID') : ''; }

        // Normalisasi No.Faktur untuk pencocokan antar tab (Bank Data Penjualan <-> Data Uang Masuk).
        // Kenapa perlu: kadang satu sisi No.Faktur ke-import sebagai TEKS (nol di depan tetap ada)
        // sementara sisi lain ke-import sebagai ANGKA (nol di depan hilang). Dibandingkan dengan
        // "===" string biasa, dua No.Faktur yg sebenarnya sama jadi dianggap beda -> status
        // "Lunas"/pencocokan Data Uang Masuk gagal padahal datanya ada.
        function normFaktur(v) {
            return String(v || '').trim().toLowerCase().replace(/[\s\-.]/g, '').replace(/^0+(?=\d)/, '');
        }

        // Normalisasi kode tanggal harian "D-M" / "DD-MM" (dipakai di dalam data Data Uang Masuk)
        // jadi selalu "DD-MM" dengan nol di depan. Kenapa perlu: sebagian data lama tersimpan
        // tanpa nol di depan (mis. "5-7"), sementara kode lain selalu membaca/menulis dengan nol
        // di depan (mis. "05-07") -> perbandingan "===" gagal utk tanggal2 tsb & tombol Muat
        // jadi terlihat "tidak berfungsi" (padahal cuma gagal ketemu, bukan error).
        function normDDMM(v) {
            const s = String(v || '').trim();
            const m = s.match(/^(\d{1,2})-(\d{1,2})$/);
            if (!m) return s.toLowerCase();
            return m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
        }

        function parseNumber(v) {
            if (v === null || v === undefined || v === '') return 0;
            if (typeof v === 'number') return v;
            if (typeof v === 'string') {
                let clean = v.replace(/\./g, '').replace(/,/g, '.').replace(/[^\d\-.]/g, '');
                if (clean === '') return 0;
                let result = parseFloat(clean);
                return isNaN(result) ? 0 : result;
            }
            return 0;
        }

        const NAMA_BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus',
            'September', 'Oktober', 'November', 'Desember'
        ];

        function fmtBulanTahun(ym) {
            if (!ym) return '';
            const m = String(ym).match(/^(\d{4})-(\d{1,2})$/);
            if (!m) return ym;
            const bulanIdx = parseInt(m[2], 10) - 1;
            const namaBulan = NAMA_BULAN_ID[bulanIdx] || m[2];
            return `${namaBulan} ${m[1]}`;
        }

        function fmtTanggal(iso) {
            if (!iso) return '';
            if (iso.includes('/')) return iso;
            const parts = iso.split('-');
            if (parts.length !== 3) return iso;
            return parts[2] + '/' + parts[1] + '/' + parts[0];
        }

        // Menyingkat tanggal dd/mm/yyyy (atau yyyy-mm-dd) menjadi dd/mm/yy
        function fmtTanggalYY(val) {
            if (!val) return '';
            let s = String(val);
            if (s.includes('/')) {
                const p = s.split('/');
                if (p.length === 3) return p[0] + '/' + p[1] + '/' + p[2].slice(-2);
                return s;
            }
            if (s.includes('-')) {
                const p = s.split('-');
                if (p.length === 3) return p[2] + '/' + p[1] + '/' + p[0].slice(-2);
            }
            return s;
        }

        // Format tanggal harian (disimpan sebagai "DD-MM") jadi dd/mm/yy, mengambil tahun dari kode bulan "YYYY-MM"
        function fmtTanggalHarianYY(tanggalDDMM, bulanYYYYMM) {
            if (!tanggalDDMM) return '';
            const parts = String(tanggalDDMM).split('-');
            if (parts.length < 2) return tanggalDDMM;
            const dd = parts[0].padStart(2, '0');
            const mm = parts[1].padStart(2, '0');
            let yy = '';
            if (bulanYYYYMM) {
                const y = String(bulanYYYYMM).split('-')[0];
                yy = y.slice(-2);
            }
            return yy ? `${dd}/${mm}/${yy}` : `${dd}/${mm}`;
        }

        function toDateKey(iso) {
            if (!iso) return '';
            if (iso.includes('/')) {
                const p = iso.split('/');
                return p[2] + '-' + p[1].padStart(2, '0') + '-' + p[0].padStart(2, '0');
            }
            return iso.slice(0, 10);
        }

        function showToast(msg, type = 'info') {
            const t = document.getElementById('toastGlobal');
            t.textContent = msg;
            t.className = 'toast ' + type;
            void t.offsetWidth;
            t.classList.add('show');
            clearTimeout(t._hideTimer);
            t._hideTimer = setTimeout(() => t.classList.remove('show'), 2800);
        }

        // ================================================================
        // NOTIFIKASI "DATA BARU" di sebelah kiri tombol Muat Ulang
        // (Tab Cek Cash & Tab Cek Piutang). Muncul ketika ada:
        //  1) Upload Excel di Tab Data Uang Masuk (Tab 2)
        //  2) Input manual disimpan di Tab Pembayaran (Tab 7)
        // Notifikasi hilang begitu tombol "Muat Ulang" pada tab terkait diklik.
        // target: 'cash' -> badge di Tab Cek Cash, 'piutang' -> badge di Tab Cek Piutang,
        //         'both'  -> keduanya
        // ================================================================
        function tampilkanNotifDataBaru(target) {
            if (target === 'cash' || target === 'both') {
                const el = document.getElementById('cashDataBaruNotif');
                if (el) el.style.display = 'inline-flex';
            }
            if (target === 'piutang' || target === 'both') {
                const el = document.getElementById('ptDataBaruNotif');
                if (el) el.style.display = 'inline-flex';
            }
        }

        function sembunyikanNotifDataBaru(target) {
            if (target === 'cash' || target === 'both') {
                const el = document.getElementById('cashDataBaruNotif');
                if (el) el.style.display = 'none';
            }
            if (target === 'piutang' || target === 'both') {
                const el = document.getElementById('ptDataBaruNotif');
                if (el) el.style.display = 'none';
            }
        }

        // Mendeteksi teks "mentah" hasil Date.toString() JS, misalnya:
        // "Thu Apr 02 2026 23:59:48 GMT+0700 (Western Indonesia Time)"
        // Ini bisa muncul kalau sumber Excel-nya sendiri sudah salah format
        // (kolom Alamat/Tgl Faktur ketiban nilai Date mentah).
        const RE_TEKS_TANGGAL_MENTAH = /^[A-Za-z]{3}\s[A-Za-z]{3}\s\d{1,2}\s\d{4}\s\d{2}:\d{2}:\d{2}\sGMT/;

        function formatTanggalExcel(v) {
            if (v === undefined || v === null || v === '') return '';
            if (v instanceof Date) {
                const d = String(v.getDate()).padStart(2, '0');
                const m = String(v.getMonth() + 1).padStart(2, '0');
                const y = v.getFullYear();
                return d + '/' + m + '/' + y;
            }
            if (typeof v === 'number') {
                try {
                    const dt = XLSX.SSF.parse_date_code(v);
                    if (dt) return String(dt.d).padStart(2, '0') + '/' + String(dt.m).padStart(2, '0') + '/' + dt.y;
                } catch (e) {}
            }
            if (typeof v === 'string' && RE_TEKS_TANGGAL_MENTAH.test(v.trim())) {
                const parsed = new Date(v);
                if (!isNaN(parsed.getTime())) {
                    const d = String(parsed.getDate()).padStart(2, '0');
                    const m = String(parsed.getMonth() + 1).padStart(2, '0');
                    const y = parsed.getFullYear();
                    return d + '/' + m + '/' + y;
                }
                return '';
            }
            return String(v);
        }

        // Membersihkan nilai kolom Alamat: kalau ternyata isinya objek Date atau
        // teks Date.toString() mentah (bug dari file sumber), jangan ditampilkan
        // apa adanya karena bukan alamat yang valid — kosongkan saja.
        function bersihkanTeksAlamat(v) {
            if (v === undefined || v === null || v === '') return '';
            if (v instanceof Date) return '';
            const s = String(v);
            if (RE_TEKS_TANGGAL_MENTAH.test(s.trim())) return '';
            return s;
        }

        function ambilAngka(row, idx) {
            const v = row[idx];
            if (v === undefined || v === null || v === '') return 0;
            if (typeof v === 'number') return v;
            if (typeof v === 'string') {
                let bersih = v.replace(/\./g, '').replace(',', '.').replace(/[^\d\-.]/g, '');
                if (bersih === '') return 0;
                return parseFloat(bersih) || 0;
            }
            return 0;
        }

        function cariBaris(data, teks) {
            for (let i = 0; i < data.length; i++) {
                const row = data[i];
                if (!Array.isArray(row)) continue;
                for (let j = 0; j < row.length; j++) {
                    const cell = row[j];
                    if (typeof cell === 'string' && cell.toLowerCase().includes(teks.toLowerCase())) {
                        return i;
                    }
                }
            }
            return -1;
        }

        function cariBarisDari(data, teks, mulai) {
            for (let i = mulai; i < data.length; i++) {
                const row = data[i];
                if (!Array.isArray(row)) continue;
                for (let j = 0; j < row.length; j++) {
                    const cell = row[j];
                    if (typeof cell === 'string' && cell.toLowerCase().includes(teks.toLowerCase())) {
                        return i;
                    }
                }
            }
            return -1;
        }

        function ekstrakDetailFaktur(rows, startIdx, endIdx) {
            const list = [];
            if (startIdx === -1 || endIdx === -1) return list;
            let dataStart = startIdx;
            for (let i = startIdx; i < Math.min(startIdx + 10, endIdx); i++) {
                const row = rows[i];
                if (!Array.isArray(row)) continue;
                const cell1 = String(row[1] || '').toLowerCase();
                const cell3 = String(row[3] || '').toLowerCase();
                if (cell1.includes('no') || cell3.includes('no faktur') || cell3.includes('faktur')) {
                    dataStart = i + 1;
                    break;
                }
            }
            if (dataStart === startIdx) dataStart = startIdx + 3;
            let currentSales = '';
            for (let i = dataStart; i < endIdx; i++) {
                const row = rows[i];
                if (!Array.isArray(row)) continue;
                const noCell = row[1];
                const salesCell = row[2];
                if (typeof salesCell === 'string' && salesCell.trim() !== '') {
                    currentSales = salesCell.trim();
                }
                if (noCell === undefined || noCell === null || noCell === '') continue;
                if (typeof noCell === 'string' && noCell.toLowerCase().includes('total')) continue;
                const noFaktur = row[3];
                if (noFaktur === undefined || noFaktur === null || noFaktur === '') continue;
                const tagihan = ambilAngka(row, 8);
                // PENTING: Minyak & Rupa-Rupa disimpan TERPISAH (bukan digabung),
                // supaya saat ditarik ke tab Pembayaran, split-nya tetap akurat
                // sama seperti file Excel aslinya.
                const minyakCash = ambilAngka(row, 9);
                const minyakTransfer = ambilAngka(row, 10);
                const rupaCash = ambilAngka(row, 11);
                const rupaTransfer = ambilAngka(row, 12);
                const bayarCash = minyakCash + rupaCash;
                const bayarTransfer = minyakTransfer + rupaTransfer;
                list.push({
                    no: typeof noCell === 'number' ? noCell : parseInt(noCell) || 0,
                    sales: currentSales,
                    noFaktur: String(noFaktur),
                    namaToko: row[4] ? String(row[4]) : '',
                    alamat: bersihkanTeksAlamat(row[5]),
                    tglFaktur: formatTanggalExcel(row[6]),
                    jt: formatTanggalExcel(row[7]),
                    tagihan: tagihan,
                    minyakCash: minyakCash,
                    minyakTransfer: minyakTransfer,
                    rupaCash: rupaCash,
                    rupaTransfer: rupaTransfer,
                    bayarCash: bayarCash,
                    bayarTransfer: bayarTransfer,
                    totalBayar: bayarCash + bayarTransfer,
                    ket: row[13] ? String(row[13]) : ''
                });
            }
            return list;
        }

        function ekstrakTanggal(rows) {
            for (let i = 0; i < Math.min(5, rows.length); i++) {
                const row = rows[i];
                if (!Array.isArray(row)) continue;
                for (let j = 0; j < row.length; j++) {
                    const cell = row[j];
                    if (typeof cell === 'string') {
                        const m = cell.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                        if (m) return m[1] + '-' + m[2];
                    }
                }
            }
            return null;
        }

        function debounce(fn, delay = 300) {
            let timer;
            return function(...args) {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        }

        // ================================================================
