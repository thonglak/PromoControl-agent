<?php

namespace App\Controllers;

use CodeIgniter\HTTP\ResponseInterface;

class DevToolController extends BaseController
{
    private function isAdmin(): bool { return ($this->request->user_role ?? '') === 'admin'; }
    private function db(): \CodeIgniter\Database\BaseConnection { return \Config\Database::connect(); }
    private function userId(): int { return (int) ($this->request->user_id ?? 0); }

    // ═══════════════════════════════════════════════════════════════════════
    // POST /api/dev/clear-transactions
    // ล้างข้อมูลการขายของโครงการ
    //
    // Body:
    //   project_id (int, required)
    //   mode (string, required) — 'sales_only' | 'full_reset'
    //     - sales_only: ลบ sales_transactions + items + budget_movements ที่เกี่ยวกับการขาย (USE/auto-RETURN)
    //                   คงงบที่ตั้งไว้ (ALLOCATE) + manual RETURN/TRANSFER + unit_budget_allocations
    //     - full_reset: ลบทั้งหมด รวม ALLOCATE/allocations + reset BUDGET_MOVE number_series
    //   project_name_confirm (string, required) — ต้องตรงกับชื่อโครงการ
    //   reason (string, optional)
    // ═══════════════════════════════════════════════════════════════════════

