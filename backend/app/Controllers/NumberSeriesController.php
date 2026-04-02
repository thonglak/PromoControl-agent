<?php

namespace App\Controllers;

use App\Models\NumberSeriesModel;
use App\Services\NumberSeriesService;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * NumberSeriesController — HTTP handlers สำหรับ /api/number-series
 *
 * Endpoints:
 *  GET    /api/number-series              → index (filter by project_id)
 *  GET    /api/number-series/:id          → show
 *  PUT    /api/number-series/:id          → update
 *  POST   /api/number-series/preview      → preview (ไม่บันทึก แค่คำนวณ)
 *  GET    /api/number-series/:id/logs     → logs with pagination
 */
class NumberSeriesController extends BaseController
{
    private NumberSeriesModel   $model;
    private NumberSeriesService $service;

    private function db(): \CodeIgniter\Database\BaseConnection
    {
        return \Config\Database::connect();
    }

    public function __construct()
    {
        $this->model   = new NumberSeriesModel();
        $this->service = new NumberSeriesService();
    }

    // ─── Enum ที่รับได้ ────────────────────────────────────────────────
    private const VALID_YEAR_FORMATS  = ['YYYY_BE', 'YYYY_AD', 'YY_BE', 'YY_AD', 'NONE'];
    private const VALID_RESET_CYCLES  = ['YEARLY', 'MONTHLY', 'NEVER'];
    private const VALID_RUNNING_DIGITS = [3, 4, 5, 6];

    // ─── GET /api/number-series?project_id= ───────────────────────────

    /**
     * รายการ series ทั้งหมดของโครงการที่เลือก
     */
    public function index(): ResponseInterface
    {
        $projectId = (int) ($this->request->getGet('project_id') ?? 0);

        if ($projectId <= 0) {
            return $this->response->setStatusCode(422)->setJSON([
                'errors' => ['project_id' => 'กรุณาระบุ project_id'],
            ]);
        }

        // ตรวจสิทธิ์เข้าถึงโครงการ
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(404)->setJSON([
                'error' => 'ไม่พบโครงการ',
            ]);
        }

        $series = $this->service->getByProject($projectId);

