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

        $projects = $this->projectModel->getProjectsWithUnitCount(
            projectIds: array_map('intval', (array) ($this->request->project_ids ?? [])),
            isAdmin:    $this->isAdmin(),
            search:     $search,
            status:     $status,
            type:       $type
        );

        return $this->response->setStatusCode(200)->setJSON(['data' => $projects]);
    }

    // ─── GET /api/projects/:id ────────────────────────────────────────────

    public function show(int $id): ResponseInterface
    {
        if (! $this->canAccessProject($id)) {
            return $this->notFound();
        }

        $project = $this->projectModel->find($id);
        if ($project === null) {
            return $this->notFound();
        }

        // Summary: unit_count + budget_used
        $unitCount  = $this->db()->table('project_units')
            ->where('project_id', $id)->countAllResults();
        $budgetUsed = (float) ($this->db()->table('budget_movements')
            ->selectSum('amount')->where('project_id', $id)->get()->getRow()->amount ?? 0);

        $project['unit_count']  = $unitCount;
        $project['budget_used'] = $budgetUsed;

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
            return $this->response->setStatusCode(500)->setJSON(['error' => 'เกิดข้อผิดพลาดในการสร้างโครงการ: ' . $e->getMessage()]);
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
        $project = $this->projectModel->find($id);
        if ($project === null) {
            return $this->notFound();
        }

        if ($this->projectModel->hasSalesTransactions($id)) {
            return $this->response->setStatusCode(400)->setJSON([
                'error' => 'ไม่สามารถลบโครงการที่มีรายการขายได้',
            ]);
        }

        try {
            $this->projectModel->deleteProjectCascade($id);
        } catch (\RuntimeException $e) {
            return $this->response->setStatusCode(500)->setJSON(['error' => $e->getMessage()]);
        }

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
