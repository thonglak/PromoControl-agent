<?php

declare(strict_types=1);

namespace App\Models;

use CodeIgniter\Model;

/**
 * ProjectLegacyReconciliationModel — จัดการข้อมูล "กระทบยอดระบบเก่า" ต่อโครงการ
 *
 * ตาราง project_legacy_reconciliation มี 1 row ต่อ 1 โครงการ (project_id = PRIMARY KEY)
 * ดังนั้นไม่ใช้ auto_increment — ทุก operation ใช้ project_id เป็น key
 */
class ProjectLegacyReconciliationModel extends Model
{
    protected $table            = 'project_legacy_reconciliation';
    protected $primaryKey       = 'project_id';
    protected $useAutoIncrement = false;
    protected $returnType       = 'array';
    protected $useSoftDeletes   = false;
    protected $useTimestamps    = false;

    protected $allowedFields = [
        'project_id',
        'legacy_total_budget_remaining',
        'legacy_total_profit',
        'as_of_date',
        'note',
        'created_by',
        'created_at',
        'updated_by',
        'updated_at',
    ];

    /**
     * ดึงข้อมูลกระทบยอดระบบเก่าของโครงการ พร้อมชื่อผู้แก้ไขล่าสุด
     * คืน null ถ้ายังไม่มีข้อมูล
     */
    public function getByProjectId(int $projectId): ?array
    {
        $row = $this->db->table('project_legacy_reconciliation plr')
            ->select('plr.*, u.name AS updated_by_name')
            ->join('users u', 'u.id = plr.updated_by', 'left')
            ->where('plr.project_id', $projectId)
            ->get()->getRowArray();

        return $row ?: null;
    }

    /**
     * Upsert ข้อมูลกระทบยอดระบบเก่า
     * ถ้ายังไม่มี row → INSERT พร้อม created_by / created_at
     * ถ้ามีอยู่แล้ว → UPDATE เฉพาะ field ที่เปลี่ยนได้
     */
    public function upsert(int $projectId, array $data, int $userId): bool
    {
        $now      = date('Y-m-d H:i:s');
        $existing = $this->where('project_id', $projectId)->countAllResults();

        if ($existing === 0) {
            // INSERT
            return $this->insert([
                'project_id'                   => $projectId,
                'legacy_total_budget_remaining' => $data['legacy_total_budget_remaining'],
                'legacy_total_profit'           => $data['legacy_total_profit'],
                'as_of_date'                   => $data['as_of_date'],
                'note'                         => $data['note'] ?? null,
                'created_by'                   => $userId,
                'created_at'                   => $now,
                'updated_by'                   => $userId,
                'updated_at'                   => $now,
            ]) !== false;
        }

        // UPDATE
        return $this->where('project_id', $projectId)->set([
            'legacy_total_budget_remaining' => $data['legacy_total_budget_remaining'],
            'legacy_total_profit'           => $data['legacy_total_profit'],
            'as_of_date'                   => $data['as_of_date'],
            'note'                         => $data['note'] ?? null,
            'updated_by'                   => $userId,
            'updated_at'                   => $now,
        ])->update();
    }

    /**
     * ลบข้อมูลกระทบยอดระบบเก่าของโครงการ
     */
    public function deleteByProjectId(int $projectId): bool
    {
        return $this->where('project_id', $projectId)->delete();
    }
}
