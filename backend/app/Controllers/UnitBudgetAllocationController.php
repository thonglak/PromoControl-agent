<?php

namespace App\Controllers;

use App\Services\BudgetMovementService;
use CodeIgniter\HTTP\ResponseInterface;
use RuntimeException;

class UnitBudgetAllocationController extends BaseController
{
    private BudgetMovementService $budgetSvc;

    public function __construct()
    {
        $this->budgetSvc = new BudgetMovementService();
    }

    private function canWrite(): bool { return in_array($this->request->user_role ?? '', ['admin', 'manager', 'sales'], true); }
    private function isAdmin(): bool { return ($this->request->user_role ?? '') === 'admin'; }
    private function canAccessProject(int $pid): bool {
        if ($this->isAdmin()) return true;
        return in_array($pid, array_map('intval', (array) ($this->request->project_ids ?? [])), true);
    }
    private function userId(): int { return (int) ($this->request->user_id ?? 0); }
    private function db(): \CodeIgniter\Database\BaseConnection { return \Config\Database::connect(); }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/unit-budget-allocations/:unitId?project_id=
    // ═══════════════════════════════════════════════════════════════════════

    public function show(int $unitId): ResponseInterface
    {
        $pid = (int) ($this->request->getGet('project_id') ?? 0);
        if ($pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        if (!$this->canAccessProject($pid)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $allocations = $this->db()->table('unit_budget_allocations uba')
            ->select('uba.*, u.name AS created_by_name')
            ->join('users u', 'u.id = uba.created_by', 'left')
            ->where('uba.unit_id', $unitId)
            ->where('uba.project_id', $pid)
            ->get()->getResultArray();

        return $this->response->setStatusCode(200)->setJSON(['data' => [
            'unit_id'     => $unitId,
            'allocations' => $allocations,
        ]]);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/unit-budget-allocations
    // ═══════════════════════════════════════════════════════════════════════

    public function create(): ResponseInterface
    {
        if (!$this->canWrite()) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $body       = $this->request->getJSON(true) ?? [];
        $unitId     = (int) ($body['unit_id'] ?? 0);
        $pid        = (int) ($body['project_id'] ?? 0);
        $sourceType = $body['budget_source_type'] ?? '';
        $amount     = (float) ($body['allocated_amount'] ?? 0);
        $note       = $body['note'] ?? '';

        if ($unitId <= 0 || $pid <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ unit_id และ project_id']);
        if (!$this->canAccessProject($pid)) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        // ห้าม UNIT_STANDARD
        if ($sourceType === 'UNIT_STANDARD') {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'ไม่สามารถตั้งงบ UNIT_STANDARD ผ่าน API ได้ — ค่ามาจาก standard_budget ของยูนิต']);
        }

        $validSources = ['PROJECT_POOL', 'MANAGEMENT_SPECIAL'];
        if (!in_array($sourceType, $validSources, true)) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'budget_source_type ไม่ถูกต้อง']);
        }
        if ($amount <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'จำนวนเงินต้องมากกว่า 0']);

        // ตรวจซ้ำ: ถ้ามีอยู่แล้ว → update (เพิ่มเงิน)
        $existing = $this->db()->table('unit_budget_allocations')
            ->where('unit_id', $unitId)->where('project_id', $pid)->where('budget_source_type', $sourceType)
            ->get()->getRowArray();

        $this->db()->transBegin();
        try {
            // สร้าง movement
            $moveType = in_array($sourceType, ['MANAGEMENT_SPECIAL'], true)
                ? 'SPECIAL_BUDGET_ALLOCATE' : 'ALLOCATE';

            $movement = $this->budgetSvc->createMovement([
                'project_id'         => $pid,
                'unit_id'            => $unitId,
                'movement_type'      => $moveType,
                'budget_source_type' => $sourceType,
                'amount'             => $amount,
                'note'               => $note ?: "ตั้งงบ {$sourceType} ให้ยูนิต",
                'created_by'         => $this->userId(),
            ]);

            $now = date('Y-m-d H:i:s');

            if ($existing) {
                // Update existing allocation (เพิ่มจำนวน)
                $newAmount = (float) $existing['allocated_amount'] + $amount;
                $this->db()->table('unit_budget_allocations')
                    ->where('id', $existing['id'])
                    ->update(['allocated_amount' => $newAmount, 'movement_id' => $movement['id'], 'note' => $note, 'updated_at' => $now]);
                $allocId = (int) $existing['id'];
            } else {
                // สร้างใหม่
                $this->db()->table('unit_budget_allocations')->insert([
                    'unit_id'            => $unitId,
                    'project_id'         => $pid,
                    'budget_source_type' => $sourceType,
                    'allocated_amount'   => $amount,
                    'movement_id'        => $movement['id'],
                    'note'               => $note,
                    'created_by'         => $this->userId(),
                    'created_at'         => $now,
                    'updated_at'         => $now,
                ]);
                $allocId = $this->db()->insertID();
            }

            $this->db()->transCommit();

            $alloc = $this->db()->table('unit_budget_allocations')->where('id', $allocId)->get()->getRowArray();
            return $this->response->setStatusCode(201)->setJSON([
                'message' => 'ตั้งงบสำเร็จ',
                'data'    => ['allocation' => $alloc, 'movement' => $movement],
            ]);
        } catch (\Throwable $e) {
            $this->db()->transRollback();
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUT /api/unit-budget-allocations/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function update(int $id): ResponseInterface
    {
        if (!in_array($this->request->user_role ?? '', ['admin', 'manager'], true)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        }

        $alloc = $this->db()->table('unit_budget_allocations')->where('id', $id)->get()->getRowArray();
        if (!$alloc) return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบรายการ']);
        if (!$this->canAccessProject((int) $alloc['project_id'])) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $body      = $this->request->getJSON(true) ?? [];
        $newAmount = (float) ($body['allocated_amount'] ?? 0);
        $oldAmount = (float) $alloc['allocated_amount'];

        if ($newAmount <= 0) return $this->response->setStatusCode(400)->setJSON(['error' => 'จำนวนเงินต้องมากกว่า 0']);
        if ($newAmount === $oldAmount) return $this->response->setStatusCode(200)->setJSON(['message' => 'ไม่มีการเปลี่ยนแปลง']);

        $diff = $newAmount - $oldAmount;

        $this->db()->transBegin();
        try {
            // สร้าง ADJUST movement สำหรับส่วนต่าง
            $movement = $this->budgetSvc->createMovement([
                'project_id'         => (int) $alloc['project_id'],
                'unit_id'            => (int) $alloc['unit_id'],
                'movement_type'      => 'ADJUST',
                'budget_source_type' => $alloc['budget_source_type'],
                'amount'             => abs($diff),
                'note'               => $diff > 0 ? "เพิ่มงบ " . number_format(abs($diff)) . " บาท" : "ลดงบ " . number_format(abs($diff)) . " บาท",
                'created_by'         => $this->userId(),
            ]);

            $this->db()->table('unit_budget_allocations')
                ->where('id', $id)
                ->update(['allocated_amount' => $newAmount, 'movement_id' => $movement['id'], 'updated_at' => date('Y-m-d H:i:s')]);

            $this->db()->transCommit();

            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'แก้ไขงบสำเร็จ',
                'data'    => $this->db()->table('unit_budget_allocations')->where('id', $id)->get()->getRowArray(),
            ]);
        } catch (\Throwable $e) {
            $this->db()->transRollback();
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // DELETE /api/unit-budget-allocations/:id
    // ═══════════════════════════════════════════════════════════════════════

    public function delete(int $id): ResponseInterface
    {
        if (!in_array($this->request->user_role ?? '', ['admin', 'manager'], true)) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);
        }

        $alloc = $this->db()->table('unit_budget_allocations')->where('id', $id)->get()->getRowArray();
        if (!$alloc) return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบรายการ']);
        if (!$this->canAccessProject((int) $alloc['project_id'])) return $this->response->setStatusCode(403)->setJSON(['error' => 'ไม่มีสิทธิ์']);

        $this->db()->transBegin();
        try {
            // สร้าง RETURN movement คืนงบ
            $returnType = in_array($alloc['budget_source_type'], ['MANAGEMENT_SPECIAL'], true)
                ? 'SPECIAL_BUDGET_RETURN' : 'RETURN';

            $this->budgetSvc->createMovement([
                'project_id'         => (int) $alloc['project_id'],
                'unit_id'            => (int) $alloc['unit_id'],
                'movement_type'      => $returnType,
                'budget_source_type' => $alloc['budget_source_type'],
                'amount'             => (float) $alloc['allocated_amount'],
                'note'               => "ยกเลิกการตั้งงบ {$alloc['budget_source_type']}",
                'created_by'         => $this->userId(),
            ]);

            $this->db()->table('unit_budget_allocations')->where('id', $id)->delete();
            $this->db()->transCommit();

            return $this->response->setStatusCode(200)->setJSON(['message' => 'ยกเลิกการตั้งงบสำเร็จ']);
        } catch (\Throwable $e) {
            $this->db()->transRollback();
            return $this->response->setStatusCode(400)->setJSON(['error' => $e->getMessage()]);
        }
    }
}
