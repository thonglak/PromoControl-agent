<?php

namespace App\Controllers;

use App\Models\RefreshTokenModel;
use App\Models\UserModel;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * UserController — จัดการ User Management (admin only)
 *
 * กฎ:
 * - ทุก route ต้องผ่าน role:admin filter (กำหนดใน Routes.php)
 * - ห้าม return password_hash ใน response เด็ดขาด
 * - Soft delete เท่านั้น (is_active = false) — ไม่ลบ record จริง
 * - Error messages เป็นภาษาไทย
 */
class UserController extends BaseController
{
    private UserModel         $userModel;
    private RefreshTokenModel $tokenModel;

    /** roles ที่ระบบรองรับ */
    private const VALID_ROLES = ['admin', 'manager', 'sales', 'finance', 'viewer'];

    /** access levels ที่รองรับสำหรับ project assignment */
    private const VALID_ACCESS_LEVELS = ['view', 'edit'];

    public function __construct()
    {
        $this->userModel  = new UserModel();
        $this->tokenModel = new RefreshTokenModel();
    }

    // ─── GET /api/users ────────────────────────────────────────────────

    /**
     * ดึงรายชื่อ users ทั้งหมด พร้อม project assignments
     * Query: ?search=&role=&is_active=
     * Response: { "data": [...] }
     */
    public function index(): ResponseInterface
    {
        $search   = $this->request->getGet('search')    ?? '';
        $role     = $this->request->getGet('role')      ?? '';
        $isActive = $this->request->getGet('is_active') ?? '';

        $builder = $this->userModel
            ->select('id, email, name, role, phone, avatar_url, is_active, last_login_at, created_at')
            ->orderBy('created_at', 'DESC');

        if ($search !== '') {
            $builder->groupStart()
                ->like('email', $search)
                ->orLike('name', $search)
                ->groupEnd();
        }

        if ($role !== '' && in_array($role, self::VALID_ROLES, true)) {
            $builder->where('role', $role);
        }

        if ($isActive !== '') {
            $builder->where('is_active', (bool) $isActive);
        }

        $users = $builder->findAll();

        // แนบ projects ให้แต่ละ user
        foreach ($users as &$user) {
            $user['projects'] = $this->userModel->getUserProjects(
                (int) $user['id'],
                $user['role']
            );
        }
        unset($user);

        return $this->response->setStatusCode(200)->setJSON(['data' => $users]);
    }

    // ─── POST /api/users ────────────────────────────────────────────────

    /**
     * สร้าง user ใหม่
     * Body: { email, password, name, role, phone? }
     * Response 201: { message, data }
     */
    public function create(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];

        $email    = strtolower(trim((string) ($body['email']    ?? '')));
        $password =                  (string) ($body['password'] ?? '');
        $name     =             trim((string) ($body['name']     ?? ''));
        $role     =                  (string) ($body['role']     ?? '');
        $phone    =             trim((string) ($body['phone']    ?? ''));

        // ── Validate required fields ──────────────────────────────────
        $errors = [];
        if ($email === '')    { $errors[] = 'email'; }
        if ($password === '') { $errors[] = 'password'; }
        if ($name === '')     { $errors[] = 'ชื่อ'; }
        if ($role === '')     { $errors[] = 'role'; }

