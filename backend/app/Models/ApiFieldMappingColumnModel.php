<?php

namespace App\Models;

use CodeIgniter\Model;

class ApiFieldMappingColumnModel extends Model
{
    protected $table      = 'api_field_mapping_columns';
    protected $primaryKey = 'id';
    protected $returnType = 'array';

    protected $allowedFields = [
        'preset_id', 'source_field', 'target_field',
        'transform_type', 'transform_value', 'sort_order',
    ];

    protected $useTimestamps = false;

    /**
     * ดึง columns ทั้งหมดของ preset เรียงตาม sort_order
     */
    public function getByPreset(int $presetId): array
    {
        return $this->where('preset_id', $presetId)
            ->orderBy('sort_order', 'ASC')
            ->findAll();
    }

    /**
     * ลบ columns ทั้งหมดของ preset (ใช้ก่อน re-insert ตอน update)
     */
    public function deleteByPreset(int $presetId): void
    {
        $this->where('preset_id', $presetId)->delete();
    }
}