        return $this->response->setStatusCode(200)->setJSON(['data' => $series]);
    }

    // ─── GET /api/number-series/:id ───────────────────────────────────

    /**
     * รายละเอียด series
     */
    public function show(int $id): ResponseInterface
    {
        $series = $this->model->find($id);
        if (!$series) {
            return $this->notFound();
        }

        if (!$this->canAccessProject((int) $series['project_id'])) {
            return $this->notFound();
        }

        // คำนวณ sample_output แบบ real-time
        $series['sample_output'] = $this->buildSampleOutput($series);
        $series['document_type_label'] = NumberSeriesService::DOCUMENT_TYPE_LABELS[$series['document_type']] ?? $series['document_type'];
        $series['total_generated'] = (int) $this->db()->table('number_series_logs')
            ->where('number_series_id', $id)
            ->countAllResults();

        return $this->response->setStatusCode(200)->setJSON(['data' => $series]);
    }

    // ─── PUT /api/number-series/:id ───────────────────────────────────

    /**
     * แก้ไข series (pattern, next_number, is_active)
     */
    public function update(int $id): ResponseInterface
    {
        $series = $this->model->find($id);
        if (!$series) {
            return $this->notFound();
        }

        if (!$this->canAccessProject((int) $series['project_id'])) {
            return $this->notFound();
        }

        $body = $this->request->getJSON(true) ?? [];

        // ─── Validation ──────────────────────────────────────────────
        $errors = $this->validateUpdate($body, $series);
        if (!empty($errors)) {
            return $this->response->setStatusCode(422)->setJSON(['errors' => $errors]);
        }

        try {
            $updated = $this->service->update($id, $body);

            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'อัปเดตเลขที่เอกสารสำเร็จ',
                'data'    => $updated,
            ]);
        } catch (\RuntimeException $e) {
            return $this->response->setStatusCode(400)->setJSON([
                'error' => $e->getMessage(),
            ]);
        }
    }

    // ─── POST /api/number-series/preview ──────────────────────────────

    /**
     * Preview เลขที่จาก pattern ที่กำหนด — ไม่บันทึกอะไร แค่คำนวณ
     */
    public function preview(): ResponseInterface
    {
        $body = $this->request->getJSON(true) ?? [];

        // ─── Validation ──────────────────────────────────────────────
        $errors = $this->validatePreview($body);
        if (!empty($errors)) {
            return $this->response->setStatusCode(422)->setJSON(['errors' => $errors]);
        }

        $result = $this->service->preview($body);

        return $this->response->setStatusCode(200)->setJSON(['data' => $result]);
    }

    // ─── GET /api/number-series/:id/logs ──────────────────────────────

    /**
     * ประวัติการออกเลขที่ (pagination)
     */
    public function logs(int $id): ResponseInterface
    {
        $series = $this->model->find($id);
        if (!$series) {
            return $this->notFound();
        }

        if (!$this->canAccessProject((int) $series['project_id'])) {
            return $this->notFound();
        }

        $page    = max(1, (int) ($this->request->getGet('page') ?? 1));
        $perPage = min(100, max(10, (int) ($this->request->getGet('per_page') ?? 20)));
        $offset  = ($page - 1) * $perPage;

        // ดึง logs + join ชื่อ user
        $builder = $this->db()->table('number_series_logs AS nsl')
            ->select('nsl.*, u.name AS generated_by_name')
            ->join('users AS u', 'u.id = nsl.generated_by', 'left')
            ->where('nsl.number_series_id', $id)
            ->where('nsl.reference_table !=', 'config_change') // ไม่แสดง config change logs
            ->orderBy('nsl.generated_at', 'DESC');

        $total = (clone $builder)->countAllResults(false);
        $logs  = $builder->limit($perPage, $offset)->get()->getResultArray();

        return $this->response->setStatusCode(200)->setJSON([
            'data' => $logs,
            'meta' => [
                'page'       => $page,
                'per_page'   => $perPage,
                'total'      => $total,
                'total_pages' => (int) ceil($total / $perPage),
            ],
        ]);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Private helpers
    // ═══════════════════════════════════════════════════════════════════

    /**
     * ตรวจสิทธิ์ว่า user เข้าถึงโครงการนี้ได้หรือไม่
     */
    private function canAccessProject(int $projectId): bool
    {
        $role = $this->request->user_role ?? '';
        if ($role === 'admin') {
            return true;
        }
        $allowed = array_map('intval', (array) ($this->request->project_ids ?? []));
        return in_array($projectId, $allowed, true);
    }

    /**
     * Validate update request
     */
    private function validateUpdate(array $body, array $currentSeries): array
    {
        $errors = [];

        if (isset($body['prefix'])) {
            $prefix = trim((string) $body['prefix']);
            if ($prefix === '') {
                $errors['prefix'] = 'กรุณากรอก prefix';
            } elseif (mb_strlen($prefix) > 20) {
                $errors['prefix'] = 'prefix ต้องไม่เกิน 20 ตัวอักษร';
            }
        }

        if (isset($body['year_format']) && !in_array($body['year_format'], self::VALID_YEAR_FORMATS, true)) {
            $errors['year_format'] = 'รูปแบบปีไม่ถูกต้อง';
        }

        if (isset($body['reset_cycle']) && !in_array($body['reset_cycle'], self::VALID_RESET_CYCLES, true)) {
            $errors['reset_cycle'] = 'ตัวเลือก reset ไม่ถูกต้อง';
        }

        if (isset($body['running_digits'])) {
            $digits = (int) $body['running_digits'];
            if (!in_array($digits, self::VALID_RUNNING_DIGITS, true)) {
                $errors['running_digits'] = 'จำนวนหลักเลขลำดับต้องเป็น 3, 4, 5 หรือ 6';
            }
        }

        if (isset($body['next_number'])) {
            $next = (int) $body['next_number'];
            if ($next < 1) {
                $errors['next_number'] = 'เลขลำดับถัดไปต้องไม่น้อยกว่า 1';
            }

            // ตรวจว่า next_number ไม่เกิน max ที่ running_digits รองรับ
            $digits = (int) ($body['running_digits'] ?? $currentSeries['running_digits']);
            $maxNumber = (int) str_repeat('9', $digits);
            if ($next > $maxNumber) {
                $errors['next_number'] = "เลขลำดับต้องไม่เกิน {$maxNumber} (สำหรับ {$digits} หลัก)";
            }
        }

        if (isset($body['separator']) && mb_strlen((string) $body['separator']) > 5) {
            $errors['separator'] = 'ตัวคั่นต้องไม่เกิน 5 ตัวอักษร';
        }

        if (isset($body['year_separator']) && mb_strlen((string) $body['year_separator']) > 5) {
            $errors['year_separator'] = 'ตัวคั่นหลังปีต้องไม่เกิน 5 ตัวอักษร';
        }

        return $errors;
    }

    /**
     * Validate preview request
     */
    private function validatePreview(array $body): array
    {
        $errors = [];

        if (empty($body['prefix'])) {
            $errors['prefix'] = 'กรุณากรอก prefix';
        }

        if (isset($body['year_format']) && !in_array($body['year_format'], self::VALID_YEAR_FORMATS, true)) {
            $errors['year_format'] = 'รูปแบบปีไม่ถูกต้อง';
        }

        if (isset($body['reset_cycle']) && !in_array($body['reset_cycle'], self::VALID_RESET_CYCLES, true)) {
            $errors['reset_cycle'] = 'ตัวเลือก reset ไม่ถูกต้อง';
        }

        if (isset($body['running_digits'])) {
            $digits = (int) $body['running_digits'];
            if (!in_array($digits, self::VALID_RUNNING_DIGITS, true)) {
                $errors['running_digits'] = 'จำนวนหลักเลขลำดับต้องเป็น 3, 4, 5 หรือ 6';
            }
        }

        return $errors;
    }

    /**
     * สร้าง sample output จาก series config (ใช้ใน show)
     */
    private function buildSampleOutput(array $series): string
    {
        // ใช้ preview service เพื่อ consistency
        $result = $this->service->preview(array_merge($series, [
            'reference_date' => date('Y-m-d'),
        ]));
        return $result['samples'][0]['number'] ?? '';
    }

    private function notFound(): ResponseInterface
    {
        return $this->response->setStatusCode(404)->setJSON([
            'error' => 'ไม่พบเลขที่เอกสาร',
        ]);
    }
}
