<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Models\ProjectLegacyReconciliationModel;
use CodeIgniter\HTTP\ResponseInterface;

/**
 * ProjectLegacyReconciliationController — จัดการ endpoint "ข้อมูลกระทบยอดระบบเก่า"
 *
 * GET    /api/projects/{id}/legacy-reconciliation — ดูข้อมูล (ทุก role ที่เข้าถึงโครงการได้)
 * PUT    /api/projects/{id}/legacy-reconciliation — บันทึก/แก้ไข (admin, manager)
 * DELETE /api/projects/{id}/legacy-reconciliation — ลบข้อมูล (admin)
 *
 * ข้อมูลนี้เป็น metadata เปรียบเทียบเท่านั้น ไม่แตะ budget_movements และไม่แตะสูตรคำนวณใดๆ
 */
class ProjectLegacyReconciliationController extends BaseController
{
    private ProjectLegacyReconciliationModel $model;

    public function __construct()
    {
        $this->model = new ProjectLegacyReconciliationModel();
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    private function isAdmin(): bool
    {
        return ($this->request->user_role ?? '') === 'admin';
    }

    private function isManager(): bool
    {
        return ($this->request->user_role ?? '') === 'manager';
    }

    private function canAccessProject(int $projectId): bool
    {
        if ($this->isAdmin()) {
            return true;
        }
        return in_array($projectId, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }

    private function userId(): int
    {
        return (int) ($this->request->user_id ?? 0);
    }

    private function projectExists(int $projectId): bool
    {
        return \Config\Database::connect()
            ->table('projects')
            ->where('id', $projectId)
            ->countAllResults() > 0;
    }

    /**
     * แปลง row จาก DB ให้เป็น response payload (cast id เป็น string ตาม convention)
     */
    private function formatRow(array $row): array
    {
        return [
            'project_id'                    => (string) $row['project_id'],
            'legacy_total_budget_remaining' => (float) $row['legacy_total_budget_remaining'],
            'legacy_total_profit'           => (float) $row['legacy_total_profit'],
            'legacy_sold_units'             => (int) ($row['legacy_sold_units'] ?? 0),
            'legacy_sold_net_price'         => (float) ($row['legacy_sold_net_price'] ?? 0),
            'legacy_total_discount_amount'  => (float) ($row['legacy_total_discount_amount'] ?? 0),
            'legacy_value_achieved'         => (float) ($row['legacy_value_achieved'] ?? 0),
            'as_of_date'                    => $row['as_of_date'],
            'note'                          => $row['note'],
            'updated_at'                    => $row['updated_at'],
            'updated_by'                    => $row['updated_by'] !== null ? (string) $row['updated_by'] : null,
            'updated_by_name'               => $row['updated_by_name'] ?? null,
        ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/projects/{id}/legacy-reconciliation
    // ═══════════════════════════════════════════════════════════════════════

    public function show(int $projectId): ResponseInterface
    {
        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        if (!$this->projectExists($projectId)) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบโครงการ']);
        }

        $row = $this->model->getByProjectId($projectId);

        if ($row === null) {
            // ยังไม่เคยตั้งค่า — คืน null (ไม่ใช่ 404)
            return $this->response->setStatusCode(200)->setJSON(['data' => null]);
        }

        return $this->response->setStatusCode(200)->setJSON(['data' => $this->formatRow($row)]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/projects/{id}/legacy-reconciliation
    // ═══════════════════════════════════════════════════════════════════════

    public function upsert(int $projectId): ResponseInterface
    {
        // เฉพาะ admin หรือ manager
        if (!$this->isAdmin() && !$this->isManager()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ (ต้องเป็น admin หรือ manager)']);
        }

        if (!$this->canAccessProject($projectId)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์เข้าถึงโครงการนี้']);
        }

        if (!$this->projectExists($projectId)) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบโครงการ']);
        }

        $body = $this->request->getJSON(true) ?? [];

        // ─── Validation ───────────────────────────────────────────────────

        // legacy_total_budget_remaining — บังคับ, ตัวเลข (อนุญาตติดลบ)
        if (!isset($body['legacy_total_budget_remaining']) || !is_numeric($body['legacy_total_budget_remaining'])) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'กรุณาระบุ legacy_total_budget_remaining เป็นตัวเลข']);
        }

        // legacy_total_profit — บังคับ, ตัวเลข (อนุญาตติดลบ)
        if (!isset($body['legacy_total_profit']) || !is_numeric($body['legacy_total_profit'])) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'กรุณาระบุ legacy_total_profit เป็นตัวเลข']);
        }

        // as_of_date — บังคับ, YYYY-MM-DD valid date
        $asOfDate = trim($body['as_of_date'] ?? '');
        if ($asOfDate === '') {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'กรุณาระบุ as_of_date (YYYY-MM-DD)']);
        }
        $parsedDate = \DateTime::createFromFormat('Y-m-d', $asOfDate);
        if (!$parsedDate || $parsedDate->format('Y-m-d') !== $asOfDate) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'รูปแบบ as_of_date ไม่ถูกต้อง (ต้องเป็น YYYY-MM-DD)']);
        }

        // legacy_sold_units — optional, integer >= 0
        $legacySoldUnits = isset($body['legacy_sold_units']) ? $body['legacy_sold_units'] : 0;
        if (!is_numeric($legacySoldUnits) || (int) $legacySoldUnits < 0 || (int) $legacySoldUnits != $legacySoldUnits) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'legacy_sold_units ต้องเป็นจำนวนเต็มที่ >= 0']);
        }

        // legacy_sold_net_price — optional, ตัวเลข (อนุญาตติดลบ)
        if (isset($body['legacy_sold_net_price']) && !is_numeric($body['legacy_sold_net_price'])) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'legacy_sold_net_price ต้องเป็นตัวเลข']);
        }

        // legacy_total_discount_amount — optional, ตัวเลข (อนุญาตติดลบ)
        if (isset($body['legacy_total_discount_amount']) && !is_numeric($body['legacy_total_discount_amount'])) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'legacy_total_discount_amount ต้องเป็นตัวเลข']);
        }

        // legacy_value_achieved — optional, ตัวเลข (อนุญาตติดลบ)
        if (isset($body['legacy_value_achieved']) && !is_numeric($body['legacy_value_achieved'])) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'legacy_value_achieved ต้องเป็นตัวเลข']);
        }

        // note — optional, ≤ 1000 ตัวอักษร
        $note = isset($body['note']) ? (string) $body['note'] : null;
        if ($note !== null && $note !== '' && mb_strlen($note) > 1000) {
            return $this->response->setStatusCode(422)->setJSON(['error' => 'note ต้องไม่เกิน 1000 ตัวอักษร']);
        }
        // แปลง '' → null
        if ($note === '') {
            $note = null;
        }

        // ─── Upsert ───────────────────────────────────────────────────────

        $ok = $this->model->upsert($projectId, [
            'legacy_total_budget_remaining' => (float) $body['legacy_total_budget_remaining'],
            'legacy_total_profit'           => (float) $body['legacy_total_profit'],
            'legacy_sold_units'             => (int) $legacySoldUnits,
            'legacy_sold_net_price'         => (float) ($body['legacy_sold_net_price'] ?? 0),
            'legacy_total_discount_amount'  => (float) ($body['legacy_total_discount_amount'] ?? 0),
            'legacy_value_achieved'         => (float) ($body['legacy_value_achieved'] ?? 0),
            'as_of_date'                    => $asOfDate,
            'note'                          => $note,
        ], $this->userId());

        if (!$ok) {
            return $this->response->setStatusCode(500)->setJSON(['error' => 'บันทึกข้อมูลไม่สำเร็จ']);
        }

        // คืน row ล่าสุดหลัง upsert
        $row = $this->model->getByProjectId($projectId);

        return $this->response->setStatusCode(200)->setJSON(['data' => $this->formatRow($row)]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/projects/{id}/legacy-reconciliation
    // ═══════════════════════════════════════════════════════════════════════

    public function delete(int $projectId): ResponseInterface
    {
        // เฉพาะ admin
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์ (ต้องเป็น admin)']);
        }

        if (!$this->projectExists($projectId)) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบโครงการ']);
        }

        $this->model->deleteByProjectId($projectId);

        return $this->response->setStatusCode(200)->setJSON(['success' => true]);
    }
}
