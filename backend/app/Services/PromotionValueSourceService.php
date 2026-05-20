<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;
use RuntimeException;

/**
 * PromotionValueSourceService — จัดการแหล่งข้อมูลค่ารายยูนิต (value_mode=unit_table)
 *
 * ทะเบียนแหล่งข้อมูลเก็บในตาราง promotion_value_sources (admin จัดการได้จากหน้าจอ)
 * resolver เป็น generic: query {amount_column} จาก {source_table}
 * โดย match {item_column}=promotion_item_id และ {unit_column}=unit_id
 *
 * ความปลอดภัย: ชื่อตาราง/คอลัมน์ต้องผ่าน regex + ตรวจกับ information_schema
 * ว่ามีจริงในฐานข้อมูลนี้ ก่อนนำไปใช้ใน query เสมอ
 */
class PromotionValueSourceService
{
    private BaseConnection $db;

    /** cache ภายใน request */
    private array $keyCache    = [];   // source_key => row|null
    private array $columnCache = [];   // table => [column, ...]

    private const IDENTIFIER = '/^[A-Za-z0-9_]+$/';

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // อ่านข้อมูล
    // ═══════════════════════════════════════════════════════════════════════

    /** รายการแหล่งข้อมูลที่ใช้งานได้ — สำหรับ dropdown ในฟอร์มของแถม */
    public function list(): array
    {
        $out = [];
        foreach ($this->db->table('promotion_value_sources')
                     ->where('is_active', 1)
                     ->orderBy('label', 'ASC')
                     ->get()->getResultArray() as $s) {
            $out[] = [
                'key'         => $s['source_key'],
                'label'       => $s['label'],
                'description' => $s['description'],
            ];
        }
        return $out;
    }

    /** รายการทั้งหมด พร้อมจำนวนการใช้งาน + สถานะ schema — สำหรับหน้าจัดการ */
    public function getAll(): array
    {
        $sources = $this->db->table('promotion_value_sources')
            ->orderBy('is_system', 'DESC')
            ->orderBy('id', 'ASC')
            ->get()->getResultArray();

        // นับจำนวน promotion item ที่ใช้แต่ละ source
        $counts = [];
        foreach ($this->db->table('promotion_item_master')
                     ->select('value_source, COUNT(*) AS c')
                     ->where('value_source IS NOT NULL', null, false)
                     ->groupBy('value_source')
                     ->get()->getResultArray() as $r) {
            $counts[$r['value_source']] = (int) $r['c'];
        }

        foreach ($sources as &$s) {
            $s['is_active']   = (int) $s['is_active'];
            $s['is_system']   = (int) $s['is_system'];
            $s['usage_count'] = $counts[$s['source_key']] ?? 0;
            $s['schema_ok']   = $this->isSafeConfig($s);
        }
        return $sources;
    }

    public function find(int $id): ?array
    {
        $r = $this->db->table('promotion_value_sources')->where('id', $id)->get()->getRowArray();
        if (!$r) {
            return null;
        }
        $r['is_active'] = (int) $r['is_active'];
        $r['is_system'] = (int) $r['is_system'];
        return $r;
    }

