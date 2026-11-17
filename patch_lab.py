#!/usr/bin/env python3
from pathlib import Path
import re, shutil, sys
p=Path("lab-konveksibos.html")
if not p.exists(): sys.exit("Jalankan dari ~/fastproduction-v2; lab-konveksibos.html tidak ditemukan.")
s=p.read_text(encoding="utf-8")
if "workforce.html" in s:
    print("Link Workforce sudah ada di Lab. Tidak diubah."); sys.exit(0)
backup=p.with_name("backup-lab-before-workforce-link.html")
shutil.copy2(p,backup)
card = r'''
<!-- FASTPRODUCTION WORKFORCE STUDIO LAUNCHER -->
<style>
.fp-workforce-launch{margin:22px 0;padding:20px;border:1px solid #52643c;border-radius:16px;background:linear-gradient(125deg,#1d291d,#171e18);display:flex;align-items:center;justify-content:space-between;gap:16px;color:#eef3eb}
.fp-workforce-launch .k{font:10px monospace;letter-spacing:.13em;color:#c5f36b}
.fp-workforce-launch h3{margin:7px 0 4px;font:800 18px system-ui}
.fp-workforce-launch p{margin:0;color:#aab7a9;font:12px/1.6 system-ui}
.fp-workforce-launch a{display:inline-block;white-space:nowrap;padding:11px 15px;border-radius:10px;background:#c5f36b;color:#172015;text-decoration:none;font:800 12px system-ui}
@media(max-width:620px){.fp-workforce-launch{align-items:flex-start;flex-direction:column}}
</style>
<section class="fp-workforce-launch"><div><div class="k">PRODUCTION OPERATIONS</div><h3>Workforce Studio</h3><p>Kelola pekerja, stok PO &amp; Independent, distribusi barang, dan pending produksi dalam satu ruang kendali.</p></div><a href="workforce.html">Buka Workforce Studio →</a></section>
<!-- /FASTPRODUCTION WORKFORCE STUDIO LAUNCHER -->
'''
m=re.search(r'</main\s*>',s,re.I)
if not m: m=re.search(r'</body\s*>',s,re.I)
if not m: sys.exit("Tidak menemukan titik sisip </main> atau </body>; file tidak diubah.")
s=s[:m.start()]+card+s[m.start():]
p.write_text(s,encoding="utf-8")
print("OK: launcher ditambahkan hanya ke lab-konveksibos.html")
print("Backup:",backup)
print("Periksa Lab setelah refresh. Patch ini tidak menghapus monitor lama yang mungkin masih tertanam.")
