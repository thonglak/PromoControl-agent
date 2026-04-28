<?php

namespace App\Models;

use CodeIgniter\Model;

class PhaseModel extends Model
{
    protected $table      = 'project_phases';
    protected $primaryKey = 'id';
    protected $returnType = 'array';

    protected $allowedFields = ['project_id', 'name', 'sort_order'];

    protected $useTimestamps = true;
    protected $createdField  = 'created_at';
    protected $updatedField  = 'updated_at';

    /**
     * ดึงรายการ phase ของโครงการ เรียงตาม sort_order
     */
    public function getByProject(int $projectId): array
    {
        return $this->where('project_id', $projectId)
                    ->orderBy('sort_order', 'ASC')
                    ->findAll();
    }
}