    public function isValid(string $key): bool
    {
        return $this->db->table('promotion_value_sources')
            ->where('source_key', $key)
            ->where('is_active', 1)
            ->countAllResults() > 0;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Resolver — ดึงค่ารายยูนิต
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ดึงจำนวนเงินรายยูนิตของของแถมจากแหล่งข้อมูล
     *
     * @return ?float null = ไม่มีข้อมูล/แหล่งข้อมูลใช้ไม่ได้ (ผู้เรียกควร fallback default_value)
     */
    public function resolve(string $sourceKey, int $promotionItemId, int $unitId): ?float
    {
        $src = $this->getByKey($sourceKey);
        if (!$src || !(int) $src['is_active'] || !$this->isSafeConfig($src)) {
            return null;
        }

        // ชื่อตาราง/คอลัมน์ผ่านการตรวจกับ information_schema แล้ว — Query Builder escape ให้
        $row = $this->db->table($src['source_table'])
            ->select($src['amount_column'] . ' AS amount')
            ->where($src['item_column'], $promotionItemId)
            ->where($src['unit_column'], $unitId)
            ->get()->getRowArray();

        return $row ? (float) $row['amount'] : null;
    }

    /**
     * ดึงค่ารายยูนิตทั้งหมดของของแถม 1 รายการ (batch — ลดจำนวน query)
     *
     * @return array<int,float> map[unit_id => amount]
     */
    public function resolveAll(string $sourceKey, int $promotionItemId): array
    {
        $src = $this->getByKey($sourceKey);
        if (!$src || !(int) $src['is_active'] || !$this->isSafeConfig($src)) {
            return [];
        }

        $rows = $this->db->table($src['source_table'])
            ->select($src['unit_column'] . ' AS uid')
            ->select($src['amount_column'] . ' AS amount')
            ->where($src['item_column'], $promotionItemId)
            ->get()->getResultArray();

        $map = [];
        foreach ($rows as $r) {
            $map[(int) $r['uid']] = (float) $r['amount'];
        }
        return $map;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // CRUD (หน้าจัดการ — admin)
    // ═══════════════════════════════════════════════════════════════════════

    public function create(array $data): array
    {
        $errors = $this->validateConfig($data, null);
        if ($errors) {
            throw new RuntimeException(implode(' / ', $errors));
        }

        $now = date('Y-m-d H:i:s');
        $this->db->table('promotion_value_sources')->insert([
            'source_key'    => trim((string) $data['source_key']),
            'label'         => trim((string) $data['label']),
            'description'   => ($data['description'] ?? null) ?: null,
            'source_table'  => trim((string) $data['source_table']),
            'item_column'   => trim((string) $data['item_column']),
            'unit_column'   => trim((string) $data['unit_column']),
            'amount_column' => trim((string) $data['amount_column']),
            'is_active'     => !empty($data['is_active']) || !isset($data['is_active']) ? 1 : 0,
            'is_system'     => 0,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);
        return $this->find((int) $this->db->insertID());
    }

    public function update(int $id, array $data): array
    {
        $existing = $this->find($id);
        if (!$existing) {
            throw new RuntimeException('ไม่พบแหล่งข้อมูล');
        }

        $payload = [
            'label'       => trim((string) ($data['label'] ?? $existing['label'])),
            'description' => ($data['description'] ?? null) ?: null,
            'is_active'   => isset($data['is_active']) ? ((int) (bool) $data['is_active']) : $existing['is_active'],
            'updated_at'  => date('Y-m-d H:i:s'),
        ];
        if ($payload['label'] === '') {
            throw new RuntimeException('กรุณากรอกชื่อแหล่งข้อมูล');
        }

        // source ของระบบ: แก้ได้แค่ label/description/is_active — ล็อก mapping ตาราง
        if (!$existing['is_system']) {
            $merged = array_merge($existing, $data);
            $errors = $this->validateConfig($merged, $id);
            if ($errors) {
                throw new RuntimeException(implode(' / ', $errors));
            }
            $payload['source_table']  = trim((string) ($data['source_table']  ?? $existing['source_table']));
            $payload['item_column']   = trim((string) ($data['item_column']   ?? $existing['item_column']));
            $payload['unit_column']   = trim((string) ($data['unit_column']   ?? $existing['unit_column']));
            $payload['amount_column'] = trim((string) ($data['amount_column'] ?? $existing['amount_column']));
        }

        $this->db->table('promotion_value_sources')->where('id', $id)->update($payload);
        return $this->find($id);
    }

    public function delete(int $id): void
    {
        $src = $this->find($id);
        if (!$src) {
            throw new RuntimeException('ไม่พบแหล่งข้อมูล');
        }
        if ($src['is_system']) {
            throw new RuntimeException('ลบแหล่งข้อมูลของระบบไม่ได้');
        }
        $used = $this->db->table('promotion_item_master')
            ->where('value_source', $src['source_key'])
            ->countAllResults();
        if ($used > 0) {
            throw new RuntimeException("ลบไม่ได้ — มีรายการของแถม {$used} รายการใช้แหล่งข้อมูลนี้อยู่");
        }
        $this->db->table('promotion_value_sources')->where('id', $id)->delete();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Validation
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * ตรวจสอบ config ของแหล่งข้อมูล — คืน array ข้อความ error (ว่าง = ผ่าน)
     *
     * @param ?int $excludeId null = ตอนสร้าง (ตรวจ source_key); มีค่า = ตอนแก้ไข
     */
    public function validateConfig(array $data, ?int $excludeId): array
    {
        $errors = [];

        // source_key — ตรวจเฉพาะตอนสร้าง (ห้ามแก้ภายหลัง)
        if ($excludeId === null) {
            $key = trim((string) ($data['source_key'] ?? ''));
            if (!preg_match('/^[a-z][a-z0-9_]*$/', $key)) {
                $errors[] = 'รหัสแหล่งข้อมูลต้องเป็นภาษาอังกฤษพิมพ์เล็ก/ตัวเลข/ขีดล่าง และขึ้นต้นด้วยตัวอักษร';
            } elseif ($this->db->table('promotion_value_sources')->where('source_key', $key)->countAllResults() > 0) {
                $errors[] = 'รหัสแหล่งข้อมูลนี้มีอยู่แล้ว';
            }
        }

        if (trim((string) ($data['label'] ?? '')) === '') {
            $errors[] = 'กรุณากรอกชื่อแหล่งข้อมูล';
        }

        $fields = [
            'source_table'  => 'ชื่อตาราง',
            'item_column'   => 'คอลัมน์ promotion item',
            'unit_column'   => 'คอลัมน์ unit',
            'amount_column' => 'คอลัมน์จำนวนเงิน',
        ];
        foreach ($fields as $f => $th) {
            if (!preg_match(self::IDENTIFIER, trim((string) ($data[$f] ?? '')))) {
                $errors[] = "{$th}ไม่ถูกต้อง (ใช้ได้เฉพาะ A-Z a-z 0-9 _)";
            }
        }
        if ($errors) {
            return $errors; // หยุดก่อน — ยังตรวจ schema ไม่ได้ถ้า format ผิด
        }

        // ตรวจว่าตาราง/คอลัมน์มีอยู่จริงในฐานข้อมูล
        $table = trim((string) $data['source_table']);
        if (!$this->tableExists($table)) {
            return ["ไม่พบตาราง \"{$table}\" ในฐานข้อมูล"];
        }
        $cols = $this->columnsOf($table);
        foreach (['item_column', 'unit_column', 'amount_column'] as $f) {
            $c = trim((string) $data[$f]);
            if (!in_array($c, $cols, true)) {
                $errors[] = "ไม่พบคอลัมน์ \"{$c}\" ในตาราง \"{$table}\"";
            }
        }
        return $errors;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Private helpers
    // ═══════════════════════════════════════════════════════════════════════

    private function getByKey(string $key): ?array
    {
        if (!array_key_exists($key, $this->keyCache)) {
            $this->keyCache[$key] = $this->db->table('promotion_value_sources')
                ->where('source_key', $key)
                ->get()->getRowArray() ?: null;
        }
        return $this->keyCache[$key];
    }

    /** config ปลอดภัยพอที่จะนำชื่อตาราง/คอลัมน์ไปใช้ใน query ไหม */
    private function isSafeConfig(array $s): bool
    {
        foreach (['source_table', 'item_column', 'unit_column', 'amount_column'] as $f) {
            if (!preg_match(self::IDENTIFIER, (string) ($s[$f] ?? ''))) {
                return false;
            }
        }
        if (!$this->tableExists($s['source_table'])) {
            return false;
        }
        $cols = $this->columnsOf($s['source_table']);
        return in_array($s['item_column'], $cols, true)
            && in_array($s['unit_column'], $cols, true)
            && in_array($s['amount_column'], $cols, true);
    }

    private function tableExists(string $table): bool
    {
        return count($this->columnsOf($table)) > 0;
    }

    /** คอลัมน์ทั้งหมดของตาราง (อ่านจาก information_schema, cache ไว้) */
    private function columnsOf(string $table): array
    {
        if (!isset($this->columnCache[$table])) {
            if (!preg_match(self::IDENTIFIER, $table)) {
                return $this->columnCache[$table] = [];
            }
            $rows = $this->db->table('information_schema.COLUMNS')
                ->select('COLUMN_NAME')
                ->where('TABLE_SCHEMA', $this->db->getDatabase())
                ->where('TABLE_NAME', $table)
                ->get()->getResultArray();
            $this->columnCache[$table] = array_column($rows, 'COLUMN_NAME');
        }
        return $this->columnCache[$table];
    }
}
