<?php

namespace App\Controllers;

use App\Models\ProjectModel;
use App\Services\NumberSeriesService;
use App\Services\ProjectService;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * ProjectController — HTTP handlers สำหรับ /api/projects
 * Business logic ทั้งหมดอยู่ใน ProjectService และ ProjectModel
 */
class ProjectController extends BaseController
{
    private ProjectModel        $projectModel;
    private ProjectService      $projectService;
    private NumberSeriesService $numberSeriesService;
    private function db(): \CodeIgniter\Database\BaseConnection { return \Config\Database::connect(); }


    public function __construct()
    {
        $this->projectModel        = new ProjectModel();
        $this->projectService      = new ProjectService();
        $this->numberSeriesService = new NumberSeriesService();
    }

    // ─── ค่า enum ที่รับได้ ───────────────────────────────────────────────

    private const VALID_TYPES    = ['condo', 'house', 'townhouse', 'mixed'];
    private const VALID_STATUSES = ['active', 'inactive', 'completed'];

    // ─── Helper: ตรวจสิทธิ์ project ──────────────────────────────────────

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    /**
     * ตรวจว่า user มีสิทธิ์เข้าถึง project นี้หรือไม่
     * admin → ผ่านเสมอ, others → project_id ต้องอยู่ใน project_ids
     */
    private function canAccessProject(int $projectId): bool
    {
        if ($this->isAdmin()) {
            return true;
        }
        $allowed = (array) ($this->request->project_ids ?? []);
        return in_array($projectId, array_map('intval', $allowed), true);
    }

    // ─── GET /api/projects ────────────────────────────────────────────────

    public function index(): ResponseInterface
    {
        $search = (string) ($this->request->getGet('search')       ?? '');
        $status = (string) ($this->request->getGet('status')       ?? '');
        $type   = (string) ($this->request->getGet('project_type') ?? '');

        $page    = max(1, (int) ($this->request->getGet('page')     ?? 1));
        $perPage = max(1, min(100, (int) ($this->request->getGet('per_page') ?? 20)));

        $result = $this->projectModel->getProjectsWithUnitCount(
            projectIds: array_map('intval', (array) ($this->request->project_ids ?? [])),
            isAdmin:    $this->isAdmin(),
            search:     $search,
            status:     $status,
            type:       $type,
            page:       $page,
            perPage:    $perPage,
        );

        $total = $result['total'];
        return $this->response->setStatusCode(200)->setJSON([
            'data' => $result['data'],
            'meta' => [
                'total'     => $total,
                'page'      => $page,
                'per_page'  => $perPage,
                'last_page' => $total > 0 ? (int) ceil($total / $perPage) : 1,
            ],
        ]);
    }

    // ─── GET /api/projects/:id ────────────────────────────────────────────

    public function show(int $id): ResponseInterface
    {
        if (! $this->canAccessProject($id)) {
            return $this->notFound();
        }

        // รวม 3 queries เป็น 1 query พร้อม subqueries
        // budget_used: เฉพาะ movements ที่ approved เท่านั้น (ตาม business rule)
        $project = $this->db()->table('projects p')
            ->select("p.*,
                (SELECT COUNT(*) FROM project_units WHERE project_id = p.id) AS unit_count,
                (SELECT COALESCE(SUM(amount), 0) FROM budget_movements WHERE project_id = p.id AND status = 'approved') AS budget_used")
            ->where('p.id', $id)
            ->get()->getRowArray();

        if ($project === null) {
            return $this->notFound();
        }

        $project['unit_count']  = (int)   $project['unit_count'];
        $project['budget_used'] = (float) $project['budget_used'];

        return $this->response->setStatusCode(200)->setJSON(['data' => $project]);
    }

    // ─── POST /api/projects ───────────────────────────────────────────────

    public function create(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];

        // Validate required fields
        $errors = $this->validateCreate($body);
        if (! empty($errors)) {
            return $this->response->setStatusCode(422)->setJSON(['errors' => $errors]);
        }

        // ─── ใช้ DB transaction เดียวกันสำหรับทั้ง project + default series ──
        $db = $this->db();
        $db->transBegin();

        try {
            $now = date('Y-m-d H:i:s');
            $projectId = $this->projectModel->insert([
                'code'                => trim((string) $body['code']),
                'name'                => trim((string) $body['name']),
                'description'         => trim((string) ($body['description']  ?? '')),
                'project_type'        => (string) $body['project_type'],
                'approval_required'   => (bool) ($body['approval_required'] ?? false),
                'allow_over_budget'   => (bool) ($body['allow_over_budget'] ?? false),
                'pool_budget_amount'  => max(0, (float) ($body['pool_budget_amount'] ?? 0)),
                'status'              => 'active',
                'created_at'          => $now,
                'updated_at'          => $now,
            ]);

            if ($projectId === false) {
                $db->transRollback();
                return $this->response->setStatusCode(500)->setJSON(['error' => 'เกิดข้อผิดพลาดในการสร้างโครงการ']);
            }

            // ─── สำคัญ: auto-create number series 4 รายการ (ใน transaction เดียวกัน) ───
            $this->numberSeriesService->createDefaultSeries((int) $projectId);

            $db->transCommit();
        } catch (\Exception $e) {
            $db->transRollback();
            log_message('error', '[ProjectController::create] ' . $e->getMessage());
            return $this->response->setStatusCode(500)->setJSON(['error' => 'เกิดข้อผิดพลาดในการสร้างโครงการ']);
        }

        $project = $this->projectModel->find((int) $projectId);
        $project['unit_count'] = 0;

        return $this->response->setStatusCode(201)->setJSON([
            'message' => 'สร้างโครงการสำเร็จ',
            'data'    => $project,
        ]);
    }