    public function clearTransactions(): ResponseInterface
    {
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'เฉพาะ admin เท่านั้น']);
        }

        $body = $this->request->getJSON(true) ?? [];
        $pid               = (int) ($body['project_id'] ?? 0);
        $mode              = (string) ($body['mode'] ?? '');
        $confirmName       = trim((string) ($body['project_name_confirm'] ?? ''));
        $reason            = trim((string) ($body['reason'] ?? ''));

        if ($pid <= 0) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'กรุณาระบุ project_id']);
        }
        if (!in_array($mode, ['sales_only', 'full_reset'], true)) {
            return $this->response->setStatusCode(400)->setJSON(['error' => 'mode ต้องเป็น sales_only หรือ full_reset']);
        }

        $db = $this->db();

        // ตรวจชื่อโครงการตรงกับที่ผู้ใช้กรอกมา
        $project = $db->table('projects')->select('id, name')->where('id', $pid)->get()->getRowArray();
        if (!$project) {
            return $this->response->setStatusCode(404)->setJSON(['error' => 'ไม่พบโครงการ']);
        }
        if ($confirmName === '' || $confirmName !== (string) $project['name']) {
            return $this->response->setStatusCode(400)->setJSON([
                'error' => 'ชื่อโครงการที่กรอกไม่ตรงกับโครงการที่เลือก',
            ]);
        }

        // ดึงชื่อผู้ทำรายการเพื่อ snapshot ลง audit log
        $uid = $this->userId();
        $user = $db->table('users')->select('id, name')->where('id', $uid)->get()->getRowArray();

        $db->transBegin();

        try {
            $deletedItems        = 0;
            $deletedTransactions = 0;
            $deletedMovements    = 0;
            $deletedAllocations  = 0;
            $resetUnits          = 0;

            // ─── 1. ลบ sales_transaction_items (ต้องลบก่อน FK) ─────────────
            $transactionIds = $db->table('sales_transactions')
                ->select('id')
                ->where('project_id', $pid)
                ->get()->getResultArray();
            $tids = array_column($transactionIds, 'id');

            if (!empty($tids)) {
                $db->table('sales_transaction_items')
                    ->whereIn('sales_transaction_id', $tids)
                    ->delete();
                $deletedItems = $db->affectedRows();
            }

            // ─── 2. ลบ sales_transactions ─────────────────────────────────
            $db->table('sales_transactions')
                ->where('project_id', $pid)
                ->delete();
            $deletedTransactions = $db->affectedRows();

            // ─── 3. ลบ budget_movements ───────────────────────────────────
            if ($mode === 'full_reset') {
                // ลบทุก movement ของโครงการ
                $db->table('budget_movements')
                    ->where('project_id', $pid)
                    ->delete();
            } else {
                // sales_only: ลบเฉพาะที่มาจากการขาย
                // - USE / SPECIAL_BUDGET_USE (ใช้ในรายการขาย)
                // - RETURN / SPECIAL_BUDGET_RETURN ที่มี reference_type = 'sales_transaction_cancel' (auto จาก cancel)
                $db->table('budget_movements')
                    ->where('project_id', $pid)
                    ->groupStart()
                        ->whereIn('movement_type', ['USE', 'SPECIAL_BUDGET_USE'])
                        ->orGroupStart()
                            ->whereIn('movement_type', ['RETURN', 'SPECIAL_BUDGET_RETURN'])
                            ->where('reference_type', 'sales_transaction_cancel')
                        ->groupEnd()
                    ->groupEnd()
                    ->delete();
            }
            $deletedMovements = $db->affectedRows();

            // ─── 4. ลบ unit_budget_allocations (เฉพาะ full_reset) ──────────
            if ($mode === 'full_reset') {
                $db->table('unit_budget_allocations')
                    ->where('project_id', $pid)
                    ->delete();
                $deletedAllocations = $db->affectedRows();
            }

            // ─── 5. Reset project_units status ─────────────────────────────
            // ทั้ง 2 mode: ยูนิตที่ขายแล้ว/โอนแล้ว → กลับเป็น available
            $db->table('project_units')
                ->where('project_id', $pid)
                ->whereIn('status', ['sold', 'transferred'])
                ->update([
                    'status'        => 'available',
                    'customer_name' => null,
                    'salesperson'   => null,
                    'sale_date'     => null,
                    'updated_at'    => date('Y-m-d H:i:s'),
                ]);
            $resetUnits = $db->affectedRows();

            // ─── 6. Reset number_series ────────────────────────────────────
            // sales_only: reset เฉพาะ SALE (BUDGET_MOVE ยังคงอ้างอิง ALLOCATE ที่ค้างอยู่)
            // full_reset: reset ทั้ง SALE และ BUDGET_MOVE
            $seriesTypes = $mode === 'full_reset' ? ['SALE', 'BUDGET_MOVE'] : ['SALE'];
            $seriesIds = $db->table('number_series')
                ->select('id')
                ->where('project_id', $pid)
                ->whereIn('document_type', $seriesTypes)
                ->get()->getResultArray();
            $sids = array_column($seriesIds, 'id');

            $db->table('number_series')
                ->where('project_id', $pid)
                ->whereIn('document_type', $seriesTypes)
                ->update([
                    'next_number'     => 1,
                    'last_reset_date' => null,
                    'updated_at'      => date('Y-m-d H:i:s'),
                ]);

            if (!empty($sids)) {
                $db->table('number_series_logs')
                    ->whereIn('number_series_id', $sids)
                    ->delete();
            }

            // ─── 7. เขียน audit log ────────────────────────────────────────
            $db->table('project_clear_logs')->insert([
                'project_id'                => $pid,
                'project_name'              => $project['name'],
                'user_id'                   => $uid,
                'user_name'                 => $user['name'] ?? null,
                'mode'                      => $mode,
                'reason'                    => $reason !== '' ? $reason : null,
                'deleted_transaction_items' => $deletedItems,
                'deleted_transactions'      => $deletedTransactions,
                'deleted_movements'         => $deletedMovements,
                'deleted_allocations'       => $deletedAllocations,
                'reset_units'               => $resetUnits,
                'created_at'                => date('Y-m-d H:i:s'),
            ]);

            $db->transCommit();

            return $this->response->setStatusCode(200)->setJSON([
                'message' => 'ล้างข้อมูลสำเร็จ',
                'mode'    => $mode,
                'summary' => [
                    'deleted_transaction_items'  => $deletedItems,
                    'deleted_transactions'       => $deletedTransactions,
                    'deleted_budget_movements'   => $deletedMovements,
                    'deleted_budget_allocations' => $deletedAllocations,
                    'reset_units'                => $resetUnits,
                ],
            ]);
        } catch (\Exception $e) {
            $db->transRollback();
            return $this->response->setStatusCode(500)->setJSON([
                'error' => 'เกิดข้อผิดพลาด: ' . $e->getMessage(),
            ]);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GET /api/dev/clear-logs?project_id=X
    // ดึงประวัติการล้างข้อมูล (audit trail)
    // ═══════════════════════════════════════════════════════════════════════

    public function clearLogs(): ResponseInterface
    {
        if (!$this->isAdmin()) {
            return $this->response->setStatusCode(403)->setJSON(['error' => 'เฉพาะ admin เท่านั้น']);
        }

        $pid = (int) ($this->request->getGet('project_id') ?? 0);
        $qb  = $this->db()->table('project_clear_logs')
            ->orderBy('created_at', 'DESC')
            ->limit(50);
        if ($pid > 0) {
            $qb->where('project_id', $pid);
        }
        $logs = $qb->get()->getResultArray();

        return $this->response->setStatusCode(200)->setJSON(['data' => $logs]);
    }
}
