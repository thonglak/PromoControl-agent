<?php

namespace App\Models;

use CodeIgniter\Model;

class UserModel extends Model
{
    protected $table          = 'users';
    protected $primaryKey     = 'id';
    protected $useAutoIncrement = true;
    protected $returnType     = 'array';
    protected $useSoftDeletes = false;
    protected $useTimestamps  = false; // จัดการ timestamps เอง

    protected $allowedFields = [
        'email', 'password_hash', 'name', 'role',
        'phone', 'avatar_url', 'is_active',
        'last_login_at', 'failed_attempts', 'locked_until',
        'created_at', 'updated_at',
    ];

    /**
     * ดึง user พร้อม project assignments (ยกเว้น password_hash)
     */
    public function findWithProjects(int $userId): ?array
    {
        $user = $this->select('id, email, name, role, phone, avatar_url, is_active, last_login_at, created_at')
                     ->find($userId);

        if ($user === null) {
            return null;
        }

        // ดึง project ที่ user มีสิทธิ์เข้าถึง
        $user['projects'] = $this->getUserProjects($userId, $user['role']);
        return $user;
    }

    /**
     * ดึง projects ของ user
     * admin → เห็นทุกโครงการ (access_level = edit)
     * อื่นๆ → เฉพาะที่ assign ใน user_projects
     */
    public function getUserProjects(int $userId, string $role): array
    {
        if ($role === 'admin') {
            // admin เห็นทุก project พร้อม edit access
            return $this->db->table('projects')
                ->select('id, code, name, project_type, status, pool_budget_amount, "edit" AS access_level')
                ->where('status !=', 'inactive')
                ->get()->getResultArray();
        }

        return $this->db->table('user_projects up')
            ->select('p.id, p.code, p.name, p.project_type, p.status, p.pool_budget_amount, up.access_level')
            ->join('projects p', 'p.id = up.project_id')
            ->where('up.user_id', $userId)
            ->get()->getResultArray();
    }
}