    // ─── PUT /api/projects/:id ────────────────────────────────────────────

    public function update(int $id): ResponseInterface
    {
        if (! $this->canAccessProject($id)) {
            return $this->notFound();
        }

        $project = $this->projectModel->find($id);
        if ($project === null) {
            return $this->notFound();
        }

        $body   = $this->request->getJSON(true) ?? [];
        $errors = $this->validateUpdate($body);
        if (! empty($errors)) {
            return $this->response->setStatusCode(422)->setJSON(['errors' => $errors]);
        }

        $updateData = ['updated_at' => date('Y-m-d H:i:s')];

        if (isset($body['name']))               $updateData['name']               = trim((string) $body['name']);
        if (isset($body['description']))        $updateData['description']        = trim((string) $body['description']);
        if (isset($body['project_type']))       $updateData['project_type']       = (string) $body['project_type'];
        if (isset($body['approval_required']))  $updateData['approval_required']  = (bool) $body['approval_required'];
        if (isset($body['allow_over_budget']))  $updateData['allow_over_budget']  = (bool) $body['allow_over_budget'];
        if (isset($body['pool_budget_amount'])) $updateData['pool_budget_amount'] = max(0, (float) $body['pool_budget_amount']);
        if (isset($body['status']))             $updateData['status']             = (string) $body['status'];

        $this->projectModel->update($id, $updateData);

        $updated = $this->projectModel->find($id);
        $updated['unit_count'] = $this->db()->table('project_units')
            ->where('project_id', $id)->countAllResults();

        return $this->response->setStatusCode(200)->setJSON([
            'message' => 'อัปเดตโครงการสำเร็จ',
            'data'    => $updated,
        ]);
    }

    // ─── DELETE /api/projects/:id ─────────────────────────────────────────

    public function delete(int $id): ResponseInterface
    {
        // ตรวจสิทธิ์การเข้าถึง project
        if (! $this->canAccessProject($id)) {
            return $this->notFound();
        }

        $project = $this->projectModel->find($id);
        if ($project === null) {
            return $this->notFound();
        }

        if ($this->projectModel->hasSalesTransactions($id)) {
            return $this->response->setStatusCode(400)->setJSON([
                'error' => 'ไม่สามารถลบโครงการที่มีรายการขายได้',
            ]);
        }

        // ตรวจว่ามี units หรือ house_models หรือไม่ (spec: ลบได้เฉพาะกรณีไม่มี units)
        if ($this->projectModel->hasUnitsOrHouseModels($id)) {
            return $this->response->setStatusCode(400)->setJSON([
                'error' => 'ไม่สามารถลบโครงการที่มียูนิตหรือแบบบ้านได้',
            ]);
        }

        // Soft-delete: เปลี่ยน status เป็น inactive แทนการลบจริง
        $this->projectModel->update($id, [
            'status'     => 'inactive',
            'updated_at' => date('Y-m-d H:i:s'),
        ]);

        return $this->response->setStatusCode(200)->setJSON(['message' => 'ลบโครงการสำเร็จ']);
    }

    // ─── GET /api/projects/:id/units ─────────────────────────────────────

    public function units(int $id): ResponseInterface
    {
        if (! $this->canAccessProject($id)) {
            return $this->notFound();
        }

        $units = $this->db()->table('project_units')
            ->where('project_id', $id)
            ->orderBy('unit_code', 'ASC')
            ->get()->getResultArray();

        return $this->response->setStatusCode(200)->setJSON(['data' => $units]);
    }

    // ─── GET /api/projects/:id/house-models ──────────────────────────────

    public function houseModels(int $id): ResponseInterface
    {
        if (! $this->canAccessProject($id)) {
            return $this->notFound();
        }

        $models = $this->db()->table('house_models')
            ->where('project_id', $id)
            ->orderBy('code', 'ASC')
            ->get()->getResultArray();

        return $this->response->setStatusCode(200)->setJSON(['data' => $models]);
    }

    // ─── Private helpers ──────────────────────────────────────────────────

    private function validateCreate(array $body): array
    {
        $errors = [];

        $code = trim((string) ($body['code'] ?? ''));
        $name = trim((string) ($body['name'] ?? ''));
        $type = (string) ($body['project_type'] ?? '');

        if ($code === '') {
            $errors['code'] = 'กรุณากรอกรหัสโครงการ';
        } elseif (! preg_match('/^[A-Za-z0-9\-_]+$/', $code)) {
            $errors['code'] = 'รหัสโครงการใช้ได้เฉพาะตัวอักษร ตัวเลข - และ _';
        } elseif ($this->projectModel->isCodeDuplicate($code)) {
            $errors['code'] = 'รหัสโครงการนี้มีอยู่แล้วในระบบ';
        }

        if ($name === '') {
            $errors['name'] = 'กรุณากรอกชื่อโครงการ';
        }

        if (! in_array($type, self::VALID_TYPES, true)) {
            $errors['project_type'] = 'ประเภทโครงการไม่ถูกต้อง';
        }

        return $errors;
    }

    private function validateUpdate(array $body): array
    {
        $errors = [];

        if (isset($body['name']) && trim((string) $body['name']) === '') {
            $errors['name'] = 'ชื่อโครงการต้องไม่ว่าง';
        }

        if (isset($body['project_type']) && ! in_array($body['project_type'], self::VALID_TYPES, true)) {
            $errors['project_type'] = 'ประเภทโครงการไม่ถูกต้อง';
        }

        if (isset($body['status']) && ! in_array($body['status'], self::VALID_STATUSES, true)) {
            $errors['status'] = 'สถานะโครงการไม่ถูกต้อง';
        }

        return $errors;
    }

    private function notFound(): ResponseInterface
    {
        return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบโครงการ']);
    }
}
