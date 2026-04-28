<?php

namespace App\Models;

use CodeIgniter\Model;

class HouseModelModel extends Model
{
    protected $table      = 'house_models';
    protected $primaryKey = 'id';
    protected $returnType = 'array';
    protected $useSoftDeletes = false;

    protected $allowedFields = [
        'project_id', 'code', 'name', 'area_sqm',
    ];

    protected $useTimestamps = true;
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    /**
     * ดึงรายการ house models พร้อม unit_count จาก project_units
     */
    public function getListWithUnitCount(int $projectId, string $search = ''): array
    {
        $db = \Config\Database::connect();

        $builder = $db->table('house_models hm')
            ->select('hm.*, COUNT(pu.id) AS unit_count')
            ->join('project_units pu', 'pu.house_model_id = hm.id', 'left')
            ->where('hm.project_id', $projectId)
            ->groupBy('hm.id')
            ->orderBy('hm.code', 'ASC');

        if ($search !== '') {
            $builder->groupStart()
                ->like('hm.code', $search)
                ->orLike('hm.name', $search)
                ->groupEnd();
        }

        return $builder->get()->getResultArray();
    }

    /**
     * ตรวจว่า code ซ้ำภายใน project หรือไม่
     */
    public function isCodeDuplicate(string $code, int $projectId, ?int $excludeId = null): bool
    {
        $builder = $this->where('project_id', $projectId)->where('code', $code);
        if ($excludeId !== null) {
            $builder = $builder->where('id !=', $excludeId);
        }
        return $builder->countAllResults() > 0;
    }
}
