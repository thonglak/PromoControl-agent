<?php

namespace App\Models;

use CodeIgniter\Model;

/**
 * NumberSeriesModel — ตั้งค่าเลขที่เอกสารอัตโนมัติ per project per document type
 * UNIQUE(project_id, document_type) — 1 โครงการ : 1 series ต่อ document type
 */
class NumberSeriesModel extends Model
{
    protected $table      = 'number_series';
    protected $primaryKey = 'id';
    protected $useAutoIncrement = true;
    protected $returnType = 'array';
    protected $useSoftDeletes  = false;
    protected $useTimestamps   = false; // จัดการ timestamps เอง

    protected $allowedFields = [
        'project_id', 'document_type', 'prefix', 'separator',
        'year_format', 'year_separator', 'running_digits',
        'reset_cycle', 'next_number', 'last_reset_date',
        'sample_output', 'is_active', 'created_at', 'updated_at',
    ];

    // ─── Validation Rules ─────────────────────────────────────────────
    protected $validationRules = [
        'prefix'         => 'required|max_length[20]',
        'running_digits' => 'required|in_list[3,4,5,6]',
    ];

    protected $validationMessages = [
        'prefix' => [
            'required'   => 'กรุณากรอก prefix',
            'max_length' => 'prefix ต้องไม่เกิน 20 ตัวอักษร',
        ],
        'running_digits' => [
            'required' => 'กรุณาระบุจำนวนหลักเลขลำดับ',
            'in_list'  => 'จำนวนหลักเลขลำดับต้องเป็น 3, 4, 5 หรือ 6',
        ],
    ];
}