        if (! empty($errors)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'กรุณากรอก ' . implode(', ', $errors)]
            );
        }

        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'รูปแบบ email ไม่ถูกต้อง']
            );
        }

        if (! in_array($role, self::VALID_ROLES, true)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'role ไม่ถูกต้อง ต้องเป็น: ' . implode(', ', self::VALID_ROLES)]
            );
        }

        // ── Validate password complexity ──────────────────────────────
        $pwError = $this->validatePasswordComplexity($password);
        if ($pwError !== null) {
            return $this->response->setStatusCode(422)->setJSON(['error' => $pwError]);
        }

        // ── ตรวจ email ซ้ำ ────────────────────────────────────────────
        $existing = $this->userModel->where('email', $email)->first();
        if ($existing !== null) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'email นี้มีในระบบแล้ว']
            );
        }

        // ── Insert ────────────────────────────────────────────────────
        $now    = date('Y-m-d H:i:s');
        $userId = $this->userModel->insert([
            'email'         => $email,
            'password_hash' => password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]),
            'name'          => $name,
            'role'          => $role,
            'phone'         => $phone !== '' ? $phone : null,
            'is_active'     => true,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);

        $user = $this->userModel->findWithProjects((int) $userId);

        return $this->response->setStatusCode(201)->setJSON([
            'message' => 'สร้างผู้ใช้สำเร็จ',
            'data'    => $user,
        ]);
    }

    // ─── GET /api/users/:id ─────────────────────────────────────────────

    /**
     * ดูรายละเอียด user + projects
     * Response 200: { ...user, projects: [...] }
     * Response 404: { error }
     */
    public function show(int $id): ResponseInterface
    {
        $user = $this->userModel->findWithProjects($id);

        if ($user === null) {
            return $this->response->setStatusCode(404)->setJSON(
                ['error' => 'ไม่พบผู้ใช้']
            );
        }

        return $this->response->setStatusCode(200)->setJSON($user);
    }

    // ─── PUT /api/users/:id ─────────────────────────────────────────────

    /**
     * อัปเดตข้อมูล user
     * Body: { name?, role?, phone?, is_active? }
     * ห้ามเปลี่ยน email / ห้ามเปลี่ยน role admin คนสุดท้าย
     * Response 200: { message, data }
     */
    public function update(int $id): ResponseInterface
    {
        $user = $this->userModel
            ->select('id, email, name, role, phone, avatar_url, is_active')
            ->find($id);

        if ($user === null) {
            return $this->response->setStatusCode(404)->setJSON(
                ['error' => 'ไม่พบผู้ใช้']
            );
        }

        $body     = $this->request->getJSON(true) ?? [];
        $toUpdate = ['updated_at' => date('Y-m-d H:i:s')];

        // name
        if (isset($body['name'])) {
            $name = trim((string) $body['name']);
            if ($name === '') {
                return $this->response->setStatusCode(422)->setJSON(
                    ['error' => 'ชื่อต้องไม่ว่างเปล่า']
                );
            }
            $toUpdate['name'] = $name;
        }

        // role
        if (isset($body['role'])) {
            $newRole = (string) $body['role'];
            if (! in_array($newRole, self::VALID_ROLES, true)) {
                return $this->response->setStatusCode(422)->setJSON(
                    ['error' => 'role ไม่ถูกต้อง ต้องเป็น: ' . implode(', ', self::VALID_ROLES)]
                );
            }

            // ห้ามเปลี่ยน role admin คนสุดท้าย
            if ($user['role'] === 'admin' && $newRole !== 'admin') {
                if ($this->countActiveAdmins() <= 1) {
                    return $this->response->setStatusCode(422)->setJSON(
                        ['error' => 'ไม่สามารถเปลี่ยน role ได้ เนื่องจากเป็น admin คนสุดท้ายในระบบ']
                    );
                }
            }

            $toUpdate['role'] = $newRole;
        }

        // phone
        if (array_key_exists('phone', $body)) {
            $toUpdate['phone'] = trim((string) ($body['phone'] ?? '')) ?: null;
        }

        // is_active
        if (isset($body['is_active'])) {
            $toUpdate['is_active'] = (bool) $body['is_active'];

            // ถ้าจะปิดการใช้งาน — ตรวจ last admin
            if (! $toUpdate['is_active'] && $user['role'] === 'admin') {
                if ($this->countActiveAdmins() <= 1) {
                    return $this->response->setStatusCode(422)->setJSON(
                        ['error' => 'ไม่สามารถปิดการใช้งานได้ เนื่องจากเป็น admin คนสุดท้ายในระบบ']
                    );
                }
            }
        }

        $this->userModel->update($id, $toUpdate);

        $updated = $this->userModel->findWithProjects($id);

        return $this->response->setStatusCode(200)->setJSON([
            'message' => 'อัปเดตผู้ใช้สำเร็จ',
            'data'    => $updated,
        ]);
    }

    // ─── DELETE /api/users/:id ──────────────────────────────────────────

    /**
     * Soft delete user (is_active = false) + Revoke tokens
     * ห้ามลบ admin คนสุดท้าย
     * Response 200: { message }
     */
    public function delete(int $id): ResponseInterface
    {
        $user = $this->userModel
            ->select('id, role, is_active')
            ->find($id);

        if ($user === null) {
            return $this->response->setStatusCode(404)->setJSON(
                ['error' => 'ไม่พบผู้ใช้']
            );
        }

        // ห้ามลบ admin คนสุดท้าย
        if ($user['role'] === 'admin' && $this->countActiveAdmins() <= 1) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'ไม่สามารถปิดการใช้งานได้ เนื่องจากเป็น admin คนสุดท้ายในระบบ']
            );
        }

        // Soft delete
        $this->userModel->update($id, [
            'is_active'  => false,
            'updated_at' => date('Y-m-d H:i:s'),
        ]);

        // Revoke tokens ทั้งหมด
        $this->tokenModel->revokeAllForUser($id);

        return $this->response->setStatusCode(200)->setJSON(
            ['message' => 'ปิดการใช้งานผู้ใช้สำเร็จ']
        );
    }

    // ─── PUT /api/users/:id/projects ────────────────────────────────────

    /**
     * กำหนด projects ให้ user (Replace all)
     * Body: { projects: [{ project_id, access_level }] }
     * Response 200: { message, data: { projects: [...] } }
     */
    public function assignProjects(int $id): ResponseInterface
    {
        $user = $this->userModel->select('id, role')->find($id);

        if ($user === null) {
            return $this->response->setStatusCode(404)->setJSON(
                ['error' => 'ไม่พบผู้ใช้']
            );
        }

        $body     = $this->request->getJSON(true) ?? [];
        $projects = $body['projects'] ?? [];

        if (! is_array($projects)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'projects ต้องเป็น array']
            );
        }

        // Validate แต่ละ project entry
        foreach ($projects as $i => $p) {
            if (! isset($p['project_id']) || ! is_numeric($p['project_id'])) {
                return $this->response->setStatusCode(422)->setJSON(
                    ['error' => "projects[{$i}]: project_id ไม่ถูกต้อง"]
                );
            }
            $al = $p['access_level'] ?? '';
            if (! in_array($al, self::VALID_ACCESS_LEVELS, true)) {
                return $this->response->setStatusCode(422)->setJSON(
                    ['error' => "projects[{$i}]: access_level ต้องเป็น 'view' หรือ 'edit'"]
                );
            }
        }

        $db  = \Config\Database::connect();
        $now = date('Y-m-d H:i:s');

        // Replace all ใน user_projects (transaction)
        $db->transStart();

        $db->table('user_projects')->where('user_id', $id)->delete();

        foreach ($projects as $p) {
            $db->table('user_projects')->insert([
                'user_id'      => $id,
                'project_id'   => (int) $p['project_id'],
                'access_level' => $p['access_level'],
                'created_at'   => $now,
                'updated_at'   => $now,
            ]);
        }

        $db->transComplete();

        if (! $db->transStatus()) {
            return $this->response->setStatusCode(500)->setJSON(
                ['error' => 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่']
            );
        }

        $userProjects = $this->userModel->getUserProjects($id, $user['role']);

        return $this->response->setStatusCode(200)->setJSON([
            'message' => 'กำหนดโครงการสำเร็จ',
            'data'    => ['projects' => $userProjects],
        ]);
    }

    // ─── PUT /api/users/:id/reset-password ──────────────────────────────

    /**
     * รีเซ็ตรหัสผ่านของ user + Revoke tokens ทั้งหมด
     * Body: { new_password }
     * Response 200: { message }
     */
    public function resetPassword(int $id): ResponseInterface
    {
        $user = $this->userModel->select('id')->find($id);

        if ($user === null) {
            return $this->response->setStatusCode(404)->setJSON(
                ['error' => 'ไม่พบผู้ใช้']
            );
        }

        $body        = $this->request->getJSON(true) ?? [];
        $newPassword = (string) ($body['new_password'] ?? '');

        if ($newPassword === '') {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'กรุณากรอกรหัสผ่านใหม่']
            );
        }

        $pwError = $this->validatePasswordComplexity($newPassword);
        if ($pwError !== null) {
            return $this->response->setStatusCode(422)->setJSON(['error' => $pwError]);
        }

        $this->userModel->update($id, [
            'password_hash' => password_hash($newPassword, PASSWORD_BCRYPT, ['cost' => 12]),
            'updated_at'    => date('Y-m-d H:i:s'),
        ]);

        // Revoke ทุก token → force re-login ทุก device
        $this->tokenModel->revokeAllForUser($id);

        return $this->response->setStatusCode(200)->setJSON(
            ['message' => 'รีเซ็ตรหัสผ่านสำเร็จ']
        );
    }

    // ─── GET /api/users/browse-source ──────────────────────────────────

    /**
     * ดึงรายชื่อจาก por_users (back_db) สำหรับเลือกเข้ามาในระบบทีละหลายคน
     * Query: ?q=&page=1&per_page=20
     * แสดงเฉพาะ use_is_active=1; แถวที่ link แล้วจะมี already_added=true
     * Response: { data: [...], meta: { total, page, per_page, last_page } }
     */
    public function browseSource(): ResponseInterface
    {
        $q       = trim((string) ($this->request->getGet('q') ?? ''));
        $page    = max(1, (int) ($this->request->getGet('page') ?? 1));
        $perPage = (int) ($this->request->getGet('per_page') ?? 20);
        $perPage = max(1, min(100, $perPage));
        $offset  = ($page - 1) * $perPage;

        try {
            $back = \Config\Database::connect('back');
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(503)->setJSON(
                ['error' => 'ไม่สามารถเชื่อมต่อ DB ผู้ใช้งานต้นทางได้']
            );
        }

        $builder = $back->table('por_users')
            ->select('use_id, use_username, use_fullname, use_name, use_lastname,
                      use_nickname, use_email, use_mobile, use_tel, use_dept,
                      use_position, use_company, use_img, use_code')
            ->where('use_is_active', '1');

        if ($q !== '') {
            $builder->groupStart()
                ->like('use_username', $q)
                ->orLike('use_fullname', $q)
                ->orLike('use_nickname', $q)
                ->orLike('use_email', $q)
                ->orLike('use_code', $q)
                ->orLike('use_mobile', $q)
                ->groupEnd();
        }

        $total = (clone $builder)->countAllResults(false);

        $rows = $builder
            ->orderBy('use_fullname', 'ASC')
            ->limit($perPage, $offset)
            ->get()->getResultArray();

        // เช็ค narai_id ที่มีในระบบเราแล้ว (dedupe)
        $useIds = array_column($rows, 'use_id');
        $existingNaraiIds = [];
        if (! empty($useIds)) {
            $existing = $this->userModel
                ->select('narai_id')
                ->whereIn('narai_id', $useIds)
                ->findAll();
            $existingNaraiIds = array_flip(array_column($existing, 'narai_id'));
        }

        $data = [];
        foreach ($rows as $r) {
            $fullname = trim((string) $r['use_fullname']);
            if ($fullname === '') {
                $fullname = trim(((string) $r['use_name']) . ' ' . ((string) $r['use_lastname']));
            }

            $data[] = [
                'use_id'         => $r['use_id'],
                'use_username'   => $r['use_username'],
                'name'           => $fullname !== '' ? $fullname : $r['use_username'],
                'nickname'       => $r['use_nickname'],
                'email'          => $r['use_email'],
                'mobile'         => $r['use_mobile'] !== '' ? $r['use_mobile'] : $r['use_tel'],
                'department'     => $r['use_dept'],
                'position'       => $r['use_position'],
                'company'        => $r['use_company'],
                'avatar'         => $r['use_img'],
                'code'           => $r['use_code'],
                'already_added'  => isset($existingNaraiIds[$r['use_id']]),
            ];
        }

        return $this->response->setStatusCode(200)->setJSON([
            'data' => $data,
            'meta' => [
                'total'     => $total,
                'page'      => $page,
                'per_page'  => $perPage,
                'last_page' => max(1, (int) ceil($total / $perPage)),
            ],
        ]);
    }

    // ─── POST /api/users/bulk-import ───────────────────────────────────

    /**
     * นำเข้าผู้ใช้จาก por_users (back_db) ทีละหลายคน
     * Body: { default_role: 'viewer'|..., use_ids: [string, string, ...] }
     * - role ใช้ค่าเดียวกันทุกคน
     * - email ที่ว่างจะ generate {use_username}@narai.local
     * - skip ถ้า narai_id หรือ email ซ้ำ
     * - password_hash = null (ผู้ใช้กลุ่มนี้ login ผ่าน SSO)
     * Response 200: { message, data: { created, skipped, errors } }
     */
    public function bulkImport(): ResponseInterface
    {
        $body        = $this->request->getJSON(true) ?? [];
        $defaultRole = (string) ($body['default_role'] ?? '');
        $useIds      = $body['use_ids'] ?? [];

        if (! in_array($defaultRole, self::VALID_ROLES, true)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'default_role ไม่ถูกต้อง ต้องเป็น: ' . implode(', ', self::VALID_ROLES)]
            );
        }

        if (! is_array($useIds) || empty($useIds)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'กรุณาเลือกผู้ใช้อย่างน้อย 1 คน']
            );
        }

        // Sanitize use_ids (string)
        $useIds = array_values(array_unique(array_filter(array_map(
            static fn($v) => trim((string) $v),
            $useIds
        ), static fn($v) => $v !== '')));

        if (empty($useIds)) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'รายชื่อที่เลือกไม่ถูกต้อง']
            );
        }

        if (count($useIds) > 200) {
            return $this->response->setStatusCode(422)->setJSON(
                ['error' => 'นำเข้าได้สูงสุดครั้งละ 200 คน']
            );
        }

        // Fetch ข้อมูลจาก back.por_users
        try {
            $back = \Config\Database::connect('back');
        } catch (\Throwable $e) {
            return $this->response->setStatusCode(503)->setJSON(
                ['error' => 'ไม่สามารถเชื่อมต่อ DB ผู้ใช้งานต้นทางได้']
            );
        }

        $sourceRows = $back->table('por_users')
            ->select('use_id, use_username, use_fullname, use_name, use_lastname,
                      use_email, use_mobile, use_tel, use_img')
            ->whereIn('use_id', $useIds)
            ->get()->getResultArray();

        // index by use_id
        $byUseId = [];
        foreach ($sourceRows as $r) {
            $byUseId[(string) $r['use_id']] = $r;
        }

        // เช็ค narai_id ซ้ำในระบบเรา
        $existingNarai = $this->userModel
            ->select('narai_id')
            ->whereIn('narai_id', $useIds)
            ->findAll();
        $existingNaraiIds = array_flip(array_column($existingNarai, 'narai_id'));

        $now      = date('Y-m-d H:i:s');
        $created  = 0;
        $skipped  = [];
        $errors   = [];

        foreach ($useIds as $useId) {
            // ไม่พบใน source
            if (! isset($byUseId[$useId])) {
                $skipped[] = ['use_id' => $useId, 'reason' => 'ไม่พบในต้นทาง'];
                continue;
            }
            // link แล้ว
            if (isset($existingNaraiIds[$useId])) {
                $skipped[] = ['use_id' => $useId, 'reason' => 'มีในระบบแล้ว'];
                continue;
            }

            $r = $byUseId[$useId];

            // Map name
            $name = trim((string) $r['use_fullname']);
            if ($name === '') {
                $name = trim(((string) $r['use_name']) . ' ' . ((string) $r['use_lastname']));
            }
            if ($name === '') {
                $name = (string) $r['use_username'];
            }

            // Map email — fallback {username}@narai.local
            $email = strtolower(trim((string) $r['use_email']));
            if ($email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $username = preg_replace('/[^a-zA-Z0-9_.\-]/', '', (string) $r['use_username']);
                if ($username === '') {
                    $skipped[] = ['use_id' => $useId, 'reason' => 'ไม่มี username สำหรับ generate email'];
                    continue;
                }
                $email = strtolower($username) . '@narai.local';
            }

            // เช็ค email ซ้ำ
            $emailExists = $this->userModel->where('email', $email)->first();
            if ($emailExists !== null) {
                $skipped[] = [
                    'use_id' => $useId,
                    'reason' => "email ซ้ำ ({$email})",
                ];
                continue;
            }

            // Map phone
            $phone = trim((string) $r['use_mobile']);
            if ($phone === '') {
                $phone = trim((string) $r['use_tel']);
            }

            try {
                $this->userModel->insert([
                    'narai_id'      => (string) $useId,
                    'sso_provider'  => 'narai_portal',
                    'email'         => $email,
                    'password_hash' => null,
                    'name'          => $name,
                    'role'          => $defaultRole,
                    'phone'         => $phone !== '' ? $phone : null,
                    'avatar_url'    => null,
                    'is_active'     => true,
                    'created_at'    => $now,
                    'updated_at'    => $now,
                ]);
                $created++;
            } catch (\Throwable $e) {
                $errors[] = [
                    'use_id' => $useId,
                    'reason' => $e->getMessage(),
                ];
            }
        }

        return $this->response->setStatusCode(200)->setJSON([
            'message' => "นำเข้าสำเร็จ {$created} คน",
            'data'    => [
                'created' => $created,
                'skipped' => $skipped,
                'errors'  => $errors,
            ],
        ]);
    }

    // ─── Private helpers ────────────────────────────────────────────────

    /**
     * ตรวจ password complexity: min 8, uppercase, lowercase, ตัวเลข
     * return null = ผ่าน, string = error message
     */
    private function validatePasswordComplexity(string $password): ?string
    {
        if (strlen($password) < 8) {
            return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
        }
        if (! preg_match('/[A-Z]/', $password)) {
            return 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว';
        }
        if (! preg_match('/[a-z]/', $password)) {
            return 'รหัสผ่านต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว';
        }
        if (! preg_match('/[0-9]/', $password)) {
            return 'รหัสผ่านต้องมีตัวเลขอย่างน้อย 1 ตัว';
        }
        return null;
    }

    /**
     * นับจำนวน admin ที่ active อยู่ในระบบ
     */
    private function countActiveAdmins(): int
    {
        return (int) $this->userModel
            ->where('role', 'admin')
            ->where('is_active', true)
            ->countAllResults();
    }
}
