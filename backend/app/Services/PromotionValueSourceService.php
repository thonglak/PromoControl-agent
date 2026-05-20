<?php

namespace App\Services;

use CodeIgniter\Database\BaseConnection;

/**
 * PromotionValueSourceService — ทะเบียนแหล่งข้อมูลค่ารายยูนิตของของแถม
 *
 * ใช้กับ value_mode = 'unit_table' ของ promotion_item_master
 * แต่ละแหล่งคือ "key" ที่ map ไปยัง resolver ในโค้ด — ไม่เก็บชื่อตารางดิบใน DB
 * (กัน SQL injection + ลดการผูกแน่นกับ schema)
 *
 * เพิ่มแหล่งข้อมูลใหม่ในอนาคต = เพิ่ม 1 entry ใน SOURCES + 1 case ใน resolve()
 * ไม่ต้องแก้ migration/enum
 */
class PromotionValueSourceService
{
    private BaseConnection $db;

    /** ทะเบียนแหล่งข้อมูล: key => ['label','description'] */
    private const SOURCES = [
        'promotion_item_unit_value' => [
            'label'       => 'ค่ารายยูนิตจากการนำเข้า',
            'description' => 'ดึงจำนวนเงินรายยูนิตจากตาราง promotion_item_unit_values (นำเข้าจาก Premium.xlsx)',
        ],
    ];

    public function __construct()
    {
        $this->db = \Config\Database::connect();
    }

    /** รายการแหล่งข้อมูลทั้งหมด — สำหรับ dropdown ในฟอร์ม */
    public function list(): array
    {
        $out = [];
        foreach (self::SOURCES as $key => $meta) {
            $out[] = ['key' => $key, 'label' => $meta['label'], 'description' => $meta['description']];
        }
        return $out;
    }

    public function isValid(string $key): bool
    {
        return isset(self::SOURCES[$key]);
    }

    /**
     * ดึงค่ารายยูนิตของของแถมจากแหล่งข้อมูลที่กำหนด
     *
     * @return ?float จำนวนเงิน — null ถ้าไม่มีข้อมูลของยูนิตนั้น (ผู้เรียกควร fallback default_value)
     */
    public function resolve(string $sourceKey, int $promotionItemId, int $unitId): ?float
    {
        switch ($sourceKey) {
            case 'promotion_item_unit_value':
                $row = $this->db->table('promotion_item_unit_values')
                    ->select('amount')
                    ->where('promotion_item_id', $promotionItemId)
                    ->where('unit_id', $unitId)
                    ->get()->getRowArray();
                return $row ? (float) $row['amount'] : null;
        }
        return null;
    }
}
