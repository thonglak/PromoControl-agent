<?php

declare(strict_types=1);

namespace Config;

// ─────────────────────────────────────────────────────────────────────────────
// UserRole — role ของผู้ใช้งานในระบบ
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UserRole — PHP 8.1 backed enum สำหรับ role ผู้ใช้
 *
 * ตรงกับ ENUM ใน users.role ในฐานข้อมูล
 * ใช้ UserRole::Admin->value เพื่อได้ string 'admin' สำหรับ query/response
 */
enum UserRole: string
{
    case Admin   = 'admin';
    case Manager = 'manager';
    case Sales   = 'sales';
    case Finance = 'finance';
    case Viewer  = 'viewer';

    /**
     * ตรวจว่า role นี้มีสิทธิ์ระดับ manager ขึ้นไป (admin หรือ manager)
     */
    public function isAtLeastManager(): bool
    {
        return match ($this) {
            self::Admin, self::Manager => true,
            default                    => false,
        };
    }

    /**
     * ตรวจว่า role นี้สร้าง/บันทึกรายการขายได้
     */
    public function canCreateSales(): bool
    {
        return match ($this) {
            self::Admin, self::Manager, self::Sales => true,
            default                                  => false,
        };
    }

    /**
     * ตรวจว่า role นี้ดูรายงาน/ประวัติได้
     */
    public function canViewReports(): bool
    {
        return match ($this) {
            self::Admin, self::Manager, self::Finance, self::Viewer => true,
            default                                                   => false,
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AccessLevel — ระดับการเข้าถึง project ของ user
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AccessLevel — ระดับการเข้าถึง project
 *
 * ตรงกับ ENUM ใน user_projects.access_level ในฐานข้อมูล
 */
enum AccessLevel: string
{
    case View = 'view';
    case Edit = 'edit';
}

// ─────────────────────────────────────────────────────────────────────────────
// TokenType — ประเภท token สำหรับ Authorization header
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TokenType — constants สำหรับ HTTP Authorization token type
 *
 * ใช้ใน auth response: { "token_type": TokenType::BEARER }
 */
final class TokenType
{
    /** Bearer token — มาตรฐาน RFC 6750 */
    public const BEARER = 'Bearer';

    private function __construct() {}
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthTokenConfig — ค่า configuration สำหรับ JWT tokens และ auth security
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AuthTokenConfig — single source of truth สำหรับค่า config ทั้งหมดของ auth
 *
 * ใช้ใน AuthService แทนการ define private constants ซ้ำ
 * และใช้ใน JwtAuthFilter สำหรับตรวจค่า token
 */
final class AuthTokenConfig
{
    /** อายุ access token: 60 นาที (วินาที) */
    public const ACCESS_TOKEN_TTL  = 3600;

    /** อายุ refresh token: 30 วัน (วินาที) */
    public const REFRESH_TOKEN_TTL = 30 * 24 * 3600;

    /** bcrypt cost factor — ยิ่งสูงยิ่งปลอดภัยแต่ช้าลง */
    public const BCRYPT_COST = 12;

    /** ชื่อ cookie สำหรับ refresh token (httpOnly) */
    public const REFRESH_COOKIE_NAME = 'refresh_token';

    /** path ของ cookie — จำกัดเฉพาะ auth endpoints เท่านั้น */
    public const REFRESH_COOKIE_PATH = '/api/auth';

    /** จำนวนครั้ง login ผิดสูงสุดก่อนล็อคบัญชี */
    public const MAX_FAILED_ATTEMPTS = 5;

    /** ระยะเวลาล็อคบัญชี: 15 นาที (วินาที) */
    public const LOCKOUT_DURATION = 15 * 60;

    private function __construct() {}
}

// ─────────────────────────────────────────────────────────────────────────────
// PermissionMatrix — คำนวณ permissions ตาม role (single source of truth)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * PermissionMatrix — permission map ตาม role ของ user
 *
 * ใช้แทน buildPermissions() ใน AuthService เพื่อให้ permission matrix
 * ถูก define ที่เดียว และ reuse ได้ทั่วทั้ง application
 *
 * ดูตาราง Permission Matrix ใน docs/08-authentication.md
 */
final class PermissionMatrix
{
    private function __construct() {}

    /**
     * สร้าง permissions array ตาม role ที่ส่งมา
     *
     * @param  string|UserRole $role  role ของ user
     * @return array<string, mixed>   permissions array สำหรับ JSON response
     */
    public static function build(string|UserRole $role): array
    {
        // รองรับทั้ง string ('admin') และ UserRole enum (UserRole::Admin)
        $r = $role instanceof UserRole
            ? $role
            : UserRole::from($role);

        $isAdmin   = $r === UserRole::Admin;
        $isManager = $r->isAtLeastManager();
        $canSales  = $r->canCreateSales();
        $canReport = $r->canViewReports();

        return [
            'sales_entry' => [
                'create'   => $canSales,
                'view_own' => true,       // ทุก role ดูรายการตัวเองได้
                'view_all' => $canReport,
            ],
            'budget' => [
                'transfer' => $isManager,
                'approve'  => $isManager,
                'view'     => true,       // ทุก role ดูงบได้
            ],
            'master_data' => [
                'project'   => $isAdmin,
                'unit'      => $isManager,
                'promotion' => $isManager,
            ],
            'bottom_line' => [
                'import'   => $isManager,
                'history'  => $canReport,
                'rollback' => $isAdmin,
                'mapping'  => $isManager,
            ],
            'reports'         => $canReport,
            'user_management' => $isAdmin,
            'settings'        => $isAdmin,
        ];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UserData — shape ของ user object ใน auth response (readonly DTO)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * UserData — โครงสร้าง user object สำหรับ auth endpoints
 *
 * ใช้ใน:
 * - POST /api/auth/login  → response["user"]
 * - GET  /api/auth/me     → root response
 * - POST /api/auth/setup  → response["user"] (subset — ไม่มี projects/permissions)
 *
 * หมายเหตุความปลอดภัย: ห้ามรวม password_hash หรือ token_hash เด็ดขาด
 *
 * @property int     $id
 * @property string  $email
 * @property string  $name
 * @property string  $role        (UserRole::value)
 * @property ?string $phone
 * @property ?string $avatar_url
 * @property bool    $is_active
 * @property array   $projects    ProjectAccess[] — {id, code, name, project_type, status, access_level}
 * @property array   $permissions PermissionMatrix::build($role)
 */
final readonly class UserData
{
    public function __construct(
        public int     $id,
        public string  $email,
        public string  $name,
        public string  $role,
        public ?string $phone,
        public ?string $avatar_url,
        public bool    $is_active,
        public array   $projects,
        public array   $permissions,
    ) {}

    /**
     * สร้าง UserData จาก raw array ที่มาจาก UserModel::findWithProjects()
     *
     * @param  array<string, mixed> $user  raw user data จาก DB (ไม่มี password_hash)
     */
    public static function fromArray(array $user): self
    {
        return new self(
            id:          (int)  $user['id'],
            email:             $user['email'],
            name:              $user['name'],
            role:              $user['role'],
            phone:             $user['phone'] ?? null,
            avatar_url:        $user['avatar_url'] ?? null,
            is_active:   (bool) $user['is_active'],
            projects:          $user['projects'] ?? [],
            permissions:       PermissionMatrix::build($user['role']),
        );
    }

    /**
     * แปลงเป็น array สำหรับ JSON response
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        return [
            'id'          => $this->id,
            'email'       => $this->email,
            'name'        => $this->name,
            'role'        => $this->role,
            'phone'       => $this->phone,
            'avatar_url'  => $this->avatar_url,
            'is_active'   => $this->is_active,
            'projects'    => $this->projects,
            'permissions' => $this->permissions,
        ];
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthLoginResponse — shape ของ response จาก POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AuthLoginResponse — โครงสร้าง response สำหรับ:
 *   - POST /api/auth/login   → รวม user object
 *   - POST /api/auth/refresh → ไม่มี user object
 *
 * {
 *   "access_token": "eyJ...",
 *   "token_type":   "Bearer",
 *   "expires_in":   3600,
 *   "user":         UserData  (เฉพาะ login — ไม่มีใน refresh response)
 * }
 */
final readonly class AuthLoginResponse
{
    public function __construct(
        public string    $access_token,
        public string    $token_type,
        public int       $expires_in,
        public ?UserData $user = null,
    ) {}

    /**
     * สร้าง response สำหรับ login (รวม user object)
     */
    public static function forLogin(string $accessToken, UserData $user): self
    {
        return new self(
            access_token: $accessToken,
            token_type:   TokenType::BEARER,
            expires_in:   AuthTokenConfig::ACCESS_TOKEN_TTL,
            user:         $user,
        );
    }

    /**
     * สร้าง response สำหรับ refresh (ไม่มี user object)
     */
    public static function forRefresh(string $accessToken): self
    {
        return new self(
            access_token: $accessToken,
            token_type:   TokenType::BEARER,
            expires_in:   AuthTokenConfig::ACCESS_TOKEN_TTL,
        );
    }

    /**
     * แปลงเป็น array สำหรับ JSON response
     *
     * @return array<string, mixed>
     */
    public function toArray(): array
    {
        $data = [
            'access_token' => $this->access_token,
            'token_type'   => $this->token_type,
            'expires_in'   => $this->expires_in,
        ];
        if ($this->user !== null) {
            $data['user'] = $this->user->toArray();
        }
        return $data;
    }
}
