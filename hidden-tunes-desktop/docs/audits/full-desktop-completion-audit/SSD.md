# SSD Proof

**Audit date:** 2026-07-29  
**Scope:** Desktop only. Mobile Sports / CarPlay issues are out of scope for desktop completion scoring.

## Physical disk

| Field | Value |
|-------|-------|
| Disk number | 1 |
| Model | **SanDisk Extreme Pro 55AF** |
| Bus | USB |
| Size | 2000365371904 bytes (~1.86 TB) |
| Status | Online |

System disk 0 is `Micron_2450_MTFDKBA256TFK` (C: OS) — **not** the desktop workspace disk.

## Volume

| Field | Value |
|-------|-------|
| Drive letter | **D:** |
| Label | **llordwills** |
| Filesystem | **NTFS** |
| Total | ~1862.98 GB |
| Free | ~1858.06 GB |
| Type | Fixed |

## Commands used (read-only)

`Get-Disk`, `Get-Volume`, `Get-Partition`, `Get-PSDrive -PSProvider FileSystem`

No disks were modified, formatted, renamed, repaired, mounted, or unmounted.
