<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

/**
 * SystemSettingService — จัดการค่าตั้งค่าทั่วระบบ (key/value JSON storage)
 *
 * - 1 setting_key : 1 setting_value (เก็บเป็น JSON เพื่อรองรับหลายชนิดข้อมูล)
 * - admin/manager เท่านั้นที่แก้ไขได้
 * - frontend ดึง list ทั้งหมดตอน app init แล้วแคชไว้ในหน่วยความจำ
 */
class SystemSettingService
{
    private BaseConnection $db;

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /** ดึงทุก setting */
    public function listAll(): array
    {
        $rows = $this->db->table('system_settings')
            ->orderBy('setting_key', 'ASC')
            ->get()->getResultArray();

        return array_map(fn($r) => $this->decodeRow($r), $rows);
    }

    /** ดึง setting ตาม key */
    public function get(string $key): ?array
    {
        $row = $this->db->table('system_settings')
            ->where('setting_key', $key)
            ->get()->getRowArray();

        return $row ? $this->decodeRow($row) : null;
    }

    /** ดึงเฉพาะค่า (decoded) หรือ default ถ้าไม่พบ */
    public function getValue(string $key, mixed $default = null): mixed
    {
        $row = $this->get($key);
        return $row['setting_value'] ?? $default;
    }

    /** อัปเดต setting — key ต้องมีอยู่แล้ว (สร้างจาก migration/seed เท่านั้น) */
    public function set(string $key, mixed $value, ?int $updatedBy = null): array
    {
        $existing = $this->db->table('system_settings')
            ->where('setting_key', $key)
            ->get()->getRowArray();

        if (!$existing) {
            throw new RuntimeException("ไม่พบค่าตั้งค่า: {$key}");
        }

        $this->db->table('system_settings')
            ->where('setting_key', $key)
            ->update([
                'setting_value' => json_encode($value),
                'updated_by'    => $updatedBy,
                'updated_at'    => date('Y-m-d H:i:s'),
            ]);

        return $this->get($key) ?? throw new RuntimeException('ไม่สามารถดึงค่าที่อัปเดต');
    }

    private function decodeRow(array $row): array
    {
        $row['setting_value'] = $row['setting_value'] !== null
            ? json_decode($row['setting_value'], true)
            : null;
        return $row;
    }
}
