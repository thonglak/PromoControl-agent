<?php

namespace App\Models;

use CodeIgniter\Model;

class RefreshTokenModel extends Model
{
    protected $table          = 'refresh_tokens';
    protected $primaryKey     = 'id';
    protected $useAutoIncrement = true;
    protected $returnType     = 'array';
    protected $useSoftDeletes = false;
    protected $useTimestamps  = false;

    protected $allowedFields = [
        'user_id', 'token_hash', 'expires_at',
        'revoked', 'user_agent', 'ip_address', 'created_at',
    ];

    /**
     * ค้นหา token ที่ valid (ยังไม่ expired และไม่ถูก revoke)
     */
    public function findValidToken(string $tokenHash): ?array
    {
        return $this->where('token_hash', $tokenHash)
                    ->where('revoked', false)
                    ->where('expires_at >', date('Y-m-d H:i:s'))
                    ->first();
    }

    /**
     * Revoke token เดียว
     */
    public function revokeToken(string $tokenHash): void
    {
        $this->where('token_hash', $tokenHash)->set(['revoked' => true])->update();
    }

    /**
     * Revoke ทุก token ของ user (ใช้เมื่อเปลี่ยนรหัสผ่าน)
     */
    public function revokeAllForUser(int $userId): void
    {
        $this->where('user_id', $userId)->set(['revoked' => true])->update();
    }
}
